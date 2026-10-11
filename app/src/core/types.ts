export type Format = 'commander' | 'modern' | 'standard';

export const FORMAT_LABEL: Record<Format, string> = {
  commander: 'Commander',
  modern: 'Modern',
  standard: 'Standard',
};

/** One row of a user's collection (one printing, one finish, one condition). */
export interface CollectionEntry {
  name: string;
  setCode: string;
  collectorNumber: string;
  quantity: number;
  foil: boolean;
  condition?: string;
  scryfallId?: string;
}

/** One line of a decklist. Printing is optional; ownership is matched by card name. */
export interface DeckCard {
  name: string;
  quantity: number;
  setCode?: string;
  collectorNumber?: string;
}

export interface MissingCard extends DeckCard {
  owned: number;
}
