import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Calculator, Save, Share2, FileText, ChevronDown, CheckCircle, XCircle, ChevronRight, Hammer } from 'lucide-react';
import { getProperty, calculateUnderwriting, getRenovationEstimate, logActivity } from '../api/client';
import type { RenovationScope, RenovationCondition, RenovationEstimate } from '../api/client';
import { supabase } from '../lib/supabase';

const BASE_URL = import.meta.env.VITE_API_URL ?? '';
import type { Property, UnderwritingInputs, UnderwritingOutputs } from '../types';
import { ScoreBadge, RiskBadge, MetricRow, fmt } from '../components/UI';
import { clsx } from 'clsx';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const STRATEGIES = ['Long-Term Rental', 'BRRRR', 'Fix & Flip', 'Short-Term Rental', 'House Hack', 'Appreciation Play', 'Renovation'];
const LOAN_TYPES = ['30yr Fixed', '15yr Fixed', 'DSCR Loan', 'Interest Only', 'Hard Money'];

// ── Closing Costs ─────────────────────────────────────────────────────────────

interface ClosingCostItem {
  name: string;
  amount: number;
  type: 'buyer' | 'lender' | 'govt';
  required: boolean;
  notes: string;
}

interface ClosingCostsResult {
  items: ClosingCostItem[];
  totalBuyerCosts: number;
  totalCashToClose: number;
  rangeLow: number;
  rangeHigh: number;
}

const TYPE_COLORS: Record<string, string> = {
  buyer: 'text-blue-400 bg-blue-400/10 border-blue-400/30',
  lender: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
  govt: 'text-purple-400 bg-purple-400/10 border-purple-400/30',
};

function ClosingCostsSection({
  purchasePrice,
  downPaymentPct,
}: { purchasePrice: number; downPaymentPct: number }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<ClosingCostsResult | null>(null);
  const [loading, setLoading] = useState(false);

  const loanAmount = purchasePrice * (1 - downPaymentPct / 100);

  useEffect(() => {
    if (!open || data) return;
    setLoading(true);
    fetch('/properties/p1/closing-costs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        purchase_price: purchasePrice,
        loan_amount: loanAmount,
        state: 'TX',
        is_first_time_buyer: false,
        loan_type: '30yr Fixed',
      }),
    })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open, purchasePrice, loanAmount, data]);

  // Reset when price changes
  useEffect(() => { setData(null); }, [purchasePrice, downPaymentPct]);

  return (
    <div className="glass rounded-xl border border-white/5">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 text-sm font-semibold text-white hover:text-amber-400 transition-colors"
      >
        <span className="flex items-center gap-2">
          <ChevronRight size={14} className={clsx('transition-transform text-amber-500', open && 'rotate-90')} />
          Estimated Closing Costs
        </span>
        {data && !open && (
          <span className="text-xs font-mono text-slate-400">{fmt.currency(data.totalBuyerCosts)} est.</span>
        )}
      </button>

      {open && (
        <div className="px-5 pb-5 border-t border-white/5 pt-4">
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4].map(i => <div key={i} className="h-8 glass rounded animate-pulse" />)}
            </div>
          ) : data ? (
            <>
              <div className="space-y-1.5 mb-4">
                {data.items.map((item, i) => (
                  <div key={i} className="flex items-center justify-between py-1.5 border-b border-white/5 last:border-0">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className={clsx('text-[10px] font-semibold px-1.5 py-0.5 rounded border flex-shrink-0', TYPE_COLORS[item.type] ?? 'text-slate-400')}>
                        {item.type}
                      </span>
                      <span className="text-xs text-slate-300 truncate">{item.name}</span>
                      {!item.required && <span className="text-[10px] text-slate-600 flex-shrink-0">optional</span>}
                    </div>
                    <span className="text-xs font-mono text-white flex-shrink-0 ml-3">{fmt.currency(item.amount)}</span>
                  </div>
                ))}
              </div>

              <div className="space-y-2 pt-3 border-t border-white/10">
                <div className="flex justify-between">
                  <span className="text-sm text-slate-400">Total Buyer Closing Costs</span>
                  <span className="text-sm font-mono font-semibold text-white">{fmt.currency(data.totalBuyerCosts)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm font-semibold text-white">Total Cash to Close</span>
                  <span className="text-lg font-bold font-mono text-amber-400">{fmt.currency(data.totalCashToClose)}</span>
                </div>
                <p className="text-[10px] text-slate-600 pt-1">
                  Estimate ±15% — final costs confirmed at closing disclosure. Range: {fmt.currency(data.rangeLow)} – {fmt.currency(data.rangeHigh)}
                </p>
              </div>
            </>
          ) : (
            <p className="text-xs text-slate-500">Could not load closing cost estimates.</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── BRRRR Panel ───────────────────────────────────────────────────────────────

interface BrrrrResult {
  totalProjectCost: number;
  refiLoanAmount: number;
  cashLeftInDeal: number;
  equityCaptured: number;
  equityCapturePct: number;
  postRefiCashFlow: number;
  postRefiDscr: number;
  brrrrReturnOnEquity: number;
  arvConfidence: string;
  [key: string]: number | string;
}

function BrrrrPanel({ inputs, rehabOverride }: { inputs: Omit<UnderwritingInputs, 'propertyId'> & { propertyId: string }; rehabOverride?: number | null }) {
  const [rehabCost, setRehabCost] = useState(35000);
  const [arv, setArv] = useState(Math.round(inputs.purchasePrice * 1.25 / 5000) * 5000);
  useEffect(() => {
    if (rehabOverride != null) setRehabCost(rehabOverride);
  }, [rehabOverride]);
  const [refiLtv, setRefiLtv] = useState(75);
  const [refiRate, setRefiRate] = useState(7.0);
  const [result, setResult] = useState<BrrrrResult | null>(null);
  const [loading, setLoading] = useState(false);

  const run = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${BASE_URL}/underwriting/brrrr`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          base: {
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
          },
          rehab_cost: rehabCost,
          arv,
          refi_ltv_pct: refiLtv,
          refi_rate: refiRate,
        }),
      });
      if (res.ok) setResult(await res.json());
    } catch { /* graceful */ }
    setLoading(false);
  }, [inputs, rehabCost, arv, refiLtv, refiRate]);

  useEffect(() => { run(); }, [run]);

  return (
    <div className="glass rounded-xl p-5 space-y-4">
      <h3 className="text-sm font-semibold text-white">BRRRR Analysis</h3>

      {/* Inputs */}
      <div className="grid grid-cols-2 gap-3">
        <SliderRow label="Rehab Cost" value={rehabCost} display={fmt.compact(rehabCost)} min={0} max={150000} step={5000} onChange={setRehabCost} />
        <SliderRow label="After Repair Value" value={arv} display={fmt.compact(arv)} min={inputs.purchasePrice} max={inputs.purchasePrice * 2} step={5000} onChange={setArv} />
        <SliderRow label="Refi LTV %" value={refiLtv} display={`${refiLtv}%`} min={50} max={80} step={5} onChange={setRefiLtv} />
        <SliderRow label="Refi Rate" value={refiRate} display={`${refiRate.toFixed(2)}%`} min={5} max={12} step={0.125} onChange={setRefiRate} />
      </div>

      {loading && <div className="h-8 glass rounded animate-pulse" />}

      {result && !loading && (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <Metric label="Total Project Cost" value={fmt.currency(result.totalProjectCost)} />
            <Metric label="Refi Loan Amount" value={fmt.currency(result.refiLoanAmount)} />
            <Metric label="Cash Left in Deal" value={fmt.currency(result.cashLeftInDeal)} color={result.cashLeftInDeal < 10000 ? 'text-emerald-400' : 'text-white'} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Metric
              label="Equity Captured"
              value={fmt.currency(result.equityCaptured)}
              sub={`${result.equityCapturePct}%`}
              color={result.equityCaptured > 20000 ? 'text-amber-400' : 'text-white'}
            />
            <Metric label="Post-Refi Cash Flow" value={`${result.postRefiCashFlow >= 0 ? '+' : ''}${fmt.currency(result.postRefiCashFlow)}/mo`} color={result.postRefiCashFlow >= 0 ? 'text-emerald-400' : 'text-red-400'} />
            <Metric label="BRRRR ROE" value={`${result.brrrrReturnOnEquity}%`} sub="annual" color={result.brrrrReturnOnEquity > 10 ? 'text-emerald-400' : 'text-slate-300'} />
          </div>
          <div className="flex items-center gap-2 p-3 rounded-lg bg-white/3 border border-white/5">
            <span className="text-xs text-slate-500">ARV Confidence:</span>
            <span className={clsx('text-xs font-semibold', result.arvConfidence === 'High' ? 'text-emerald-400' : result.arvConfidence === 'Medium' ? 'text-amber-400' : 'text-red-400')}>
              {String(result.arvConfidence)}
            </span>
            <span className="text-xs text-slate-500 ml-2">Post-Refi DSCR:</span>
            <span className={clsx('text-xs font-mono font-semibold', result.postRefiDscr >= 1.25 ? 'text-emerald-400' : 'text-red-400')}>
              {Number(result.postRefiDscr).toFixed(2)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Flip Panel ────────────────────────────────────────────────────────────────

function FlipPanel({ purchasePrice }: { purchasePrice: number }) {
  const [rehabCost, setRehabCost] = useState(40000);
  const [arv, setArv] = useState(Math.round(purchasePrice * 1.30 / 5000) * 5000);
  const [holdMonths, setHoldMonths] = useState(6);
  const [result, setResult] = useState<Record<string, number> | null>(null);
  const [loading, setLoading] = useState(false);

  const run = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${BASE_URL}/underwriting/flip`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          purchase_price: purchasePrice,
          rehab_cost: rehabCost,
          arv,
          hold_months: holdMonths,
          financing_rate: 0.12,
          agent_commission_pct: 0.055,
        }),
      });
      if (res.ok) setResult(await res.json());
    } catch { /* graceful */ }
    setLoading(false);
  }, [purchasePrice, rehabCost, arv, holdMonths]);

  useEffect(() => { run(); }, [run]);

  return (
    <div className="glass rounded-xl p-5 space-y-4">
      <h3 className="text-sm font-semibold text-white">Flip Analysis</h3>

      <div className="grid grid-cols-2 gap-3">
        <SliderRow label="Rehab Cost" value={rehabCost} display={fmt.compact(rehabCost)} min={0} max={150000} step={5000} onChange={setRehabCost} />
        <SliderRow label="After Repair Value" value={arv} display={fmt.compact(arv)} min={purchasePrice} max={purchasePrice * 2} step={5000} onChange={setArv} />
        <SliderRow label="Hold Period" value={holdMonths} display={`${holdMonths} months`} min={1} max={24} step={1} onChange={setHoldMonths} />
      </div>

      {loading && <div className="h-8 glass rounded animate-pulse" />}

      {result && !loading && (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <Metric label="Total Cost" value={fmt.currency(result.totalCost)} />
            <Metric label="Gross Profit" value={`${result.grossProfit >= 0 ? '+' : ''}${fmt.currency(result.grossProfit)}`} color={result.grossProfit >= 0 ? 'text-emerald-400' : 'text-red-400'} />
            <Metric label="Net Profit" value={`${result.netProfit >= 0 ? '+' : ''}${fmt.currency(result.netProfit)}`} color={result.netProfit >= 0 ? 'text-emerald-400' : 'text-red-400'} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Metric label="Return on Cost" value={`${result.returnOnCost}%`} color={result.returnOnCost >= 15 ? 'text-emerald-400' : result.returnOnCost >= 8 ? 'text-amber-400' : 'text-red-400'} />
            <Metric label="Annualized Return" value={`${result.annualizedReturn}%`} color={result.annualizedReturn >= 20 ? 'text-emerald-400' : 'text-slate-300'} />
            <Metric label="Break-Even ARV" value={fmt.compact(result.breakEvenArv)} sub="min to profit" />
          </div>
          <div className="p-3 rounded-lg bg-white/3 border border-white/5">
            <p className="text-xs text-slate-500">
              Agent fees: {fmt.currency(result.agentFees)} · Holding costs: {fmt.currency(result.holdingCosts)} · Timeline risk: {holdMonths > 9 ? 'Elevated' : 'Moderate'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── STR Panel ─────────────────────────────────────────────────────────────────

function StrPanel({ inputs }: { inputs: Omit<UnderwritingInputs, 'propertyId'> & { propertyId: string } }) {
  const [nightlyLow, setNightlyLow] = useState(120);
  const [nightlyMid, setNightlyMid] = useState(165);
  const [nightlyHigh, setNightlyHigh] = useState(220);
  const [occupancyMid, setOccupancyMid] = useState(70);
  const [result, setResult] = useState<Record<string, number> | null>(null);
  const [loading, setLoading] = useState(false);

  const run = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${BASE_URL}/underwriting/str`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          base: {
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
          },
          nightly_rate_low: nightlyLow,
          nightly_rate_mid: nightlyMid,
          nightly_rate_high: nightlyHigh,
          occupancy_low: (occupancyMid - 15) / 100,
          occupancy_mid: occupancyMid / 100,
          occupancy_high: Math.min((occupancyMid + 12) / 100, 0.95),
          platform_fee_pct: 0.03,
          cleaning_fee_per_stay: 120,
          avg_stay_nights: 3.5,
        }),
      });
      if (res.ok) setResult(await res.json());
    } catch { /* graceful */ }
    setLoading(false);
  }, [inputs, nightlyLow, nightlyMid, nightlyHigh, occupancyMid]);

  useEffect(() => { run(); }, [run]);

  return (
    <div className="glass rounded-xl p-5 space-y-4">
      <h3 className="text-sm font-semibold text-white">STR Revenue Analysis</h3>

      <div className="grid grid-cols-2 gap-3">
        <SliderRow label="Nightly Rate (Low)" value={nightlyLow} display={`$${nightlyLow}/night`} min={50} max={300} step={5} onChange={setNightlyLow} />
        <SliderRow label="Nightly Rate (Mid)" value={nightlyMid} display={`$${nightlyMid}/night`} min={50} max={500} step={5} onChange={setNightlyMid} />
        <SliderRow label="Nightly Rate (High)" value={nightlyHigh} display={`$${nightlyHigh}/night`} min={50} max={700} step={10} onChange={setNightlyHigh} />
        <SliderRow label="Target Occupancy" value={occupancyMid} display={`${occupancyMid}%`} min={30} max={95} step={1} onChange={setOccupancyMid} />
      </div>

      {loading && <div className="h-8 glass rounded animate-pulse" />}

      {result && !loading && (
        <div className="space-y-3">
          {/* Revenue bar */}
          <div className="grid grid-cols-3 gap-2 text-center">
            {[
              { label: 'Low', value: result.strMonthlyRevenueLow, cap: result.strCapRateLow },
              { label: 'Mid', value: result.strMonthlyRevenueMid, cap: result.strCapRateMid, highlight: true },
              { label: 'High', value: result.strMonthlyRevenueHigh, cap: result.strCapRateHigh },
            ].map(s => (
              <div key={s.label} className={clsx('p-3 rounded-xl border', s.highlight ? 'border-amber-500/30 bg-amber-500/5' : 'border-white/5 bg-white/3')}>
                <p className="text-[10px] text-slate-500 uppercase tracking-wide">{s.label}</p>
                <p className={clsx('text-base font-bold font-mono', s.highlight ? 'text-amber-400' : 'text-white')}>{fmt.currency(s.value)}/mo</p>
                <p className="text-[10px] text-slate-500">{Number(s.cap).toFixed(1)}% cap</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Metric
              label="STR vs LTR Premium"
              value={`${result.strVsLtrPremium >= 0 ? '+' : ''}${result.strVsLtrPremium}%`}
              color={result.strVsLtrPremium > 0 ? 'text-emerald-400' : 'text-red-400'}
            />
            <Metric label="Occ. Break-Even" value={`${result.occupancyBreakEven}%`} sub="vs LTR" />
            <Metric label="LTR Revenue" value={`${fmt.currency(result.ltrMonthlyRevenue)}/mo`} sub={`${result.ltrCapRate}% cap`} />
          </div>

          <div className="p-3 rounded-lg bg-white/3 border border-white/5">
            <p className="text-xs text-slate-500">
              Annual STR revenue (mid): {fmt.currency(result.strAnnualRevenueMid)} · Platform fee (3% Airbnb) included · Occupancy break-even to match LTR: {result.occupancyBreakEven}%
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Renovation Panel ──────────────────────────────────────────────────────────

const SCOPE_LABELS: Record<RenovationScope, string> = {
  roof: 'Roof',
  hvac: 'HVAC',
  kitchen: 'Kitchen',
  bathrooms: 'Bathrooms',
  flooring: 'Flooring',
  windows: 'Windows',
  electrical: 'Electrical',
  plumbing: 'Plumbing',
  foundation: 'Foundation',
  exterior: 'Exterior',
  cosmetic: 'Cosmetic',
  full_gut: 'Full Gut',
};

const ALL_SCOPES: RenovationScope[] = [
  'roof', 'hvac', 'kitchen', 'bathrooms', 'flooring', 'windows',
  'electrical', 'plumbing', 'foundation', 'exterior', 'cosmetic', 'full_gut',
];

function RenovationPanel({
  property,
  onApplyToBrrrr,
}: {
  property: Property;
  onApplyToBrrrr: (rehabCost: number) => void;
}) {
  const [scope, setScope] = useState<Set<RenovationScope>>(new Set(['cosmetic', 'kitchen', 'bathrooms']));
  const [condition, setCondition] = useState<RenovationCondition>('average');
  const [contingency, setContingency] = useState<'low' | 'high'>('high');
  const [result, setResult] = useState<RenovationEstimate | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sowOpen, setSowOpen] = useState(false);
  const [applied, setApplied] = useState(false);

  const toggle = (s: RenovationScope) => {
    setScope(prev => {
      const n = new Set(prev);
      if (n.has(s)) n.delete(s); else n.add(s);
      return n;
    });
  };

  const run = async () => {
    if (scope.size === 0) {
      setError('Select at least one scope item.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const r = await getRenovationEstimate(property.id, {
        scope: Array.from(scope),
        condition,
        sqft: property.sqft,
        yearBuilt: property.yearBuilt ?? null,
        propertyType: property.type ?? 'Single Family',
        state: property.state ?? 'TX',
        baths: property.baths,
        fairValueLow: property.fairValueLow,
        fairValueHigh: property.fairValueHigh,
      });
      setResult(r);
    } catch (e: any) {
      setError(String(e?.message ?? 'Unable to generate estimate.'));
    } finally {
      setLoading(false);
    }
  };

  const totalMid = result ? Math.round((result.totalLow + result.totalHigh) / 2) : 0;
  const totalShown = result ? (contingency === 'low' ? result.totalLow : result.totalHigh) : 0;

  const applyToBrrrr = () => {
    if (!result) return;
    onApplyToBrrrr(totalMid);
    setApplied(true);
    setTimeout(() => setApplied(false), 2500);
  };

  return (
    <div className="glass rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
          <Hammer size={14} className="text-amber-500" /> Renovation Estimate
        </h3>
        <span className="text-xs text-slate-500">{property.state} · {fmt.num(property.sqft)} sqft · {property.baths}ba</span>
      </div>

      {/* Scope checklist */}
      <div>
        <p className="text-xs text-slate-400 mb-2 font-semibold uppercase tracking-wider">Scope of Work</p>
        <div className="grid grid-cols-3 gap-1.5">
          {ALL_SCOPES.map(s => {
            const checked = scope.has(s);
            return (
              <button
                key={s}
                onClick={() => toggle(s)}
                className={clsx(
                  'text-xs px-3 py-2 rounded-lg border transition-all text-left',
                  checked
                    ? 'bg-amber-500/15 text-amber-400 border-amber-500/40'
                    : 'text-slate-500 border-white/10 hover:border-white/20'
                )}
              >
                <span className="inline-block w-3 h-3 mr-1.5 rounded border border-current align-middle">
                  {checked && <CheckCircle size={11} className="-ml-px -mt-px" />}
                </span>
                {SCOPE_LABELS[s]}
              </button>
            );
          })}
        </div>
      </div>

      {/* Condition selector */}
      <div>
        <p className="text-xs text-slate-400 mb-2 font-semibold uppercase tracking-wider">Condition</p>
        <div className="flex gap-1.5">
          {(['poor', 'fair', 'average', 'good'] as RenovationCondition[]).map(c => (
            <button
              key={c}
              onClick={() => setCondition(c)}
              className={clsx(
                'flex-1 text-xs px-3 py-2 rounded-lg border capitalize transition-all',
                condition === c
                  ? 'bg-amber-500/15 text-amber-400 border-amber-500/40'
                  : 'text-slate-500 border-white/10 hover:border-white/20'
              )}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      <button onClick={run} disabled={loading || scope.size === 0} className="btn-primary w-full justify-center text-sm">
        {loading ? 'Estimating…' : 'Estimate Costs'}
      </button>

      {error && <p className="text-xs text-red-400">{error}</p>}

      {result && !loading && (
        <div className="space-y-4">
          {/* Line items table */}
          <div>
            <p className="text-xs text-slate-400 mb-2 font-semibold uppercase tracking-wider">Line Items</p>
            <div className="glass rounded-lg border border-white/5 divide-y divide-white/5">
              {result.lineItems.map(li => (
                <div key={li.scope} className="flex items-start justify-between gap-4 px-4 py-2.5">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white capitalize">{li.scope.replace('_', ' ')}</p>
                    <p className="text-[10px] text-slate-500">{li.notes}</p>
                  </div>
                  <p className="text-sm font-mono text-slate-200 flex-shrink-0 whitespace-nowrap">
                    {fmt.currency(li.low)} – {fmt.currency(li.high)}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Subtotal + contingency */}
          <div className="grid grid-cols-2 gap-3">
            <div className="glass rounded-xl p-3 border border-white/5">
              <p className="text-[10px] text-slate-500 uppercase tracking-wide">Subtotal</p>
              <p className="text-base font-mono text-white">{fmt.currency(result.subtotalLow)} – {fmt.currency(result.subtotalHigh)}</p>
            </div>
            <div className="glass rounded-xl p-3 border border-white/5">
              <p className="text-[10px] text-slate-500 uppercase tracking-wide">Contingency</p>
              <div className="flex gap-1.5 mt-0.5">
                {(['low', 'high'] as const).map(c => (
                  <button
                    key={c}
                    onClick={() => setContingency(c)}
                    className={clsx(
                      'text-xs px-2.5 py-1 rounded border transition-all',
                      contingency === c
                        ? 'bg-amber-500/15 text-amber-400 border-amber-500/40'
                        : 'text-slate-500 border-white/10'
                    )}
                  >
                    +{c === 'low' ? '10%' : '20%'} ({fmt.currency(c === 'low' ? result.contingency10Pct : result.contingency20Pct)})
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Total + per-sqft */}
          <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/5">
            <div className="flex items-baseline justify-between mb-2">
              <span className="text-sm text-slate-300">Total at +{contingency === 'low' ? '10%' : '20%'} contingency</span>
              <span className="text-2xl font-bold font-mono text-amber-400">{fmt.currency(totalShown)}</span>
            </div>
            <div className="flex items-baseline justify-between text-xs text-slate-500">
              <span>Range:</span>
              <span className="font-mono">{fmt.currency(result.totalLow)} – {fmt.currency(result.totalHigh)}</span>
            </div>
            <div className="flex items-baseline justify-between text-xs text-slate-500">
              <span>Per sqft:</span>
              <span className="font-mono">${result.costPerSqftLow} – ${result.costPerSqftHigh}</span>
            </div>
          </div>

          {/* ARV uplift */}
          {result.arvLow && result.arvHigh && (
            <div className="p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5">
              <div className="flex items-baseline justify-between mb-1">
                <span className="text-sm text-slate-300">Projected ARV</span>
                <span className="text-lg font-bold font-mono text-emerald-400">{fmt.currency(result.arvLow)} – {fmt.currency(result.arvHigh)}</span>
              </div>
              <p className="text-xs text-slate-500">
                Uplift {result.upliftLowPct}%–{result.upliftHighPct}% above current fair value mid-point. ARV ranges assume a typical local market; verify with comps after renovation.
              </p>
            </div>
          )}

          {/* Apply to BRRRR */}
          <button onClick={applyToBrrrr} className="btn-ghost w-full justify-center text-sm">
            {applied ? <><CheckCircle size={14} /> Applied — switch to BRRRR tab</> : 'Add to BRRRR Analysis (pre-fill rehab cost)'}
          </button>

          {/* SOW narrative */}
          <div className="glass rounded-xl border border-white/5">
            <button onClick={() => setSowOpen(o => !o)} className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-white hover:text-amber-400 transition-colors">
              <span className="flex items-center gap-2">
                <ChevronRight size={14} className={clsx('transition-transform text-amber-500', sowOpen && 'rotate-90')} />
                Scope of Work Narrative
              </span>
            </button>
            {sowOpen && (
              <div className="px-4 pb-4 text-sm text-slate-300 leading-relaxed whitespace-pre-line border-t border-white/5 pt-3">
                {result.scopeOfWork}
              </div>
            )}
          </div>

          <p className="text-[10px] text-slate-600 leading-relaxed">
            Estimate only. Actual cost depends on scope detail, finish level, permits, and contractor bids. Always verify with at least two licensed contractors before committing capital.
          </p>
        </div>
      )}
    </div>
  );
}

// ── Small metric card ─────────────────────────────────────────────────────────

function Metric({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="p-3 rounded-lg bg-white/3 border border-white/5">
      <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-0.5">{label}</p>
      <p className={clsx('text-sm font-bold font-mono', color ?? 'text-white')}>{value}</p>
      {sub && <p className="text-[10px] text-slate-600 mt-0.5">{sub}</p>}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function UnderwritePage() {
  const [searchParams] = useSearchParams();
  const propertyId = searchParams.get('property') || 'p1';
  const initialStrategy = searchParams.get('strategy');

  const [property, setProperty] = useState<Property | null>(null);
  const [strategy, setStrategy] = useState(
    initialStrategy && STRATEGIES.includes(initialStrategy) ? initialStrategy : 'Long-Term Rental'
  );
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [outputs, setOutputs] = useState<UnderwritingOutputs | null>(null);
  const [saveLabel, setSaveLabel] = useState<'Save' | 'Saving…' | 'Saved!'>('Save');
  const [copied, setCopied] = useState(false);
  const [memoLabel, setMemoLabel] = useState<'Generate Memo' | 'Copied!'>('Generate Memo');
  const [brrrrRehabOverride, setBrrrrRehabOverride] = useState<number | null>(null);

  const [inputs, setInputs] = useState<Omit<UnderwritingInputs, 'propertyId'>>({
    purchasePrice: 342000,
    downPaymentPct: 25,
    interestRate: 7.25,
    loanType: '30yr Fixed',
    monthlyRent: 2240,
    vacancyPct: 6,
    managementPct: 8,
    maintenancePct: 1.0,
    insuranceMonthly: 140,
    capexPct: 5,
    strategy: 'Long-Term Rental',
  });

  const [loadError, setLoadError] = useState<string | null>(null);
  useEffect(() => {
    setLoadError(null);
    setProperty(null);
    getProperty(propertyId)
      .then(p => {
        setProperty(p);
        setInputs(prev => ({ ...prev, purchasePrice: p.price, monthlyRent: p.rentEstMid }));
      })
      .catch(() => {
        // Real RapidAPI listings 404 when the backend lacks the API key.
        // Silently load p1 as a working calculator template. Only surface an
        // error banner if even that falls through (backend unreachable).
        getProperty('p1')
          .then(p => {
            setProperty(p);
            setInputs(prev => ({ ...prev, purchasePrice: p.price, monthlyRent: p.rentEstMid }));
          })
          .catch(() => setLoadError('Backend unreachable. Try again in a moment.'));
      });
    logActivity(propertyId, 'underwritten');
  }, [propertyId]);

  const recalculate = useCallback(() => {
    calculateUnderwriting({ ...inputs, propertyId, strategy }).then(setOutputs);
  }, [inputs, propertyId, strategy]);

  useEffect(() => { recalculate(); }, [recalculate]);

  const set = (key: keyof typeof inputs) => (val: number | string) =>
    setInputs(prev => ({ ...prev, [key]: val }));

  const handleSave = async () => {
    if (!outputs) return;
    setSaveLabel('Saving…');
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      const res = await fetch(`${BASE_URL}/underwriting/scenarios`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ property_id: propertyId, strategy, inputs: { ...inputs, strategy }, outputs }),
      });
      if (!res.ok) throw new Error('save failed');
      setSaveLabel('Saved!');
    } catch {
      setSaveLabel('Save');
    }
    setTimeout(() => setSaveLabel('Save'), 2000);
  };

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleMemo = () => {
    if (!outputs || !property) return;
    const memo = [
      `STRATA UNDERWRITING MEMO`,
      `========================`,
      `Property: ${property.address}, ${property.city}, ${property.state}`,
      `Strategy: ${strategy}`,
      ``,
      `ASSUMPTIONS`,
      `Purchase Price:   $${inputs.purchasePrice.toLocaleString()}`,
      `Down Payment:     ${inputs.downPaymentPct}% ($${(inputs.purchasePrice * inputs.downPaymentPct / 100).toLocaleString()})`,
      `Loan Type:        ${inputs.loanType}`,
      `Interest Rate:    ${inputs.interestRate}%`,
      `Monthly Rent:     $${inputs.monthlyRent.toLocaleString()}`,
      `Vacancy:          ${inputs.vacancyPct}%`,
      ``,
      `RESULTS`,
      `Recommendation:   ${outputs.recommendation}`,
      `Cash Flow:        $${Math.round(outputs.cashFlow).toLocaleString()}/mo`,
      `Cap Rate:         ${outputs.capRate.toFixed(2)}%`,
      `Cash-on-Cash:     ${outputs.cashOnCash.toFixed(2)}%`,
      `DSCR:             ${outputs.dscr.toFixed(2)}x`,
      `NOI:              $${Math.round(outputs.noi).toLocaleString()}/mo`,
      `Total Cash to Close: $${Math.round(outputs.totalCashToClose).toLocaleString()}`,
      ``,
      `Generated by STRATA — ${new Date().toLocaleDateString()}`,
    ].join('\n');
    navigator.clipboard.writeText(memo);
    setMemoLabel('Copied!');
    setTimeout(() => setMemoLabel('Generate Memo'), 2000);
  };

  if (!property || !outputs) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 px-6 text-center">
        {loadError ? (
          <>
            <p className="text-sm text-red-400 font-medium">Couldn't load property</p>
            <p className="text-xs text-slate-500 max-w-md">{loadError}</p>
            <button onClick={() => window.history.back()} className="btn-ghost text-sm mt-2">Go Back</button>
          </>
        ) : (
          <>
            <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-slate-500 text-sm">Loading underwriting…</p>
          </>
        )}
      </div>
    );
  }

  const recColor = {
    'Strong Buy': 'text-emerald-400 border-emerald-400/40 bg-emerald-400/10',
    'Buy with Negotiation': 'text-amber-400 border-amber-500/40 bg-amber-500/10',
    'Marginal': 'text-orange-400 border-orange-400/40 bg-orange-400/10',
    'Avoid': 'text-red-400 border-red-400/40 bg-red-400/10',
  }[outputs.recommendation];

  const fullInputs = { ...inputs, propertyId };

  return (
    <div className="flex flex-col h-full page-fade overflow-hidden">
      {loadError && (
        <div className="px-4 md:px-6 py-2 border-b border-amber-500/20 bg-amber-500/5 text-xs text-amber-400 flex-shrink-0">
          {loadError}
        </div>
      )}
      {/* Header */}
      <div className="px-4 md:px-6 py-3 border-b border-white/5 flex flex-wrap items-center gap-3 md:gap-4 flex-shrink-0">
        <Calculator size={16} className="text-amber-400 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white truncate">{property.address}</p>
          <p className="text-xs text-slate-500 truncate">STRATA Underwrite · {strategy}</p>
        </div>
        <div className="order-3 md:order-none flex items-center gap-1.5 overflow-x-auto w-full md:w-auto -mx-4 px-4 md:mx-0 md:px-0">
          {STRATEGIES.map(s => (
            <button key={s} onClick={() => setStrategy(s)} className={clsx('text-xs font-medium px-3 py-1.5 rounded-lg border transition-all whitespace-nowrap flex-shrink-0', strategy === s ? 'bg-amber-500/15 text-amber-400 border-amber-500/40' : 'text-slate-500 border-white/8 hover:border-white/20 hover:text-slate-400')}>{s}</button>
          ))}
        </div>
        <div className="flex items-center gap-2 ml-auto md:ml-2 flex-shrink-0">
          <button onClick={handleSave} aria-label={saveLabel} className="btn-ghost text-xs py-1.5 px-2.5 md:px-3"><Save size={12} /> <span className="hidden md:inline">{saveLabel}</span></button>
          <button onClick={handleShare} aria-label="Share" className="btn-ghost text-xs py-1.5 px-2.5 md:px-3"><Share2 size={12} /> <span className="hidden md:inline">{copied ? 'Copied!' : 'Share'}</span></button>
          <button onClick={handleMemo} className="btn-primary text-xs py-2 px-3 md:px-4"><FileText size={12} /> <span className="hidden sm:inline">{memoLabel}</span></button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden flex-col md:flex-row">
        {/* Assumptions */}
        <div className="w-full md:w-[272px] flex-shrink-0 overflow-y-auto border-r border-white/5 px-4 py-4 space-y-4 max-h-[45vh] md:max-h-none border-b md:border-b-0">
          {/* Purchase */}
          <div className="glass rounded-xl p-4">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Purchase</p>
            <SliderRow label="Purchase Price" value={inputs.purchasePrice} display={fmt.currency(inputs.purchasePrice)} min={50000} max={1000000} step={5000} onChange={v => set('purchasePrice')(v)} />
            <SliderRow label="Down Payment" value={inputs.downPaymentPct} display={`${inputs.downPaymentPct}% · ${fmt.compact(inputs.purchasePrice * inputs.downPaymentPct / 100)}`} min={3.5} max={100} step={0.5} onChange={v => set('downPaymentPct')(v)} />
            <div className="mb-3">
              <label className="text-xs text-slate-500 block mb-1.5">Loan Type</label>
              <select className="strata-input text-xs py-1.5" value={inputs.loanType} onChange={e => set('loanType')(e.target.value)}>
                {LOAN_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <SliderRow label="Interest Rate" value={inputs.interestRate} display={`${inputs.interestRate.toFixed(3)}%`} min={4} max={14} step={0.125} onChange={v => set('interestRate')(v)} />
          </div>

          {/* Income */}
          <div className="glass rounded-xl p-4">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Income</p>
            <SliderRow label="Monthly Rent" value={inputs.monthlyRent} display={fmt.currency(inputs.monthlyRent)} min={500} max={6000} step={50} onChange={v => set('monthlyRent')(v)} />
            <p className="text-[10px] text-slate-600 -mt-2 mb-3">STRATA estimate: {fmt.currency(property.rentEstMid)} ({property.rentConfidence} confidence)</p>
            <SliderRow label="Vacancy Rate" value={inputs.vacancyPct} display={`${inputs.vacancyPct}%`} min={0} max={30} step={1} onChange={v => set('vacancyPct')(v)} />
          </div>

          {/* Expenses */}
          <div className="glass rounded-xl p-4">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Expenses</p>
            <SliderRow label="Property Mgmt" value={inputs.managementPct} display={`${inputs.managementPct}%`} min={0} max={15} step={0.5} onChange={v => set('managementPct')(v)} />
            <SliderRow label="Maintenance" value={inputs.maintenancePct} display={`${inputs.maintenancePct}% of value/yr`} min={0.25} max={3} step={0.25} onChange={v => set('maintenancePct')(v)} />
            <SliderRow label="Insurance" value={inputs.insuranceMonthly} display={`${fmt.currency(inputs.insuranceMonthly)}/mo`} min={60} max={400} step={10} onChange={v => set('insuranceMonthly')(v)} />
            <SliderRow label="CapEx Reserve" value={inputs.capexPct} display={`${inputs.capexPct}% of EGI`} min={0} max={15} step={1} onChange={v => set('capexPct')(v)} />
          </div>

          {/* Advanced */}
          <button onClick={() => setShowAdvanced(!showAdvanced)} className="w-full flex items-center justify-between px-4 py-2.5 text-xs text-slate-500 hover:text-slate-400 rounded-lg border border-white/8 hover:border-white/15 transition-all">
            Advanced Assumptions
            <ChevronDown size={12} className={clsx('transition-transform', showAdvanced && 'rotate-180')} />
          </button>
          {showAdvanced && (
            <div className="glass rounded-xl p-4 space-y-2">
              {[['Appreciation Rate/yr', '3.0%'], ['Rent Growth/yr', '2.5%'], ['Turnover Cost', '$1,200'], ['Hold Period', '7 years'], ['Closing Costs', '$8,500']].map(([k, v]) => (
                <div key={k} className="flex justify-between"><span className="text-xs text-slate-500">{k}</span><span className="text-xs font-mono text-amber-400">{v}</span></div>
              ))}
            </div>
          )}
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto px-4 md:px-5 py-4 space-y-4 min-w-0">
          {/* Recommendation */}
          <div className={clsx('rounded-xl p-4 border flex items-center gap-4', recColor)}>
            <div className="text-2xl font-bold">{outputs.recommendation === 'Strong Buy' || outputs.recommendation === 'Buy with Negotiation' ? '✓' : outputs.recommendation === 'Marginal' ? '!' : '✗'}</div>
            <div className="flex-1">
              <p className="font-bold text-base">{outputs.recommendation}</p>
              <p className="text-sm opacity-80">
                {outputs.recommendation === 'Strong Buy' && `${fmt.currency(outputs.cashFlow)}/mo cash flow · ${fmt.pct(outputs.cashOnCash)} CoC · DSCR ${outputs.dscr.toFixed(2)}`}
                {outputs.recommendation === 'Buy with Negotiation' && `Deal works at or below ${fmt.currency(inputs.purchasePrice - 12000)}. Consider negotiating.`}
                {outputs.recommendation === 'Marginal' && 'Returns below threshold at standard assumptions. Stress-test before committing.'}
                {outputs.recommendation === 'Avoid' && 'Negative cash flow at any standard financing scenario at this price.'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <ScoreBadge score={property.dealScore} />
              <RiskBadge score={property.riskScore} />
            </div>
          </div>

          {/* Key metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {[
              { label: 'Cash Flow', value: `${outputs.cashFlow >= 0 ? '+' : ''}${fmt.currency(outputs.cashFlow)}/mo`, color: outputs.cashFlow >= 0 ? 'text-emerald-400' : 'text-red-400' },
              { label: 'Cap Rate', value: fmt.pct(outputs.capRate), color: outputs.capRate >= 5 ? 'text-amber-400' : 'text-slate-300' },
              { label: 'CoC Return', value: fmt.pct(outputs.cashOnCash), color: outputs.cashOnCash >= 6 ? 'text-emerald-400' : 'text-slate-300' },
              { label: 'DSCR', value: outputs.dscr.toFixed(2), color: outputs.dscr >= 1.25 ? 'text-emerald-400' : 'text-red-400' },
              { label: 'GRM', value: `${outputs.grm.toFixed(1)}x`, color: 'text-slate-300' },
            ].map(m => (
              <div key={m.label} className="glass rounded-xl p-4 text-center">
                <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">{m.label}</p>
                <p className={clsx('text-xl font-bold font-mono', m.color)}>{m.value}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* P&L */}
            <div className="glass rounded-xl p-5">
              <h3 className="text-sm font-semibold text-white mb-4">Monthly P&L</h3>
              <MetricRow label="Gross Rent" value={fmt.currency(inputs.monthlyRent)} />
              <MetricRow label="Vacancy Loss" value={`-${fmt.currency(inputs.monthlyRent * inputs.vacancyPct / 100)}`} />
              <MetricRow label="Eff. Gross Income" value={fmt.currency(outputs.effectiveGrossIncome)} highlight />
              <div className="my-2 border-t border-white/5" />
              <MetricRow label="Operating Expenses" value={`-${fmt.currency(outputs.totalExpenses)}`} />
              <MetricRow label="NOI" value={fmt.currency(outputs.noi)} />
              <div className="my-2 border-t border-white/5" />
              <MetricRow label="Mortgage" value={`-${fmt.currency(outputs.mortgage)}`} />
              <div className="mt-3 pt-3 border-t border-white/10 flex justify-between items-center">
                <span className="text-sm font-bold text-white">Net Cash Flow</span>
                <span className={clsx('text-lg font-bold font-mono', outputs.cashFlow >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                  {outputs.cashFlow >= 0 ? '+' : ''}{fmt.currency(outputs.cashFlow)}
                </span>
              </div>
            </div>

            {/* Scenarios */}
            <div className="glass rounded-xl p-5">
              <h3 className="text-sm font-semibold text-white mb-4">Scenario Analysis</h3>
              <div className="h-36 mb-3">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={outputs.scenarios} barSize={40}>
                    <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#64748b', fontSize: 9 }} axisLine={false} tickLine={false} tickFormatter={v => `$${Math.round(v)}`} />
                    <Tooltip contentStyle={{ background: '#112240', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 11 }} formatter={(v: any) => [fmt.currency(v), 'Cash Flow']} />
                    <Bar dataKey="cashFlow" radius={[4, 4, 0, 0]}>
                      {outputs.scenarios.map((s, i) => <Cell key={i} fill={s.cashFlow >= 200 ? '#34d399' : s.cashFlow >= 0 ? '#C9A84C' : '#f87171'} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              {outputs.scenarios.map(s => (
                <div key={s.name} className="flex items-center p-2 rounded-lg bg-white/3 mb-1.5">
                  <span className="text-xs text-slate-400 w-10">{s.name}</span>
                  <span className={clsx('text-xs font-mono font-semibold flex-1 text-center', s.cashFlow >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                    {s.cashFlow >= 0 ? '+' : ''}{fmt.currency(s.cashFlow)}/mo
                  </span>
                  <span className="text-xs font-mono text-amber-400 w-16 text-right">{fmt.pct(s.capRate)} cap</span>
                  <span className="text-xs font-mono text-slate-400 w-14 text-right">{fmt.pct(s.irr)} IRR</span>
                </div>
              ))}
            </div>
          </div>

          {/* Additional metrics */}
          <div className="glass rounded-xl p-5">
            <h3 className="text-sm font-semibold text-white mb-4">Additional Metrics</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
              <div><p className="text-xs text-slate-500 mb-1">Cash to Close</p><p className="text-lg font-bold font-mono text-white">{fmt.currency(outputs.totalCashToClose)}</p><p className="text-xs text-slate-500">Down + est. closing</p></div>
              <div><p className="text-xs text-slate-500 mb-1">Break-Even Occupancy</p><p className={clsx('text-lg font-bold font-mono', outputs.breakEvenOccupancy <= 80 ? 'text-emerald-400' : 'text-amber-400')}>{fmt.pct(outputs.breakEvenOccupancy, 0)}</p><p className="text-xs text-slate-500">Min occupancy needed</p></div>
              <div><p className="text-xs text-slate-500 mb-1">Break-Even Rent</p><p className="text-lg font-bold font-mono text-white">{fmt.currency(outputs.breakEvenRent)}/mo</p><p className="text-xs text-slate-500">Min rent to cover all costs</p></div>
              <div><p className="text-xs text-slate-500 mb-1">Expense Ratio</p><p className={clsx('text-lg font-bold font-mono', outputs.expenseRatio <= 45 ? 'text-emerald-400' : 'text-amber-400')}>{fmt.pct(outputs.expenseRatio, 0)}</p><p className="text-xs text-slate-500">Opex / EGI</p></div>
            </div>
          </div>

          {/* DSCR check */}
          <div className={clsx('rounded-xl p-4 border flex items-center gap-3', outputs.dscr >= 1.25 ? 'border-emerald-400/30 bg-emerald-400/5' : 'border-red-400/30 bg-red-400/5')}>
            {outputs.dscr >= 1.25 ? <CheckCircle size={16} className="text-emerald-400" /> : <XCircle size={16} className="text-red-400" />}
            <div>
              <p className={clsx('text-sm font-semibold', outputs.dscr >= 1.25 ? 'text-emerald-400' : 'text-red-400')}>
                DSCR Financing: {outputs.dscr >= 1.25 ? `Qualifies at ${outputs.dscr.toFixed(2)}` : `Does Not Qualify at ${outputs.dscr.toFixed(2)}`}
              </p>
              <p className="text-xs text-slate-500">
                {outputs.dscr >= 1.25
                  ? 'This deal qualifies for DSCR loan products. Most lenders require 1.20–1.25 minimum.'
                  : 'Most DSCR lenders require 1.20–1.25 minimum. Increase rent, reduce price, or increase down payment.'}
              </p>
            </div>
          </div>

          {/* Strategy-specific panels */}
          {strategy === 'BRRRR' && <BrrrrPanel inputs={fullInputs} rehabOverride={brrrrRehabOverride} />}
          {strategy === 'Fix & Flip' && <FlipPanel purchasePrice={inputs.purchasePrice} />}
          {strategy === 'Short-Term Rental' && <StrPanel inputs={fullInputs} />}
          {strategy === 'Renovation' && (
            <RenovationPanel
              property={property}
              onApplyToBrrrr={(cost) => {
                setBrrrrRehabOverride(cost);
                setStrategy('BRRRR');
              }}
            />
          )}

          {/* Closing costs — always shown, collapsed by default */}
          <ClosingCostsSection purchasePrice={inputs.purchasePrice} downPaymentPct={inputs.downPaymentPct} />
        </div>
      </div>
    </div>
  );
}

function SliderRow({ label, value, display, min, max, step, onChange }: {
  label: string; value: number; display: string; min: number; max: number; step: number; onChange: (v: number) => void;
}) {
  return (
    <div className="mb-4">
      <label className="text-xs text-slate-500 flex justify-between mb-1.5">
        <span>{label}</span>
        <span className="text-amber-400 font-mono">{display}</span>
      </label>
      <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(+e.target.value)} />
    </div>
  );
}
