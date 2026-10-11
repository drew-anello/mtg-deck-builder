import type { DeckCard } from './types';

export interface ParsedDecklist {
  commanders: DeckCard[];
  main: DeckCard[];
  sideboard: DeckCard[];
}

const SECTION = /^(commander|companion|deck|main(?:board)?|side(?:board)?|maybeboard)s?:?$/i;
// "1 Sol Ring", "1x Sol Ring", "1 Sol Ring (C21) 263", "1 Lightning Bolt [SLD] 84", "SB: 1 Name"
const LINE = /^(?:(SB):\s*)?(\d+)\s*x?\s+(.+?)(?:\s+[([]([A-Za-z0-9]{2,6})[)\]](?:\s+(\S+))?)?\s*(?:\*[A-Za-z]+\*)?$/;

/** Parses the plain-text decklist formats used by Moxfield, Archidekt, Arena and mass-entry boxes. */
export function parseDecklist(text: string): ParsedDecklist {
  const out: ParsedDecklist = { commanders: [], main: [], sideboard: [] };
  let section: keyof ParsedDecklist | 'ignore' = 'main';

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('//') || line.startsWith('#')) continue;

    const header = SECTION.exec(line);
    if (header) {
      const h = header[1].toLowerCase();
      section = h === 'commander' ? 'commanders' : h.startsWith('side') ? 'sideboard' : h === 'companion' || h === 'maybeboard' ? 'ignore' : 'main';
      continue;
    }

    const m = LINE.exec(line);
    if (!m) continue;
    const card: DeckCard = {
      quantity: parseInt(m[2], 10),
      name: m[3].trim(),
      ...(m[4] ? { setCode: m[4].toLowerCase() } : {}),
      ...(m[5] ? { collectorNumber: m[5] } : {}),
    };
    const target = m[1] ? 'sideboard' : section;
    if (target !== 'ignore') out[target].push(card);
  }
  return out;
}

export function mergeDuplicates(cards: DeckCard[]): DeckCard[] {
  const byName = new Map<string, DeckCard>();
  for (const c of cards) {
    const key = c.name.toLowerCase();
    const existing = byName.get(key);
    if (existing) existing.quantity += c.quantity;
    else byName.set(key, { ...c });
  }
  return [...byName.values()];
}

export function toPlainList(cards: DeckCard[]): string {
  return cards.map((c) => `${c.quantity} ${c.name}`).join('\n');
}
