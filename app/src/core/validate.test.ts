import { describe, expect, it } from 'vitest';
import { parseDecklist } from './decklist';
import type { Card } from './scryfall';
import { cardKey } from './scryfall';
import { canBeCommander, validateDeck, type Deck } from './validate';

function card(over: Partial<Card> & { name: string }): Card {
  return {
    id: over.name,
    manaCost: '',
    cmc: 0,
    typeLine: 'Artifact',
    oracleText: '',
    colorIdentity: [],
    keywords: [],
    legalities: { commander: 'legal', modern: 'legal', standard: 'legal' },
    set: 'tst',
    collectorNumber: '1',
    ...over,
  };
}

const CARDS: Card[] = [
  card({ name: 'Atraxa, Praetors\' Voice', typeLine: 'Legendary Creature — Phyrexian Angel', colorIdentity: ['W', 'U', 'B', 'G'], keywords: [] }),
  card({ name: 'Sol Ring' }),
  card({ name: 'Lightning Bolt', typeLine: 'Instant', colorIdentity: ['R'] }),
  card({ name: 'Relentless Rats', typeLine: 'Creature — Rat', colorIdentity: ['B'], oracleText: 'A deck can have any number of cards named Relentless Rats.' }),
  card({ name: 'Mana Crypt', legalities: { commander: 'banned', modern: 'not_legal', standard: 'not_legal' } }),
  card({ name: 'Thrasios, Triton Hero', typeLine: 'Legendary Creature — Merfolk Wizard', colorIdentity: ['G', 'U'], keywords: ['Partner'] }),
  card({ name: 'Tymna the Weaver', typeLine: 'Legendary Creature — Human Cleric', colorIdentity: ['W', 'B'], keywords: ['Partner'] }),
];
const lookup = (name: string) => CARDS.find((c) => cardKey(c.name) === cardKey(name));

function deck(over: Partial<Deck>): Deck {
  return { id: 'd', name: 'Test', format: 'commander', commanders: [], main: [], sideboard: [], updatedAt: 0, ...over };
}

describe('parseDecklist', () => {
  it('parses sections, set codes and quantity styles', () => {
    const parsed = parseDecklist(
      ['Commander', "1 Atraxa, Praetors' Voice", '', 'Deck', '1x Sol Ring (C21) 263', '4 Lightning Bolt [SLD] 84', '', 'Sideboard', '2 Mana Crypt'].join('\n'),
    );
    expect(parsed.commanders).toEqual([{ name: "Atraxa, Praetors' Voice", quantity: 1 }]);
    expect(parsed.main).toEqual([
      { name: 'Sol Ring', quantity: 1, setCode: 'c21', collectorNumber: '263' },
      { name: 'Lightning Bolt', quantity: 4, setCode: 'sld', collectorNumber: '84' },
    ]);
    expect(parsed.sideboard).toEqual([{ name: 'Mana Crypt', quantity: 2 }]);
  });
});

describe('validateDeck: commander', () => {
  it('requires a commander and flags short decks as warnings', () => {
    const r = validateDeck(deck({ main: [{ name: 'Sol Ring', quantity: 1 }] }), lookup);
    expect(r.issues.some((i) => i.message.includes('Choose a commander'))).toBe(true);
    expect(r.valid).toBe(false);
  });

  it('flags singleton violations but not basics or any-number cards', () => {
    const r = validateDeck(
      deck({
        commanders: ["Atraxa, Praetors' Voice"],
        main: [
          { name: 'Sol Ring', quantity: 2 },
          { name: 'Forest', quantity: 30 },
          { name: 'Relentless Rats', quantity: 20 },
        ],
      }),
      lookup,
    );
    const msgs = r.issues.map((i) => i.message);
    expect(msgs.some((m) => m.startsWith('Sol Ring: 2 copies'))).toBe(true);
    expect(msgs.some((m) => m.includes('Forest'))).toBe(false);
    expect(msgs.some((m) => m.includes('Relentless Rats'))).toBe(false);
  });

  it('flags color identity and banned cards', () => {
    const r = validateDeck(
      deck({
        commanders: ["Atraxa, Praetors' Voice"],
        main: [
          { name: 'Lightning Bolt', quantity: 1 },
          { name: 'Mana Crypt', quantity: 1 },
        ],
      }),
      lookup,
    );
    const msgs = r.issues.map((i) => i.message);
    expect(msgs.some((m) => m.includes('Lightning Bolt is outside'))).toBe(true);
    expect(msgs.some((m) => m.includes('Mana Crypt is banned'))).toBe(true);
    expect(r.colorIdentity).toEqual(['W', 'U', 'B', 'G']);
  });

  it('counts the commander toward the 100 and rejects non-commanders', () => {
    const r = validateDeck(deck({ commanders: ['Sol Ring'], main: [] }), lookup);
    expect(r.total).toBe(1);
    expect(r.issues.some((i) => i.message.includes("can't be your commander"))).toBe(true);
  });

  it('accepts partner pairs and rejects others', () => {
    const ok = validateDeck(deck({ commanders: ['Thrasios, Triton Hero', 'Tymna the Weaver'] }), lookup);
    expect(ok.issues.some((i) => i.message.includes('partners'))).toBe(false);
    expect(ok.colorIdentity).toEqual(['W', 'U', 'B', 'G']);
    const bad = validateDeck(deck({ commanders: ["Atraxa, Praetors' Voice", 'Tymna the Weaver'] }), lookup);
    expect(bad.issues.some((i) => i.message.includes('partners'))).toBe(true);
  });

  it('treats a deck at exactly 100 as the right size', () => {
    const r = validateDeck(
      deck({ commanders: ["Atraxa, Praetors' Voice"], main: [{ name: 'Forest', quantity: 99 }] }),
      lookup,
    );
    expect(r.total).toBe(100);
    expect(r.valid).toBe(true);
  });
});

describe('validateDeck: 60-card formats', () => {
  it('enforces 4 copies and sideboard size', () => {
    const r = validateDeck(
      deck({
        format: 'modern',
        main: [{ name: 'Lightning Bolt', quantity: 5 }],
        sideboard: [{ name: 'Forest', quantity: 16 }],
      }),
      lookup,
    );
    const msgs = r.issues.map((i) => i.message);
    expect(msgs.some((m) => m.startsWith('Lightning Bolt: 5 copies'))).toBe(true);
    expect(msgs.some((m) => m.includes('Sideboard has 16'))).toBe(true);
  });

  it('flags cards not legal in the format', () => {
    const r = validateDeck(deck({ format: 'standard', main: [{ name: 'Mana Crypt', quantity: 1 }] }), lookup);
    expect(r.issues.some((i) => i.message.includes('Mana Crypt is not legal in standard'))).toBe(true);
  });
});

describe('canBeCommander', () => {
  it('accepts legendary creatures and "can be your commander" text', () => {
    expect(canBeCommander(lookup('Tymna the Weaver')!)).toBe(true);
    expect(canBeCommander(card({ name: 'X', typeLine: 'Legendary Planeswalker', oracleText: 'X can be your commander.' }))).toBe(true);
    expect(canBeCommander(lookup('Sol Ring')!)).toBe(false);
  });
});
