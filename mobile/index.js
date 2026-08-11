/**
 * @format
 */
// Must come before anything that constructs a Supabase client. React Native's
// built-in URL is a stub — `new URL(...).protocol` throws "not implemented" —
// and supabase-js reads .protocol in its constructor, so the app white-screened
// on launch before this polyfill was in place.
import 'react-native-url-polyfill/auto';

import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';

AppRegistry.registerComponent(appName, () => App);
