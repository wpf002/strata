// STRATA Mobile — runtime constants
//
// Values come from mobile/.env, inlined at build time by react-native-dotenv
// (see babel.config.js). Editing .env requires a Metro restart with
// --reset-cache and a rebuild; a reload alone won't pick up changes.
//
// Fallbacks keep dev smoke-testing productive when .env is missing, but an
// absent SUPABASE_ANON_KEY is fatal at client construction, so it's surfaced
// loudly rather than silently defaulting to an empty string.

// @ts-expect-error — virtual module created by the babel plugin at build time.
import { SUPABASE_URL as ENV_SUPABASE_URL, SUPABASE_ANON_KEY as ENV_SUPABASE_ANON_KEY, API_BASE_URL as ENV_API_BASE_URL } from '@env';

export const API_BASE_URL: string =
  ENV_API_BASE_URL ?? (__DEV__ ? 'http://localhost:8083' : 'https://api.strata.app');

export const SUPABASE_URL: string =
  ENV_SUPABASE_URL ?? 'https://your-project.supabase.co';

export const SUPABASE_ANON_KEY: string = ENV_SUPABASE_ANON_KEY ?? '';

if (__DEV__ && !ENV_SUPABASE_ANON_KEY) {
  console.warn(
    '[STRATA] SUPABASE_ANON_KEY missing from mobile/.env — auth will fail. ' +
    'Copy .env.example to .env, then restart Metro with --reset-cache.',
  );
}
