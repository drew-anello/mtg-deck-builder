import { useMemo } from 'react';

import { ownedCounts } from '@/core/missing';
import { allEntries, useCollection } from '@/store/collection';

/** Map of normalized card name -> copies owned across every imported file. */
export function useOwned(): Map<string, number> {
  const sources = useCollection((s) => s.sources);
  return useMemo(() => ownedCounts(allEntries(sources)), [sources]);
}
