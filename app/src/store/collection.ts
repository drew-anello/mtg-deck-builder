import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { parseManaBoxCsv } from '@/core/manabox';
import { cardKey, collectionIdentifiers, fetchCards, type Card } from '@/core/scryfall';
import type { CollectionEntry } from '@/core/types';
import { useCards } from './cards';
import { persistStorage } from './storage';

interface CollectionState {
  /**
   * One entry list per imported file (e.g. one ManaBox binder). Importing a file with the
   * same name replaces it, so re-exporting from ManaBox and re-importing refreshes the data.
   */
  sources: Record<string, CollectionEntry[]>;
  progress: { done: number; total: number } | null;
  importCsv: (fileName: string, text: string) => Promise<{ cards: number; notFound: number }>;
  removeSource: (fileName: string) => void;
  /** Adds `delta` copies of a card to the in-app list (negative removes; zero removes the row). */
  adjustManual: (card: Card, delta: number) => void;
}

/** Cards added by hand live in their own source so re-importing a ManaBox file never wipes them. */
export const MANUAL_SOURCE = 'Added in app';

export const useCollection = create<CollectionState>()(
  persist(
    (set) => ({
      sources: {},
      progress: null,
      importCsv: async (fileName, text) => {
        const entries = parseManaBoxCsv(text);
        set((s) => ({ sources: { ...s.sources, [fileName]: entries } }));

        // Load card data (images, prices, legality) for everything we don't have yet.
        const have = useCards.getState().cards;
        const wanted = collectionIdentifiers(entries.filter((e) => !have[cardKey(e.name)]));
        const total = wanted.length;
        set({ progress: { done: 0, total } });
        try {
          const { cards, notFound } = await fetchCards(wanted, (done) =>
            set({ progress: { done, total } }),
          );
          useCards.getState().put(cards);
          return { cards: entries.length, notFound: notFound.length };
        } finally {
          set({ progress: null });
        }
      },
      removeSource: (fileName) =>
        set((s) => {
          const sources = { ...s.sources };
          delete sources[fileName];
          return { sources };
        }),
      adjustManual: (card, delta) =>
        set((s) => {
          const list = s.sources[MANUAL_SOURCE] ?? [];
          const i = list.findIndex((e) => e.scryfallId === card.id);
          let next: CollectionEntry[];
          if (i === -1) {
            if (delta <= 0) return s;
            next = [
              ...list,
              { name: card.name, setCode: card.set, collectorNumber: card.collectorNumber, quantity: delta, foil: false, condition: 'near_mint', scryfallId: card.id },
            ];
          } else {
            const quantity = list[i].quantity + delta;
            next = quantity <= 0 ? list.filter((_, j) => j !== i) : list.map((e, j) => (j === i ? { ...e, quantity } : e));
          }
          const sources: Record<string, CollectionEntry[]> = { ...s.sources, [MANUAL_SOURCE]: next };
          if (next.length === 0) delete sources[MANUAL_SOURCE];
          return { sources };
        }),
    }),
    {
      name: 'collection',
      storage: persistStorage,
      partialize: (s) => ({ sources: s.sources }),
    },
  ),
);

export function allEntries(sources: Record<string, CollectionEntry[]>): CollectionEntry[] {
  return Object.values(sources).flat();
}
