import { Stack } from 'expo-router';
import { Platform } from 'react-native';

export default function DecksLayout() {
  // On web the floating tab bar sits where the stack header would be, so pages draw their own back link.
  return (
    <Stack screenOptions={{ headerShown: Platform.OS !== 'web' }}>
      <Stack.Screen name="index" options={{ title: 'Decks', headerShown: false }} />
      <Stack.Screen name="[id]/index" options={{ title: 'Deck' }} />
      <Stack.Screen name="[id]/search" options={{ title: 'Add cards' }} />
    </Stack>
  );
}
