import { describe, it, expect, vi } from 'vitest';
import fixtures from './fixtures/underwriting-parity.json';
import taxJson from '../../../backend/data/property_tax.json';
import { PROPERTY_TAX_RATES, DEFAULT_PROPERTY_TAX_RATE, defaultTaxRatePct } from '../data/propertyTax';

// Mock mode routes calculateUnderwriting() through the local TS model, which is
// exactly the code under test.
vi.stubEnv('VITE_USE_MOCK', 'true');
vi.mock('../lib/supabase', () => ({
  supabase: { auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null } }) } },
}));

const { calculateUnderwriting } = await import('../api/client');

type Case = (typeof fixtures)['cases'][number];

/**
 * The financial model exists twice — Python serves the API, TypeScript serves
 * mock mode — and underwriting_service.py claims the two "must return
 * identical numbers for identical inputs". Nothing checked that, and they had
 * already drifted: at 100% down TS produced Infinity where Python produced 0.
 *
 * Fixtures come from the Python model via bin/gen-underwriting-fixtures.py.
 */
describe('underwriting parity: TypeScript vs Python', () => {
  for (const c of fixtures.cases as Case[]) {
    it(`matches the Python model — ${c.name}`, async () => {
      const out = await calculateUnderwriting({
        propertyId: 'test',
        strategy: 'Long-Term Rental',
        ...c.inputs,
      } as any);

      const e = c.expected as any;
      const scalars = [
        'cashFlow', 'capRate', 'cashOnCash', 'grm', 'noi', 'mortgage',
        'totalExpenses', 'effectiveGrossIncome', 'breakEvenRent',
        'breakEvenOccupancy', 'expenseRatio', 'totalCashToClose', 'annualCashFlow',
      ] as const;

      for (const k of scalars) {
        expect(out[k], `${c.name} → ${k}`).toBeCloseTo(e[k], 6);
      }

      // dscr is null for an all-cash purchase in both implementations.
      if (e.dscr === null) {
        expect(out.dscr, `${c.name} → dscr should be null with no debt`).toBeNull();
      } else {
        expect(out.dscr!).toBeCloseTo(e.dscr, 6);
      }

      expect(out.recommendation).toBe(e.recommendation);

      expect(out.scenarios).toHaveLength(e.scenarios.length);
      out.scenarios.forEach((s, idx) => {
        expect(s.name).toBe(e.scenarios[idx].name);
        expect(s.cashFlow).toBeCloseTo(e.scenarios[idx].cashFlow, 6);
        expect(s.capRate).toBeCloseTo(e.scenarios[idx].capRate, 6);
        expect(s.yearOneReturn).toBeCloseTo(e.scenarios[idx].yearOneReturn, 6);
      });
    });
  }
});

describe('underwriting: values that must never reach the UI', () => {
  const boundary = [
    { label: '100% down (all cash)', downPaymentPct: 100 },
    { label: 'minimum down', downPaymentPct: 3.5 },
    { label: '0% interest', interestRate: 0 },
    { label: 'zero rent', monthlyRent: 0 },
  ];

  for (const b of boundary) {
    it(`produces no NaN or Infinity — ${b.label}`, async () => {
      const out = await calculateUnderwriting({
        propertyId: 'test',
        purchasePrice: 342000,
        downPaymentPct: 25,
        interestRate: 7.25,
        loanType: '30yr Fixed',
        monthlyRent: 2240,
        vacancyPct: 6,
        managementPct: 8,
        maintenancePct: 1,
        insuranceMonthly: 140,
        capexPct: 5,
        strategy: 'Long-Term Rental',
        state: 'TX',
        ...b,
      } as any);

      for (const [k, v] of Object.entries(out)) {
        if (typeof v !== 'number') continue;
        expect(Number.isFinite(v), `${b.label} → ${k} was ${v}`).toBe(true);
      }
      for (const s of out.scenarios) {
        for (const [k, v] of Object.entries(s)) {
          if (typeof v !== 'number') continue;
          expect(Number.isFinite(v), `${b.label} → scenario ${s.name}.${k} was ${v}`).toBe(true);
        }
      }
    });
  }

  it('reports DSCR as null rather than Infinity when there is no mortgage', async () => {
    const out = await calculateUnderwriting({
      propertyId: 'test', purchasePrice: 342000, downPaymentPct: 100,
      interestRate: 7.25, loanType: '30yr Fixed', monthlyRent: 2240,
      vacancyPct: 6, managementPct: 8, maintenancePct: 1, insuranceMonthly: 140,
      capexPct: 5, strategy: 'Long-Term Rental', state: 'TX',
    } as any);
    expect(out.mortgage).toBe(0);
    expect(out.dscr).toBeNull();
  });
});

describe('property tax table', () => {
  it('stays in sync with the Python source of truth', () => {
    // web/src/data/propertyTax.ts is generated from this JSON. If they drift,
    // mock mode and the API disagree about every deal's expenses.
    expect(PROPERTY_TAX_RATES).toEqual(taxJson.rates);
    expect(DEFAULT_PROPERTY_TAX_RATE).toBe(taxJson._default);
  });

  it('resolves state rates case- and whitespace-insensitively', () => {
    expect(defaultTaxRatePct('tx')).toBe(taxJson.rates.TX);
    expect(defaultTaxRatePct('  Tx  ')).toBe(taxJson.rates.TX);
  });

  it('falls back to the national default for unknown or missing states', () => {
    expect(defaultTaxRatePct('ZZ')).toBe(taxJson._default);
    expect(defaultTaxRatePct(undefined)).toBe(taxJson._default);
    expect(defaultTaxRatePct(null)).toBe(taxJson._default);
  });

  it('covers every state STRATA lists as a supported market', () => {
    // A missing state silently falls back to the national rate, quietly
    // mispricing every deal in that market.
    const marketStates = ['AL', 'AR', 'AZ', 'CO', 'FL', 'GA', 'IN', 'MO', 'NC', 'NV', 'OH', 'OK', 'TN', 'TX', 'UT', 'VA'];
    for (const s of marketStates) {
      expect(PROPERTY_TAX_RATES[s], `no tax rate for ${s}`).toBeTypeOf('number');
    }
  });
});
