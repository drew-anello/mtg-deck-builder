import type { CollectionEntry, DeckCard, MissingCard } from './types';

const BASIC_LANDS = new Set([
  'plains',
  'island',
  'swamp',
  'mountain',
  'forest',
  'wastes',
  'snow-covered plains',
  'snow-covered island',
  'snow-covered swamp',
  'snow-covered mountain',
  'snow-covered forest',
]);

/** Front face only, lowercased, so "Fire // Ice" and "Fire" match the same card. */
export function normalizeName(name: string): string {
  return name.split('//')[0].trim().toLowerCase();
}

export function ownedCounts(collection: CollectionEntry[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const e of collection) {
    const key = normalizeName(e.name);
    counts.set(key, (counts.get(key) ?? 0) + e.quantity);
  }
  return counts;
}

/**
 * Cards (and how many copies) the deck needs that the collection doesn't cover.
 * Ownership is by card name across all printings. Basic lands are assumed free.
 */
export function findMissing(deck: DeckCard[], collection: CollectionEntry[]): MissingCard[] {
  const owned = ownedCounts(collection);
  const missing: MissingCard[] = [];
  for (const card of deck) {
    const key = normalizeName(card.name);
    if (BASIC_LANDS.has(key)) continue;
    const have = owned.get(key) ?? 0;
    if (have < card.quantity) {
      missing.push({ ...card, quantity: card.quantity - have, owned: have });
    }
  }
  return missing;
}
