import type { Card } from './scryfall';

export type Role = 'land' | 'ramp' | 'draw' | 'removal' | 'wipe';

/**
 * Role detection from oracle text. This is deliberately rough: it only has to be good enough to fill
 * a deck template (ramp / draw / removal / wipes) from cards we have no external tags for.
 */
export function roleTags(card: Card): Role[] {
  const text = card.oracleText.toLowerCase();
  const type = card.typeLine;
  const roles: Role[] = [];

  if (/\bland\b/i.test(type)) {
    roles.push('land');
    return roles; // Lands are handled as their own slot; don't double count them as ramp.
  }
  // Loyalty abilities and creature ETBs make poor "removal" or "wipe" slot-fillers; keep those for spells.
  const isSpell = !/Creature|Planeswalker/.test(type);

  if (
    /add (\{[wubrgc]\}|one mana|two mana|an amount|\w+ mana of)/.test(text) ||
    /search your library for (a|up to \w+) (basic )?(\w+ )?lands?/.test(text) ||
    /create (a|two|three|\w+) treasure/.test(text) ||
    /put (a|that|up to \w+) (\w+ )?land cards? .{0,40}onto the battlefield/.test(text)
  ) {
    roles.push('ramp');
  }

  if (/\bdraws? (a|an additional|two|three|four|x|that many|\w+) cards?\b/.test(text) || /you may draw/.test(text)) {
    // "target opponent draws" is a drawback, not card advantage.
    if (!/(target opponent|each opponent) draws/.test(text)) roles.push('draw');
  }

  if (isSpell && (/(destroy|exile) all (creatures|nonland permanents|permanents|artifacts|enchantments|other)/.test(text) || /deals? \d+ damage to each creature/.test(text))) {
    roles.push('wipe');
  } else if (
    isSpell &&
    (/(destroy|exile) target (?!player|card)/.test(text) || /deals? ([1-9]|x) damage to (any target|target creature|target planeswalker)/.test(text))
  ) {
    roles.push('removal');
  }

  return roles;
}

export interface Theme {
  id: string;
  label: string;
  /** Matches oracle text / type line. */
  pattern: RegExp;
  /** Scryfall query fragment that finds cards supporting the theme. */
  query: string;
}

export const THEMES: Theme[] = [
  { id: 'counters', label: '+1/+1 counters', pattern: /\+1\/\+1 counter|proliferate/, query: 'o:"+1/+1 counter"' },
  { id: 'tokens', label: 'tokens', pattern: /create [^.]*token|populate/, query: 'o:"create" o:"token"' },
  { id: 'sacrifice', label: 'sacrifice', pattern: /sacrifice (a|another|an|two|x)\b/, query: 'o:"sacrifice"' },
  { id: 'graveyard', label: 'graveyard', pattern: /graveyard|reanimat|\bmill\b/, query: 'o:"graveyard"' },
  { id: 'spells', label: 'spellslinger', pattern: /instant or sorcery|noncreature spell/, query: 'o:"instant or sorcery"' },
  { id: 'artifacts', label: 'artifacts', pattern: /\bartifacts?\b/, query: 'o:artifact' },
  { id: 'enchantments', label: 'enchantments', pattern: /\benchantments?\b|\bauras?\b/, query: 'o:enchantment' },
  { id: 'lifegain', label: 'lifegain', pattern: /gain (\d+|x) life|lifelink|whenever you gain life/, query: 'o:"whenever you gain life"' },
  { id: 'blink', label: 'blink', pattern: /exile [^.]*then return [^.]*to the battlefield|\bblink\b|flicker/, query: 'o:"return it to the battlefield"' },
  { id: 'lands', label: 'landfall / lands', pattern: /landfall|land enters|additional land/, query: 'o:landfall' },
  { id: 'equipment', label: 'equipment', pattern: /\bequipment\b|\bequip\b/, query: 't:equipment' },
];

export function themeTags(card: Card): string[] {
  const text = `${card.oracleText} ${card.typeLine}`.toLowerCase();
  return THEMES.filter((t) => t.pattern.test(text)).map((t) => t.id);
}

/** Creature subtypes ("Phyrexian Angel Horror" -> ["phyrexian", "angel", "horror"]). */
export function subtypes(card: Card): string[] {
  const [, sub] = card.typeLine.split('—');
  return sub ? sub.trim().toLowerCase().split(/\s+/) : [];
}

const BASIC_TYPE_COLOR: Record<string, string> = { plains: 'W', island: 'U', swamp: 'B', mountain: 'R', forest: 'G' };

/** How many of the commander's colors a land can produce (0 for colorless utility lands). */
export function landFixing(card: Card, identity: string[]): number {
  const text = card.oracleText.toLowerCase();
  if (/any color|any type|color in your commander's color identity|color of mana/.test(text)) return identity.length;
  const produced = new Set<string>();
  for (const c of identity) {
    if (new RegExp(`add [^.]*\\{${c.toLowerCase()}\\}`).test(text)) produced.add(c);
  }
  for (const [type, color] of Object.entries(BASIC_TYPE_COLOR)) {
    if (card.typeLine.toLowerCase().includes(type) && identity.includes(color)) produced.add(color);
  }
  return produced.size;
}
