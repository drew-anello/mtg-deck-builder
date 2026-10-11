import type { Card } from './scryfall';
import { cardKey } from './scryfall';
import type { DeckCard, Format } from './types';

export interface Deck {
  id: string;
  name: string;
  format: Format;
  commanders: string[];
  main: DeckCard[];
  sideboard: DeckCard[];
  updatedAt: number;
}

export interface Issue {
  severity: 'error' | 'warning';
  message: string;
  card?: string;
}

export interface ValidationResult {
  issues: Issue[];
  /** Cards counted toward the deck size (commanders included for Commander). */
  total: number;
  required: number;
  colorIdentity: string[];
  valid: boolean;
}

type Lookup = (name: string) => Card | undefined;

const BASIC = /^(Snow-Covered )?(Plains|Island|Swamp|Mountain|Forest)$|^Wastes$/;

export function isBasicLand(name: string): boolean {
  return BASIC.test(name);
}

/** Cards like Relentless Rats ignore the copy limit. Returns Infinity, a number, or undefined. */
export function copyLimitOverride(card: Card | undefined): number | undefined {
  if (!card) return undefined;
  if (/a deck can have any number of cards named/i.test(card.oracleText)) return Infinity;
  const up = /a deck can have up to (\w+) cards named/i.exec(card.oracleText);
  if (up) {
    const words: Record<string, number> = { two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
    return words[up[1].toLowerCase()] ?? parseInt(up[1], 10);
  }
  return undefined;
}

export function canBeCommander(card: Card): boolean {
  const t = card.typeLine;
  return (
    (/Legendary/.test(t) && /Creature/.test(t)) ||
    /can be your commander/i.test(card.oracleText) ||
    (/Legendary/.test(t) && /Vehicle|Spacecraft/.test(t) && /\d+\/\d+/.test(card.oracleText))
  );
}

const WUBRG = ['W', 'U', 'B', 'R', 'G'];
export function sortColors(colors: Iterable<string>): string[] {
  return [...new Set(colors)].sort((a, b) => WUBRG.indexOf(a) - WUBRG.indexOf(b));
}

function partnerOk(a: Card, b: Card): boolean {
  const kw = (c: Card) => c.keywords.map((k) => k.toLowerCase());
  const ka = kw(a);
  const kb = kw(b);
  if (ka.includes('partner') && kb.includes('partner')) return true;
  if (ka.includes('friends forever') && kb.includes('friends forever')) return true;
  if (ka.includes('choose a background') && /Background/.test(b.typeLine)) return true;
  if (kb.includes('choose a background') && /Background/.test(a.typeLine)) return true;
  // "Partner with X" only pairs with X.
  const withA = new RegExp(`partner with ${escapeRe(b.name)}`, 'i').test(a.oracleText);
  const withB = new RegExp(`partner with ${escapeRe(a.name)}`, 'i').test(b.oracleText);
  return withA && withB;
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function validateDeck(deck: Deck, lookup: Lookup): ValidationResult {
  const issues: Issue[] = [];
  const isCommander = deck.format === 'commander';
  const commanderCards = deck.commanders.map((n) => lookup(n));
  const identity = new Set<string>();
  for (const c of commanderCards) c?.colorIdentity.forEach((x) => identity.add(x));

  const mainCount = deck.main.reduce((s, c) => s + c.quantity, 0);
  const total = mainCount + (isCommander ? deck.commanders.length : 0);
  const required = isCommander ? 100 : 60;

  // --- Commander zone ---
  if (isCommander) {
    if (deck.commanders.length === 0) {
      issues.push({ severity: 'error', message: 'Choose a commander.' });
    }
    deck.commanders.forEach((name, i) => {
      const card = commanderCards[i];
      if (card && !canBeCommander(card)) {
        issues.push({ severity: 'error', message: `${name} can't be your commander.`, card: name });
      }
    });
    if (deck.commanders.length === 2) {
      const [a, b] = commanderCards;
      if (a && b && !partnerOk(a, b)) {
        issues.push({ severity: 'error', message: `${deck.commanders[0]} and ${deck.commanders[1]} can't be paired as partners.` });
      }
    }
    if (deck.commanders.length > 2) {
      issues.push({ severity: 'error', message: 'A deck has at most two commanders.' });
    }
  }

  // --- Size ---
  if (isCommander) {
    if (total > required) issues.push({ severity: 'error', message: `${total - required} too many cards (${total}/${required}).` });
    else if (total < required) issues.push({ severity: 'warning', message: `${required - total} more cards needed (${total}/${required}).` });
  } else {
    if (total < required) issues.push({ severity: 'warning', message: `${required - total} more cards needed (${total}/${required} minimum).` });
    const sb = deck.sideboard.reduce((s, c) => s + c.quantity, 0);
    if (sb > 15) issues.push({ severity: 'error', message: `Sideboard has ${sb} cards; the limit is 15.` });
  }

  // --- Per-card rules ---
  const counts = new Map<string, { name: string; qty: number }>();
  for (const c of [...deck.main, ...deck.sideboard]) {
    const key = cardKey(c.name);
    const e = counts.get(key) ?? { name: c.name, qty: 0 };
    e.qty += c.quantity;
    counts.set(key, e);
  }
  // In Commander the commander counts toward singleton too.
  for (const name of deck.commanders) {
    const e = counts.get(cardKey(name));
    if (e) e.qty += 1;
  }

  const formatKey = deck.format;
  const unknown: string[] = [];
  for (const { name, qty } of counts.values()) {
    if (isBasicLand(name)) continue;
    const card = lookup(name);
    if (!card) {
      unknown.push(name);
      continue;
    }
    const override = copyLimitOverride(card);
    const limit = override ?? (isCommander ? 1 : 4);
    if (qty > limit) {
      issues.push({
        severity: 'error',
        message: `${name}: ${qty} copies, limit is ${limit}.`,
        card: name,
      });
    }
  }

  const checkCards = [
    ...deck.main.map((c) => c.name),
    ...deck.sideboard.map((c) => c.name),
    ...deck.commanders,
  ];
  for (const name of new Set(checkCards)) {
    if (isBasicLand(name)) continue;
    const card = lookup(name);
    if (!card) continue;
    const status = card.legalities[formatKey];
    if (status === 'banned') {
      issues.push({ severity: 'error', message: `${name} is banned in ${formatKey}.`, card: name });
    } else if (status === 'not_legal') {
      issues.push({ severity: 'error', message: `${name} is not legal in ${formatKey}.`, card: name });
    } else if (status === 'restricted' && (counts.get(cardKey(name))?.qty ?? 0) > 1) {
      issues.push({ severity: 'error', message: `${name} is restricted in ${formatKey}.`, card: name });
    }
    if (isCommander && deck.commanders.length > 0 && !deck.commanders.includes(name)) {
      const outside = card.colorIdentity.filter((c) => !identity.has(c));
      if (outside.length > 0) {
        issues.push({
          severity: 'error',
          message: `${name} is outside your commander's color identity (${outside.join('')}).`,
          card: name,
        });
      }
    }
  }

  if (unknown.length > 0) {
    issues.push({
      severity: 'warning',
      message: `Couldn't verify ${unknown.length} card${unknown.length === 1 ? '' : 's'} (still loading or misspelled): ${unknown.slice(0, 3).join(', ')}${unknown.length > 3 ? '…' : ''}`,
    });
  }

  return {
    issues,
    total,
    required,
    colorIdentity: sortColors(identity),
    valid: !issues.some((i) => i.severity === 'error'),
  };
}
