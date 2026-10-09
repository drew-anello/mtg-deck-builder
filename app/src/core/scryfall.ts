import { normalizeName } from './missing';
import type { CollectionEntry } from './types';

/** The slice of a Scryfall card object the app uses, flattened so it is cheap to persist. */
export interface Card {
  id: string;
  name: string;
  manaCost: string;
  cmc: number;
  typeLine: string;
  oracleText: string;
  colorIdentity: string[];
  keywords: string[];
  /** format -> 'legal' | 'not_legal' | 'banned' | 'restricted' */
  legalities: Record<string, string>;
  imageSmall?: string;
  imageNormal?: string;
  priceUsd?: number;
  priceUsdFoil?: number;
  tcgplayerUrl?: string;
  cardKingdomUrl?: string;
  set: string;
  collectorNumber: string;
  edhrecRank?: number;
}

interface ScryfallCard {
  id: string;
  name: string;
  mana_cost?: string;
  cmc: number;
  type_line?: string;
  oracle_text?: string;
  color_identity: string[];
  keywords?: string[];
  legalities: Record<string, string>;
  image_uris?: { small: string; normal: string };
  card_faces?: {
    mana_cost?: string;
    type_line?: string;
    oracle_text?: string;
    image_uris?: { small: string; normal: string };
  }[];
  prices?: { usd?: string | null; usd_foil?: string | null };
  purchase_uris?: { tcgplayer?: string; cardkingdom?: string };
  set: string;
  collector_number: string;
  edhrec_rank?: number;
}

const API = 'https://api.scryfall.com';
// Scryfall asks for a descriptive User-Agent and an Accept header on every request.
// Browsers ignore a custom User-Agent, which is fine.
const HEADERS = {
  Accept: 'application/json;q=0.9,*/*;q=0.8',
  'User-Agent': 'MTGDeckBuilder/0.1',
};
// Scryfall asks for 50-100ms between requests.
const MIN_GAP_MS = 100;

let lastRequest = 0;
async function throttle() {
  const wait = lastRequest + MIN_GAP_MS - Date.now();
  lastRequest = Math.max(Date.now(), lastRequest + MIN_GAP_MS);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  await throttle();
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { ...HEADERS, ...(init?.headers ?? {}), ...(init?.body ? { 'Content-Type': 'application/json' } : {}) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const err = new Error(body?.details ?? `Scryfall request failed (${res.status})`);
    (err as Error & { status?: number }).status = res.status;
    throw err;
  }
  return res.json() as Promise<T>;
}

export function toCard(c: ScryfallCard): Card {
  const front = c.card_faces?.[0];
  const images = c.image_uris ?? front?.image_uris;
  // Double-faced cards keep their text on the faces.
  const manaCost = c.mana_cost ?? front?.mana_cost ?? '';
  const oracleText =
    c.oracle_text ?? c.card_faces?.map((f) => f.oracle_text ?? '').join('\n//\n') ?? '';
  const typeLine = c.type_line ?? front?.type_line ?? '';
  const usd = c.prices?.usd ? parseFloat(c.prices.usd) : undefined;
  const usdFoil = c.prices?.usd_foil ? parseFloat(c.prices.usd_foil) : undefined;
  return {
    id: c.id,
    name: c.name,
    manaCost,
    cmc: c.cmc,
    typeLine,
    oracleText,
    colorIdentity: c.color_identity,
    keywords: c.keywords ?? [],
    legalities: c.legalities,
    imageSmall: images?.small,
    imageNormal: images?.normal,
    priceUsd: usd,
    priceUsdFoil: usdFoil,
    tcgplayerUrl: c.purchase_uris?.tcgplayer,
    cardKingdomUrl: c.purchase_uris?.cardkingdom,
    set: c.set,
    collectorNumber: c.collector_number,
    edhrecRank: c.edhrec_rank,
  };
}

export type CardIdentifier = { id: string } | { name: string };

/** Looks up cards in batches of 75 (the API limit). Unknown cards are returned in `notFound`. */
export async function fetchCards(
  identifiers: CardIdentifier[],
  onProgress?: (done: number, total: number) => void,
): Promise<{ cards: Card[]; notFound: CardIdentifier[] }> {
  const cards: Card[] = [];
  const notFound: CardIdentifier[] = [];
  for (let i = 0; i < identifiers.length; i += 75) {
    // The collection endpoint only matches the front face of multi-face names ("Fire", not "Fire // Ice").
    const batch = identifiers
      .slice(i, i + 75)
      .map((id) => ('name' in id ? { name: id.name.split('//')[0].trim() } : id));
    const res = await request<{ data: ScryfallCard[]; not_found: CardIdentifier[] }>(
      '/cards/collection',
      { method: 'POST', body: JSON.stringify({ identifiers: batch }) },
    );
    cards.push(...res.data.map(toCard));
    notFound.push(...res.not_found);
    onProgress?.(Math.min(i + 75, identifiers.length), identifiers.length);
  }
  return { cards, notFound };
}

export interface SearchResult {
  cards: Card[];
  hasMore: boolean;
  total: number;
}

/** Scryfall full-text search syntax: https://scryfall.com/docs/syntax */
export async function searchCards(query: string, page = 1): Promise<SearchResult> {
  try {
    const res = await request<{ data: ScryfallCard[]; has_more: boolean; total_cards: number }>(
      `/cards/search?q=${encodeURIComponent(query)}&unique=cards&order=edhrec&page=${page}`,
    );
    return { cards: res.data.map(toCard), hasMore: res.has_more, total: res.total_cards };
  } catch (e) {
    // Scryfall answers 404 for "no matches".
    if ((e as { status?: number }).status === 404) return { cards: [], hasMore: false, total: 0 };
    throw e;
  }
}

/** Distinct cards in a collection, keyed to the Scryfall printing the user owns. */
export function collectionIdentifiers(entries: CollectionEntry[]): CardIdentifier[] {
  const seen = new Set<string>();
  const out: CardIdentifier[] = [];
  for (const e of entries) {
    // One printing per card name is enough for display and legality data.
    const key = normalizeName(e.name);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e.scryfallId ? { id: e.scryfallId } : { name: e.name });
  }
  return out;
}

export function cardKey(name: string): string {
  return normalizeName(name);
}

/** Fallback buy links for when Scryfall has no purchase URI for a card. */
export function tcgplayerSearchUrl(name: string): string {
  return `https://www.tcgplayer.com/search/magic/product?productLineName=magic&q=${encodeURIComponent(name)}`;
}

export function cardKingdomSearchUrl(name: string): string {
  return `https://www.cardkingdom.com/catalog/search?search=header&filter%5Bname%5D=${encodeURIComponent(name)}`;
}
