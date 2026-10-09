import { Stack } from 'expo-router';
import { Platform } from 'react-native';

export default function CollectionLayout() {
  // On web the floating tab bar sits where the stack header would be, so pages draw their own back link.
  return (
    <Stack screenOptions={{ headerShown: Platform.OS !== 'web' }}>
      <Stack.Screen name="index" options={{ title: 'Collection', headerShown: false }} />
      <Stack.Screen name="add" options={{ title: 'Add cards' }} />
    </Stack>
  );
}
