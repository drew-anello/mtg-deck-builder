import { describe, expect, it } from 'vitest';
import { parseCsv } from './csv';
import { toCardKingdomList, toTcgplayerMassEntry } from './massEntry';
import { findMissing } from './missing';
import { parseManaBoxCsv } from './manabox';

const CSV = [
  'Name,Set code,Set name,Collector number,Foil,Rarity,Quantity,ManaBox ID,Scryfall ID,Purchase price,Misprint,Altered,Condition,Language,Purchase price currency',
  'Sol Ring,c21,Commander 2021,263,normal,uncommon,2,1,abc,1.00,false,false,near_mint,en,USD',
  '"Fire // Ice",mh2,Modern Horizons 2,290,foil,rare,1,2,def,2.00,false,false,near_mint,en,USD',
  'Island,m21,Core Set 2021,270,normal,common,12,3,ghi,0.10,false,false,near_mint,en,USD',
].join('\r\n');

describe('parseCsv', () => {
  it('handles quotes, escaped quotes and embedded commas', () => {
    expect(parseCsv('a,"b,c","d""e"\n1,2,3')).toEqual([
      ['a', 'b,c', 'd"e'],
      ['1', '2', '3'],
    ]);
  });
});

describe('parseManaBoxCsv', () => {
  it('maps columns by header', () => {
    const entries = parseManaBoxCsv(CSV);
    expect(entries).toHaveLength(3);
    expect(entries[0]).toMatchObject({ name: 'Sol Ring', setCode: 'c21', quantity: 2, foil: false });
    expect(entries[1]).toMatchObject({ name: 'Fire // Ice', foil: true });
  });

  it('rejects files without the required columns', () => {
    expect(() => parseManaBoxCsv('foo,bar\n1,2')).toThrow(/ManaBox/);
  });
});

describe('findMissing', () => {
  const collection = parseManaBoxCsv(CSV);

  it('returns only the shortfall and skips basic lands', () => {
    const missing = findMissing(
      [
        { name: 'Sol Ring', quantity: 1 },
        { name: 'Arcane Signet', quantity: 1 },
        { name: 'Island', quantity: 30 },
      ],
      collection,
    );
    expect(missing).toEqual([{ name: 'Arcane Signet', quantity: 1, owned: 0 }]);
  });

  it('matches split cards by front face', () => {
    expect(findMissing([{ name: 'Fire', quantity: 1 }], collection)).toEqual([]);
  });

  it('counts a partial shortfall', () => {
    expect(findMissing([{ name: 'Sol Ring', quantity: 3 }], collection)).toEqual([
      { name: 'Sol Ring', quantity: 1, owned: 2 },
    ]);
  });
});

describe('mass entry formatters', () => {
  const cards = [
    { name: 'Lightning Bolt', quantity: 1, setCode: 'sld', collectorNumber: '84' },
    { name: 'Sol Ring', quantity: 1 },
  ];
  it('formats TCGplayer lines with optional printing', () => {
    expect(toTcgplayerMassEntry(cards)).toBe('1 Lightning Bolt [SLD] 84\n1 Sol Ring');
  });
  it('formats Card Kingdom lines', () => {
    expect(toCardKingdomList(cards)).toBe('1 Lightning Bolt\n1 Sol Ring');
  });
});
