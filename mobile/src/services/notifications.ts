/**
 * Push notification setup via Firebase Cloud Messaging (`@react-native-firebase`).
 *
 * Native setup (done once per platform):
 *   - android/app/google-services.json        (real Firebase Android config)
 *   - ios/StrataApp/GoogleService-Info.plist  (real Firebase iOS config)
 *   - android/build.gradle:   classpath('com.google.gms:google-services:4.4.2')
 *   - android/app/build.gradle: apply plugin: 'com.google.gms.google-services'
 *   - FIREBASE_SERVER_KEY in backend/.env for server-side sends
 *
 * The placeholder config files that ship in the repo are sufficient to build,
 * but sends will no-op on real devices until real Firebase credentials are
 * populated. See mobile/SETUP.md for the manual replacement steps.
 */
import { Alert, Platform } from 'react-native';
import messaging from '@react-native-firebase/messaging';
import { registerPushToken } from '../api';

export async function setupPushNotifications(): Promise<void> {
  try {
    // iOS: explicitly request permission. Android 13+ also shows the runtime
    // prompt; older versions auto-grant.
    const status = await messaging().requestPermission();
    const authorized =
      status === messaging.AuthorizationStatus.AUTHORIZED ||
      status === messaging.AuthorizationStatus.PROVISIONAL;
    if (!authorized) return;

    const token = await messaging().getToken();
    if (token) {
      const platform = Platform.OS === 'android' ? 'android' : 'ios';
      await registerPushToken(token, platform).catch(() => {});
    }

    messaging().onTokenRefresh(async newToken => {
      const platform = Platform.OS === 'android' ? 'android' : 'ios';
      await registerPushToken(newToken, platform).catch(() => {});
    });

    // Foreground messages show as an in-app alert; tap navigation for
    // background / quit state is handled by the notification payload itself.
    messaging().onMessage(async remoteMessage => {
      const title = remoteMessage.notification?.title ?? 'STRATA Alert';
      const body = remoteMessage.notification?.body ?? '';
      if (body) Alert.alert(title, body);
    });

    messaging().setBackgroundMessageHandler(async _remoteMessage => {
      // No-op — native OS renders the notification; data.propertyId (if any)
      // is available to the app when it opens from the tap.
    });
  } catch {
    // Push is best-effort. A missing Firebase config or a denied permission
    // should never crash the app — all other features continue to work.
  }
}
