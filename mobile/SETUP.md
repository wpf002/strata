# STRATA Mobile — Setup Guide

Bare React Native 0.76.7 (no Expo). The JS + native projects are checked in;
you need to do a one-time install and config on each developer machine.

---

## 1. Install JS dependencies

```bash
cd mobile
npm install
```

This pulls React Navigation, `react-native-dotenv`, the URL polyfill that
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

Values are inlined at build time by `react-native-dotenv` (a Babel transform —
see `babel.config.js`). Editing `.env` and reloading does nothing; restart Metro
with `--reset-cache` and rebuild. Without a `.env` the app warns in the console
and auth fails.

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

**Verified working** — API 35 emulator (Pixel 7, arm64), Gradle build via
JDK 17. Toolchain, one-time:

```bash
brew install openjdk@17
# Command-line tools, if you don't want the full Android Studio:
#   https://developer.android.com/studio#command-line-tools-only
#   unzip into ~/Library/Android/sdk/cmdline-tools/latest
export JAVA_HOME=/opt/homebrew/opt/openjdk@17
export ANDROID_HOME=$HOME/Library/Android/sdk
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$PATH"

yes | sdkmanager --licenses
sdkmanager "platform-tools" "platforms;android-35" "build-tools;35.0.0" \
           "emulator" "system-images;android-35;google_apis;arm64-v8a"
avdmanager create avd -n strata_pixel -k "system-images;android-35;google_apis;arm64-v8a" -d pixel_7
echo "sdk.dir=$ANDROID_HOME" > android/local.properties
```

Then:

```bash
emulator -avd strata_pixel &
npx react-native start &
cd android && ./gradlew assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
adb reverse tcp:8081 tcp:8081     # Metro
adb reverse tcp:8083 tcp:8083     # the STRATA API
adb shell am start -n com.strataapp/.MainActivity
```

Notes from getting this working the first time:

- **JDK 17 specifically.** RN 0.76's Gradle rejects much newer JDKs; this
  machine's default is 25, so `JAVA_HOME` has to be set explicitly.
- **The NDK isn't needed.** `android/build.gradle` pins
  `ndkVersion = "26.1.10909125"`, but nothing in the dependency tree builds
  native code from source, and the build succeeds without it installed.
- **`adb reverse` is required** for both Metro and the API — the emulator
  can reach the host as `10.0.2.2`, but the reverse tunnels keep `localhost`
  working so one `.env` serves both platforms.

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
  you edited `.env` without restarting Metro with `--reset-cache` and
  rebuilding.
- **Android-only red screen: "Cannot read property 'getConfig' of null"** —
  you're back on `react-native-config`. Its Android side doesn't autolink
  (`npx react-native config` reports `android: null`), so under the New
  Architecture its TurboModule never registers. That's why config is a Babel
  transform now, with no native module on either platform.
- **Red screen: "URL.protocol is not implemented"** — the
  `react-native-url-polyfill/auto` import at the top of `index.js` was removed.
  supabase-js constructs a `URL` and React Native's built-in is a stub.
- **"No script URL provided"** — Metro isn't running, or something else has
  port 8081. Start it with `npx react-native start`.

- **"Unable to resolve module `@env`"** — run `npm install`, then restart
  Metro with `--reset-cache`. The module is virtual, created by the Babel
  plugin at transform time; it doesn't exist on disk.
- **"No Metro bundler running"** — run `npx react-native start` in a second
  terminal before `run-ios` / `run-android`.
