import type { Property, UnderwritingInputs, UnderwritingOutputs, Portfolio, MarketData, SearchFilters } from '../types';
import { mockProperties, mockPortfolioHoldings, mockMarketData } from '../data/mockData';
import { supabase } from '../lib/supabase';

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
  };
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
