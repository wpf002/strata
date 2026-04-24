import type { Property, PortfolioHolding, MarketData } from '../types';

export const mockProperties: Property[] = [
  {
    id: 'p1', address: '4521 Oak Creek Drive', city: 'Dallas', state: 'TX', zip: '75201',
    price: 342000, beds: 3, baths: 2, sqft: 1840, lotSqft: 6200, yearBuilt: 2001,
    type: 'Single Family', status: 'Active', daysOnMarket: 23,
    dealScore: 81, riskScore: 28, capRate: 6.4, cashOnCash: 7.2, cashFlow: 312,
    fairValueLow: 318000, fairValueHigh: 347000, rentEstLow: 2100, rentEstHigh: 2380, rentEstMid: 2240,
    rentConfidence: 'High', valuationConfidence: 'High', priceVsFairValue: -1.4, strategyFit: 88,
    neighborhood: 'Lake Highlands', neighborhoodScore: 74, marketRegime: 'Balanced',
    riskFlags: [{ label: 'HVAC age est. 14 yrs', severity: 'Medium' }, { label: 'Hail risk — moderate', severity: 'Low' }],
    image: 'https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=1200&q=85&auto=format&fit=crop',
    lat: 32.7767, lng: -96.7970,
  },
  {
    id: 'p2', address: '1872 Magnolia Street', city: 'Dallas', state: 'TX', zip: '75206',
    price: 285000, beds: 3, baths: 2, sqft: 1520, lotSqft: 5400, yearBuilt: 1995,
    type: 'Single Family', status: 'Active', daysOnMarket: 11,
    dealScore: 74, riskScore: 35, capRate: 5.8, cashOnCash: 6.1, cashFlow: 198,
    fairValueLow: 274000, fairValueHigh: 299000, rentEstLow: 1750, rentEstHigh: 1980, rentEstMid: 1860,
    rentConfidence: 'High', valuationConfidence: 'Medium', priceVsFairValue: 0.7, strategyFit: 72,
    neighborhood: 'Lakewood', neighborhoodScore: 81, marketRegime: 'Hot',
    riskFlags: [{ label: 'Roof age est. 18 yrs', severity: 'High' }, { label: 'Tax reassessment likely', severity: 'Medium' }],
    image: 'https://images.unsplash.com/photo-1570129477492-45c003edd2be?w=1200&q=85&auto=format&fit=crop',
    lat: 32.7957, lng: -96.7543,
  },
  {
    id: 'p3', address: '9034 Sunset Ridge Ln', city: 'Dallas', state: 'TX', zip: '75218',
    price: 419000, beds: 4, baths: 3, sqft: 2280, lotSqft: 8100, yearBuilt: 2008,
    type: 'Single Family', status: 'Active', daysOnMarket: 47,
    dealScore: 62, riskScore: 42, capRate: 4.9, cashOnCash: 5.2, cashFlow: 88,
    fairValueLow: 388000, fairValueHigh: 421000, rentEstLow: 2450, rentEstHigh: 2780, rentEstMid: 2610,
    rentConfidence: 'Medium', valuationConfidence: 'Medium', priceVsFairValue: 2.1, strategyFit: 58,
    neighborhood: 'White Rock', neighborhoodScore: 69, marketRegime: 'Cooling',
    riskFlags: [{ label: 'HOA reserve underfunded', severity: 'Medium' }, { label: 'Investor saturation 42%', severity: 'Medium' }, { label: 'Permit open — addition 2019', severity: 'High' }],
    image: 'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=1200&q=85&auto=format&fit=crop',
    lat: 32.8212, lng: -96.7021,
  },
  {
    id: 'p4', address: '2218 Cedar Springs Rd', city: 'Dallas', state: 'TX', zip: '75219',
    price: 198000, beds: 2, baths: 1, sqft: 980, lotSqft: 3200, yearBuilt: 1962,
    type: 'Condo', status: 'Active', daysOnMarket: 68,
    dealScore: 44, riskScore: 67, capRate: 3.8, cashOnCash: 3.2, cashFlow: -84,
    fairValueLow: 171000, fairValueHigh: 194000, rentEstLow: 1100, rentEstHigh: 1350, rentEstMid: 1220,
    rentConfidence: 'Low', valuationConfidence: 'Low', priceVsFairValue: 9.2, strategyFit: 28,
    neighborhood: 'Uptown', neighborhoodScore: 88, marketRegime: "Buyer's Market",
    riskFlags: [{ label: 'Negative cash flow at standard financing', severity: 'High' }, { label: 'HOA $620/mo — elevated', severity: 'High' }, { label: 'Priced 9% above fair value', severity: 'High' }, { label: 'STR restrictions active', severity: 'Medium' }],
    image: 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=1200&q=85&auto=format&fit=crop',
    lat: 32.8031, lng: -96.8099,
  },
  {
    id: 'p5', address: '517 Elmwood Avenue', city: 'Dallas', state: 'TX', zip: '75208',
    price: 378000, beds: 4, baths: 2.5, sqft: 2010, lotSqft: 7200, yearBuilt: 2014,
    type: 'Single Family', status: 'Active', daysOnMarket: 6,
    dealScore: 77, riskScore: 22, capRate: 6.1, cashOnCash: 6.8, cashFlow: 274,
    fairValueLow: 362000, fairValueHigh: 392000, rentEstLow: 2380, rentEstHigh: 2620, rentEstMid: 2500,
    rentConfidence: 'High', valuationConfidence: 'High', priceVsFairValue: -0.8, strategyFit: 84,
    neighborhood: 'Bishop Arts', neighborhoodScore: 79, marketRegime: 'Hot',
    riskFlags: [{ label: 'Low inventory — move fast', severity: 'Low' }],
    image: 'https://images.unsplash.com/photo-1580587771525-78b9dba3b914?w=1200&q=85&auto=format&fit=crop',
    lat: 32.7456, lng: -96.8312,
  },
  {
    id: 'p6', address: '3301 Harvest Glen Dr', city: 'Dallas', state: 'TX', zip: '75234',
    price: 312000, beds: 3, baths: 2, sqft: 1680, lotSqft: 5800, yearBuilt: 1998,
    type: 'Single Family', status: 'Active', daysOnMarket: 34,
    dealScore: 69, riskScore: 31, capRate: 5.6, cashOnCash: 6.0, cashFlow: 156,
    fairValueLow: 298000, fairValueHigh: 326000, rentEstLow: 1920, rentEstHigh: 2180, rentEstMid: 2050,
    rentConfidence: 'High', valuationConfidence: 'High', priceVsFairValue: -0.6, strategyFit: 76,
    neighborhood: 'Farmers Branch', neighborhoodScore: 67, marketRegime: 'Balanced',
    riskFlags: [{ label: 'Declining school rating', severity: 'Medium' }],
    image: 'https://images.unsplash.com/photo-1598228723793-52759bba239c?w=1200&q=85&auto=format&fit=crop',
    lat: 32.9270, lng: -96.8996,
  },
];

export const mockPortfolioHoldings: PortfolioHolding[] = [
  {
    id: 'ph1', address: '7823 Ridgecrest Ave, Austin TX 78745',
    purchasePrice: 285000, purchaseDate: '2022-03-15', currentValue: 334000,
    loanBalance: 228000, equity: 106000, monthlyRent: 2200, monthlyExpenses: 1620,
    cashFlow: 580, capRate: 6.8, status: 'Active', recommendation: 'Hold',
    recommendationNote: 'Strong cash flow. Equity at 31.7% — consider refi in 12 months.',
    image: 'https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=1200&q=85&auto=format&fit=crop',
    appreciation: 17.2, totalReturn: 31.4,
  },
  {
    id: 'ph2', address: '2204 Pecan Street, Dallas TX 75208',
    purchasePrice: 198000, purchaseDate: '2021-08-22', currentValue: 241000,
    loanBalance: 158400, equity: 82600, monthlyRent: 1950, monthlyExpenses: 1480,
    cashFlow: 470, capRate: 7.1, status: 'Active', recommendation: 'Refi',
    recommendationNote: 'LTV at 65.7%. Cash-out refi could yield $28K at current rates while maintaining DSCR.',
    image: 'https://images.unsplash.com/photo-1570129477492-45c003edd2be?w=1200&q=85&auto=format&fit=crop',
    appreciation: 21.7, totalReturn: 38.9,
  },
  {
    id: 'ph3', address: '1509 Mockingbird Ln, Phoenix AZ 85016',
    purchasePrice: 340000, purchaseDate: '2023-01-10', currentValue: 358000,
    loanBalance: 272000, equity: 86000, monthlyRent: 2600, monthlyExpenses: 2010,
    cashFlow: 590, capRate: 6.2, status: 'Active', recommendation: 'Hold',
    recommendationNote: 'Stable performer. Phoenix market cooling — hold and collect cash flow.',
    image: 'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=1200&q=85&auto=format&fit=crop',
    appreciation: 5.3, totalReturn: 11.8,
  },
];

export const mockMarketData: MarketData = {
  city: 'Dallas, TX', regime: 'Balanced', medianPrice: 342000,
  priceChange12mo: 4.2, priceChange6mo: 1.8, inventory: 2.3,
  daysOnMarket: 28, domChange: -4, listToSaleRatio: 97.2,
  priceReductions: 31, capRateMedian: 5.4, rentGrowth12mo: 3.1,
  vacancyRate: 4.8, newListings: 1840, absorption: 2.3,
};

export const chartDataPortfolioEquity = [
  { month: 'Q1 22', value: 120000 }, { month: 'Q2 22', value: 148000 },
  { month: 'Q3 22', value: 162000 }, { month: 'Q4 22', value: 174000 },
  { month: 'Q1 23', value: 192000 }, { month: 'Q2 23', value: 218000 },
  { month: 'Q3 23', value: 241000 }, { month: 'Q4 23', value: 258000 },
  { month: 'Q1 24', value: 274600 },
];

export const priceHistory = [
  { date: 'Jan 23', price: 295000 }, { date: 'Apr 23', price: 310000 },
  { date: 'Jul 23', price: 318000 }, { date: 'Oct 23', price: 314000 },
  { date: 'Jan 24', price: 329000 }, { date: 'Apr 24', price: 342000 },
];
