import * as Clipboard from 'expo-clipboard';
import { Linking, Platform } from 'react-native';

export async function openUrl(url: string): Promise<void> {
  if (Platform.OS === 'web') {
    window.open(url, '_blank', 'noopener,noreferrer');
    return;
  }
  await Linking.openURL(url);
}

export async function copyText(text: string): Promise<boolean> {
  try {
    return await Clipboard.setStringAsync(text);
  } catch {
    return false;
  }
}

export const TCGPLAYER_MASS_ENTRY_URL = 'https://www.tcgplayer.com/massentry';
export const CARD_KINGDOM_BUILDER_URL = 'https://www.cardkingdom.com/builder';
