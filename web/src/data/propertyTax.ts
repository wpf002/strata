/**
 * GENERATED from backend/data/property_tax.json — do not edit by hand.
 * Regenerate with: bin/gen-tax-table.py
 *
 * The TS and Python underwriting models must apply identical tax rates or the
 * mock-mode numbers diverge from the server's. test/underwriting.test.ts
 * asserts this file matches the JSON.
 */

/** Approximate effective annual property tax, percent of value, by state. */
export const PROPERTY_TAX_RATES: Record<string, number> = {
  AL: 0.4,
  AR: 0.6,
  AZ: 0.6,
  CA: 0.7,
  CO: 0.5,
  CT: 2.0,
  FL: 0.8,
  GA: 0.9,
  IA: 1.5,
  ID: 0.6,
  IL: 2.1,
  IN: 0.8,
  KS: 1.3,
  KY: 0.8,
  LA: 0.6,
  MA: 1.1,
  MD: 1.0,
  MI: 1.3,
  MN: 1.1,
  MO: 0.9,
  MS: 0.7,
  MT: 0.7,
  NC: 0.7,
  ND: 0.9,
  NE: 1.5,
  NH: 1.8,
  NJ: 2.2,
  NM: 0.7,
  NV: 0.5,
  NY: 1.6,
  OH: 1.4,
  OK: 0.8,
  OR: 0.9,
  PA: 1.4,
  RI: 1.3,
  SC: 0.5,
  SD: 1.1,
  TN: 0.6,
  TX: 1.6,
  UT: 0.6,
  VA: 0.8,
  VT: 1.8,
  WA: 0.9,
  WI: 1.6,
  WV: 0.6,
  WY: 0.6,
};

/** National fallback for states not in the table. */
export const DEFAULT_PROPERTY_TAX_RATE = 1.1;

export function defaultTaxRatePct(state?: string | null): number {
  if (!state) return DEFAULT_PROPERTY_TAX_RATE;
  return PROPERTY_TAX_RATES[state.trim().toUpperCase()] ?? DEFAULT_PROPERTY_TAX_RATE;
}
