/**
 * Push notification setup via Firebase Cloud Messaging.
 *
 * Prerequisites — run before enabling push:
 *   npm install @react-native-firebase/app @react-native-firebase/messaging
 *   npx react-native link (or use autolinking on RN 0.60+)
 *
 * Then:
 *   - Move google-services.json  → android/app/google-services.json
 *   - Move GoogleService-Info.plist → ios/GoogleService-Info.plist
 *   - Set FIREBASE_SERVER_KEY in backend/.env (from Firebase Console > Project Settings > Cloud Messaging)
 *
 * Until @react-native-firebase packages are installed, all calls degrade silently.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
declare function require(module: string): any;
import { Alert, Platform } from 'react-native';
import { registerPushToken } from '../api';

type FirebaseMessaging = {
  requestPermission(): Promise<number>;
  getToken(): Promise<string>;
  onTokenRefresh(cb: (token: string) => void): () => void;
  onMessage(cb: (msg: RemoteMessage) => void): () => void;
  setBackgroundMessageHandler(cb: (msg: RemoteMessage) => Promise<void>): void;
  AuthorizationStatus: { AUTHORIZED: number; PROVISIONAL: number };
};

interface RemoteMessage {
  notification?: { title?: string; body?: string };
  data?: Record<string, string>;
}

function getMessaging(): FirebaseMessaging | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('@react-native-firebase/messaging').default() as FirebaseMessaging;
  } catch {
    return null;
  }
}

async function _registerToken(messaging: FirebaseMessaging): Promise<void> {
  const token = await messaging.getToken();
  if (token) {
    const platform = Platform.OS === 'android' ? 'android' : 'ios';
    await registerPushToken(token, platform).catch(() => {});
  }
}

export async function setupPushNotifications(): Promise<void> {
  const messaging = getMessaging();
  if (!messaging) return;

  try {
    // iOS: explicitly request permission
    const status = await messaging.requestPermission();
    const authorized =
      status === messaging.AuthorizationStatus.AUTHORIZED ||
      status === messaging.AuthorizationStatus.PROVISIONAL;

    if (!authorized) return;

    // Register token with backend
    await _registerToken(messaging);

    // Refresh token handler
    messaging.onTokenRefresh(async newToken => {
      const platform = Platform.OS === 'android' ? 'android' : 'ios';
      await registerPushToken(newToken, platform).catch(() => {});
    });

    // Foreground message handler — show in-app banner
    messaging.onMessage(async remoteMessage => {
      const title = remoteMessage.notification?.title ?? 'STRATA Alert';
      const body = remoteMessage.notification?.body ?? '';
      Alert.alert(title, body);
    });

    // Background / quit state handler
    messaging.setBackgroundMessageHandler(async _remoteMessage => {
      // Navigation on tap is handled natively via the notification payload.
      // The data.propertyId field (if present) can be used by the navigator
      // when the app opens from a killed state.
    });
  } catch {
    // Graceful degradation — push is best-effort
  }
}
