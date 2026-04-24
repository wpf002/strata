import type {
  Property, UnderwritingInputs, UnderwritingOutputs, Portfolio, MarketData, SearchFilters,
  SupportedMarket, OffMarketSignalResult,
} from '../types';
import { mockProperties, mockPortfolioHoldings, mockMarketData } from '../data/mockData';
import { supabase } from '../lib/supabase';

export type ValuationData = {
  propertyId: string;
  fairValueLow: number;
  fairValueHigh: number;
  fairValueMid: number;
  confidence: 'High' | 'Medium' | 'Low';
  compCount: number;
  comps: Array<{ address: string; sqft: number; listPrice: number; adjustedValue: number; daysAgo?: number }>;
  adjustmentPerSqft: number;
};

export type RiskDimension = { name: string; score: number; description: string };
export type RiskData = {
  propertyId: string;
  compositeScore: number;
  dimensions: RiskDimension[];
  flags: Array<{ label: string; severity: 'High' | 'Medium' | 'Low' }>;
  floodRisk?: { zone: string; inSfha: boolean; riskLabel: string; description: string } | null;
};

export type SavedSearch = { id: string; name: string | null; criteria: object; alertEnabled: boolean; createdAt: string };
export type Watchlist = { id: string; name: string; propertyIds: string[]; createdAt: string };

const BASE_URL = import.meta.env.VITE_API_URL ?? '';
const USE_MOCK = import.meta.env.VITE_USE_MOCK !== 'false';

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function get<T>(path: string, auth = false): Promise<T> {
  const headers = auth ? await authHeaders() : {};
  const res = await fetch(`${BASE_URL}${path}`, { headers });
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  return res.json();
}

async function post<T>(path: string, body: unknown, auth = false): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (auth) Object.assign(headers, await authHeaders());
  const res = await fetch(`${BASE_URL}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  return res.json();
}

async function del(path: string, auth = false): Promise<void> {
  const headers = auth ? await authHeaders() : {};
  const res = await fetch(`${BASE_URL}${path}`, { method: 'DELETE', headers });
  if (!res.ok && res.status !== 204) throw new Error(`API error ${res.status}`);
}

// ── Properties ──────────────────────────────────────────────────────────────
export async function getProperties(filters?: Partial<SearchFilters>): Promise<Property[]> {
  if (USE_MOCK) {
    await delay(200);
    let results = [...mockProperties];
    if (filters?.minDealScore) results = results.filter(p => p.dealScore >= filters.minDealScore!);
    if (filters?.maxPrice) results = results.filter(p => p.price <= filters.maxPrice!);
    if (filters?.sortBy === 'Deal Score') results.sort((a, b) => b.dealScore - a.dealScore);
    if (filters?.sortBy === 'Price') results.sort((a, b) => a.price - b.price);
    if (filters?.sortBy === 'Cap Rate') results.sort((a, b) => b.capRate - a.capRate);
    if (filters?.sortBy === 'Cash Flow') results.sort((a, b) => b.cashFlow - a.cashFlow);
    if (filters?.sortBy === 'Days on Market') results.sort((a, b) => a.daysOnMarket - b.daysOnMarket);
    return results;
  }
  const params = new URLSearchParams();
  if (filters?.query) params.set('query', filters.query);
  if (filters?.minDealScore) params.set('min_deal_score', String(filters.minDealScore));
  if (filters?.maxPrice) params.set('max_price', String(filters.maxPrice));
  if (filters?.minCapRate) params.set('min_cap_rate', String(filters.minCapRate));
  if (filters?.propertyTypes?.length) filters.propertyTypes.forEach(t => params.append('property_types', t));
  if (filters?.sortBy) params.set('sort_by', filters.sortBy);
  if (filters?.offMarketOnly) params.set('off_market_only', 'true');
  if (filters?.minMotivationScore != null) params.set('min_motivation_score', String(filters.minMotivationScore));
  const data = await get<any[]>(`/properties/search?${params}`);
  return data.map(apiToProperty);
}

export async function getProperty(id: string): Promise<Property> {
  if (USE_MOCK) {
    await delay(150);
    const p = mockProperties.find(p => p.id === id);
    if (!p) throw new Error('Property not found');
    return p;
  }
  return apiToProperty(await get<any>(`/properties/${id}`));
}

// ── Underwriting ────────────────────────────────────────────────────────────
export async function calculateUnderwriting(inputs: UnderwritingInputs): Promise<UnderwritingOutputs> {
  if (USE_MOCK) {
    await delay(100);
    return computeUnderwriting(inputs);
  }
  // Convert camelCase inputs → snake_case for backend
  const body = {
    property_id: inputs.propertyId,
    purchase_price: inputs.purchasePrice,
    down_payment_pct: inputs.downPaymentPct,
    interest_rate: inputs.interestRate,
    loan_type: inputs.loanType,
    monthly_rent: inputs.monthlyRent,
    vacancy_pct: inputs.vacancyPct,
    management_pct: inputs.managementPct,
    maintenance_pct: inputs.maintenancePct,
    insurance_monthly: inputs.insuranceMonthly,
    capex_pct: inputs.capexPct,
    strategy: inputs.strategy,
  };
  const raw = await post<any>('/underwriting/calculate', body);
  return apiToUnderwritingOutputs(raw);
}

// ── Portfolio ────────────────────────────────────────────────────────────────
export async function getPortfolio(): Promise<Portfolio> {
  if (USE_MOCK) {
    await delay(200);
    const holdings = mockPortfolioHoldings;
    return {
      holdings,
      totalValue: holdings.reduce((s, h) => s + h.currentValue, 0),
      totalEquity: holdings.reduce((s, h) => s + h.equity, 0),
      totalDebt: holdings.reduce((s, h) => s + h.loanBalance, 0),
      totalCashFlow: holdings.reduce((s, h) => s + h.cashFlow, 0),
      healthScore: 68,
    };
  }
  try {
    const raw = await get<any>('/portfolio', true);
    return {
      holdings: (raw.holdings ?? []).map(apiToHolding),
      totalValue: raw.totalValue ?? 0,
      totalEquity: raw.totalEquity ?? 0,
      totalDebt: raw.totalDebt ?? 0,
      totalCashFlow: raw.totalCashFlow ?? 0,
      healthScore: raw.healthScore ?? 0,
    };
  } catch {
    // Fall back to mock if not authenticated or portfolio empty
    const holdings = mockPortfolioHoldings;
    return {
      holdings,
      totalValue: holdings.reduce((s, h) => s + h.currentValue, 0),
      totalEquity: holdings.reduce((s, h) => s + h.equity, 0),
      totalDebt: holdings.reduce((s, h) => s + h.loanBalance, 0),
      totalCashFlow: holdings.reduce((s, h) => s + h.cashFlow, 0),
      healthScore: 68,
    };
  }
}

// ── Valuation & Risk ─────────────────────────────────────────────────────────
export async function getValuation(id: string): Promise<ValuationData> {
  const raw = await get<any>(`/properties/${id}/valuation`);
  return {
    propertyId: raw.propertyId,
    fairValueLow: raw.fairValueLow,
    fairValueHigh: raw.fairValueHigh,
    fairValueMid: raw.fairValueMid,
    confidence: raw.confidence,
    compCount: raw.compCount,
    comps: (raw.comps ?? []).map((c: any) => ({
      address: c.address ?? c.id ?? 'Unknown',
      sqft: c.sqft ?? 0,
      listPrice: c.list_price ?? c.listPrice ?? 0,
      adjustedValue: c.adjusted_value ?? c.adjustedValue ?? 0,
      daysAgo: c.days_ago ?? c.daysAgo,
    })),
    adjustmentPerSqft: raw.adjustmentPerSqft ?? 60,
  };
}

export async function getRisk(id: string): Promise<RiskData> {
  const raw = await get<any>(`/properties/${id}/risk`);
  return {
    propertyId: raw.propertyId,
    compositeScore: raw.compositeScore,
    dimensions: raw.dimensions ?? [],
    flags: raw.flags ?? [],
    floodRisk: raw.floodRisk ?? null,
  };
}

// ── Saved Searches ────────────────────────────────────────────────────────────
export async function getSavedSearches(): Promise<SavedSearch[]> {
  return get<SavedSearch[]>('/saved-searches', true);
}

export async function createSavedSearch(name: string, criteria: object): Promise<SavedSearch> {
  return post<SavedSearch>('/saved-searches', { name, criteria, alertEnabled: false }, true);
}

export async function deleteSavedSearch(id: string): Promise<void> {
  return del(`/saved-searches/${id}`, true);
}

// ── Watchlists ────────────────────────────────────────────────────────────────
export async function getWatchlists(): Promise<Watchlist[]> {
  return get<Watchlist[]>('/watchlists', true);
}

export async function createWatchlist(name: string): Promise<Watchlist> {
  return post<Watchlist>('/watchlists', { name }, true);
}

export async function addToWatchlist(watchlistId: string, propertyId: string): Promise<Watchlist> {
  return post<Watchlist>(`/watchlists/${watchlistId}/properties/${propertyId}`, {}, true);
}

export async function removeFromWatchlist(watchlistId: string, propertyId: string): Promise<void> {
  return del(`/watchlists/${watchlistId}/properties/${propertyId}`, true);
}

// ── Portfolio CRUD ────────────────────────────────────────────────────────────
export async function createHolding(data: object): Promise<any> {
  return post<any>('/portfolio/holdings', data, true);
}

export async function updateHolding(id: string, data: object): Promise<any> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(await authHeaders()) };
  const res = await fetch(`${BASE_URL}/portfolio/holdings/${id}`, { method: 'PUT', headers, body: JSON.stringify(data) });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

export async function deleteHolding(id: string): Promise<void> {
  return del(`/portfolio/holdings/${id}`, true);
}

// ── Market ───────────────────────────────────────────────────────────────────
export async function getMarketData(zip?: string): Promise<MarketData> {
  if (USE_MOCK) {
    await delay(150);
    return mockMarketData;
  }
  const geoId = zip || '75201';
  const raw = await get<any>(`/market/zip/${geoId}`);
  return {
    city: raw.city,
    regime: raw.regime,
    medianPrice: raw.medianPrice,
    priceChange12mo: raw.priceChange12mo,
    priceChange6mo: raw.priceChange6mo,
    inventory: raw.inventory,
    daysOnMarket: raw.daysOnMarket,
    domChange: raw.domChange,
    listToSaleRatio: raw.listToSaleRatio,
    priceReductions: raw.priceReductions,
    capRateMedian: raw.capRateMedian,
    rentGrowth12mo: raw.rentGrowth12mo,
    vacancyRate: raw.vacancyRate,
    newListings: raw.newListings,
    absorption: raw.absorption,
  };
}

// ── Adapters (API camelCase → frontend types) ────────────────────────────────
function apiToProperty(p: any): Property {
  return {
    id: p.id, address: p.address, city: p.city, state: p.state, zip: p.zip,
    price: p.price, beds: p.beds, baths: p.baths, sqft: p.sqft,
    lotSqft: p.lotSqft, yearBuilt: p.yearBulit ?? p.yearBuilt,
    type: p.type, status: p.status, daysOnMarket: p.daysOnMarket,
    dealScore: p.dealScore, riskScore: p.riskScore,
    capRate: p.capRate, cashOnCash: p.cashOnCash, cashFlow: p.cashFlow,
    fairValueLow: p.fairValueLow, fairValueHigh: p.fairValueHigh,
    rentEstLow: p.rentEstLow, rentEstHigh: p.rentEstHigh, rentEstMid: p.rentEstMid,
    rentConfidence: p.rentConfidence, valuationConfidence: p.valuationConfidence,
    priceVsFairValue: p.priceVsFairValue, strategyFit: p.strategyFit,
    neighborhood: p.neighborhood, neighborhoodScore: p.neighborhoodScore,
    marketRegime: p.marketRegime, riskFlags: p.riskFlags ?? [],
    image: p.image, lat: p.lat, lng: p.lng,
    motivationScore: p.motivationScore,
    offMarketSignals: p.offMarketSignals ?? [],
  };
}

// ── Markets ──────────────────────────────────────────────────────────────────
export async function getSupportedMarkets(): Promise<SupportedMarket[]> {
  const raw = await get<{ markets: SupportedMarket[] }>('/markets/supported');
  return raw.markets;
}

// ── Off-market signals ───────────────────────────────────────────────────────
export async function getOffMarketSignals(propertyId: string): Promise<OffMarketSignalResult> {
  const raw = await get<any>(`/properties/${propertyId}/off-market-signals`);
  return {
    hasSignals: raw.has_signals ?? raw.hasSignals ?? false,
    motivationScore: raw.motivation_score ?? raw.motivationScore ?? 0,
    signals: (raw.signals ?? []).map((s: any) => ({
      type: s.type, label: s.label, severity: s.severity,
    })),
  };
}

// ── Renovation estimate ──────────────────────────────────────────────────────
export type RenovationScope =
  | 'roof' | 'hvac' | 'kitchen' | 'bathrooms' | 'flooring' | 'windows'
  | 'electrical' | 'plumbing' | 'foundation' | 'exterior' | 'cosmetic' | 'full_gut';

export type RenovationCondition = 'poor' | 'fair' | 'average' | 'good';

export interface RenovationEstimateRequest {
  scope: RenovationScope[];
  condition: RenovationCondition;
  sqft: number;
  yearBuilt?: number | null;
  propertyType?: string;
  state?: string;
  baths?: number | null;
  fairValueLow?: number | null;
  fairValueHigh?: number | null;
}

export interface RenovationLineItem {
  scope: string;
  low: number;
  high: number;
  notes: string;
}

export interface RenovationEstimate {
  lineItems: RenovationLineItem[];
  subtotalLow: number;
  subtotalHigh: number;
  contingency10Pct: number;
  contingency20Pct: number;
  totalLow: number;
  totalHigh: number;
  costPerSqftLow: number;
  costPerSqftHigh: number;
  arvLow: number | null;
  arvHigh: number | null;
  upliftLowPct: number;
  upliftHighPct: number;
  scopeOfWork: string;
  scope: string[];
  condition: string;
}

export async function getRenovationEstimate(propertyId: string, body: RenovationEstimateRequest): Promise<RenovationEstimate> {
  const raw = await post<any>(`/properties/${propertyId}/renovation-estimate`, {
    scope: body.scope,
    condition: body.condition,
    sqft: body.sqft,
    year_built: body.yearBuilt,
    property_type: body.propertyType ?? 'Single Family',
    state: body.state ?? 'TX',
    baths: body.baths,
    fair_value_low: body.fairValueLow,
    fair_value_high: body.fairValueHigh,
  });
  return {
    lineItems: (raw.line_items ?? []).map((i: any) => ({ scope: i.scope, low: i.low, high: i.high, notes: i.notes })),
    subtotalLow: raw.subtotal_low,
    subtotalHigh: raw.subtotal_high,
    contingency10Pct: raw.contingency_10pct,
    contingency20Pct: raw.contingency_20pct,
    totalLow: raw.total_low,
    totalHigh: raw.total_high,
    costPerSqftLow: raw.cost_per_sqft_low,
    costPerSqftHigh: raw.cost_per_sqft_high,
    arvLow: raw.arv_low,
    arvHigh: raw.arv_high,
    upliftLowPct: raw.uplift_low_pct,
    upliftHighPct: raw.uplift_high_pct,
    scopeOfWork: raw.scope_of_work,
    scope: raw.scope ?? [],
    condition: raw.condition ?? 'average',
  };
}

// ── Leads / Activity ─────────────────────────────────────────────────────────
export type ActivityType = 'viewed' | 'underwritten' | 'reported' | 'saved' | 'copilot_asked';

export interface ActivityCount {
  count: number;
  lastAt: string | null;
}

export interface Lead {
  propertyId: string;
  address: string;
  city: string | null;
  state: string | null;
  price: number | null;
  image: string | null;
  dealScore: number | null;
  activities: Partial<Record<ActivityType, ActivityCount>>;
  lastActive: string | null;
  engagementScore: number;
}

// Map leads activity → client activity type. Some types (e.g. 'reported') share
// a name; others don't apply at the client level and are skipped.
const CLIENT_ACTIVITY_MAP: Partial<Record<ActivityType, string>> = {
  viewed: 'viewed',
  underwritten: 'underwritten',
  reported: 'reported',
  saved: 'saved',
  copilot_asked: 'copilot_asked',
};

function currentClientId(): string | null {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get('client');
}

export async function logActivity(propertyId: string, activityType: ActivityType, metadata?: Record<string, unknown>): Promise<void> {
  // Dual-write: always log user_property_activity; also attribute to a client
  // when the URL says ?client={id}. Both calls are best-effort.
  const body = { property_id: propertyId, activity_type: activityType, metadata };
  try { await post('/activity', body, true); } catch { /* silent */ }

  const clientId = currentClientId();
  const clientType = CLIENT_ACTIVITY_MAP[activityType];
  if (clientId && clientType) {
    try {
      await post(`/clients/${clientId}/activity`, {
        property_id: propertyId,
        activity_type: clientType,
        metadata,
      }, true);
    } catch { /* silent */ }
  }
}

export async function removeActivity(propertyId: string, activityType: ActivityType): Promise<void> {
  // Used when a user unfavorites a property — removes the user_property_activity
  // row so Leads reflects current intent. Does NOT decrement client_activity
  // (intentionally — agents still want to see that the client saved it once).
  try {
    await post('/activity/remove', { property_id: propertyId, activity_type: activityType }, true);
  } catch { /* silent */ }
}

export async function listLeads(): Promise<Lead[]> {
  return get<Lead[]>('/leads', true);
}

// ── Client Portals ──────────────────────────────────────────────────────────
export interface ClientPortalSummary {
  id: string;
  clientId: string;
  clientName: string | null;
  name: string;
  magicLinkToken: string;
  shareUrl: string;
  propertyCount: number;
  status: string;
  createdAt: string;
  updatedAt: string;
  lastClientActivityAt: string | null;
}

export interface PortalProperty {
  id: string;
  address: string;
  city: string | null;
  state: string | null;
  price: number | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  image: string | null;
  dealScore: number | null;
  capRate: number | null;
  cashFlow: number | null;
  rentEstimate: number | null;
  neighborhoodScore: number | null;
  daysOnMarket: number | null;
}

export interface PortalActivityEntry {
  id: string;
  propertyId: string | null;
  actionType: string;
  clientName: string | null;
  clientEmail: string | null;
  occurredAt: string;
}

export interface ClientPortalDetail extends ClientPortalSummary {
  properties: PortalProperty[];
  activity: PortalActivityEntry[];
}

export interface PortalPublicView {
  portalName: string;
  agent: { name: string | null; email: string | null; phone: string | null; brokerage: string | null; photo: string | null };
  properties: PortalProperty[];
}

export async function createClientPortal(clientId: string, name: string, propertyIds: string[]): Promise<ClientPortalSummary> {
  return post<ClientPortalSummary>('/client-portals', { clientId, name, propertyIds }, true);
}

export async function listClientPortals(): Promise<ClientPortalSummary[]> {
  return get<ClientPortalSummary[]>('/client-portals', true);
}

export async function getClientPortal(id: string): Promise<ClientPortalDetail> {
  return get<ClientPortalDetail>(`/client-portals/${id}`, true);
}

export async function archiveClientPortal(id: string): Promise<void> {
  return del(`/client-portals/${id}`, true);
}

export async function addPortalProperty(portalId: string, propertyId: string): Promise<ClientPortalDetail> {
  return post<ClientPortalDetail>(`/client-portals/${portalId}/properties`, { propertyId }, true);
}

export async function removePortalProperty(portalId: string, propertyId: string): Promise<ClientPortalDetail> {
  const headers = await authHeaders();
  const res = await fetch(`${BASE_URL}/client-portals/${portalId}/properties/${propertyId}`, { method: 'DELETE', headers });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

export async function viewPortal(token: string): Promise<PortalPublicView> {
  return get<PortalPublicView>(`/client-portals/view/${token}`);
}

// ── Demand Signal ────────────────────────────────────────────────────────────
export interface DemandSignal {
  propertyId: string;
  strataViews30d: number;
  strataSaves30d: number;
  strataUnderwrites30d: number;
  demandScore: number;
  demandLabel: string;
  priceDropCount: number;
  daysOnMarket: number | null;
  vsMarketDom: string;
  note: string;
}

export interface DemandSignalSummary {
  propertyId: string;
  demandScore: number;
  demandLabel: string;
}

export async function getDemandSignal(propertyId: string): Promise<DemandSignal> {
  try {
    return await get<DemandSignal>(`/properties/${propertyId}/demand`);
  } catch {
    // Never crash the intelligence page on a demand lookup failure.
    return {
      propertyId,
      strataViews30d: 0,
      strataSaves30d: 0,
      strataUnderwrites30d: 0,
      demandScore: 0,
      demandLabel: 'Low — limited investor activity',
      priceDropCount: 0,
      daysOnMarket: null,
      vsMarketDom: 'Baseline unavailable',
      note: 'Demand signal unavailable',
    };
  }
}

export async function getDemandSignalsBatch(
  propertyIds: string[],
): Promise<Record<string, DemandSignalSummary>> {
  if (propertyIds.length === 0) return {};
  const params = new URLSearchParams({ ids: propertyIds.join(',') });
  try {
    return await get<Record<string, DemandSignalSummary>>(`/properties/demand-signals?${params}`);
  } catch {
    return {};
  }
}

// ── Transactions ─────────────────────────────────────────────────────────────
export interface TransactionMilestone {
  id: string;
  label: string;
  status: 'pending' | 'complete' | 'skipped';
  targetDate: string | null;
  completedDate: string | null;
  notes: string | null;
}

export interface ClientTransaction {
  id: string;
  clientId: string;
  propertyId: string | null;
  propertyAddress: string;
  status: 'searching' | 'offer_made' | 'under_contract' | 'closing' | 'closed' | 'cancelled';
  milestones: TransactionMilestone[];
  createdAt: string;
  updatedAt: string;
  progressPct: number;
  progressCount: number;
  progressTotal: number;
}

export async function listTransactions(clientId: string): Promise<ClientTransaction[]> {
  return get<ClientTransaction[]>(`/clients/${clientId}/transactions`, true);
}

export async function createTransaction(
  clientId: string,
  propertyAddress: string,
  propertyId?: string,
): Promise<ClientTransaction> {
  return post<ClientTransaction>(`/clients/${clientId}/transactions`, { propertyAddress, propertyId }, true);
}

export async function updateTransaction(
  clientId: string,
  txnId: string,
  body: Partial<{ status: string; propertyAddress: string }>,
): Promise<ClientTransaction> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(await authHeaders()) };
  const res = await fetch(`${BASE_URL}/clients/${clientId}/transactions/${txnId}`, {
    method: 'PUT', headers, body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

export async function patchMilestone(
  clientId: string,
  txnId: string,
  milestoneId: string,
  body: Partial<{ status: 'pending' | 'complete' | 'skipped'; notes: string; targetDate: string }>,
): Promise<ClientTransaction> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(await authHeaders()) };
  const res = await fetch(`${BASE_URL}/clients/${clientId}/transactions/${txnId}/milestones/${milestoneId}`, {
    method: 'PATCH', headers, body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

export async function deleteTransaction(clientId: string, txnId: string): Promise<void> {
  const headers: Record<string, string> = await authHeaders();
  const res = await fetch(`${BASE_URL}/clients/${clientId}/transactions/${txnId}`, { method: 'DELETE', headers });
  if (!res.ok && res.status !== 204) throw new Error(`${res.status}`);
}

export async function recordPortalActivity(
  token: string,
  body: { propertyId?: string; actionType: string; clientName?: string; clientEmail?: string },
): Promise<void> {
  try {
    const res = await fetch(`${BASE_URL}/client-portals/view/${token}/activity`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        propertyId: body.propertyId,
        actionType: body.actionType,
        clientName: body.clientName,
        clientEmail: body.clientEmail,
      }),
    });
    if (!res.ok) throw new Error(`${res.status}`);
  } catch { /* silent — portal view should never break on logging failure */ }
}

function apiToHolding(h: any) {
  return {
    id: h.id, address: h.address, image: h.image,
    purchasePrice: h.purchasePrice, purchaseDate: h.purchaseDate,
    currentValue: h.currentValue, loanBalance: h.loanBalance,
    equity: h.equity, monthlyRent: h.monthlyRent,
    monthlyExpenses: h.monthlyExpenses, cashFlow: h.cashFlow,
    capRate: h.capRate, status: h.status,
    recommendation: h.recommendation, recommendationNote: h.recommendationNote,
    appreciation: h.appreciation, totalReturn: h.totalReturn,
  };
}

function apiToUnderwritingOutputs(r: any): UnderwritingOutputs {
  return {
    cashFlow: r.cashFlow, capRate: r.capRate, cashOnCash: r.cashOnCash,
    dscr: r.dscr, grm: r.grm, noi: r.noi, mortgage: r.mortgage,
    totalExpenses: r.totalExpenses, effectiveGrossIncome: r.effectiveGrossIncome,
    breakEvenRent: r.breakEvenRent, breakEvenOccupancy: r.breakEvenOccupancy,
    expenseRatio: r.expenseRatio, totalCashToClose: r.totalCashToClose,
    annualCashFlow: r.annualCashFlow, recommendation: r.recommendation,
    scenarios: (r.scenarios ?? []).map((s: any) => ({
      name: s.name, cashFlow: s.cashFlow, capRate: s.capRate, irr: s.irr,
    })),
  };
}

// ── Local calculation (mirrors backend logic exactly) ────────────────────────
function computeUnderwriting(i: UnderwritingInputs): UnderwritingOutputs {
  const downAmount = i.purchasePrice * (i.downPaymentPct / 100);
  const loanAmt = i.purchasePrice - downAmount;
  const monthlyRate = i.interestRate / 100 / 12;
  const numPayments = i.loanType === '15yr Fixed' ? 180 : 360;
  const mortgage = i.loanType === 'Interest Only'
    ? loanAmt * monthlyRate
    : loanAmt * (monthlyRate * Math.pow(1 + monthlyRate, numPayments)) / (Math.pow(1 + monthlyRate, numPayments) - 1);

  const vacancyLoss = i.monthlyRent * (i.vacancyPct / 100);
  const egi = i.monthlyRent - vacancyLoss;
  const mgmtCost = egi * (i.managementPct / 100);
  const taxMo = (i.purchasePrice * 0.022) / 12;
  const maintenanceMo = (i.purchasePrice * (i.maintenancePct / 100)) / 12;
  const capexMo = egi * (i.capexPct / 100);
  const totalOpex = mgmtCost + taxMo + i.insuranceMonthly + maintenanceMo + capexMo;
  const noi = egi - totalOpex;
  const cashFlow = noi - mortgage;
  const cocReturn = ((cashFlow * 12) / (downAmount + 8500)) * 100;
  const capRate = ((noi * 12) / i.purchasePrice) * 100;
  const grm = i.purchasePrice / (i.monthlyRent * 12);
  const dscr = noi / mortgage;

  const scenarios = [
    { name: 'Bear' as const, rentAdj: -0.10, vacAdj: 4, aprAdj: -2 },
    { name: 'Base' as const, rentAdj: 0, vacAdj: 0, aprAdj: 3 },
    { name: 'Bull' as const, rentAdj: 0.10, vacAdj: -2, aprAdj: 6 },
  ].map(s => {
    const r = i.monthlyRent * (1 + s.rentAdj);
    const v = i.vacancyPct + s.vacAdj;
    const e2 = r * (1 - v / 100);
    const op = e2 * (i.managementPct / 100) + taxMo + i.insuranceMonthly + maintenanceMo + capexMo;
    const n2 = e2 - op;
    const cf = n2 - mortgage;
    const irr = ((cf * 12) / (downAmount + 8500)) + (s.aprAdj / 100 * (i.purchasePrice / (downAmount + 8500)));
    return { name: s.name, cashFlow: cf, irr: irr * 100, capRate: (n2 * 12 / i.purchasePrice) * 100 };
  });

  const recommendation =
    cashFlow > 200 && cocReturn > 6 ? 'Strong Buy' :
    cashFlow > 0 && cocReturn > 4 ? 'Buy with Negotiation' :
    cashFlow > -100 ? 'Marginal' : 'Avoid';

  return {
    cashFlow, capRate, cashOnCash: cocReturn, dscr, grm, noi, mortgage,
    totalExpenses: totalOpex, effectiveGrossIncome: egi,
    breakEvenRent: mortgage + totalOpex,
    breakEvenOccupancy: ((mortgage + totalOpex) / i.monthlyRent) * 100,
    expenseRatio: (totalOpex / egi) * 100,
    totalCashToClose: downAmount + 8500,
    annualCashFlow: cashFlow * 12,
    recommendation, scenarios,
  };
}

function delay(ms: number) { return new Promise(r => setTimeout(r, ms)); }
