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
  /** Re-fetch cards whose data is older than `maxAgeMs` so prices stay current. Returns how many were refreshed. */
  refreshStale: (maxAgeMs?: number) => Promise<number>;
}

/** Scryfall refreshes prices roughly once a day. */
export const PRICE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
let refreshing: Promise<number> | null = null;

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
      refreshStale: (maxAgeMs = PRICE_MAX_AGE_MS) => {
        // Share one in-flight refresh between callers (app start + manual button).
        if (refreshing) return refreshing;
        const cutoff = Date.now() - maxAgeMs;
        const stale = Object.values(get().cards).filter((c) => !c.fetchedAt || c.fetchedAt < cutoff);
        if (stale.length === 0) return Promise.resolve(0);
        refreshing = fetchCards(stale.map((c) => ({ id: c.id })))
          .then(({ cards }) => {
            get().put(cards);
            return cards.length;
          })
          .finally(() => {
            refreshing = null;
          });
        return refreshing;
      },
    }),
    { name: 'cards', storage: persistStorage },
  ),
);

export function lookupCard(name: string): Card | undefined {
  return useCards.getState().cards[cardKey(name)];
}
