// STRATA Mobile — runtime constants
// In production, inject via CI env or a build-time config file.

export const API_BASE_URL = __DEV__
  ? 'http://localhost:8080'
  : 'https://api.strata.app';

export const SUPABASE_URL = process.env.SUPABASE_URL ?? 'https://your-project.supabase.co';
export const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ?? '';
