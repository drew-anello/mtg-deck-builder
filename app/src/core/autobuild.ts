import { buildDeck, type BuildResult, type PoolCard } from './builder';
import { findCombos, missingFromPool, type ComboRef } from './combos';
import type { Role } from './roles';
import { THEMES, themeTags } from './roles';
import { cardKey, fetchCards, searchCards, type Card } from './scryfall';

export interface AutoBuildOptions {
  commander: Card;
  mode: 'owned' | 'any';
  /** 0 disables combos (and the Commander Spellbook call). */
  comboCount: number;
  /** Cards the user owns (card data) and how many copies of each, keyed by `cardKey`. */
  ownedCards: Card[];
  ownedCounts: Map<string, number>;
  onStatus?: (message: string) => void;
}

export interface AutoBuildOutput {
  result: BuildResult;
  /** Things that went wrong but didn't stop the build (e.g. combo lookup failed). */
  warnings: string[];
}

// Commander Spellbook rejects more than 600 cards per request.
const MAX_POOL_FOR_COMBOS = 600;
const MAX_ALMOST_COMBO_LOOKUPS = 8;

/** Roles tagged by Scryfall Tagger functions; used to widen the pool in "buy the rest" mode. */
const ROLE_QUERIES: [Role, string][] = [
  ['ramp', 'otag:ramp'],
  ['draw', 'otag:draw'],
  ['removal', 'otag:removal'],
  ['wipe', 'otag:sweeper'],
];

export function identityQuery(identity: string[]): string {
  return `legal:commander id<=${identity.length ? identity.join('').toLowerCase() : 'c'}`;
}

export async function autoBuild(opts: AutoBuildOptions): Promise<AutoBuildOutput> {
  const { commander, mode, ownedCounts } = opts;
  const warnings: string[] = [];
  const status = opts.onStatus ?? (() => {});
  const pool = new Map<string, PoolCard>();

  const addToPool = (card: Card, roles: Role[]) => {
    const key = cardKey(card.name);
    const existing = pool.get(key);
    pool.set(key, {
      card: existing?.card ?? card,
      roles: [...new Set([...(existing?.roles ?? []), ...roles])],
      owned: ownedCounts.get(key) ?? 0,
    });
  };

  // 1. Everything the user owns that could be in this deck. The builder filters legality and colors.
  for (const c of opts.ownedCards) addToPool(c, []);

  // 2. Buy mode: widen the pool with popular and role-specific cards in the commander's colors.
  if (mode === 'any') {
    const base = identityQuery(commander.colorIdentity);
    const themes = themeTags(commander)
      .slice(0, 2)
      .map((id) => THEMES.find((t) => t.id === id)!);
    const searches: { label: string; query: string; page: number; roles: Role[] }[] = [
      { label: 'popular cards', query: base, page: 1, roles: [] },
      { label: 'popular cards', query: base, page: 2, roles: [] },
      ...ROLE_QUERIES.map(([role, q]) => ({ label: role, query: `${base} ${q}`, page: 1, roles: [role] })),
      ...themes.map((t) => ({ label: t.label, query: `${base} ${t.query}`, page: 1, roles: [] as Role[] })),
    ];
    for (const [i, s] of searches.entries()) {
      status(`Searching Scryfall: ${s.label} (${i + 1}/${searches.length})`);
      try {
        const res = await searchCards(s.query, s.page);
        for (const c of res.cards) addToPool(c, s.roles);
      } catch (e) {
        warnings.push(`Scryfall search for ${s.label} failed: ${(e as Error).message}`);
      }
    }
  }

  // 3. Combos from Commander Spellbook.
  let combos: ComboRef[] = [];
  if (opts.comboCount > 0) {
    status('Looking for combos on Commander Spellbook…');
    try {
      // Only send cards that could actually be in this deck (legal, on-color), owned first, then most popular.
      const ids = new Set(commander.colorIdentity);
      const names = [...pool.values()]
        .filter((p) => p.card.legalities.commander === 'legal' && p.card.colorIdentity.every((c) => ids.has(c)))
        .filter((p) => (mode === 'owned' ? p.owned > 0 : true))
        .sort((a, b) => Number(b.owned > 0) - Number(a.owned > 0) || (a.card.edhrecRank ?? 1e9) - (b.card.edhrecRank ?? 1e9))
        .slice(0, MAX_POOL_FOR_COMBOS)
        .map((p) => p.card.name);
      const { included, almost } = await findCombos([commander.name], names);
      combos = included;

      if (mode === 'any' && almost.length > 0) {
        // Combos that are one card short: fetch that card so the builder can include the whole combo.
        const keys = new Set(pool.keys());
        const wanted = new Map<string, string>();
        for (const combo of [...almost].sort((a, b) => b.popularity - a.popularity)) {
          const missing = missingFromPool(combo, [commander.name], keys);
          if (missing.length === 1 && wanted.size < MAX_ALMOST_COMBO_LOOKUPS) wanted.set(cardKey(missing[0]), missing[0]);
        }
        if (wanted.size > 0) {
          status('Fetching combo pieces…');
          const { cards } = await fetchCards([...wanted.values()].map((name) => ({ name })));
          for (const c of cards) addToPool(c, []);
          combos = [...included, ...almost];
        }
      }
    } catch (e) {
      warnings.push(`Combo lookup failed, building without combos: ${(e as Error).message}`);
    }
  }

  status('Building the deck…');
  const result = buildDeck({
    commander,
    pool: [...pool.values()],
    combos,
    mode,
    comboCount: opts.comboCount,
  });
  return { result, warnings };
}
