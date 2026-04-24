// STRATA Mobile — runtime constants
//
// Values load from mobile/.env via react-native-config (build-time inlined).
// Fallbacks keep dev smoke-testing productive even without a .env file.

import Config from 'react-native-config';

export const API_BASE_URL: string =
  Config.API_BASE_URL ?? (__DEV__ ? 'http://localhost:8080' : 'https://api.strata.app');

export const SUPABASE_URL: string =
  Config.SUPABASE_URL ?? 'https://your-project.supabase.co';

export const SUPABASE_ANON_KEY: string =
  Config.SUPABASE_ANON_KEY ?? '';
