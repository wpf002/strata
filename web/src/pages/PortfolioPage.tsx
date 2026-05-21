import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, ArrowUpRight, RefreshCw, AlertCircle, DollarSign, Building2, TrendingUp, X, Check, Home, Trash2, Loader2, Wallet, Sparkles } from 'lucide-react';
import { getPortfolio, createHolding, updateHolding, deleteHolding } from '../api/client';
import type { Portfolio, PortfolioHolding } from '../types';
import { StatCard, MetricRow, fmt } from '../components/UI';
import { clsx } from 'clsx';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, Cell, Legend } from 'recharts';
import { supabase } from '../lib/supabase';

const BASE_URL = import.meta.env.VITE_API_URL ?? '';

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
}

interface HoldingAnalysis {
  recommendation: 'Hold' | 'Sell' | 'Refi';
  confidence: 'High' | 'Medium' | 'Low';
  rationale: string;
  signalsTriggered: string[];
  // Sell
  estimatedNetProceeds?: number;
  estimatedCapGains?: number;
  suggestedListingPriceLow?: number;
  suggestedListingPriceHigh?: number;
  // Refi
  estimatedNewLoan?: number;
  estimatedCashOut?: number;
  newMonthlyPayment?: number;
  newDscr?: number;
  breakevenMonths?: number;
  // Hold
  projectedEquity12Mo?: number;
  projectedEquity36Mo?: number;
  nextReviewTrigger?: string;
}

interface TaxAnalysis {
  annualDepreciation: number;
  accumulatedDepreciation: number;
  depreciationRecaptureOnSale: number;
  grossProceeds: number;
  agentFees: number;
  adjustedBasis: number;
  capitalGain: number;
  federalLtcgTax: number;
  depreciationRecaptureTax: number;
  statesTaxEstimate: number;
  netAfterTaxProceeds: number;
  yearsHeld: number;
  qualifiesFor1031: boolean;
  identificationDeadline: string;
  exchangeDeadline: string;
  minReplacementValue: number;
  costSegregationApplicable: boolean;
  estimatedYear1BonusDepreciation: number;
  disclaimer: string;
}

// ── Analysis Panel ─────────────────────────────────────────────────────────────

function AnalysisPanel({ holdingId, onClose }: { holdingId: string; onClose: () => void }) {
  const [analysis, setAnalysis] = useState<HoldingAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    authHeaders().then(h =>
      fetch(`${BASE_URL}/portfolio/holdings/${holdingId}/analysis`, { method: 'POST', headers: h })
        .then(r => { if (!r.ok) throw new Error(`${r.status}`); return r.json(); })
        .then(setAnalysis)
        .catch(() => setError('Analysis unavailable.'))
        .finally(() => setLoading(false))
    );
  }, [holdingId]);

  const REC_STYLE: Record<string, string> = {
    Hold: 'text-blue-400 border-blue-400/30 bg-blue-400/10',
    Sell: 'text-emerald-400 border-emerald-400/30 bg-emerald-400/10',
    Refi: 'text-amber-400 border-amber-500/30 bg-amber-500/10',
  };

  const CONF_COLOR: Record<string, string> = { High: 'text-emerald-400', Medium: 'text-amber-400', Low: 'text-orange-400' };

  return (
    <div className="glass rounded-2xl border border-white/10 p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-white">Hold / Sell / Refi Analysis</h3>
        <button onClick={onClose} aria-label="Close" className="text-slate-500 hover:text-white transition-colors"><X size={14} /></button>
      </div>

      {loading && <div className="flex items-center gap-2 text-slate-400 text-sm"><Loader2 size={14} className="animate-spin" /> Analyzing…</div>}
      {error && <p className="text-sm text-red-400">{error}</p>}

      {analysis && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <span className={clsx('text-2xl font-bold px-4 py-1.5 rounded-xl border', REC_STYLE[analysis.recommendation])}>
              {analysis.recommendation}
            </span>
            <span className={clsx('text-xs font-semibold', CONF_COLOR[analysis.confidence])}>
              {analysis.confidence} Confidence
            </span>
          </div>

          <p className="text-sm text-slate-300 leading-relaxed">{analysis.rationale}</p>

          <div>
            <p className="text-xs text-slate-500 mb-2 uppercase tracking-widest">Signals Triggered</p>
            <div className="space-y-1.5">
              {analysis.signalsTriggered.map((s, i) => (
                <div key={i} className="flex items-start gap-2 text-xs text-slate-300">
                  <span className="text-amber-400 mt-0.5">•</span> {s}
                </div>
              ))}
            </div>
          </div>

          {analysis.recommendation === 'Sell' && (
            <div className="grid grid-cols-2 gap-3">
              <div className="glass rounded-xl p-3"><p className="text-[10px] text-slate-500">Net Proceeds</p><p className="text-sm font-bold font-mono text-emerald-400">{fmt.currency(analysis.estimatedNetProceeds!)}</p></div>
              <div className="glass rounded-xl p-3"><p className="text-[10px] text-slate-500">Capital Gain</p><p className="text-sm font-bold font-mono text-white">{fmt.currency(analysis.estimatedCapGains!)}</p></div>
              <div className="glass rounded-xl p-3"><p className="text-[10px] text-slate-500">List Price Range</p><p className="text-sm font-bold font-mono text-white">{fmt.compact(analysis.suggestedListingPriceLow!)} – {fmt.compact(analysis.suggestedListingPriceHigh!)}</p></div>
            </div>
          )}

          {analysis.recommendation === 'Refi' && (
            <div className="grid grid-cols-2 gap-3">
              <div className="glass rounded-xl p-3"><p className="text-[10px] text-slate-500">New Loan</p><p className="text-sm font-bold font-mono text-white">{fmt.compact(analysis.estimatedNewLoan!)}</p></div>
              <div className="glass rounded-xl p-3"><p className="text-[10px] text-slate-500">Cash Out</p><p className="text-sm font-bold font-mono text-amber-400">{fmt.currency(analysis.estimatedCashOut!)}</p></div>
              <div className="glass rounded-xl p-3"><p className="text-[10px] text-slate-500">New Payment</p><p className="text-sm font-bold font-mono text-white">{fmt.currency(analysis.newMonthlyPayment!)}/mo</p></div>
              <div className="glass rounded-xl p-3"><p className="text-[10px] text-slate-500">New DSCR</p><p className="text-sm font-bold font-mono text-emerald-400">{analysis.newDscr?.toFixed(2)}x</p></div>
              {analysis.breakevenMonths !== undefined && (
                <div className="glass rounded-xl p-3 col-span-2"><p className="text-[10px] text-slate-500">Breakeven</p><p className="text-sm font-bold font-mono text-white">{analysis.breakevenMonths} months</p></div>
              )}
            </div>
          )}

          {analysis.recommendation === 'Hold' && (
            <div className="grid grid-cols-2 gap-3">
              <div className="glass rounded-xl p-3"><p className="text-[10px] text-slate-500">Equity in 12mo</p><p className="text-sm font-bold font-mono text-white">{fmt.compact(analysis.projectedEquity12Mo!)}</p></div>
              <div className="glass rounded-xl p-3"><p className="text-[10px] text-slate-500">Equity in 36mo</p><p className="text-sm font-bold font-mono text-white">{fmt.compact(analysis.projectedEquity36Mo!)}</p></div>
              <div className="glass rounded-xl p-3 col-span-2"><p className="text-[10px] text-slate-500">Next Review Trigger</p><p className="text-xs text-slate-300 mt-0.5">{analysis.nextReviewTrigger}</p></div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Tax Panel ──────────────────────────────────────────────────────────────────

function TaxPanel({ holdingId, onClose }: { holdingId: string; onClose: () => void }) {
  const [tax, setTax] = useState<TaxAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    authHeaders().then(h =>
      fetch(`${BASE_URL}/portfolio/holdings/${holdingId}/tax-analysis`, { method: 'POST', headers: h })
        .then(r => { if (!r.ok) throw new Error(`${r.status}`); return r.json(); })
        .then(setTax)
        .catch(() => setError('Tax analysis unavailable.'))
        .finally(() => setLoading(false))
    );
  }, [holdingId]);

  return (
    <div className="glass rounded-2xl border border-white/10 p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-white">Tax &amp; Exit Analysis</h3>
        <button onClick={onClose} aria-label="Close" className="text-slate-500 hover:text-white transition-colors"><X size={14} /></button>
      </div>

      {loading && <div className="flex items-center gap-2 text-slate-400 text-sm"><Loader2 size={14} className="animate-spin" /> Calculating…</div>}
      {error && <p className="text-sm text-red-400">{error}</p>}

      {tax && (
        <div className="space-y-5">
          {/* Depreciation */}
          <div>
            <p className="text-xs font-bold text-amber-400 uppercase tracking-widest mb-2">Depreciation</p>
            <div className="grid grid-cols-2 gap-2">
              <div className="glass rounded-xl p-3"><p className="text-[10px] text-slate-500">Annual Benefit</p><p className="text-sm font-bold font-mono text-white">{fmt.currency(tax.annualDepreciation)}/yr</p></div>
              <div className="glass rounded-xl p-3"><p className="text-[10px] text-slate-500">Accumulated</p><p className="text-sm font-bold font-mono text-white">{fmt.currency(tax.accumulatedDepreciation)}</p></div>
              <div className="glass rounded-xl p-3 col-span-2"><p className="text-[10px] text-slate-500">Recapture on Sale (25%)</p><p className="text-sm font-bold font-mono text-orange-400">{fmt.currency(tax.depreciationRecaptureOnSale)}</p></div>
            </div>
            {tax.costSegregationApplicable && (
              <div className="mt-2 p-2.5 rounded-lg bg-blue-500/5 border border-blue-500/20">
                <p className="text-xs text-blue-400">Cost segregation applicable — est. Year 1 bonus depreciation: <span className="font-bold font-mono">{fmt.currency(tax.estimatedYear1BonusDepreciation)}</span>. Consult your CPA.</p>
              </div>
            )}
          </div>

          {/* If sold today */}
          <div>
            <p className="text-xs font-bold text-amber-400 uppercase tracking-widest mb-2">If Sold Today</p>
            <div className="space-y-1">
              {[
                { label: 'Gross Proceeds', value: fmt.currency(tax.grossProceeds), cls: 'text-white' },
                { label: '− Agent Fees (6%)', value: `−${fmt.currency(tax.agentFees)}`, cls: 'text-red-400' },
                { label: '− Federal LTCG Tax', value: `−${fmt.currency(tax.federalLtcgTax)}`, cls: 'text-red-400' },
                { label: '− Depreciation Recapture', value: `−${fmt.currency(tax.depreciationRecaptureTax)}`, cls: 'text-red-400' },
                { label: '− State Tax (est.)', value: `−${fmt.currency(tax.statesTaxEstimate)}`, cls: 'text-red-400' },
              ].map(row => (
                <div key={row.label} className="flex justify-between text-xs py-1 border-b border-white/5">
                  <span className="text-slate-400">{row.label}</span>
                  <span className={clsx('font-mono font-semibold', row.cls)}>{row.value}</span>
                </div>
              ))}
              <div className="flex justify-between text-sm pt-2">
                <span className="text-slate-300 font-semibold">Net After-Tax Proceeds</span>
                <span className="font-mono font-bold text-amber-400">{fmt.currency(tax.netAfterTaxProceeds)}</span>
              </div>
            </div>
          </div>

          {/* 1031 */}
          <div>
            <p className="text-xs font-bold text-amber-400 uppercase tracking-widest mb-2">1031 Exchange</p>
            <div className="flex items-center gap-2 mb-2">
              <span className={clsx('inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded border', tax.qualifiesFor1031 ? 'text-emerald-400 bg-emerald-400/10 border-emerald-400/30' : 'text-slate-400 bg-white/5 border-white/10')}>
                {tax.qualifiesFor1031 ? <><Check size={13} /> Eligible</> : <><X size={13} /> Not Eligible</>}
              </span>
            </div>
            {tax.qualifiesFor1031 && (
              <div className="grid grid-cols-2 gap-2">
                <div className="glass rounded-xl p-3"><p className="text-[10px] text-slate-500">ID Deadline (45 days)</p><p className="text-xs font-semibold text-white">{tax.identificationDeadline}</p></div>
                <div className="glass rounded-xl p-3"><p className="text-[10px] text-slate-500">Exchange Deadline (180 days)</p><p className="text-xs font-semibold text-white">{tax.exchangeDeadline}</p></div>
                <div className="glass rounded-xl p-3 col-span-2"><p className="text-[10px] text-slate-500">Min Replacement Value</p><p className="text-sm font-bold font-mono text-white">{fmt.currency(tax.minReplacementValue)}</p></div>
              </div>
            )}
          </div>

          <p className="text-[10px] text-slate-600 leading-relaxed border-t border-white/5 pt-3">{tax.disclaimer}</p>
        </div>
      )}
    </div>
  );
}

// ── Holding Form ───────────────────────────────────────────────────────────────

interface HoldingFormData {
  address: string;
  purchasePrice: string;
  purchaseDate: string;
  loanBalance: string;
  monthlyRent: string;
  monthlyExpenses: string;
  notes: string;
}

const EMPTY_FORM: HoldingFormData = {
  address: '', purchasePrice: '', purchaseDate: '', loanBalance: '',
  monthlyRent: '', monthlyExpenses: '', notes: '',
};

function HoldingModal({
  initial, onClose, onSave, title,
}: {
  initial?: Partial<HoldingFormData>;
  onClose: () => void;
  onSave: (data: HoldingFormData) => Promise<void>;
  title: string;
}) {
  const [form, setForm] = useState<HoldingFormData>({ ...EMPTY_FORM, ...initial });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (k: keyof HoldingFormData) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const submit = async () => {
    if (!form.address.trim()) { setError('Address is required'); return; }
    setSaving(true);
    try {
      await onSave(form);
      onClose();
    } catch {
      setError('Failed to save. Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="glass rounded-2xl p-6 w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-semibold text-white">{title}</h3>
          <button onClick={onClose} aria-label="Close" className="text-slate-500 hover:text-white transition-colors"><X size={16} /></button>
        </div>

        {error && <p className="text-xs text-red-400 mb-3 p-2 rounded bg-red-400/10 border border-red-400/20">{error}</p>}

        <div className="space-y-3">
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Address *</label>
            <input className="strata-input w-full" placeholder="123 Main St, Dallas, TX 75201" value={form.address} onChange={set('address')} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Purchase Price ($)</label>
              <input className="strata-input w-full" type="number" placeholder="350000" value={form.purchasePrice} onChange={set('purchasePrice')} />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Purchase Date</label>
              <input className="strata-input w-full" type="date" aria-label="Purchase date" value={form.purchaseDate} onChange={set('purchaseDate')} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Loan Balance ($)</label>
              <input className="strata-input w-full" type="number" placeholder="262500" value={form.loanBalance} onChange={set('loanBalance')} />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Monthly Rent ($)</label>
              <input className="strata-input w-full" type="number" placeholder="2200" value={form.monthlyRent} onChange={set('monthlyRent')} />
            </div>
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Monthly Expenses ($)</label>
            <input className="strata-input w-full" type="number" placeholder="1400" value={form.monthlyExpenses} onChange={set('monthlyExpenses')} />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Notes (optional)</label>
            <textarea className="strata-input w-full resize-none" rows={2} placeholder="Any notes about this property…" value={form.notes} onChange={set('notes')} />
          </div>
        </div>

        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="btn-ghost flex-1 justify-center text-sm">Cancel</button>
          <button onClick={submit} disabled={saving} className="btn-primary flex-1 justify-center text-sm">
            {saving ? 'Saving…' : 'Save Property'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Net Worth Card ───────────────────────────────────────────────────────────
// Reframes the portfolio from property-management to wealth-building. Uses
// conservative assumptions: 3% annual appreciation (long-run US SFH average)
// and flat cash flow + principal paydown (paydown is approximated as 2% of
// loan balance per year — close to average for 30yr mortgages in year 3–7).

function NetWorthCard({ portfolio }: { portfolio: Portfolio }) {
  const annualCashFlow = portfolio.totalCashFlow * 12;
  const annualAppreciation = portfolio.totalValue * 0.03;
  const annualPaydown = portfolio.totalDebt * 0.02;
  const totalAnnualGrowth = annualCashFlow + annualAppreciation + annualPaydown;

  // 5-year projection assumes the same annual growth rate compounded against
  // the growing equity base. Conservative: cash flow + paydown stay flat, only
  // appreciation compounds.
  const currentEquity = portfolio.totalEquity;
  let projectedEquity = currentEquity;
  let projectedValue = portfolio.totalValue;
  for (let year = 0; year < 5; year++) {
    projectedValue = projectedValue * 1.03;
    projectedEquity += (projectedValue * 0.03) + annualPaydown + annualCashFlow;
  }
  const wealthAdded = projectedEquity - currentEquity;

  return (
    <div className="glass rounded-2xl p-5 border border-amber-500/20 bg-gradient-to-br from-amber-500/5 to-transparent">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-2">
          <Wallet size={16} className="text-amber-400" />
          <h3 className="text-sm font-semibold text-white">Net Worth from Real Estate</h3>
        </div>
        <Sparkles size={13} className="text-amber-400/50" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div>
          <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-0.5">Current Equity</p>
          <p className="text-xl font-bold font-mono text-white">{fmt.compact(currentEquity)}</p>
        </div>
        <div>
          <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-0.5">Annual Cash Flow</p>
          <p className="text-xl font-bold font-mono text-emerald-400">{fmt.compact(annualCashFlow)}</p>
        </div>
        <div>
          <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-0.5">Est. Annual Growth</p>
          <p className="text-xl font-bold font-mono text-amber-400">{fmt.compact(totalAnnualGrowth)}</p>
          <p className="text-[10px] text-slate-600 mt-0.5">appreciation + paydown + CF</p>
        </div>
        <div>
          <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-0.5">5-Year Projection</p>
          <p className="text-xl font-bold font-mono text-white">{fmt.compact(projectedEquity)}</p>
          <p className="text-[10px] text-emerald-400 mt-0.5">+{fmt.compact(wealthAdded)} added</p>
        </div>
      </div>
    </div>
  );
}

// ── US State Concentration Map ───────────────────────────────────────────────
// Tile-grid cartogram — each state is a 22×22 tile positioned in a simplified
// US layout. Compact, no map library, legible on mobile. States with 0% get
// no fill; 1–25% light amber, 26–50% amber, 51%+ red (over-concentration).

const STATE_TILES: Record<string, [number, number]> = {
  AK: [0, 0], ME: [10, 0],
  VT: [9, 1], NH: [10, 1],
  WA: [0, 2], ID: [1, 2], MT: [2, 2], ND: [3, 2], MN: [4, 2], IL: [5, 2], WI: [6, 2], MI: [7, 2], NY: [9, 2], MA: [10, 2],
  OR: [0, 3], UT: [1, 3], WY: [2, 3], SD: [3, 3], IA: [4, 3], IN: [5, 3], OH: [6, 3], PA: [7, 3], NJ: [8, 3], CT: [9, 3], RI: [10, 3],
  CA: [0, 4], NV: [1, 4], CO: [2, 4], NE: [3, 4], MO: [4, 4], KY: [5, 4], WV: [6, 4], VA: [7, 4], MD: [8, 4], DE: [9, 4],
  AZ: [1, 5], NM: [2, 5], KS: [3, 5], AR: [4, 5], TN: [5, 5], NC: [6, 5], SC: [7, 5], DC: [8, 5],
  OK: [3, 6], LA: [4, 6], MS: [5, 6], AL: [6, 6], GA: [7, 6],
  HI: [0, 7], TX: [3, 7], FL: [8, 7],
};

function stateFromAddress(address: string): string | null {
  // Look for a 2-letter uppercase code (state abbreviation) in the address.
  // Match from the end since the state typically appears after the city.
  const tokens = address.replace(/,/g, ' ').split(/\s+/).filter(Boolean);
  for (let i = tokens.length - 1; i >= 0; i--) {
    const t = tokens[i].toUpperCase();
    if (/^[A-Z]{2}$/.test(t) && t in STATE_TILES) return t;
  }
  return null;
}

function ConcentrationMap({ portfolio }: { portfolio: Portfolio }) {
  const byState: Record<string, number> = {};
  for (const h of portfolio.holdings) {
    const state = stateFromAddress(h.address);
    if (!state) continue;
    byState[state] = (byState[state] ?? 0) + h.currentValue;
  }
  const total = Object.values(byState).reduce((s, v) => s + v, 0) || 1;
  const pctByState: Record<string, number> = {};
  for (const [s, v] of Object.entries(byState)) pctByState[s] = (v / total) * 100;

  const tile = 22;
  const gap = 2;
  const cols = 11;
  const rows = 8;
  const width = cols * (tile + gap);
  const height = rows * (tile + gap);

  const fillFor = (pct: number): string => {
    if (pct === 0) return 'rgba(255,255,255,0.03)';
    if (pct < 25) return 'rgba(201,168,76,0.25)';  // light amber
    if (pct <= 50) return 'rgba(201,168,76,0.65)'; // amber
    return 'rgba(239,68,68,0.75)';                  // red — over-concentration
  };

  const overConcentrated = Object.entries(pctByState)
    .filter(([, pct]) => pct > 50)
    .map(([s]) => s);

  const ranked = Object.entries(pctByState).sort(([, a], [, b]) => b - a).slice(0, 5);

  return (
    <div className="glass rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-white">Geographic Concentration</h3>
        <span className="text-[10px] text-slate-500 uppercase tracking-wider">by value</span>
      </div>

      {portfolio.holdings.length === 0 || Object.keys(byState).length === 0 ? (
        <p className="text-xs text-slate-500 text-center py-6">
          No state data — add holdings with an address that includes a 2-letter state code.
        </p>
      ) : (
        <>
          <svg viewBox={`0 0 ${width} ${height}`} className="w-full max-h-[180px]">
            {Object.entries(STATE_TILES).map(([code, [col, row]]) => {
              const pct = pctByState[code] ?? 0;
              return (
                <g key={code} transform={`translate(${col * (tile + gap)}, ${row * (tile + gap)})`}>
                  <rect
                    width={tile} height={tile} rx={3}
                    fill={fillFor(pct)}
                    stroke="rgba(255,255,255,0.08)"
                    strokeWidth={0.5}
                  />
                  <text
                    x={tile / 2} y={tile / 2 + 3}
                    textAnchor="middle"
                    fontSize={pct > 0 ? 8 : 7}
                    fontFamily="'JetBrains Mono', monospace"
                    fontWeight={pct > 0 ? 700 : 400}
                    fill={pct > 50 ? 'white' : pct > 0 ? '#f8fafc' : 'rgba(148, 163, 184, 0.4)'}
                  >
                    {code}
                  </text>
                </g>
              );
            })}
          </svg>

          <div className="mt-4 space-y-1.5">
            {ranked.map(([code, pct]) => (
              <div key={code} className="flex justify-between text-xs">
                <span className="text-slate-400">{code}</span>
                <span className={clsx('font-mono font-semibold', pct > 50 ? 'text-red-400' : pct > 25 ? 'text-amber-400' : 'text-white')}>
                  {pct.toFixed(1)}%
                </span>
              </div>
            ))}
          </div>

          {overConcentrated.length > 0 && (
            <div className="flex items-start gap-2 mt-3 p-2.5 rounded-lg bg-red-400/5 border border-red-400/20">
              <AlertCircle size={12} className="text-red-400 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-red-400/90">
                {overConcentrated.join(', ')} above 50% — diversify next acquisition into a different state.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Equity Timeline ──────────────────────────────────────────────────────────
// Shows the wealth-building story for a single holding: appreciation vs
// principal paydown, stacked by month since purchase. Uses straight-line
// interpolation between purchase and present — accurate enough to visualize.

function EquityTimeline({ holding }: { holding: PortfolioHolding }) {
  const months = useMemo(() => {
    if (!holding.purchaseDate) return 12;
    const diff = Date.now() - new Date(holding.purchaseDate).getTime();
    return Math.max(1, Math.floor(diff / (30 * 86_400_000)));
  }, [holding.purchaseDate]);

  const totalAppreciation = holding.currentValue - holding.purchasePrice;
  // Paydown estimate: assume a 25% down conventional, so initial loan = 75% of
  // purchase. Current paydown = initialLoan - currentLoanBalance.
  const initialLoan = holding.purchasePrice * 0.75;
  const totalPaydown = Math.max(0, initialLoan - holding.loanBalance);

  const data = Array.from({ length: Math.min(months, 60) + 1 }, (_, i) => {
    const m = (i / Math.min(months, 60)) * months;
    const progress = months > 0 ? m / months : 0;
    const appreciation = totalAppreciation * progress;
    const paydown = totalPaydown * progress;
    return {
      month: Math.round(m),
      appreciation: Math.round(appreciation),
      paydown: Math.round(paydown),
      equity: Math.round(appreciation + paydown + (holding.purchasePrice - initialLoan)),
    };
  });

  return (
    <div className="glass rounded-xl p-5">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-semibold text-white">Equity Timeline</h3>
        <span className="text-[10px] text-slate-500 uppercase tracking-wider">months since purchase</span>
      </div>
      <p className="text-xs text-slate-500 mb-3">
        Straight-line estimate — appreciation vs. principal paydown
      </p>
      <div className="h-40">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <defs>
              <linearGradient id="eqg-appr" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#34d399" stopOpacity={0.4} />
                <stop offset="95%" stopColor="#34d399" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="eqg-paydown" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#C9A84C" stopOpacity={0.4} />
                <stop offset="95%" stopColor="#C9A84C" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="month" tick={{ fill: '#64748b', fontSize: 9 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: '#64748b', fontSize: 9 }} axisLine={false} tickLine={false} tickFormatter={v => `$${fmt.compact(v)}`} />
            <Tooltip
              contentStyle={{ background: '#112240', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 11 }}
              formatter={(v: any, key: any) => [fmt.currency(v), key === 'appreciation' ? 'Appreciation' : 'Paydown']}
              labelFormatter={(m) => `Month ${m}`}
            />
            <Legend wrapperStyle={{ fontSize: 10, color: '#94a3b8' }} />
            <Area type="monotone" dataKey="appreciation" stackId="1" stroke="#34d399" strokeWidth={2} fill="url(#eqg-appr)" name="Appreciation" />
            <Area type="monotone" dataKey="paydown" stackId="1" stroke="#C9A84C" strokeWidth={2} fill="url(#eqg-paydown)" name="Paydown" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default function PortfolioPage() {
  const navigate = useNavigate();
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [activeId, setActiveId] = useState<string>('ph1');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingHolding, setEditingHolding] = useState<PortfolioHolding | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [showTax, setShowTax] = useState(false);
  const load = async () => {
    const p = await getPortfolio();
    setPortfolio(p);
    if (p.holdings.length > 0) setActiveId(p.holdings[0].id);
  };

  useEffect(() => { load(); }, []);

  const handleAdd = async (form: HoldingFormData) => {
    await createHolding({
      address: form.address,
      purchase_price: Number(form.purchasePrice) || 0,
      purchase_date: form.purchaseDate || null,
      loan_balance: Number(form.loanBalance) || 0,
      monthly_rent: Number(form.monthlyRent) || 0,
      monthly_expenses: Number(form.monthlyExpenses) || 0,
      current_value: Number(form.purchasePrice) || 0,
      notes: form.notes,
      recommendation: 'Hold',
      status: 'Active',
    });
    await load();
  };

  const handleUpdate = async (form: HoldingFormData) => {
    if (!editingHolding) return;
    await updateHolding(editingHolding.id, {
      address: form.address || undefined,
      purchase_price: Number(form.purchasePrice) || undefined,
      purchase_date: form.purchaseDate || undefined,
      loan_balance: Number(form.loanBalance) || undefined,
      monthly_rent: Number(form.monthlyRent) || undefined,
      monthly_expenses: Number(form.monthlyExpenses) || undefined,
      notes: form.notes || undefined,
    });
    await load();
  };

  const handleDelete = async (id: string) => {
    await deleteHolding(id);
    setConfirmDeleteId(null);
    if (activeId === id && portfolio) {
      const remaining = portfolio.holdings.filter(h => h.id !== id);
      setActiveId(remaining[0]?.id ?? '');
    }
    await load();
  };

  if (!portfolio) {
    return <div className="flex items-center justify-center h-full"><div className="glass rounded-xl w-80 h-40 animate-pulse" /></div>;
  }

  // Empty state
  if (portfolio.holdings.length === 0) {
    return (
      <div className="flex flex-col h-full page-fade">
        {showAddModal && <HoldingModal title="Add Property" onClose={() => setShowAddModal(false)} onSave={handleAdd} />}
        <div className="px-4 md:px-6 py-3 md:py-4 border-b border-white/5 flex items-center justify-between flex-shrink-0 gap-3">
          <div>
            <h1 className="text-lg font-semibold text-white">Portfolio</h1>
            <p className="text-sm text-slate-500">0 properties</p>
          </div>
          <button className="btn-primary text-sm" onClick={() => setShowAddModal(true)}><Plus size={14} /> Add Property</button>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-8">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/10 flex items-center justify-center">
            <Home size={28} className="text-amber-400/60" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-white mb-2">No properties yet</h2>
            <p className="text-slate-500 text-sm max-w-xs">Add your first property to start tracking equity, cash flow, and performance.</p>
          </div>
          <button className="btn-primary" onClick={() => setShowAddModal(true)}>
            <Plus size={14} /> Add Property
          </button>
        </div>
      </div>
    );
  }

  const active = portfolio.holdings.find(h => h.id === activeId) || portfolio.holdings[0];
  const cashFlowData = portfolio.holdings.map(h => ({
    name: h.address.split(',')[0].split(' ').slice(-2).join(' '),
    value: h.cashFlow,
  }));

  return (
    <div className="flex flex-col h-full page-fade overflow-hidden">
      {showAddModal && (
        <HoldingModal title="Add Property" onClose={() => setShowAddModal(false)} onSave={handleAdd} />
      )}
      {editingHolding && (
        <HoldingModal
          title="Update Actuals"
          initial={{
            address: editingHolding.address,
            purchasePrice: String(editingHolding.purchasePrice),
            purchaseDate: editingHolding.purchaseDate ?? '',
            loanBalance: String(editingHolding.loanBalance),
            monthlyRent: String(editingHolding.monthlyRent),
            monthlyExpenses: String(editingHolding.monthlyExpenses),
            notes: editingHolding.recommendationNote ?? '',
          }}
          onClose={() => setEditingHolding(null)}
          onSave={handleUpdate}
        />
      )}
      {confirmDeleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="glass rounded-2xl p-6 w-full max-w-sm mx-4">
            <h3 className="text-base font-semibold text-white mb-2">Remove property?</h3>
            <p className="text-sm text-slate-400 mb-5">This will permanently remove the property from your portfolio. This action cannot be undone.</p>
            <div className="flex gap-2">
              <button className="btn-ghost flex-1 justify-center text-sm" onClick={() => setConfirmDeleteId(null)}>Cancel</button>
              <button className="flex-1 justify-center text-sm px-4 py-2 rounded-xl bg-red-500/15 border border-red-500/30 text-red-400 hover:bg-red-500/25 transition-colors font-medium" onClick={() => handleDelete(confirmDeleteId)}>Remove</button>
            </div>
          </div>
        </div>
      )}

      <div className="px-4 md:px-6 py-3 md:py-4 border-b border-white/5 flex items-center justify-between flex-shrink-0 gap-3">
        <div>
          <h1 className="text-lg font-semibold text-white">Portfolio</h1>
          <p className="text-sm text-slate-500">{portfolio.holdings.length} properties · Health Score: <span className="text-amber-400 font-mono font-semibold">{portfolio.healthScore}/100</span></p>
        </div>
        <div className="flex items-center gap-3">
          <button className="btn-ghost text-sm" onClick={load}><RefreshCw size={14} /> Refresh Values</button>
          <button className="btn-primary text-sm" onClick={() => setShowAddModal(true)}><Plus size={14} /> Add Property</button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden flex-col md:flex-row">
        {/* Left sidebar — becomes top section on mobile */}
        <div className="w-full md:w-[360px] flex-shrink-0 border-r border-white/5 flex flex-col overflow-hidden max-h-[50vh] md:max-h-none border-b md:border-b-0">
          <div className="px-4 py-4 border-b border-white/5 flex-shrink-0 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <StatCard label="Total Value" value={fmt.compact(portfolio.totalValue)} sub={`+${fmt.pct(((portfolio.totalValue - portfolio.holdings.reduce((s,h)=>s+h.purchasePrice,0)) / portfolio.holdings.reduce((s,h)=>s+h.purchasePrice,0)) * 100)} since purchase`} color="gold" />
              <StatCard label="Total Equity" value={fmt.compact(portfolio.totalEquity)} sub={`${fmt.pct((portfolio.totalEquity / portfolio.totalValue) * 100)} equity`} color="green" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <StatCard label="Monthly Cash Flow" value={`+${fmt.currency(portfolio.totalCashFlow)}`} sub="all properties" color="green" />
              <StatCard label="Total Debt" value={fmt.compact(portfolio.totalDebt)} sub="outstanding" />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
            {portfolio.holdings.map(h => (
              <div key={h.id} onClick={() => setActiveId(h.id)} className={clsx('rounded-xl p-4 cursor-pointer transition-all border', activeId === h.id ? 'border-amber-500/40 bg-amber-500/5' : 'border-white/5 glass hover:border-white/15')}>
                <div className="flex items-start gap-3">
                  <img src={h.image} alt="" className="w-14 h-14 rounded-lg object-cover flex-shrink-0" onError={e => { (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=1200&q=85&auto=format&fit=crop'; }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{h.address.split(',')[0]}</p>
                    <p className="text-xs text-slate-500 truncate">{h.address.split(',').slice(1).join(',').trim()}</p>
                    <div className="flex items-center gap-3 mt-2">
                      <div><p className="text-[10px] text-slate-500">Equity</p><p className="text-sm font-bold font-mono text-white">{fmt.compact(h.equity)}</p></div>
                      <div><p className="text-[10px] text-slate-500">Cash Flow</p><p className={clsx('text-sm font-bold font-mono', h.cashFlow >= 0 ? 'text-emerald-400' : 'text-red-400')}>{h.cashFlow >= 0 ? '+' : ''}{fmt.currency(h.cashFlow)}</p></div>
                      <div className="ml-auto flex items-center gap-1">
                        <RecBadge rec={h.recommendation} />
                        <button onClick={e => { e.stopPropagation(); setEditingHolding(h); }} className="p-1 text-slate-500 hover:text-amber-400 transition-colors" aria-label="Edit actuals"><Building2 size={12} /></button>
                        <button onClick={e => { e.stopPropagation(); setConfirmDeleteId(h.id); }} className="p-1 text-slate-500 hover:text-red-400 transition-colors" title="Remove"><Trash2 size={12} /></button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
            <div className="border border-dashed border-white/10 rounded-xl p-4 flex items-center justify-center gap-2 text-slate-600 hover:text-slate-400 hover:border-white/20 cursor-pointer transition-all" onClick={() => setShowAddModal(true)}>
              <Plus size={14} /><span className="text-sm">Add Property</span>
            </div>
          </div>
        </div>

        {/* Right detail */}
        <div className="flex-1 overflow-y-auto px-4 md:px-6 py-4 md:py-5">
          <div className="mb-5">
            <NetWorthCard portfolio={portfolio} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4 mb-5">
            <StatCard label="Current Value" value={fmt.compact(active.currentValue)} sub={`Purchased ${fmt.compact(active.purchasePrice)}`} color="gold" trend={active.appreciation} />
            <StatCard label="Equity" value={fmt.compact(active.equity)} sub={`${fmt.pct((active.equity / active.currentValue) * 100)} equity`} color="green" />
            <StatCard label="Total Return" value={fmt.pct(active.totalReturn)} sub="appreciation + cash flow" color="green" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-5 mb-5">
            <EquityTimeline holding={active} />
            <div className="glass rounded-xl p-5">
              <h3 className="text-sm font-semibold text-white mb-3">Cash Flow by Property</h3>
              <div className="h-36">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={cashFlowData} barSize={32}>
                    <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#64748b', fontSize: 9 }} axisLine={false} tickLine={false} tickFormatter={v => `$${v}`} />
                    <Tooltip contentStyle={{ background: '#112240', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 11 }} formatter={(v: any) => [fmt.currency(v), 'Cash Flow']} />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                      {cashFlowData.map((_, i) => <Cell key={i} fill={portfolio.holdings[i]?.id === activeId ? '#C9A84C' : '#34d399'} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-5 items-start">
            <div className="glass rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-white">Property Performance</h3>
                <RecBadge rec={active.recommendation} />
              </div>
              <MetricRow label="Purchase Price" value={fmt.currency(active.purchasePrice)} />
              <MetricRow label="Current Value" value={fmt.currency(active.currentValue)} highlight />
              <MetricRow label="Appreciation" value={`+${fmt.pct(active.appreciation)}`} />
              <MetricRow label="Loan Balance" value={fmt.currency(active.loanBalance)} />
              <MetricRow label="Equity" value={fmt.currency(active.equity)} highlight />
              <MetricRow label="Monthly Rent" value={fmt.currency(active.monthlyRent)} />
              <MetricRow label="Monthly Expenses" value={fmt.currency(active.monthlyExpenses)} />
              <MetricRow label="Net Cash Flow" value={`+${fmt.currency(active.cashFlow)}/mo`} highlight />
              <MetricRow label="Cap Rate" value={fmt.pct(active.capRate)} />
              <div className="mt-4 pt-4 border-t border-white/10">
                <p className="text-xs text-slate-500 mb-1">STRATA Recommendation</p>
                <p className="text-sm text-white">{active.recommendationNote}</p>
              </div>
            </div>

            <div className="space-y-4">
              <ConcentrationMap portfolio={portfolio} />
              <div className="glass rounded-xl p-5">
                <h3 className="text-sm font-semibold text-white mb-3">Quick Actions</h3>
                <div className="space-y-2">
                  <button className="w-full btn-ghost text-sm justify-start gap-3" onClick={() => { setShowAnalysis(a => !a); setShowTax(false); }}>
                    <ArrowUpRight size={14} className="text-emerald-400" />
                    {showAnalysis ? 'Hide Analysis' : 'Get Hold/Sell/Refi Analysis'}
                  </button>
                  <button className="w-full btn-ghost text-sm justify-start gap-3" onClick={() => { setShowTax(t => !t); setShowAnalysis(false); }}>
                    <DollarSign size={14} className="text-blue-400" />
                    {showTax ? 'Hide Tax Analysis' : 'Tax & Exit Analysis'}
                  </button>
                  <button className="w-full btn-ghost text-sm justify-start gap-3" onClick={() => { setShowAnalysis(false); setShowTax(false); setEditingHolding(active); }}>
                    <Building2 size={14} className="text-slate-400" /> Update Actuals
                  </button>
                  <button className="w-full btn-ghost text-sm justify-start gap-3" onClick={() => navigate('/copilot')}>
                    <RefreshCw size={14} className="text-amber-400" /> Go to Copilot for Memo
                  </button>
                </div>
              </div>

              {showAnalysis && (
                <AnalysisPanel holdingId={active.id} onClose={() => setShowAnalysis(false)} />
              )}
              {showTax && (
                <TaxPanel holdingId={active.id} onClose={() => setShowTax(false)} />
              )}
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}

function RecBadge({ rec }: { rec: PortfolioHolding['recommendation'] }) {
  const styles: Record<string, string> = {
    Hold: 'text-blue-400 bg-blue-400/10 border-blue-400/30',
    Refi: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
    Sell: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/30',
    Watch: 'text-orange-400 bg-orange-400/10 border-orange-400/30',
  };
  const icons: Record<string, React.ReactNode> = {
    Hold: <TrendingUp size={10} />, Refi: <RefreshCw size={10} />,
    Sell: <ArrowUpRight size={10} />, Watch: <AlertCircle size={10} />,
  };
  return <span className={clsx('inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded border', styles[rec])}>{icons[rec]} {rec}</span>;
}
