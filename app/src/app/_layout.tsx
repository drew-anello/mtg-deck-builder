import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import AppTabs from '@/components/app-tabs';
import { useCards } from '@/store/cards';

export default function RootLayout() {
  const colorScheme = useColorScheme();

  // Keep prices current: once persisted cards are loaded, refresh anything older than a day.
  useEffect(() => {
    const refresh = () => {
      useCards.getState().refreshStale().catch(() => {});
    };
    if (useCards.persist.hasHydrated()) refresh();
    return useCards.persist.onFinishHydration(refresh);
  }, []);

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AppTabs />
    </ThemeProvider>
  );
}
