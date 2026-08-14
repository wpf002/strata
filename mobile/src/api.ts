import { API_BASE_URL } from './constants';
import { supabase } from './supabase';

const USE_MOCK = false;

// ── Auth helpers ──────────────────────────────────────────────────────────────

async function getToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

type NavigateToLogin = () => void;
let _onUnauthorized: NavigateToLogin = () => {};

export function setUnauthorizedHandler(fn: NavigateToLogin) {
  _onUnauthorized = fn;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });

  if (res.status === 401) {
    _onUnauthorized();
    throw new Error('Unauthorized');
  }

  if (!res.ok) {
    throw new Error(`API error ${res.status}: ${await res.text()}`);
  }

  return res.json();
}

// ── Property types ────────────────────────────────────────────────────────────

export interface MobileProperty {
  id: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  price: number;
  beds: number;
  baths: number;
  sqft: number;
  dealScore: number;
  capRate: number;
  cashFlow: number;
  /** Monthly rent estimate. Without it, revenue can't be derived from the
   *  other fields — the property screen used to fake it. */
  rentEstMid: number;
  image: string | null;
  lat: number | null;
  lng: number | null;
}

// ── Mock fallback ─────────────────────────────────────────────────────────────

const MOCK_PROPERTIES: MobileProperty[] = [
  { id: 'p1', address: '4521 Oak Creek Drive', city: 'Dallas', state: 'TX', zip: '75201', price: 342000, beds: 3, baths: 2, sqft: 1840, dealScore: 81, capRate: 6.4, cashFlow: 312, rentEstMid: 2240, image: 'https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=400&q=70', lat: 32.7767, lng: -96.7970 },
  { id: 'p2', address: '1872 Magnolia Street', city: 'Dallas', state: 'TX', zip: '75206', price: 285000, beds: 3, baths: 2, sqft: 1520, dealScore: 74, capRate: 5.8, cashFlow: 198, rentEstMid: 1860, image: 'https://images.unsplash.com/photo-1570129477492-45c003edd2be?w=400&q=70', lat: 32.7957, lng: -96.7543 },
  { id: 'p3', address: '9034 Sunset Ridge Ln', city: 'Dallas', state: 'TX', zip: '75218', price: 419000, beds: 4, baths: 3, sqft: 2280, dealScore: 62, capRate: 4.9, cashFlow: 88, rentEstMid: 2650, image: 'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=400&q=70', lat: 32.8212, lng: -96.7021 },
];

// ── API functions ─────────────────────────────────────────────────────────────

export async function searchProperties(query?: string): Promise<MobileProperty[]> {
  if (USE_MOCK) {
    if (!query) return MOCK_PROPERTIES;
    const q = query.toLowerCase();
    return MOCK_PROPERTIES.filter(p =>
      p.address.toLowerCase().includes(q) ||
      p.city.toLowerCase().includes(q) ||
      p.zip.includes(q)
    );
  }

  const params = new URLSearchParams();
  if (query) params.set('query', query);
  const data = await request<any[]>(`/properties/search?${params}`);
  return data.map(p => ({
    id: p.id,
    address: p.address,
    city: p.city,
    state: p.state,
    zip: p.zip,
    price: p.price,
    beds: p.beds,
    baths: p.baths,
    sqft: p.sqft,
    dealScore: p.dealScore,
    capRate: p.capRate,
    cashFlow: p.cashFlow,
    rentEstMid: p.rentEstMid ?? 0,
    image: p.image ?? null,
    lat: p.lat ?? null,
    lng: p.lng ?? null,
  }));
}

export async function getProperty(id: string): Promise<MobileProperty | null> {
  if (USE_MOCK) {
    return MOCK_PROPERTIES.find(p => p.id === id) ?? null;
  }
  const p = await request<any>(`/properties/${id}`);
  return {
    id: p.id, address: p.address, city: p.city, state: p.state, zip: p.zip,
    price: p.price, beds: p.beds, baths: p.baths, sqft: p.sqft,
    dealScore: p.dealScore, capRate: p.capRate, cashFlow: p.cashFlow,
    rentEstMid: p.rentEstMid ?? 0,
    image: p.image ?? null, lat: p.lat ?? null, lng: p.lng ?? null,
  };
}

// ── Portfolio ─────────────────────────────────────────────────────────────────

export interface PortfolioEntry {
  id: string;
  propertyId: string;
  address: string;
  city: string;
  state: string;
  purchasePrice: number;
  currentValue: number;
  monthlyRent: number;
  monthlyExpenses: number;
  equity: number;
  cashFlow: number;
  capRate: number;
  cocReturn: number;
  acquisitionDate: string | null;
  strategy: string | null;
}

const MOCK_PORTFOLIO: PortfolioEntry[] = [
  { id: 'port1', propertyId: 'p1', address: '4521 Oak Creek Drive', city: 'Dallas', state: 'TX', purchasePrice: 310000, currentValue: 342000, monthlyRent: 2400, monthlyExpenses: 2088, equity: 72000, cashFlow: 312, capRate: 6.4, cocReturn: 8.2, acquisitionDate: '2023-06-15', strategy: 'Long-Term Rental' },
  { id: 'port2', propertyId: 'p2', address: '1872 Magnolia Street', city: 'Dallas', state: 'TX', purchasePrice: 265000, currentValue: 285000, monthlyRent: 2100, monthlyExpenses: 1902, equity: 58000, cashFlow: 198, capRate: 5.8, cocReturn: 7.1, acquisitionDate: '2022-11-03', strategy: 'Long-Term Rental' },
];

export interface PortfolioSummary {
  holdings: PortfolioEntry[];
  totalValue: number;
  totalEquity: number;
  totalDebt: number;
  totalCashFlow: number;
  healthScore: number;
}

/**
 * GET /portfolio returns a summary object, not an array. This used to call
 * `.map()` on it directly — "data.map is not a function" — so the Portfolio
 * tab threw for every real user and only ever worked against the mock.
 */
export async function getPortfolioSummary(): Promise<PortfolioSummary> {
  if (USE_MOCK) {
    return {
      holdings: MOCK_PORTFOLIO,
      totalValue: MOCK_PORTFOLIO.reduce((t, h) => t + h.currentValue, 0),
      totalEquity: MOCK_PORTFOLIO.reduce((t, h) => t + h.equity, 0),
      totalDebt: 0,
      totalCashFlow: MOCK_PORTFOLIO.reduce((t, h) => t + h.cashFlow, 0),
      healthScore: 68,
    };
  }
  const raw = await request<any>('/portfolio');
  const holdings = Array.isArray(raw) ? raw : (raw?.holdings ?? []);
  return {
    holdings: holdings.map(mapHolding),
    totalValue: raw?.totalValue ?? 0,
    totalEquity: raw?.totalEquity ?? 0,
    totalDebt: raw?.totalDebt ?? 0,
    totalCashFlow: raw?.totalCashFlow ?? 0,
    healthScore: raw?.healthScore ?? 0,
  };
}

export async function getPortfolio(): Promise<PortfolioEntry[]> {
  return (await getPortfolioSummary()).holdings;
}

function mapHolding(e: any): PortfolioEntry {
  return ({
    id: e.id,
    propertyId: e.propertyId ?? e.property_id ?? '',
    address: e.address ?? '',
    city: e.city ?? '',
    state: e.state ?? '',
    purchasePrice: e.purchasePrice ?? e.purchase_price ?? 0,
    currentValue: e.currentValue ?? e.current_value ?? 0,
    monthlyRent: e.monthlyRent ?? e.monthly_rent ?? 0,
    monthlyExpenses: e.monthlyExpenses ?? e.monthly_expenses ?? 0,
    equity: e.equity ?? 0,
    cashFlow: e.cashFlow ?? e.cash_flow ?? 0,
    capRate: e.capRate ?? e.cap_rate ?? 0,
    cocReturn: e.cocReturn ?? e.coc_return ?? 0,
    acquisitionDate: e.acquisitionDate ?? e.acquisition_date ?? e.purchaseDate ?? null,
    strategy: e.strategy ?? null,
  });
}


// ── Underwriting ──────────────────────────────────────────────────────────────

export interface UnderwritingInputs {
  propertyId?: string;
  purchasePrice: number;
  downPaymentPct: number;
  interestRate: number;
  loanType: '30yr Fixed' | '15yr Fixed' | 'Interest Only';
  monthlyRent: number;
  vacancyPct: number;
  managementPct: number;
  maintenancePct: number;
  insuranceMonthly: number;
  capexPct: number;
  propertyTaxRatePct?: number;
  state?: string;
}

export interface Scenario {
  name: 'Bear' | 'Base' | 'Bull';
  cashFlow: number;
  capRate: number;
  yearOneReturn: number;
}

export interface UnderwritingOutputs {
  cashFlow: number;
  capRate: number;
  cashOnCash: number;
  /** null on an all-cash purchase — there is no debt to service. */
  dscr: number | null;
  grm: number;
  noi: number;
  mortgage: number;
  totalExpenses: number;
  effectiveGrossIncome: number;
  breakEvenRent: number;
  breakEvenOccupancy: number;
  expenseRatio: number;
  totalCashToClose: number;
  annualCashFlow: number;
  recommendation: 'Strong Buy' | 'Buy with Negotiation' | 'Marginal' | 'Avoid';
  scenarios: Scenario[];
}

export async function calculateUnderwriting(i: UnderwritingInputs): Promise<UnderwritingOutputs> {
  const raw = await request<any>('/underwriting/calculate', {
    method: 'POST',
    body: JSON.stringify({
      property_id: i.propertyId,
      purchase_price: i.purchasePrice,
      down_payment_pct: i.downPaymentPct,
      interest_rate: i.interestRate,
      loan_type: i.loanType,
      monthly_rent: i.monthlyRent,
      vacancy_pct: i.vacancyPct,
      management_pct: i.managementPct,
      maintenance_pct: i.maintenancePct,
      insurance_monthly: i.insuranceMonthly,
      capex_pct: i.capexPct,
      property_tax_rate_pct: i.propertyTaxRatePct,
      state: i.state,
    }),
  });
  return {
    ...raw,
    // The API sends null for an all-cash purchase; `?? 0` here would report
    // the worst possible coverage for the safest possible structure.
    dscr: raw.dscr ?? null,
    scenarios: (raw.scenarios ?? []).map((s: any) => ({
      name: s.name,
      cashFlow: s.cashFlow,
      capRate: s.capRate,
      yearOneReturn: s.yearOneReturn ?? s.irr ?? 0,
    })),
  };
}

// ── Watchlist ─────────────────────────────────────────────────────────────────

export interface Watchlist {
  id: string;
  name: string;
  propertyIds: string[];
}

export async function getWatchlists(): Promise<Watchlist[]> {
  const raw = await request<any[]>('/watchlists');
  return (raw ?? []).map(w => ({
    id: w.id,
    name: w.name ?? 'My Watchlist',
    propertyIds: w.propertyIds ?? w.property_ids ?? [],
  }));
}

export async function createWatchlist(name = 'My Watchlist'): Promise<Watchlist> {
  const w = await request<any>('/watchlists', {
    method: 'POST',
    body: JSON.stringify({ name, propertyIds: [] }),
  });
  return { id: w.id, name: w.name ?? name, propertyIds: w.propertyIds ?? [] };
}

export async function addToWatchlist(watchlistId: string, propertyId: string): Promise<void> {
  await request(`/watchlists/${watchlistId}/properties`, {
    method: 'POST',
    body: JSON.stringify({ propertyId }),
  });
}

export async function removeFromWatchlist(watchlistId: string, propertyId: string): Promise<void> {
  await request(`/watchlists/${watchlistId}/properties/${propertyId}`, { method: 'DELETE' });
}

// ── Markets ───────────────────────────────────────────────────────────────────

export interface MarketSummary {
  city: string;
  state: string;
  regime: 'Hot' | 'Balanced' | 'Cooling' | "Buyer's Market";
  medianPrice: number;
  priceChange12Mo: number;
  inventoryMonths: number;
  daysOnMarket: number;
  capRateMedian: number;
  rentGrowth12Mo: number;
  vacancyRate: number;
}

export async function getMarketSummary(): Promise<MarketSummary[]> {
  const raw = await request<any>('/market/summary');
  return Array.isArray(raw) ? raw : [];
}

// ── Profile ───────────────────────────────────────────────────────────────────

export interface UserProfile {
  id: string;
  email: string;
  name: string | null;
  strategySettings: Record<string, any>;
}

export async function getProfile(): Promise<UserProfile> {
  const p = await request<any>('/users/me');
  return {
    id: p.id,
    email: p.email ?? '',
    name: p.name ?? null,
    strategySettings: p.strategySettings ?? p.strategy_settings ?? {},
  };
}

export async function updateProfile(name: string): Promise<UserProfile> {
  const p = await request<any>('/users/me', { method: 'PUT', body: JSON.stringify({ name }) });
  return {
    id: p.id,
    email: p.email ?? '',
    name: p.name ?? null,
    strategySettings: p.strategySettings ?? p.strategy_settings ?? {},
  };
}
