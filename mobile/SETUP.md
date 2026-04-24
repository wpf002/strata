# STRATA Mobile — Setup Guide

Bare React Native 0.76.7 (no Expo). The JS + native projects are checked in;
you need to do a one-time install and config on each developer machine.

---

## 1. Install JS dependencies

```bash
cd mobile
npm install
```

This pulls React Navigation, `@react-native-firebase/*`, and
`react-native-config` (listed in `package.json`).

## 2. Create `.env`

```bash
cp .env.example .env
```

Fill in the real values:

```
SUPABASE_URL=https://mawabokdbrmzegjtvzyz.supabase.co
SUPABASE_ANON_KEY=<your Supabase anon key>
API_BASE_URL=http://localhost:8080        # or your deployed backend
```

Values are inlined at build time by `react-native-config`; change them and
rebuild the app to pick up the new values.

## 3. iOS — CocoaPods + first build

```bash
cd ios
bundle install          # once per machine; installs the right CocoaPods version
bundle exec pod install
cd ..
npx react-native run-ios
```

The app should launch to the Login screen in the iOS simulator.

## 4. Android — first build

```bash
npx react-native run-android
```

Requires:

- Android Studio installed with the default SDK (34) and an emulator or
  connected device.
- `JAVA_HOME` pointed at a JDK (Android Studio's bundled JDK works fine).

## 5. Replace placeholder Firebase credentials

The repo ships with placeholder Firebase config files so the app builds out
of the box:

- `mobile/android/app/google-services.json`
- `mobile/ios/StrataApp/GoogleService-Info.plist`

**Push notifications will no-op on real devices until these are replaced.**

### To get real values:

1. Open the Firebase Console → create (or pick) a project
2. Add two apps inside the project:
   - **Android**: package name `com.strataapp` (matches `android/app/build.gradle` `applicationId`)
   - **iOS**: bundle identifier `org.reactjs.native.example.StrataApp` (matches Xcode's default; you can change both later)
3. Download the two config files
4. Replace the placeholders in the paths above — keep the filenames identical
5. In Firebase Console → Project Settings → Cloud Messaging → Server Key
6. Paste that key into `backend/.env` as `FIREBASE_SERVER_KEY=...`

### One-time Android Gradle plugin wiring (only if not already present):

`mobile/android/build.gradle` (project level):

```groovy
buildscript {
  dependencies {
    // ...existing dependencies...
    classpath('com.google.gms:google-services:4.4.2')
  }
}
```

`mobile/android/app/build.gradle` (app level) — add at the bottom:

```groovy
apply plugin: 'com.google.gms.google-services'
```

### One-time iOS Firebase initialization:

In `mobile/ios/StrataApp/AppDelegate.mm`, add inside `didFinishLaunchingWithOptions`:

```objc
#import <Firebase.h>   // at the top with the other imports

// inside didFinishLaunchingWithOptions, before the return:
[FIRApp configure];
```

Then run `cd ios && bundle exec pod install` again.

## 6. Android release signing (for shipping to the Play Store)

```bash
# From inside mobile/android/app:
keytool -genkey -v -keystore strata-release.keystore -alias strata -keyalg RSA -keysize 2048 -validity 10000
```

Then add to `~/.gradle/gradle.properties` (never commit these):

```
STRATA_UPLOAD_STORE_FILE=strata-release.keystore
STRATA_UPLOAD_KEY_ALIAS=strata
STRATA_UPLOAD_STORE_PASSWORD=<password>
STRATA_UPLOAD_KEY_PASSWORD=<password>
```

And reference them in `android/app/build.gradle` under the `release`
`signingConfigs` block. See the React Native signing guide for the exact
template: https://reactnative.dev/docs/signed-apk-android

## 7. iOS provisioning (for TestFlight / App Store)

1. Open `mobile/ios/StrataApp.xcodeproj` in Xcode
2. Select the `StrataApp` target → Signing & Capabilities
3. Pick your Apple Developer team; Xcode will provision automatically
4. Increment the bundle version and identifier as needed
5. Product → Archive to upload to App Store Connect

## 8. Production `API_BASE_URL`

For TestFlight / release builds, update `mobile/.env`:

```
API_BASE_URL=https://api.strata.app
```

Then rebuild — `react-native-config` reads `.env` at native build time, not
at runtime, so the value is baked into the binary.

## Troubleshooting

- **"Unable to resolve module `react-native-config`"** — run `npm install`
  and then `cd ios && bundle exec pod install && cd ..`.
- **iOS build fails on `use_frameworks!`** — older `@react-native-firebase`
  versions sometimes require it. Try removing the line from `Podfile` and
  running `pod install` again.
- **"No Metro bundler running"** — run `npx react-native start` in a second
  terminal before `run-ios` / `run-android`.
