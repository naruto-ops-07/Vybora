import * as Clipboard from 'expo-clipboard';
import { Alert } from 'react-native';

/** Copies text. Success stays silent (the OS shows its own hint); failures are explained. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if ((await Clipboard.setStringAsync(text)) === false) throw new Error('clipboard refused');
    return true;
  } catch {
    Alert.alert('Couldn’t copy', 'The text wasn’t copied. Try again.');
    return false;
  }
}
