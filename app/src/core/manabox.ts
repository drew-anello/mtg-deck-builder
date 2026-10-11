import { detectDelimiter, parseCsv } from './csv';
import type { CollectionEntry } from './types';

/**
 * Parses a ManaBox collection CSV export.
 *
 * ManaBox has no public API, so CSV is the integration point. Columns are matched by
 * header name (case-insensitive) rather than position, because there is no published
 * schema. Only name and quantity are required; everything else is best-effort.
 * TODO: verify against a real export from the user's account.
 */
export function parseManaBoxCsv(text: string): CollectionEntry[] {
  // Pasted exports sometimes arrive tab-separated, so don't assume commas.
  const rows = parseCsv(text, detectDelimiter(text));
  if (rows.length < 2) return [];

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = (...names: string[]) => {
    for (const n of names) {
      const i = header.indexOf(n);
      if (i !== -1) return i;
    }
    return -1;
  };

  const iName = col('name');
  const iQty = col('quantity', 'qty', 'count');
  if (iName === -1 || iQty === -1) {
    throw new Error('Not a ManaBox collection CSV: missing "Name" or "Quantity" column.');
  }
  const iSet = col('set code', 'set');
  const iNum = col('collector number', 'number');
  const iFoil = col('foil');
  const iCond = col('condition');
  const iId = col('scryfall id');

  const entries: CollectionEntry[] = [];
  for (const r of rows.slice(1)) {
    const name = r[iName]?.trim();
    const quantity = parseInt(r[iQty] ?? '', 10);
    if (!name || !Number.isFinite(quantity) || quantity <= 0) continue;
    const foilRaw = iFoil === -1 ? '' : (r[iFoil] ?? '').trim().toLowerCase();
    entries.push({
      name,
      quantity,
      setCode: iSet === -1 ? '' : (r[iSet] ?? '').trim().toLowerCase(),
      collectorNumber: iNum === -1 ? '' : (r[iNum] ?? '').trim(),
      foil: foilRaw !== '' && foilRaw !== 'normal' && foilRaw !== 'false' && foilRaw !== '0',
      condition: iCond === -1 ? undefined : r[iCond]?.trim() || undefined,
      scryfallId: iId === -1 ? undefined : r[iId]?.trim() || undefined,
    });
  }
  return entries;
}

/** A ManaBox export has a header row with at least Name and Quantity columns. */
export function looksLikeManaBoxCsv(text: string): boolean {
  const first = text.split(/\r?\n/).find((l) => l.trim() !== '')?.toLowerCase() ?? '';
  return /[,\t;]/.test(first) && first.includes('name') && first.includes('quantity');
}
