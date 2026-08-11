# STRATA Mobile — Setup Guide

Bare React Native 0.76.7 (no Expo). The JS + native projects are checked in;
you need to do a one-time install and config on each developer machine.

---

## 1. Install JS dependencies

```bash
cd mobile
npm install
```

This pulls React Navigation, `react-native-config`, the URL polyfill that
supabase-js needs, and `@react-native-community/cli` (autolinking uses it —
without it `pod install` fails with "In order to autolink using Cocoapods…").

## 2. Create `.env`

```bash
cp .env.example .env
```

Fill in the real values:

```
SUPABASE_URL=https://mawabokdbrmzegjtvzyz.supabase.co
SUPABASE_ANON_KEY=<your Supabase anon key>
API_BASE_URL=http://localhost:8083        # match whatever STRATA_API_PORT you run
```

Values are inlined at build time by `react-native-config`. Editing `.env` and
reloading does nothing — you have to **rebuild**. Without a `.env` the app
crashes on launch with "supabaseKey is required".

The iOS simulator shares the host network, so `localhost` reaches the dev API.
A physical device does not — use the Mac's LAN IP there.

**Port note:** Metro wants 8081. The backend defaults to 8080 but takes
`STRATA_API_PORT`, so if something else owns 8080 (or you park the API on
8081), Metro and the API will collide. Keep 8081 free for Metro.

## 3. iOS — CocoaPods + first build

```bash
cd ios
bundle install          # once per machine; installs the right CocoaPods version
bundle exec pod install
cd ..
npx react-native run-ios
```

The app launches to the Login screen in the simulator. **Verified working** on
Xcode 26.6 / iPhone 17 Pro (iOS simulator), CocoaPods 1.16.2.

If you'd rather drive Xcode directly:

```bash
xcodebuild -workspace ios/StrataApp.xcworkspace -scheme StrataApp \
  -configuration Debug -sdk iphonesimulator \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  -derivedDataPath ios/build
```

Re-run `pod install` after adding any dependency with native code.

## 4. Android — first build

```bash
npx react-native run-android
```

**Not yet verified** — no Android SDK on the machine this was set up from. The
Gradle project is configured and autolinking is wired; what's missing is the
toolchain. You need:

- **Android Studio** (or the standalone command-line tools), then via SDK
  Manager: **SDK Platform 35** (`compileSdkVersion`), build-tools, and
  **NDK 26.1.10909125** (pinned in `android/build.gradle`).
- `ANDROID_HOME` exported, e.g. `export ANDROID_HOME=$HOME/Library/Android/sdk`.
- `android/local.properties` with `sdk.dir=/Users/<you>/Library/Android/sdk`
  (Android Studio writes this for you on first open).
- **JDK 17.** React Native 0.76's Gradle build expects 17; a much newer JDK on
  `PATH` (this machine has 25) will fail the build. Point `JAVA_HOME` at 17 —
  Android Studio's bundled JDK is the easy option.
- An emulator (AVD) or a connected device.

Expect the same two classes of problem iOS hit: a missing autolinking CLI
(already fixed in `package.json`) and native config that only takes effect on a
full rebuild.

## 5. Android release signing (for shipping to the Play Store)

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

## 6. iOS provisioning (for TestFlight / App Store)

1. Open `mobile/ios/StrataApp.xcodeproj` in Xcode
2. Select the `StrataApp` target → Signing & Capabilities
3. Pick your Apple Developer team; Xcode will provision automatically
4. Increment the bundle version and identifier as needed
5. Product → Archive to upload to App Store Connect

## 7. Production `API_BASE_URL`

For TestFlight / release builds, update `mobile/.env`:

```
API_BASE_URL=https://api.strata.app
```

Then rebuild — `react-native-config` reads `.env` at native build time, not
at runtime, so the value is baked into the binary.

## Troubleshooting

- **`pod install` fails with "In order to autolink using Cocoapods"** —
  `@react-native-community/cli` is missing. `npm install` should supply it; it
  is a devDependency as of the first verified build.
- **App launches to a red screen: "supabaseKey is required"** — no `.env`, or
  you edited `.env` without rebuilding.
- **Red screen: "URL.protocol is not implemented"** — the
  `react-native-url-polyfill/auto` import at the top of `index.js` was removed.
  supabase-js constructs a `URL` and React Native's built-in is a stub.
- **"No script URL provided"** — Metro isn't running, or something else has
  port 8081. Start it with `npx react-native start`.

- **"Unable to resolve module `react-native-config`"** — run `npm install`
  and then `cd ios && bundle exec pod install && cd ..`.
- **"No Metro bundler running"** — run `npx react-native start` in a second
  terminal before `run-ios` / `run-android`.
