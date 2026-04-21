import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock supabase before importing client
vi.mock('../lib/supabase', () => ({
  supabase: { auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null } }) } },
}));

// Mock env vars
vi.stubEnv('VITE_USE_MOCK', 'true');
vi.stubEnv('VITE_API_URL', '');

import { getProperties, getProperty } from '../api/client';

describe('getProperties (mock mode)', () => {
  it('returns 6 mock properties by default', async () => {
    const props = await getProperties();
    expect(props).toHaveLength(6);
  });

  it('filters by minDealScore', async () => {
    const props = await getProperties({ minDealScore: 70 });
    expect(props.every(p => p.dealScore >= 70)).toBe(true);
  });

  it('filters by maxPrice', async () => {
    const props = await getProperties({ maxPrice: 300000 });
    expect(props.every(p => p.price <= 300000)).toBe(true);
  });

  it('sorts by Deal Score descending', async () => {
    const props = await getProperties({ sortBy: 'Deal Score' });
    for (let i = 1; i < props.length; i++) {
      expect(props[i - 1].dealScore).toBeGreaterThanOrEqual(props[i].dealScore);
    }
  });

  it('sorts by Price ascending', async () => {
    const props = await getProperties({ sortBy: 'Price' });
    for (let i = 1; i < props.length; i++) {
      expect(props[i - 1].price).toBeLessThanOrEqual(props[i].price);
    }
  });

  it('sorts by Cap Rate descending', async () => {
    const props = await getProperties({ sortBy: 'Cap Rate' });
    for (let i = 1; i < props.length; i++) {
      expect(props[i - 1].capRate).toBeGreaterThanOrEqual(props[i].capRate);
    }
  });

  it('sorts by Cash Flow descending', async () => {
    const props = await getProperties({ sortBy: 'Cash Flow' });
    for (let i = 1; i < props.length; i++) {
      expect(props[i - 1].cashFlow).toBeGreaterThanOrEqual(props[i].cashFlow);
    }
  });

  it('sorts by Days on Market ascending', async () => {
    const props = await getProperties({ sortBy: 'Days on Market' });
    for (let i = 1; i < props.length; i++) {
      expect(props[i - 1].daysOnMarket).toBeLessThanOrEqual(props[i].daysOnMarket);
    }
  });

  it('each property has required fields', async () => {
    const props = await getProperties();
    for (const p of props) {
      expect(p.id).toBeTruthy();
      expect(p.address).toBeTruthy();
      expect(typeof p.dealScore).toBe('number');
      expect(typeof p.capRate).toBe('number');
      expect(typeof p.cashFlow).toBe('number');
      expect(Array.isArray(p.riskFlags)).toBe(true);
    }
  });
});

describe('getProperty (mock mode)', () => {
  it('returns property p1 by id', async () => {
    const p = await getProperty('p1');
    expect(p.id).toBe('p1');
    expect(p.address).toBe('4521 Oak Creek Drive');
    expect(p.dealScore).toBe(81);
  });

  it('throws for unknown id', async () => {
    await expect(getProperty('unknown-id')).rejects.toThrow('Property not found');
  });

  it('all numeric metrics are finite numbers', async () => {
    const p = await getProperty('p1');
    for (const key of ['price', 'beds', 'baths', 'sqft', 'dealScore', 'riskScore', 'capRate', 'cashFlow'] as const) {
      expect(Number.isFinite(p[key])).toBe(true);
    }
  });

  it('rentConfidence is a valid level', async () => {
    const p = await getProperty('p1');
    expect(['High', 'Medium', 'Low']).toContain(p.rentConfidence);
  });

  it('riskFlags have label and severity', async () => {
    const p = await getProperty('p1');
    for (const f of p.riskFlags) {
      expect(f.label).toBeTruthy();
      expect(['High', 'Medium', 'Low']).toContain(f.severity);
    }
  });
});
