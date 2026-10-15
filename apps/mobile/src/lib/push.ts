import { registerDeviceToken } from '@vybora/api';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { supabase } from './supabase';

export type PushRegistration = 'registered' | 'denied' | 'unsupported' | 'not_configured';

export async function registerForPush(): Promise<PushRegistration> {
  // Expo Go does not support remote push notifications on Android.
  // Return before loading expo-notifications.
  if (Constants.executionEnvironment === Constants.ExecutionEnvironment.StoreClient) {
    return 'unsupported';
  }

  if (!Device.isDevice) {
    return 'unsupported';
  }

  const projectId = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)
    ?.eas?.projectId;

  if (!projectId) {
    return 'not_configured';
  }

  // Import only after the Expo Go guard.
  const Notifications = await import('expo-notifications');

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Activity',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
    // One channel per message tone (Android binds sounds to channels).
    // The server picks the channel from the recipient's per-chat tone.
    await Notifications.setNotificationChannelAsync('messages', {
      name: 'Messages',
      importance: Notifications.AndroidImportance.HIGH,
    });
    await Notifications.setNotificationChannelAsync('messages-silent', {
      name: 'Messages (silent)',
      importance: Notifications.AndroidImportance.DEFAULT,
      sound: null,
    });
    for (const [tone, name] of [
      ['soft_chime', 'Soft chime'],
      ['pop', 'Pop'],
      ['bell', 'Bell'],
      ['electronic', 'Electronic'],
    ] as const) {
      await Notifications.setNotificationChannelAsync(`messages-${tone}`, {
        name: `Messages (${name})`,
        importance: Notifications.AndroidImportance.HIGH,
        sound: `${tone}.wav`,
      });
    }
  }

  const current = await Notifications.getPermissionsAsync();
  let granted = current.granted;

  if (!granted && current.canAskAgain) {
    granted = (await Notifications.requestPermissionsAsync()).granted;
  }

  if (!granted) {
    return 'denied';
  }

  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });

  await registerDeviceToken(supabase, token, Platform.OS === 'ios' ? 'ios' : 'android');

  return 'registered';
}
