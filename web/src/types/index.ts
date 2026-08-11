// Core property type
export interface Property {
  id: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  price: number;
  beds: number;
  baths: number;
  sqft: number;
  lotSqft: number;
  yearBuilt: number;
  type: string;
  status: string;
  daysOnMarket: number;
  dealScore: number;
  riskScore: number;
  capRate: number;
  cashOnCash: number;
  cashFlow: number;
  fairValueLow: number;
  fairValueHigh: number;
  rentEstLow: number;
  rentEstHigh: number;
  rentEstMid: number;
  rentConfidence: 'High' | 'Medium' | 'Low';
  valuationConfidence: 'High' | 'Medium' | 'Low';
  priceVsFairValue: number;
  strategyFit: number;
  neighborhood: string;
  neighborhoodScore: number;
  marketRegime: string;
  riskFlags: RiskFlag[];
  image: string;
  lat: number;
  lng: number;
  motivationScore?: number;
  offMarketSignals?: OffMarketSignal[];
}

export interface OffMarketSignal {
  type: string;
  label: string;
  severity: 'high' | 'medium' | 'low';
}

export interface OffMarketSignalResult {
  hasSignals: boolean;
  signals: OffMarketSignal[];
  motivationScore: number;
}

export interface SupportedMarket {
  marketId: string;
  city: string;
  state: string;
  stateCode: string;
  isLaunchMarket: boolean;
}

export interface RiskFlag {
  label: string;
  severity: 'High' | 'Medium' | 'Low';
}

// Underwriting inputs
export interface UnderwritingInputs {
  propertyId: string;
  purchasePrice: number;
  downPaymentPct: number;
  interestRate: number;
  loanType: string;
  monthlyRent: number;
  vacancyPct: number;
  managementPct: number;
  maintenancePct: number;
  insuranceMonthly: number;
  capexPct: number;
  strategy: string;
}

// Underwriting outputs
export interface UnderwritingOutputs {
  cashFlow: number;
  capRate: number;
  cashOnCash: number;
  dscr: number;
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
  scenarios: ScenarioOutput[];
}

export interface ScenarioOutput {
  name: 'Bear' | 'Base' | 'Bull';
  cashFlow: number;
  capRate: number;
  irr: number;
}

// Portfolio
export interface PortfolioHolding {
  id: string;
  address: string;
  purchasePrice: number;
  purchaseDate: string;
  currentValue: number;
  loanBalance: number;
  equity: number;
  monthlyRent: number;
  monthlyExpenses: number;
  cashFlow: number;
  capRate: number;
  status: string;
  recommendation: 'Hold' | 'Refi' | 'Sell' | 'Watch';
  recommendationNote: string;
  image: string;
  // Null when current_value matches purchase_price (no AVM data set yet).
  // UI renders "—" rather than a misleading 0%.
  appreciation: number | null;
  totalReturn: number | null;
}

export interface Portfolio {
  holdings: PortfolioHolding[];
  totalValue: number;
  totalEquity: number;
  totalDebt: number;
  totalCashFlow: number;
  healthScore: number;
}

// Market
export interface MarketData {
  city: string;
  regime: 'Hot' | 'Balanced' | 'Cooling' | "Buyer's Market";
  medianPrice: number;
  priceChange12mo: number;
  priceChange6mo: number;
  inventory: number;
  daysOnMarket: number;
  domChange: number;
  listToSaleRatio: number;
  priceReductions: number;
  capRateMedian: number;
  rentGrowth12mo: number;
  vacancyRate: number;
  newListings: number;
  absorption: number;
}

// Search filters
export interface SearchFilters {
  query: string;
  minDealScore: number;
  maxPrice: number;
  minCapRate: number;
  propertyTypes: string[];
  strategies: string[];
  sortBy: string;
  offMarketOnly?: boolean;
  minMotivationScore?: number;
}

// One market's live summary, from GET /market/summary. Shared by Market Pulse,
// the Search sidebar, and the Intelligence market tab — all three previously
// showed their own hardcoded copy of these numbers.
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

// API response wrapper
export interface ApiResponse<T> {
  data: T;
  success: boolean;
  message?: string;
}
