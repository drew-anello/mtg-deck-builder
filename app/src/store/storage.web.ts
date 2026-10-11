import { createJSONStorage } from 'zustand/middleware';

/** Web persistence: localStorage (expo-sqlite's web support is still alpha). Absent during static rendering. */
export const persistStorage = createJSONStorage(() =>
  typeof window === 'undefined' ? (undefined as never) : window.localStorage,
);
