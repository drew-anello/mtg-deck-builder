import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { cardKey } from '@/core/scryfall';
import type { DeckCard, Format } from '@/core/types';
import type { Deck } from '@/core/validate';
import { persistStorage } from './storage';

interface DeckState {
  decks: Record<string, Deck>;
  create: (name: string, format: Format, init?: Partial<Pick<Deck, 'commanders' | 'main' | 'sideboard'>>) => string;
  rename: (id: string, name: string) => void;
  remove: (id: string) => void;
  /** Adds `delta` copies (negative removes). The card disappears at zero. */
  adjust: (id: string, name: string, delta: number, board?: 'main' | 'sideboard') => void;
  setCommanders: (id: string, names: string[]) => void;
}

const touch = (d: Deck, patch: Partial<Deck>): Deck => ({ ...d, ...patch, updatedAt: Date.now() });

function adjustList(list: DeckCard[], name: string, delta: number): DeckCard[] {
  const key = cardKey(name);
  const i = list.findIndex((c) => cardKey(c.name) === key);
  if (i === -1) return delta > 0 ? [...list, { name, quantity: delta }] : list;
  const quantity = list[i].quantity + delta;
  if (quantity <= 0) return list.filter((_, j) => j !== i);
  return list.map((c, j) => (j === i ? { ...c, quantity } : c));
}

export const useDecks = create<DeckState>()(
  persist(
    (set) => ({
      decks: {},
      create: (name, format, init) => {
        const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
        const deck: Deck = {
          id,
          name: name.trim() || 'Untitled deck',
          format,
          commanders: [],
          main: [],
          sideboard: [],
          updatedAt: Date.now(),
          ...init,
        };
        set((s) => ({ decks: { ...s.decks, [id]: deck } }));
        return id;
      },
      rename: (id, name) =>
        set((s) => (s.decks[id] ? { decks: { ...s.decks, [id]: touch(s.decks[id], { name }) } } : s)),
      remove: (id) =>
        set((s) => {
          const decks = { ...s.decks };
          delete decks[id];
          return { decks };
        }),
      adjust: (id, name, delta, board = 'main') =>
        set((s) => {
          const d = s.decks[id];
          if (!d) return s;
          return { decks: { ...s.decks, [id]: touch(d, { [board]: adjustList(d[board], name, delta) }) } };
        }),
      setCommanders: (id, names) =>
        set((s) => {
          const d = s.decks[id];
          if (!d) return s;
          // A commander should not also sit in the 99.
          const keys = new Set(names.map(cardKey));
          const main = d.main.filter((c) => !keys.has(cardKey(c.name)));
          return { decks: { ...s.decks, [id]: touch(d, { commanders: names, main }) } };
        }),
    }),
    { name: 'decks', storage: persistStorage },
  ),
);
