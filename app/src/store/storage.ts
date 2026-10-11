import Storage from 'expo-sqlite/kv-store';
import { createJSONStorage } from 'zustand/middleware';

/** Native persistence: SQLite-backed key-value store. */
export const persistStorage = createJSONStorage(() => Storage);
