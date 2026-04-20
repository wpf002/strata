import type { Property, UnderwritingInputs, UnderwritingOutputs, Portfolio, MarketData, SearchFilters } from '../types';
import { mockProperties, mockPortfolioHoldings, mockMarketData } from '../data/mockData';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const USE_MOCK = import.meta.env.VITE_USE_MOCK !== 'false';

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

// ── Properties ──────────────────────────────────────────────────────────
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
  const params = new URLSearchParams(filters as any).toString();
  return get<Property[]>(`/api/properties?${params}`);
}

export async function getProperty(id: string): Promise<Property> {
  if (USE_MOCK) {
    await delay(150);
    const p = mockProperties.find(p => p.id === id);
    if (!p) throw new Error('Property not found');
    return p;
  }
  return get<Property>(`/api/properties/${id}`);
}

// ── Underwriting ────────────────────────────────────────────────────────
export async function calculateUnderwriting(inputs: UnderwritingInputs): Promise<UnderwritingOutputs> {
  if (USE_MOCK) {
    await delay(100);
    return computeUnderwriting(inputs);
  }
  return post<UnderwritingOutputs>('/api/underwriting/calculate', inputs);
}

// Local calculation (mirrors backend logic exactly)
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

// ── Portfolio ────────────────────────────────────────────────────────────
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
  return get<Portfolio>('/api/portfolio');
}

// ── Market ───────────────────────────────────────────────────────────────
export async function getMarketData(zip?: string): Promise<MarketData> {
  if (USE_MOCK) {
    await delay(150);
    return mockMarketData;
  }
  return get<MarketData>(`/api/market${zip ? `?zip=${zip}` : ''}`);
}

function delay(ms: number) { return new Promise(r => setTimeout(r, ms)); }
