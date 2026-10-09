import { describe, expect, it } from 'vitest';
import { buildDeck, splitBasics, type PoolCard } from './builder';
import { parseFindMyCombos, type ComboRef } from './combos';
import { roleTags, themeTags } from './roles';
import type { Card } from './scryfall';
import { validateDeck } from './validate';
import { cardKey } from './scryfall';

function card(name: string, over: Partial<Card> = {}): Card {
  return {
    id: name,
    name,
    manaCost: '{1}{U}',
    cmc: 2,
    typeLine: 'Creature — Human',
    oracleText: '',
    colorIdentity: ['U'],
    keywords: [],
    legalities: { commander: 'legal' },
    set: 'tst',
    collectorNumber: '1',
    ...over,
  };
}

const ATRAXA = card("Atraxa, Praetors' Voice", {
  typeLine: 'Legendary Creature — Phyrexian Angel Horror',
  colorIdentity: ['W', 'U', 'B', 'G'],
  oracleText: 'At the beginning of your end step, proliferate.',
  manaCost: '{G}{W}{U}{B}',
});

/** A pool big enough to make a full deck: 20 lands, 15 ramp, 12 draw, 12 removal, 4 wipes, 60 filler. */
function bigPool(owned = 1): PoolCard[] {
  const pool: PoolCard[] = [];
  const mk = (prefix: string, n: number, over: Partial<Card>, roles: PoolCard['roles'] = []) => {
    for (let i = 0; i < n; i++) pool.push({ card: card(`${prefix} ${i}`, { edhrecRank: 100 + i * 50, ...over }), roles, owned });
  };
  mk('Land', 20, { typeLine: 'Land', manaCost: '', colorIdentity: [] }, ['land']);
  mk('Rock', 15, { typeLine: 'Artifact', oracleText: '{T}: Add {C}.', manaCost: '{2}' });
  mk('Draw', 12, { typeLine: 'Sorcery', oracleText: 'Draw two cards.' });
  mk('Kill', 12, { typeLine: 'Instant', oracleText: 'Destroy target creature.', colorIdentity: ['B'] });
  mk('Wipe', 4, { typeLine: 'Sorcery', oracleText: 'Destroy all creatures.', colorIdentity: ['B'] });
  mk('Filler', 60, { typeLine: 'Creature — Elf', colorIdentity: ['G'], oracleText: 'Vigilance' });
  return pool;
}

describe('roleTags / themeTags', () => {
  it('detects roles from oracle text', () => {
    expect(roleTags(card('Sol Ring', { typeLine: 'Artifact', oracleText: '{T}: Add {C}{C}.' }))).toContain('ramp');
    expect(roleTags(card('Rampant Growth', { typeLine: 'Sorcery', oracleText: 'Search your library for a basic land card, put that card onto the battlefield tapped.' }))).toContain('ramp');
    expect(roleTags(card('Swords', { typeLine: 'Instant', oracleText: 'Exile target creature. Its controller gains life.' }))).toContain('removal');
    expect(roleTags(card('Wrath', { typeLine: 'Sorcery', oracleText: 'Destroy all creatures.' }))).toEqual(['wipe']);
    expect(roleTags(card('Tower', { typeLine: 'Land', oracleText: '{T}: Add {C}.' }))).toEqual(['land']);
    expect(roleTags(card('Pact', { typeLine: 'Sorcery', oracleText: 'Target opponent draws three cards.' }))).not.toContain('draw');
  });
  it('detects themes', () => {
    expect(themeTags(ATRAXA)).toContain('counters');
  });
});

describe('splitBasics', () => {
  it('splits proportionally with at least one of each color and sums to n', () => {
    const r = splitBasics(20, ['W', 'U', 'B', 'G'], { W: 10, U: 5, B: 5, G: 0 });
    expect(Object.values(r).reduce((a, b) => a + b, 0)).toBe(20);
    expect(r.Plains).toBeGreaterThan(r.Island);
    expect(r.Forest).toBeGreaterThanOrEqual(1);
  });
  it('uses Wastes for colorless identities', () => {
    expect(splitBasics(10, [], {})).toEqual({ Wastes: 10 });
  });
});

describe('buildDeck', () => {
  const combo: ComboRef = {
    id: '1',
    cards: ['Filler 3', 'Filler 4'],
    produces: ['Infinite mana'],
    description: '',
    bracketTag: 'S',
    popularity: 100,
    identity: 'G',
  };

  it('builds a 100-card legal deck from a big enough pool, including the combo', () => {
    const r = buildDeck({ commander: ATRAXA, pool: bigPool(), combos: [combo], mode: 'any', comboCount: 2 });
    expect(r.total).toBe(100);
    expect(r.shortBy).toBe(0);
    expect(r.combos).toHaveLength(1);
    const names = r.picks.map((p) => p.name);
    expect(names).toContain('Filler 3');
    expect(names).toContain('Filler 4');

    const deck = {
      id: 'x', name: 'x', format: 'commander' as const, commanders: [ATRAXA.name], sideboard: [], updatedAt: 0,
      main: r.picks.map((p) => ({ name: p.name, quantity: p.quantity })),
    };
    const lookup = (n: string) => [ATRAXA, ...r.picks.map((p) => p.card).filter(Boolean) as Card[]].find((c) => cardKey(c.name) === cardKey(n));
    const v = validateDeck(deck, lookup);
    expect(v.issues.filter((i) => i.severity === 'error')).toEqual([]);
    expect(v.total).toBe(100);
  });

  it('fills role quotas', () => {
    const r = buildDeck({ commander: ATRAXA, pool: bigPool(), combos: [], mode: 'any', comboCount: 0 });
    const count = (cat: string) => r.picks.filter((p) => p.category === cat).length;
    expect(count('ramp')).toBeGreaterThanOrEqual(10);
    expect(count('draw')).toBeGreaterThanOrEqual(9);
    expect(count('removal')).toBeGreaterThanOrEqual(8);
    expect(count('wipe')).toBeGreaterThanOrEqual(3);
  });

  it('owned mode only uses owned cards and reports a shortfall', () => {
    const pool = bigPool(1);
    for (const p of pool.slice(0, 50)) p.owned = 0;
    const r = buildDeck({ commander: ATRAXA, pool, combos: [], mode: 'owned', comboCount: 0 });
    const ownedNames = new Set(pool.filter((p) => p.owned > 0).map((p) => p.card.name));
    for (const p of r.picks.filter((p) => p.category !== 'basic')) expect(ownedNames.has(p.name)).toBe(true);
    expect(r.total).toBeLessThanOrEqual(100);
  });

  it('skips off-color, banned and unowned-combo cards', () => {
    const pool = bigPool();
    pool.push({ card: card('Red Card', { colorIdentity: ['R'], edhrecRank: 1 }), roles: [], owned: 1 });
    pool.push({ card: card('Banned Card', { legalities: { commander: 'banned' }, edhrecRank: 1 }), roles: [], owned: 1 });
    const r = buildDeck({ commander: ATRAXA, pool, combos: [], mode: 'any', comboCount: 0 });
    const names = r.picks.map((p) => p.name);
    expect(names).not.toContain('Red Card');
    expect(names).not.toContain('Banned Card');

    const missingPiece: ComboRef = { ...combo, cards: ['Filler 3', 'Not In Pool'] };
    const r2 = buildDeck({ commander: ATRAXA, pool: bigPool(), combos: [missingPiece], mode: 'any', comboCount: 2 });
    expect(r2.combos).toHaveLength(0);
  });

  it('returns a short deck instead of padding with junk when the pool is tiny', () => {
    const r = buildDeck({ commander: ATRAXA, pool: bigPool().slice(0, 10), combos: [], mode: 'any', comboCount: 0 });
    expect(r.shortBy).toBeGreaterThan(0);
    expect(r.total + r.shortBy).toBe(100);
  });
});

describe('parseFindMyCombos', () => {
  it('maps variants to combo refs', () => {
    const v = (id: string) => ({
      id,
      identity: 'UB',
      bracketTag: 'R',
      popularity: 5,
      description: 'Do things.',
      uses: [{ card: { name: 'Demonic Consultation' } }, { card: { name: "Thassa's Oracle" } }],
      produces: [{ feature: { name: 'Win the game' } }],
    });
    const parsed = parseFindMyCombos({ results: { included: [v('a')], almostIncluded: [v('b')] } });
    expect(parsed.included[0]).toMatchObject({ id: 'a', cards: ['Demonic Consultation', "Thassa's Oracle"], produces: ['Win the game'], bracketTag: 'R' });
    expect(parsed.almost).toHaveLength(1);
  });
});

describe('buildDeck: lands tagged as ramp', () => {
  it("doesn't let tagged lands satisfy the ramp quota", () => {
    const pool = bigPool();
    for (const p of pool) if (p.roles.includes('land')) p.roles = ['land', 'ramp'];
    const r = buildDeck({ commander: ATRAXA, pool, combos: [], mode: 'any', comboCount: 0 });
    expect(r.picks.filter((p) => p.category === 'ramp').length).toBeGreaterThanOrEqual(10);
  });
});

describe('buildDeck: combo selection', () => {
  const mkCombo = (id: string, cards: string[], produces: string[], bracketTag = 'S', popularity = 10): ComboRef => ({
    id, cards, produces, description: '', bracketTag, popularity, identity: 'G',
  });

  it('skips banned combos and combos that repeat the same effect', () => {
    const combos = [
      mkCombo('banned', ['Filler 1', 'Filler 2'], ['Win the game'], 'B', 999),
      mkCombo('a', ['Filler 3', 'Filler 4'], ['Infinite mana'], 'S', 100),
      mkCombo('dup', ['Filler 3', 'Filler 5'], ['Infinite mana'], 'S', 90),
      mkCombo('b', ['Filler 6', 'Filler 7'], ['Infinite damage'], 'S', 80),
    ];
    const r = buildDeck({ commander: ATRAXA, pool: bigPool(), combos, mode: 'any', comboCount: 3 });
    expect(r.combos.map((c) => c.id)).toEqual(['a', 'b']);
  });

  it('does not treat big damage numbers as removal', () => {
    const c = card('Reservoir', { typeLine: 'Artifact', oracleText: 'Pay 50 life: Reservoir deals 50 damage to any target.' });
    expect(roleTags(c)).not.toContain('removal');
    const bolt = card('Bolt', { typeLine: 'Instant', oracleText: 'Bolt deals 3 damage to any target.' });
    expect(roleTags(bolt)).toContain('removal');
  });
});
