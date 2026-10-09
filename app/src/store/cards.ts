import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { cardKey, fetchCards, type Card } from '@/core/scryfall';
import { persistStorage } from './storage';

interface CardState {
  /** Card data by normalized front-face name. */
  cards: Record<string, Card>;
  put: (cards: Card[]) => void;
  /** Fetch any of these names we don't have yet. */
  ensure: (names: string[]) => Promise<void>;
}

export const useCards = create<CardState>()(
  persist(
    (set, get) => ({
      cards: {},
      put: (incoming) =>
        set((s) => {
          const cards = { ...s.cards };
          for (const c of incoming) cards[cardKey(c.name)] = c;
          return { cards };
        }),
      ensure: async (names) => {
        const have = get().cards;
        const missing = [...new Set(names.filter((n) => !have[cardKey(n)]))];
        if (missing.length === 0) return;
        const { cards } = await fetchCards(missing.map((name) => ({ name })));
        get().put(cards);
      },
    }),
    { name: 'cards', storage: persistStorage },
  ),
);

export function lookupCard(name: string): Card | undefined {
  return useCards.getState().cards[cardKey(name)];
}
