#!/usr/bin/env python3
"""
Regenerate web/src/data/propertyTax.ts from backend/data/property_tax.json.

The underwriting model exists twice — Python for the API, TypeScript for mock
mode — and both must apply the same property-tax rates or the two disagree.
The JSON is the source of truth; this writes the TS mirror.

    bin/gen-tax-table.py

test/underwriting.test.ts fails if the generated file drifts from the JSON.
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "backend" / "data" / "property_tax.json"
DST = ROOT / "web" / "src" / "data" / "propertyTax.ts"

data = json.loads(SRC.read_text())
rates = data["rates"]
default = data["_default"]

body = "\n".join(f"  {k}: {v}," for k, v in sorted(rates.items()))

DST.write_text(f'''/**
 * GENERATED from backend/data/property_tax.json — do not edit by hand.
 * Regenerate with: bin/gen-tax-table.py
 *
 * The TS and Python underwriting models must apply identical tax rates or the
 * mock-mode numbers diverge from the server's. test/underwriting.test.ts
 * asserts this file matches the JSON.
 */

/** Approximate effective annual property tax, percent of value, by state. */
export const PROPERTY_TAX_RATES: Record<string, number> = {{
{body}
}};

/** National fallback for states not in the table. */
export const DEFAULT_PROPERTY_TAX_RATE = {default};

export function defaultTaxRatePct(state?: string | null): number {{
  if (!state) return DEFAULT_PROPERTY_TAX_RATE;
  return PROPERTY_TAX_RATES[state.trim().toUpperCase()] ?? DEFAULT_PROPERTY_TAX_RATE;
}}
''')

print(f"wrote {DST.relative_to(ROOT)} ({len(rates)} states, default {default}%)")
