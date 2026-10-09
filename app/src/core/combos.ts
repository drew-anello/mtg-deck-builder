import { cardKey } from './scryfall';

/** A combo from Commander Spellbook (https://commanderspellbook.com). */
export interface ComboRef {
  id: string;
  /** Every card the combo uses, including the commander if it's part of it. */
  cards: string[];
  produces: string[];
  description: string;
  /** Commander Spellbook's bracket tag: R, S, P, O, C, E or B (see BRACKET_LABEL). */
  bracketTag: string;
  popularity: number;
  identity: string;
}

export const BRACKET_LABEL: Record<string, string> = {
  R: 'Ruthless',
  S: 'Spicy',
  P: 'Powerful',
  O: 'Oddball',
  C: 'Core',
  E: 'Exhibition',
  B: 'Banned',
};

interface Variant {
  id: string;
  identity: string;
  bracketTag?: string;
  popularity?: number;
  description?: string;
  uses: { card: { name: string } }[];
  produces: { feature: { name: string } }[];
}

interface FindMyCombosResponse {
  results: {
    included: Variant[];
    almostIncluded: Variant[];
  };
}

const BASE = 'https://backend.commanderspellbook.com';

function toRef(v: Variant): ComboRef {
  return {
    id: v.id,
    cards: v.uses.map((u) => u.card.name),
    produces: v.produces.map((p) => p.feature.name),
    description: v.description ?? '',
    bracketTag: v.bracketTag ?? '',
    popularity: v.popularity ?? 0,
    identity: v.identity,
  };
}

/** Pure parsing step, split out so it can be tested without the network. */
export function parseFindMyCombos(res: FindMyCombosResponse): { included: ComboRef[]; almost: ComboRef[] } {
  return {
    included: res.results.included.map(toRef),
    almost: res.results.almostIncluded.map(toRef),
  };
}

/**
 * Asks Commander Spellbook which combos exist in a candidate pool.
 * `included` combos are complete within the pool; `almost` ones are missing a card.
 * Their API guidelines: a few calls per user action, a named User-Agent, handle 429.
 */
export async function findCombos(
  commanders: string[],
  pool: string[],
  limit = 100,
): Promise<{ included: ComboRef[]; almost: ComboRef[] }> {
  const body = {
    commanders: commanders.map((card) => ({ card, quantity: 1 })),
    main: pool.map((card) => ({ card, quantity: 1 })),
  };
  const res = await fetch(`${BASE}/find-my-combos?limit=${limit}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': 'MTGDeckBuilder/0.1' },
    body: JSON.stringify(body),
  });
  if (res.status === 429) throw new Error('Commander Spellbook is rate limiting us. Try again in a minute.');
  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).slice(0, 200);
    throw new Error(`Commander Spellbook request failed (${res.status})${detail ? `: ${detail}` : ''}`);
  }
  return parseFindMyCombos((await res.json()) as FindMyCombosResponse);
}

/** Cards of a combo that are neither the commander nor already in the pool. */
export function missingFromPool(combo: ComboRef, commanders: string[], poolKeys: Set<string>): string[] {
  const cmd = new Set(commanders.map(cardKey));
  return combo.cards.filter((n) => !cmd.has(cardKey(n)) && !poolKeys.has(cardKey(n)));
}
