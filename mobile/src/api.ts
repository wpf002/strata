// Mirrors web/src/api/client.ts — same backend, same mock data
// When the backend is live, set API_BASE_URL in .env and set USE_MOCK to false

const API_BASE_URL = process.env.STRATA_API_URL || 'http://localhost:8000';
const USE_MOCK = process.env.STRATA_USE_MOCK !== 'false';

// ── Mock data ──────────────────────────────────────────────────────────
const MOCK_PROPERTIES = [
  {
    id: 'p1', address: '4521 Oak Creek Drive', city: 'Dallas', state: 'TX', zip: '75201',
    price: 342000, beds: 3, baths: 2, sqft: 1840, yearBuilt: 2001,
    type: 'Single Family', daysOnMarket: 23,
    dealScore: 81, riskScore: 28, capRate: 6.4, cashOnCash: 7.2, cashFlow: 312,
    fairValueLow: 318000, fairValueHigh: 347000, rentEstMid: 2240,
    rentConfidence: 'High', valuationConfidence: 'High', priceVsFairValue: -1.4,
    neighborhood: 'Lake Highlands', marketRegime: 'Balanced',
    riskFlags: [{ label: 'HVAC age est. 14 yrs', severity: 'Medium' }],
  },
  {
    id: 'p2', address: '1872 Magnolia Street', city: 'Dallas', state: 'TX', zip: '75206',
    price: 285000, beds: 3, baths: 2, sqft: 1520, yearBuilt: 1995,
    type: 'Single Family', daysOnMarket: 11,
    dealScore: 74, riskScore: 35, capRate: 5.8, cashOnCash: 6.1, cashFlow: 198,
    fairValueLow: 274000, fairValueHigh: 299000, rentEstMid: 1860,
    rentConfidence: 'High', valuationConfidence: 'Medium', priceVsFairValue: 0.7,
    neighborhood: 'Lakewood', marketRegime: 'Hot',
    riskFlags: [{ label: 'Roof age est. 18 yrs', severity: 'High' }],
  },
  {
    id: 'p5', address: '517 Elmwood Avenue', city: 'Dallas', state: 'TX', zip: '75208',
    price: 378000, beds: 4, baths: 2.5, sqft: 2010, yearBuilt: 2014,
    type: 'Single Family', daysOnMarket: 6,
    dealScore: 77, riskScore: 22, capRate: 6.1, cashOnCash: 6.8, cashFlow: 274,
    fairValueLow: 362000, fairValueHigh: 392000, rentEstMid: 2500,
    rentConfidence: 'High', valuationConfidence: 'High', priceVsFairValue: -0.8,
    neighborhood: 'Bishop Arts', marketRegime: 'Hot',
    riskFlags: [{ label: 'Low inventory — move fast', severity: 'Low' }],
  },
];

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

const fmt = {
  currency: (n: number) => `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`,
  pct: (n: number, d = 1) => `${n.toFixed(d)}%`,
  compact: (n: number) => n >= 1000000 ? `$${(n/1000000).toFixed(1)}M` : n >= 1000 ? `$${(n/1000).toFixed(0)}K` : `$${n}`,
};

// ── API functions ──────────────────────────────────────────────────────
export async function getProperties(filters?: { sortBy?: string; minDealScore?: number }) {
  if (USE_MOCK) {
    await delay(200);
    let results = [...MOCK_PROPERTIES];
    if (filters?.minDealScore) results = results.filter(p => p.dealScore >= filters.minDealScore!);
    if (filters?.sortBy === 'Deal Score') results.sort((a, b) => b.dealScore - a.dealScore);
    if (filters?.sortBy === 'Cap Rate') results.sort((a, b) => b.capRate - a.capRate);
    if (filters?.sortBy === 'Cash Flow') results.sort((a, b) => b.cashFlow - a.cashFlow);
    return results;
  }
  const res = await fetch(`${API_BASE_URL}/api/properties`);
  return res.json();
}

export async function getProperty(id: string) {
  if (USE_MOCK) {
    await delay(150);
    return MOCK_PROPERTIES.find(p => p.id === id) || MOCK_PROPERTIES[0];
  }
  const res = await fetch(`${API_BASE_URL}/api/properties/${id}`);
  return res.json();
}

export async function calculateUnderwriting(inputs: {
  purchasePrice: number; downPaymentPct: number; interestRate: number;
  monthlyRent: number; vacancyPct: number; managementPct: number;
}) {
  if (USE_MOCK) {
    await delay(100);
    const down = inputs.purchasePrice * (inputs.downPaymentPct / 100);
    const loan = inputs.purchasePrice - down;
    const mr = inputs.interestRate / 100 / 12;
    const mtg = loan * (mr * Math.pow(1+mr, 360)) / (Math.pow(1+mr, 360) - 1);
    const egi = inputs.monthlyRent * (1 - inputs.vacancyPct / 100);
    const opex = egi * (inputs.managementPct / 100) + (inputs.purchasePrice * 0.022 / 12) + 140 + (inputs.purchasePrice * 0.01 / 12);
    const noi = egi - opex;
    const cashFlow = noi - mtg;
    const cocReturn = ((cashFlow * 12) / (down + 8500)) * 100;
    const capRate = (noi * 12 / inputs.purchasePrice) * 100;
    const dscr = noi / mtg;
    return {
      cashFlow: Math.round(cashFlow),
      capRate: +capRate.toFixed(2),
      cashOnCash: +cocReturn.toFixed(2),
      dscr: +dscr.toFixed(2),
      noi: Math.round(noi),
      mortgage: Math.round(mtg),
      recommendation: cashFlow > 200 && cocReturn > 6 ? 'Strong Buy' : cashFlow > 0 ? 'Buy' : 'Avoid',
    };
  }
  const res = await fetch(`${API_BASE_URL}/api/underwriting/calculate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(inputs),
  });
  return res.json();
}

export { fmt };
