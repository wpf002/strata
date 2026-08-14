/**
 * Design tokens for the mobile app.
 *
 * Every screen previously declared its own `#080f1a` / `#0d1b2e` / `#22c55e`
 * literals in a private StyleSheet, so the palette drifted between screens and
 * a change meant editing five files. Values mirror the web app's Tailwind
 * theme so the two products look like one product.
 */

export const colors = {
  // Surfaces, darkest to lightest
  bg: '#080f1a',
  surface: '#0d1b2e',
  surfaceAlt: '#112240',
  raised: 'rgba(255,255,255,0.04)',

  border: 'rgba(255,255,255,0.08)',
  borderStrong: 'rgba(255,255,255,0.15)',

  // Text
  text: '#f1f5f9',
  textMuted: '#94a3b8',
  textFaint: '#64748b',
  textGhost: '#475569',

  // Brand
  gold: '#c9a84c',
  goldBright: '#f59e0b',
  goldFaint: 'rgba(201,168,76,0.14)',

  // Semantics
  green: '#22c55e',
  greenFaint: 'rgba(34,197,94,0.14)',
  red: '#ef4444',
  redFaint: 'rgba(239,68,68,0.14)',
  amber: '#f59e0b',
  amberFaint: 'rgba(245,158,11,0.14)',
  blue: '#60a5fa',
} as const;

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
} as const;

export const radius = {
  sm: 6,
  md: 10,
  lg: 14,
  pill: 999,
} as const;

export const font = {
  // iOS ships SF Mono under this name; Android falls back to its monospace.
  mono: undefined as string | undefined,
  size: {
    xs: 11,
    sm: 13,
    md: 15,
    lg: 18,
    xl: 22,
    xxl: 30,
  },
} as const;

/** Deal / risk score → colour, matching the web scale. */
export function scoreColor(score: number): string {
  if (score >= 70) return colors.green;
  if (score >= 50) return colors.amber;
  if (score >= 25) return '#f97316';
  return colors.red;
}

/** Risk uses the inverse scale — low is good. */
export function riskColor(score: number): string {
  if (score <= 30) return colors.green;
  if (score <= 55) return colors.amber;
  return colors.red;
}

export const fmt = {
  currency(v: number | null | undefined): string {
    if (v === null || v === undefined || Number.isNaN(v)) return '—';
    const sign = v < 0 ? '-' : '';
    const n = Math.abs(v);
    return `${sign}$${Math.round(n).toLocaleString('en-US')}`;
  },

  compact(v: number | null | undefined): string {
    if (v === null || v === undefined || Number.isNaN(v)) return '—';
    const sign = v < 0 ? '-' : '';
    const n = Math.abs(v);
    if (n >= 1_000_000) return `${sign}$${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${sign}$${Math.round(n / 1_000)}K`;
    return `${sign}$${Math.round(n)}`;
  },

  pct(v: number | null | undefined, digits = 1): string {
    if (v === null || v === undefined || Number.isNaN(v)) return '—';
    return `${v.toFixed(digits)}%`;
  },

  signedPct(v: number | null | undefined, digits = 1): string {
    if (v === null || v === undefined || Number.isNaN(v)) return '—';
    return `${v >= 0 ? '+' : ''}${v.toFixed(digits)}%`;
  },

  /** Ratios like DSCR, where null legitimately means "not applicable". */
  ratio(v: number | null | undefined, digits = 2): string {
    if (v === null || v === undefined || Number.isNaN(v)) return '—';
    return v.toFixed(digits);
  },
};
