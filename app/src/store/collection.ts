import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { mergeDuplicates, parseDecklist } from '@/core/decklist';
import { looksLikeManaBoxCsv, parseManaBoxCsv } from '@/core/manabox';
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
  /**
   * Import pasted text: either a ManaBox CSV (treated like a file, replacing the previous paste) or a plain
   * list such as "2 Sol Ring" (added to what was pasted before). Returns the names Scryfall didn't recognize.
   */
  importText: (text: string) => Promise<{ kind: 'csv' | 'list'; cards: number; notFound: string[] }>;
  removeSource: (fileName: string) => void;
  /** Adds `delta` copies of a card to the in-app list (negative removes; zero removes the row). */
  adjustManual: (card: Card, delta: number) => void;
}

/** Cards added by hand live in their own source so re-importing a ManaBox file never wipes them. */
export const MANUAL_SOURCE = 'Added in app';
export const PASTED_CSV_SOURCE = 'Pasted CSV';
export const PASTED_LIST_SOURCE = 'Pasted list';

export const useCollection = create<CollectionState>()(
  persist(
    (set, get) => ({
      sources: {},
      progress: null,
      importCsv: async (fileName, text) => {
        const entries = parseManaBoxCsv(text);
        set((s) => ({ sources: { ...s.sources, [fileName]: entries } }));
        const notFound = await hydrate(entries, set);
        return { cards: entries.length, notFound: notFound.length };
      },
      importText: async (text) => {
        if (looksLikeManaBoxCsv(text)) {
          const r = await get().importCsv(PASTED_CSV_SOURCE, text);
          return { kind: 'csv', cards: r.cards, notFound: [] };
        }
        const parsed = parseDecklist(text);
        const incoming = mergeDuplicates([...parsed.commanders, ...parsed.main, ...parsed.sideboard]);
        if (incoming.length === 0) throw new Error('Couldn’t find any cards. Paste a ManaBox CSV or lines like “2 Sol Ring”.');
        const entries: CollectionEntry[] = incoming.map((c) => ({
          name: c.name,
          quantity: c.quantity,
          setCode: c.setCode ?? '',
          collectorNumber: c.collectorNumber ?? '',
          foil: false,
        }));
        // Pasted lists add up: pasting "2 Sol Ring" twice means four.
        set((s) => {
          const merged = new Map<string, CollectionEntry>();
          for (const e of [...(s.sources[PASTED_LIST_SOURCE] ?? []), ...entries]) {
            const key = cardKey(e.name);
            const existing = merged.get(key);
            merged.set(key, existing ? { ...existing, quantity: existing.quantity + e.quantity } : { ...e });
          }
          return { sources: { ...s.sources, [PASTED_LIST_SOURCE]: [...merged.values()] } };
        });
        const notFound = await hydrate(entries, set);
        if (notFound.length > 0) {
          // Drop names Scryfall doesn't know so typos don't sit in the collection as ghost cards.
          const bad = new Set(notFound.map((n) => cardKey(n)));
          set((s) => {
            const left = (s.sources[PASTED_LIST_SOURCE] ?? []).filter((e) => !bad.has(cardKey(e.name)));
            const sources: Record<string, CollectionEntry[]> = { ...s.sources, [PASTED_LIST_SOURCE]: left };
            if (left.length === 0) delete sources[PASTED_LIST_SOURCE];
            return { sources };
          });
        }
        return { kind: 'list', cards: entries.length - notFound.length, notFound };
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

/** Fetches card data (images, prices, legality) for entries we haven't seen. Returns names that weren't found. */
async function hydrate(
  entries: CollectionEntry[],
  set: (partial: Partial<CollectionState>) => void,
): Promise<string[]> {
  const have = useCards.getState().cards;
  const wanted = collectionIdentifiers(entries.filter((e) => !have[cardKey(e.name)]));
  const total = wanted.length;
  set({ progress: { done: 0, total } });
  try {
    const { cards, notFound } = await fetchCards(wanted, (done) => set({ progress: { done, total } }));
    useCards.getState().put(cards);
    return notFound.flatMap((n) => ('name' in n ? [n.name] : []));
  } finally {
    set({ progress: null });
  }
}
