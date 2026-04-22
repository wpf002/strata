/**
 * Push notification registration via Firebase Cloud Messaging.
 *
 * Prerequisites (not yet installed — run before enabling):
 *   npx react-native install @react-native-firebase/app
 *   npx react-native install @react-native-firebase/messaging
 * Then add google-services.json (Android) and GoogleService-Info.plist (iOS)
 * from the Firebase console. Set FIREBASE_SERVER_KEY in backend/.env.
 *
 * Until those packages are installed, all calls degrade silently.
 */

import { Platform } from 'react-native';
import { registerPushToken } from '../api';

type FirebaseMessaging = {
  requestPermission(): Promise<number>;
  getToken(): Promise<string>;
  onTokenRefresh(cb: (token: string) => void): () => void;
  AuthorizationStatus: { AUTHORIZED: number; PROVISIONAL: number };
};

function getMessaging(): FirebaseMessaging | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('@react-native-firebase/messaging').default() as FirebaseMessaging;
  } catch {
    return null;
  }
}

export async function setupPushNotifications(): Promise<void> {
  const messaging = getMessaging();
  if (!messaging) return;

  try {
    const status = await messaging.requestPermission();
    const authorized =
      status === messaging.AuthorizationStatus.AUTHORIZED ||
      status === messaging.AuthorizationStatus.PROVISIONAL;

    if (!authorized) return;

    const token = await messaging.getToken();
    if (token) {
      const platform = Platform.OS === 'android' ? 'android' : 'ios';
      await registerPushToken(token, platform).catch(() => {});
    }

    messaging.onTokenRefresh(async newToken => {
      const platform = Platform.OS === 'android' ? 'android' : 'ios';
      await registerPushToken(newToken, platform).catch(() => {});
    });
  } catch {
    // Graceful degradation — token registration is best-effort
  }
}
