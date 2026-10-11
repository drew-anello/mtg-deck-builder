import type { DeckCard } from './types';

/**
 * TCGplayer Mass Entry: "<qty> <name> [<SET>] <number>", one card per line.
 * Set and number are optional and give a less specific match when omitted.
 * https://help.tcgplayer.com/hc/en-us/articles/360055768913-Getting-Started-With-Mass-Entry
 */
export function toTcgplayerMassEntry(cards: DeckCard[]): string {
  return cards
    .map((c) => {
      const printing =
        c.setCode && c.collectorNumber
          ? ` [${c.setCode.toUpperCase()}] ${c.collectorNumber}`
          : '';
      return `${c.quantity} ${c.name}${printing}`;
    })
    .join('\n');
}

/** Card Kingdom's Deck Builder accepts plain "<qty> <name>" lines. */
export function toCardKingdomList(cards: DeckCard[]): string {
  return cards.map((c) => `${c.quantity} ${c.name}`).join('\n');
}
