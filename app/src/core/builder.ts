import type { ComboRef } from './combos';
import { landFixing, roleTags, subtypes, themeTags, THEMES, type Role } from './roles';
import { cardKey, type Card } from './scryfall';
import { isBasicLand, sortColors } from './validate';

export type Category = 'combo' | 'land' | 'ramp' | 'draw' | 'removal' | 'wipe' | 'synergy' | 'staple' | 'basic';

export interface PoolCard {
  card: Card;
  /** Roles known from where we found the card (e.g. a Scryfall `otag:ramp` search). Text-based roles are added too. */
  roles: Role[];
  /** Copies in the user's collection. */
  owned: number;
}

export interface Pick {
  name: string;
  /** Absent for basic lands. */
  card?: Card;
  quantity: number;
  category: Category;
  reason: string;
  owned: number;
}

export interface BuildInput {
  commander: Card;
  pool: PoolCard[];
  combos: ComboRef[];
  /** 'owned': only cards in the collection. 'any': prefer owned cards but use anything in the pool. */
  mode: 'owned' | 'any';
  /** How many combos to build in. */
  comboCount: number;
}

export interface BuildResult {
  commander: Card;
  picks: Pick[];
  combos: ComboRef[];
  /** Cards in the deck including the commander. */
  total: number;
  /** Slots left empty because the pool ran out of suitable cards. */
  shortBy: number;
  themes: string[];
}

const DECK_SIZE = 100;
const LAND_TARGET = 36;
const NONBASIC_LAND_MAX = 12;
const QUOTA: [Role, number][] = [
  ['ramp', 10],
  ['draw', 9],
  ['removal', 8],
  ['wipe', 3],
];
const MAX_COMBO_CARDS = 12;
const ROLE_LABEL: Record<string, string> = { ramp: 'Ramp', draw: 'Card draw', removal: 'Removal', wipe: 'Board wipe' };

const BASIC_FOR: Record<string, string> = { W: 'Plains', U: 'Island', B: 'Swamp', R: 'Mountain', G: 'Forest' };

function popularity(rank?: number): number {
  if (!rank) return 0;
  // rank 1 -> 3 points, rank ~50,000 -> 0.
  return Math.max(0, 3 - (3 * Math.log10(rank)) / Math.log10(50000));
}

/** Splits `n` basics across colors in proportion to how many mana symbols of each color the deck uses. */
export function splitBasics(n: number, identity: string[], pips: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  if (n <= 0) return out;
  if (identity.length === 0) return { Wastes: n };
  const total = identity.reduce((s, c) => s + (pips[c] ?? 0), 0);
  // Every color in the identity gets at least one basic if there's room, so the deck can cast its commander.
  const floor = n >= identity.length ? 1 : 0;
  let left = n - floor * identity.length;
  const shares = identity.map((c) => ({ c, exact: total > 0 ? (left * (pips[c] ?? 0)) / total : left / identity.length }));
  for (const s of shares) out[s.c] = floor + Math.floor(s.exact);
  left -= shares.reduce((sum, s) => sum + Math.floor(s.exact), 0);
  shares
    .sort((a, b) => (b.exact % 1) - (a.exact % 1))
    .slice(0, left)
    .forEach((s) => (out[s.c] += 1));
  return Object.fromEntries(Object.entries(out).map(([c, v]) => [BASIC_FOR[c] ?? c, v]));
}

function countPips(cards: Card[]): Record<string, number> {
  const pips: Record<string, number> = {};
  for (const c of cards) {
    for (const m of c.manaCost.matchAll(/\{([^}]+)\}/g)) {
      for (const color of m[1].split('/')) if ('WUBRG'.includes(color) && color.length === 1) pips[color] = (pips[color] ?? 0) + 1;
    }
  }
  return pips;
}

export function buildDeck(input: BuildInput): BuildResult {
  const { commander, mode } = input;
  const identity = new Set(commander.colorIdentity);
  const cmdKey = cardKey(commander.name);

  // --- Candidate pool: legal, on-color, deduplicated ---
  const pool = new Map<string, PoolCard>();
  for (const p of input.pool) {
    const key = cardKey(p.card.name);
    if (key === cmdKey || isBasicLand(p.card.name)) continue;
    if (p.card.legalities.commander !== 'legal') continue;
    if (p.card.colorIdentity.some((c) => !identity.has(c))) continue;
    if (mode === 'owned' && p.owned < 1) continue;
    const existing = pool.get(key);
    // Scryfall's ramp/draw tags are a good signal. Its removal/sweeper tags are too broad (they include
    // creatures and planeswalkers), so those roles come from our stricter text matching only.
    const tagged = [...(existing?.roles ?? []), ...p.roles].filter((r) => r === 'ramp' || r === 'draw');
    // Lands fill their own slots; the ramp tag on e.g. Command Tower must not count toward the ramp quota.
    const roles: Role[] = /\bland\b/i.test(p.card.typeLine) ? ['land'] : [...new Set([...tagged, ...roleTags(p.card)])];
    pool.set(key, { card: p.card, roles, owned: Math.max(existing?.owned ?? 0, p.owned) });
  }

  // --- Scoring ---
  const cmdThemes = new Set(themeTags(commander));
  const cmdSubtypes = new Set(subtypes(commander));
  const themeLabel = (id: string) => THEMES.find((t) => t.id === id)?.label ?? id;
  const info = new Map<string, { score: number; shared: string[]; tribal: boolean }>();
  for (const [key, p] of pool) {
    const shared = themeTags(p.card).filter((t) => cmdThemes.has(t));
    const tribal = subtypes(p.card).some((s) => cmdSubtypes.has(s));
    const score =
      popularity(p.card.edhrecRank) +
      1.5 * Math.min(shared.length, 2) +
      (tribal ? 1 : 0) +
      (mode === 'any' && p.owned > 0 ? 1 : 0) -
      (p.card.cmc >= 7 ? 1 : 0);
    info.set(key, { score, shared, tribal });
  }
  const byScore = (a: string, b: string) => info.get(b)!.score - info.get(a)!.score;

  const picks = new Map<string, Pick>();
  const add = (key: string, category: Category, reason: string) => {
    if (picks.has(key)) return;
    const p = pool.get(key)!;
    picks.set(key, { name: p.card.name, card: p.card, quantity: 1, category, reason, owned: p.owned });
  };
  const isLand = (key: string) => pool.get(key)!.roles.includes('land');

  // --- Combos: complete combos whose every non-commander card is in the pool ---
  const chosen: ComboRef[] = [];
  let comboCards = 0;
  const eligible = input.combos
    .filter((c) => {
      const names = c.cards.filter((n) => cardKey(n) !== cmdKey);
      // 'B' = banned in Commander per Commander Spellbook.
      return c.bracketTag !== 'B' && names.length > 0 && names.every((n) => pool.has(cardKey(n)));
    })
    .sort((a, b) => b.popularity - a.popularity);
  const seenEffects = new Set<string>();
  for (const combo of eligible) {
    if (chosen.length >= input.comboCount) break;
    // Variety: don't spend two slots on combos that do the same thing (e.g. one infinite-mana engine with two partners).
    const effect = combo.produces.slice(0, 2).join('|');
    if (effect && seenEffects.has(effect)) continue;
    const fresh = combo.cards.map(cardKey).filter((k) => k !== cmdKey && !picks.has(k));
    if (comboCards + fresh.length > MAX_COMBO_CARDS) continue;
    const label = combo.produces.slice(0, 2).join(', ') || 'combo';
    const others = (n: string) => combo.cards.filter((x) => x !== n).join(' + ');
    for (const name of combo.cards) {
      const k = cardKey(name);
      if (k === cmdKey) continue;
      if (isLand(k)) continue; // Combo lands are rare; let the land logic handle them.
      add(k, 'combo', `Combo with ${others(name)} → ${label}`);
    }
    comboCards += fresh.length;
    if (effect) seenEffects.add(effect);
    chosen.push(combo);
  }

  // --- Nonbasic lands ---
  // Lands: favor ones that make the commander's colors, then popularity.
  const idColors = sortColors(identity);
  const landScore = (key: string) => {
    const c = pool.get(key)!.card;
    const fixing = landFixing(c, idColors);
    return popularity(c.edhrecRank) + 1.5 * fixing - (fixing === 0 && idColors.length >= 2 ? 1.5 : 0) + (mode === 'any' && pool.get(key)!.owned > 0 ? 1 : 0);
  };
  const lands = [...pool.keys()].filter(isLand).sort((a, b) => landScore(b) - landScore(a));
  for (const key of lands) {
    if ([...picks.values()].filter((p) => p.category === 'land').length >= NONBASIC_LAND_MAX) break;
    if (!picks.has(key)) add(key, 'land', 'Fixing / utility land');
  }
  const nonbasicLands = [...picks.values()].filter((p) => p.category === 'land').length;

  // --- Role quotas (ramp, draw, removal, wipes) ---
  const nonlandKeys = [...pool.keys()].filter((k) => !isLand(k)).sort(byScore);
  const nonlandTarget = DECK_SIZE - 1 - LAND_TARGET;
  const nonlandCount = () => [...picks.values()].filter((p) => p.category !== 'land').length;
  for (const [role, quota] of QUOTA) {
    const have = () => [...picks.keys()].filter((k) => pool.get(k)!.roles.includes(role)).length;
    for (const key of nonlandKeys) {
      if (have() >= quota || nonlandCount() >= nonlandTarget) break;
      if (picks.has(key) || !pool.get(key)!.roles.includes(role)) continue;
      add(key, role as Category, ROLE_LABEL[role]);
    }
  }

  // --- Fill the rest by score ---
  for (const key of nonlandKeys) {
    if (nonlandCount() >= nonlandTarget) break;
    if (picks.has(key)) continue;
    const i = info.get(key)!;
    if (i.shared.length > 0) add(key, 'synergy', `Synergy: ${i.shared.map(themeLabel).join(', ')}`);
    else if (i.tribal) add(key, 'synergy', 'Shares a creature type with your commander');
    else add(key, 'staple', 'Popular in Commander');
  }

  // --- Basics ---
  const spells = [...picks.values()].filter((p) => p.card && p.category !== 'land').map((p) => p.card!);
  const basics = splitBasics(Math.max(0, LAND_TARGET - nonbasicLands), sortColors(identity), countPips([commander, ...spells]));
  const result: Pick[] = [...picks.values()];
  for (const [name, quantity] of Object.entries(basics)) {
    if (quantity > 0) result.push({ name, quantity, category: 'basic', reason: 'Basic land', owned: quantity });
  }

  const total = 1 + result.reduce((s, p) => s + p.quantity, 0);
  return {
    commander,
    picks: result,
    combos: chosen,
    total,
    shortBy: Math.max(0, DECK_SIZE - total),
    themes: [...cmdThemes].map(themeLabel),
  };
}
