module.exports = {
  presets: ['@react-native/babel-preset'],
  plugins: [
    // Inlines mobile/.env at transform time as `@env` imports.
    //
    // This replaces react-native-config, which needed a native module on both
    // platforms. Its Android side never autolinked (`npx react-native config`
    // reported `android: null`), so under the New Architecture
    // TurboModuleRegistry.get("RNCConfigModule") returned null and the app
    // crashed on launch with "Cannot read property 'getConfig' of null" —
    // while iOS worked fine. A Babel transform has no native surface at all,
    // so both platforms and both architectures behave the same.
    //
    // Values are baked in at build time: edit .env, then restart Metro with
    // --reset-cache and rebuild.
    ['module:react-native-dotenv', {
      moduleName: '@env',
      path: '.env',
      safe: false,
      allowUndefined: true,
    }],
  ],
};
