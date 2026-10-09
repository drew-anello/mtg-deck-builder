import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { Platform } from 'react-native';

/** Lets the user pick one or more text files and returns their names and contents. */
export async function pickTextFiles(): Promise<{ name: string; text: string }[]> {
  const result = await DocumentPicker.getDocumentAsync({ type: ['text/*', 'application/csv', '*/*'], multiple: true });
  if (result.canceled) return [];
  return Promise.all(
    result.assets.map(async (asset) => ({
      name: asset.name,
      text: Platform.OS === 'web' && asset.file ? await asset.file.text() : await new File(asset.uri).text(),
    })),
  );
}
