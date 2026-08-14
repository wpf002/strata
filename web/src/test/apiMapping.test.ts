import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../lib/supabase', () => ({
  supabase: { auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null } }) } },
}));

// Live mode — this suite is about the API→UI mapping layer, which mock mode
// bypasses entirely.
vi.stubEnv('VITE_USE_MOCK', 'false');
vi.stubEnv('VITE_API_URL', '');

const { getProperties, getProperty, getPortfolio } = await import('../api/client');

/**
 * The mapping layer between the API and the UI types.
 *
 * This is where a renamed or misspelled field goes wrong silently: the UI gets
 * `undefined`, React renders nothing or NaN, and no error is raised anywhere.
 * These tests pin the field names the backend actually sends.
 */

const API_PROPERTY = {
  id: 'abc-123',
  address: '4521 Oak Creek Drive',
  city: 'Dallas',
  state: 'TX',
  zip: '75201',
  price: 342000,
  beds: 3,
  baths: 2,
  sqft: 1840,
  lotSqft: 6200,
  yearBuilt: 2001,
  type: 'Single Family',
  status: 'Active',
  daysOnMarket: 23,
  dealScore: 81,
  riskScore: 28,
  capRate: 6.4,
  cashOnCash: 7.2,
  cashFlow: 312,
  fairValueLow: 318000,
  fairValueHigh: 347000,
  rentEstLow: 2100,
  rentEstHigh: 2380,
  rentEstMid: 2240,
  rentConfidence: 'High',
  valuationConfidence: 'High',
  priceVsFairValue: -1.4,
  strategyFit: 88,
  neighborhood: 'Lake Highlands',
  neighborhoodScore: 74,
  marketRegime: 'Balanced',
  riskFlags: [{ label: 'HVAC age est. 14 yrs', severity: 'Medium' }],
  image: 'https://example.com/a.jpg',
  lat: 32.7767,
  lng: -96.797,
  motivationScore: 41,
  offMarketSignals: [{ type: 'price_drop', label: 'Price cut', severity: 'medium' }],
};

function mockFetchOnce(payload: unknown, ok = true) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok,
    status: ok ? 200 : 500,
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  }));
}

beforeEach(() => vi.unstubAllGlobals());
afterEach(() => vi.unstubAllGlobals());

describe('apiToProperty', () => {
  it('maps every field the UI reads', async () => {
    mockFetchOnce([API_PROPERTY]);
    const [p] = await getProperties();

    expect(p.id).toBe('abc-123');
    expect(p.address).toBe('4521 Oak Creek Drive');
    expect(p.city).toBe('Dallas');
    expect(p.state).toBe('TX');
    expect(p.zip).toBe('75201');
    expect(p.price).toBe(342000);
    expect(p.beds).toBe(3);
    expect(p.baths).toBe(2);
    expect(p.sqft).toBe(1840);
    expect(p.lotSqft).toBe(6200);
    expect(p.yearBuilt).toBe(2001);
    expect(p.type).toBe('Single Family');
    expect(p.daysOnMarket).toBe(23);
    expect(p.dealScore).toBe(81);
    expect(p.riskScore).toBe(28);
    expect(p.capRate).toBe(6.4);
    expect(p.cashOnCash).toBe(7.2);
    expect(p.cashFlow).toBe(312);
    expect(p.fairValueLow).toBe(318000);
    expect(p.fairValueHigh).toBe(347000);
    expect(p.rentEstMid).toBe(2240);
    expect(p.priceVsFairValue).toBe(-1.4);
    expect(p.neighborhoodScore).toBe(74);
    expect(p.marketRegime).toBe('Balanced');
    expect(p.motivationScore).toBe(41);
  });

  it('maps coordinates as lat/lng — a mismatch silently breaks every map pin', async () => {
    mockFetchOnce([API_PROPERTY]);
    const [p] = await getProperties();
    expect(p.lat).toBe(32.7767);
    expect(p.lng).toBe(-96.797);
    expect(Number.isFinite(p.lat)).toBe(true);
    expect(Number.isFinite(p.lng)).toBe(true);
  });

  it('leaves no mapped field undefined for a complete payload', async () => {
    mockFetchOnce([API_PROPERTY]);
    const [p] = await getProperties();
    for (const [k, v] of Object.entries(p)) {
      expect(v, `${k} came through undefined`).not.toBeUndefined();
    }
  });

  it('defaults collection fields to arrays rather than undefined', async () => {
    const { riskFlags, offMarketSignals, ...withoutArrays } = API_PROPERTY;
    mockFetchOnce([withoutArrays]);
    const [p] = await getProperties();
    expect(p.riskFlags).toEqual([]);
    expect(p.offMarketSignals).toEqual([]);
  });

  it('passes risk flags through with label and severity intact', async () => {
    mockFetchOnce([API_PROPERTY]);
    const [p] = await getProperties();
    expect(p.riskFlags[0]).toEqual({ label: 'HVAC age est. 14 yrs', severity: 'Medium' });
  });

  it('maps a single property the same way as a list item', async () => {
    mockFetchOnce(API_PROPERTY);
    const p = await getProperty('abc-123');
    expect(p.price).toBe(342000);
    expect(p.lng).toBe(-96.797);
  });
});

describe('search query construction', () => {
  it('sends the filters the backend actually reads', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, status: 200, json: async () => [], text: async () => '[]',
    });
    vi.stubGlobal('fetch', fetchMock);

    await getProperties({
      query: 'Phoenix, AZ',
      minDealScore: 60,
      maxPrice: 500000,
      minCapRate: 6,
      propertyTypes: ['Condo', 'Townhouse'],
      sortBy: 'Cap Rate',
      offMarketOnly: true,
    });

    const url = new URL(fetchMock.mock.calls[0][0], 'http://localhost');
    expect(url.searchParams.get('query')).toBe('Phoenix, AZ');
    expect(url.searchParams.get('min_deal_score')).toBe('60');
    expect(url.searchParams.get('max_price')).toBe('500000');
    expect(url.searchParams.get('min_cap_rate')).toBe('6');
    expect(url.searchParams.getAll('property_types')).toEqual(['Condo', 'Townhouse']);
    expect(url.searchParams.get('sort_by')).toBe('Cap Rate');
    expect(url.searchParams.get('off_market_only')).toBe('true');
  });

  it('omits filters that are unset instead of sending zeros', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, status: 200, json: async () => [], text: async () => '[]',
    });
    vi.stubGlobal('fetch', fetchMock);

    await getProperties({ query: 'Dallas, TX', minCapRate: 0, minDealScore: 0 });

    const url = new URL(fetchMock.mock.calls[0][0], 'http://localhost');
    // A 0 minimum is "no filter" — sending it would exclude everything that
    // has no cap rate computed yet.
    expect(url.searchParams.has('min_cap_rate')).toBe(false);
    expect(url.searchParams.has('min_deal_score')).toBe(false);
  });
});

describe('portfolio mapping', () => {
  it('falls back to mock holdings when the API rejects the request', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 401, json: async () => ({}), text: async () => 'unauthorized',
    }));
    const p = await getPortfolio();
    // Unauthenticated users still see a working page rather than a crash.
    expect(p.holdings.length).toBeGreaterThan(0);
    expect(p.totalValue).toBeGreaterThan(0);
  });

  it('uses server totals when the API responds', async () => {
    mockFetchOnce({
      holdings: [], totalValue: 933000, totalEquity: 274600,
      totalDebt: 658400, totalCashFlow: 1640, healthScore: 68,
    });
    const p = await getPortfolio();
    expect(p.totalValue).toBe(933000);
    expect(p.healthScore).toBe(68);
  });
});
