import { useState, useMemo } from 'react';
import { Landmark, Copy, Check } from 'lucide-react';
import { clsx } from 'clsx';
import { fmt } from '../components/UI';

// ── DSCR calculator (pure client-side) ───────────────────────────────────────

interface DSCRInputs {
  propertyValue: number;
  loanAmount: number;
  interestRate: number;
  loanTerm: '30yr' | '40yr' | 'IO';
  monthlyRent: number;
  annualTaxes: number;
  annualInsurance: number;
  hoa: number;
}

function computeDSCR(i: DSCRInputs) {
  const monthlyRate = i.interestRate / 100 / 12;
  let monthlyDebtService: number;
  if (i.loanTerm === 'IO') {
    monthlyDebtService = i.loanAmount * monthlyRate;
  } else {
    const n = i.loanTerm === '40yr' ? 480 : 360;
    monthlyDebtService = monthlyRate === 0 ? i.loanAmount / n
      : i.loanAmount * (monthlyRate * Math.pow(1 + monthlyRate, n)) / (Math.pow(1 + monthlyRate, n) - 1);
  }

  const monthlyNOI = i.monthlyRent - i.annualTaxes / 12 - i.annualInsurance / 12 - i.hoa;
  const dscr = monthlyDebtService > 0 ? monthlyNOI / monthlyDebtService : 0;
  const ltv = i.propertyValue > 0 ? (i.loanAmount / i.propertyValue) * 100 : 0;

  const maxLoanAt125 = (monthlyNOI / 1.25) / monthlyRate > 0
    ? Math.round(((monthlyNOI / 1.25) / monthlyRate) * ((Math.pow(1 + monthlyRate, 360) - 1) / (Math.pow(1 + monthlyRate, 360))))
    : 0;
  const maxPurchaseAt75LTV = maxLoanAt125 / 0.75;

  return { monthlyDebtService, monthlyNOI, dscr, ltv, maxLoanAt125, maxPurchaseAt75LTV };
}

function dscrLabel(dscr: number): { label: string; color: string; bg: string; border: string } {
  if (dscr < 1.0) return { label: 'Does not qualify', color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/30' };
  if (dscr < 1.20) return { label: 'Borderline — some lenders', color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/30' };
  if (dscr < 1.25) return { label: 'Qualifies at most lenders', color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/30' };
  return { label: 'Strong — qualifies everywhere', color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30' };
}

function gaugeColor(dscr: number): string {
  if (dscr < 1.0) return '#ef4444';
  if (dscr < 1.25) return '#f59e0b';
  return '#22c55e';
}

// Slider with number input
function SliderField({ label, value, min, max, step, unit = '', prefix = '', onChange }: {
  label: string; value: number; min: number; max: number; step: number;
  unit?: string; prefix?: string; onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-xs text-slate-400">{label}</label>
        <div className="flex items-center gap-1">
          {prefix && <span className="text-xs text-slate-500">{prefix}</span>}
          <input
            type="number"
            value={value}
            min={min}
            max={max}
            step={step}
            onChange={e => onChange(Number(e.target.value))}
            className="w-20 bg-transparent text-right text-xs font-mono text-white border-b border-white/10 focus:border-amber-500 outline-none pb-0.5"
          />
          {unit && <span className="text-xs text-slate-500">{unit}</span>}
        </div>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full h-1 accent-amber-500 cursor-pointer"
      />
    </div>
  );
}

const LENDER_BENCHMARKS = [
  { label: 'Min DSCR', value: '1.20 – 1.25×' },
  { label: 'Max LTV', value: '75 – 80%' },
  { label: 'Min Credit Score', value: '680+' },
  { label: 'Min Loan Amount', value: '$75,000' },
  { label: 'Max Loan Amount', value: '$3,000,000' },
];

export default function LenderPage() {
  const [inputs, setInputs] = useState<DSCRInputs>({
    propertyValue: 400000,
    loanAmount: 300000,
    interestRate: 7.5,
    loanTerm: '30yr',
    monthlyRent: 2500,
    annualTaxes: 5200,
    annualInsurance: 1800,
    hoa: 0,
  });
  const [copied, setCopied] = useState(false);

  const set = (k: keyof DSCRInputs) => (v: number | string) =>
    setInputs(prev => ({ ...prev, [k]: v }));

  const out = useMemo(() => computeDSCR(inputs), [inputs]);
  const badge = dscrLabel(out.dscr);
  const ltvPct = out.ltv;
  const gaugeWidth = Math.min(100, (out.dscr / 2) * 100);

  const exportSummary = () => {
    const lines = [
      `STRATA DSCR Analysis`,
      `─────────────────────────────`,
      `Property Value:     ${fmt.currency(inputs.propertyValue)}`,
      `Loan Amount:        ${fmt.currency(inputs.loanAmount)}`,
      `LTV:                ${ltvPct.toFixed(1)}%`,
      `Interest Rate:      ${inputs.interestRate}%`,
      `Loan Term:          ${inputs.loanTerm}`,
      `Monthly Rent:       ${fmt.currency(inputs.monthlyRent)}`,
      `Monthly NOI:        ${fmt.currency(out.monthlyNOI)}`,
      `Monthly Debt Svc:   ${fmt.currency(out.monthlyDebtService)}`,
      `DSCR:               ${out.dscr.toFixed(2)}×`,
      `Verdict:            ${badge.label}`,
    ].join('\n');
    navigator.clipboard.writeText(lines).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="flex flex-col h-full page-fade overflow-hidden">
      <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-amber-500/15 flex items-center justify-center">
            <Landmark size={16} className="text-amber-400" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-white">DSCR Financing Analysis</h1>
            <p className="text-sm text-slate-500">Evaluate any property for DSCR loan eligibility.</p>
          </div>
        </div>
        <button onClick={exportSummary} className="btn-ghost text-sm">
          {copied ? <><Check size={14} /> Copied</> : <><Copy size={14} /> Export Summary</>}
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Inputs panel */}
        <div className="w-[300px] flex-shrink-0 border-r border-white/5 overflow-y-auto px-5 py-5 space-y-6">
          <div className="space-y-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Property</p>
            <SliderField label="Property Value" value={inputs.propertyValue} min={50000} max={3000000} step={5000} prefix="$" onChange={set('propertyValue')} />
            <SliderField label="Loan Amount" value={inputs.loanAmount} min={50000} max={inputs.propertyValue} step={5000} prefix="$" onChange={set('loanAmount')} />
            <div>
              <div className="flex justify-between mb-1">
                <label className="text-xs text-slate-400">LTV</label>
                <span className={clsx('text-xs font-mono font-semibold', ltvPct > 80 ? 'text-red-400' : ltvPct > 75 ? 'text-amber-400' : 'text-emerald-400')}>{ltvPct.toFixed(1)}%</span>
              </div>
              <input type="range" min={50} max={85} step={0.5}
                value={ltvPct}
                onChange={e => set('loanAmount')(Math.round(inputs.propertyValue * Number(e.target.value) / 100))}
                className="w-full h-1 accent-amber-500 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-slate-600 mt-0.5"><span>50%</span><span>65%</span><span>75%</span><span>85%</span></div>
            </div>
          </div>

          <div className="space-y-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Financing</p>
            <SliderField label="Interest Rate" value={inputs.interestRate} min={5.0} max={12.0} step={0.125} unit="%" onChange={set('interestRate')} />
            <div>
              <label className="text-xs text-slate-400 mb-1.5 block">Loan Term</label>
              <div className="flex gap-1">
                {(['30yr', '40yr', 'IO'] as const).map(t => (
                  <button key={t} onClick={() => set('loanTerm')(t)}
                    className={clsx('flex-1 py-1.5 rounded-lg text-xs font-medium border transition-colors', inputs.loanTerm === t ? 'bg-amber-500/15 border-amber-500/40 text-amber-400' : 'border-white/10 text-slate-500 hover:border-white/20')}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Income & Expenses</p>
            <SliderField label="Monthly Rent" value={inputs.monthlyRent} min={500} max={10000} step={50} prefix="$" onChange={set('monthlyRent')} />
            <SliderField label="Annual Taxes" value={inputs.annualTaxes} min={0} max={30000} step={100} prefix="$" onChange={set('annualTaxes')} />
            <SliderField label="Annual Insurance" value={inputs.annualInsurance} min={0} max={10000} step={100} prefix="$" onChange={set('annualInsurance')} />
            <SliderField label="HOA (monthly)" value={inputs.hoa} min={0} max={2000} step={25} prefix="$" onChange={set('hoa')} />
          </div>
        </div>

        {/* Results panel */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* DSCR Gauge */}
          <div className="glass rounded-2xl p-6 border border-white/5">
            <div className="flex items-start justify-between mb-4">
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">DSCR Score</p>
                <p className="text-5xl font-black font-mono" style={{ color: gaugeColor(out.dscr) }}>{out.dscr.toFixed(2)}<span className="text-2xl">×</span></p>
              </div>
              <span className={clsx('text-sm font-semibold px-3 py-1.5 rounded-xl border', badge.color, badge.bg, badge.border)}>
                {badge.label}
              </span>
            </div>
            <div className="h-3 rounded-full bg-white/5 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{ width: `${gaugeWidth}%`, background: gaugeColor(out.dscr) }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-slate-600 mt-1.5">
              <span>0×</span><span className="text-red-400/60">1.0</span><span className="text-amber-400/60">1.25</span><span>2.0×</span>
            </div>
          </div>

          {/* Key metrics */}
          <div className="grid grid-cols-3 gap-4">
            <div className="glass rounded-xl p-4 border border-white/5">
              <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">Monthly NOI</p>
              <p className={clsx('text-lg font-bold font-mono', out.monthlyNOI >= 0 ? 'text-white' : 'text-red-400')}>{fmt.currency(out.monthlyNOI)}</p>
              <p className="text-xs text-slate-600 mt-0.5">Rent − taxes − ins − HOA</p>
            </div>
            <div className="glass rounded-xl p-4 border border-white/5">
              <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">Monthly Debt Svc</p>
              <p className="text-lg font-bold font-mono text-white">{fmt.currency(out.monthlyDebtService)}</p>
              <p className="text-xs text-slate-600 mt-0.5">{inputs.loanTerm} · {inputs.interestRate}%</p>
            </div>
            <div className="glass rounded-xl p-4 border border-white/5">
              <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">Current LTV</p>
              <p className={clsx('text-lg font-bold font-mono', ltvPct > 80 ? 'text-red-400' : ltvPct > 75 ? 'text-amber-400' : 'text-emerald-400')}>{ltvPct.toFixed(1)}%</p>
              <p className="text-xs text-slate-600 mt-0.5">Max lender: 75–80%</p>
            </div>
          </div>

          {/* Max loan / max purchase */}
          <div className="grid grid-cols-2 gap-4">
            <div className="glass rounded-xl p-5 border border-white/5">
              <p className="text-xs text-slate-400 mb-1">Max Loan at 1.25× DSCR</p>
              <p className="text-2xl font-bold font-mono text-amber-400">{fmt.compact(out.maxLoanAt125)}</p>
              <p className="text-xs text-slate-600 mt-1">Based on current rent income</p>
            </div>
            <div className="glass rounded-xl p-5 border border-white/5">
              <p className="text-xs text-slate-400 mb-1">Max Purchase at 75% LTV</p>
              <p className="text-2xl font-bold font-mono text-amber-400">{fmt.compact(out.maxPurchaseAt75LTV)}</p>
              <p className="text-xs text-slate-600 mt-1">At current rent + 75% LTV</p>
            </div>
          </div>

          {/* DSCR color bands reference */}
          <div className="glass rounded-xl p-5 border border-white/5">
            <h3 className="text-sm font-semibold text-white mb-3">DSCR Qualification Bands</h3>
            <div className="space-y-2">
              {[
                { range: 'Below 1.0×', color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20', desc: 'Does not qualify — debt exceeds income' },
                { range: '1.0 – 1.19×', color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20', desc: 'Borderline — portfolio or non-QM lenders only' },
                { range: '1.20 – 1.24×', color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20', desc: 'Qualifies at most mainstream DSCR lenders' },
                { range: '1.25×+', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20', desc: 'Strong — qualifies everywhere, best rates' },
              ].map(b => (
                <div key={b.range} className={clsx('flex items-center gap-3 rounded-xl px-4 py-2.5 border', b.bg, out.dscr >= parseFloat(b.range) ? 'opacity-100' : 'opacity-60')}>
                  <span className={clsx('text-xs font-mono font-semibold w-20 flex-shrink-0', b.color)}>{b.range}</span>
                  <span className="text-xs text-slate-400">{b.desc}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Lender benchmark table */}
          <div className="glass rounded-xl p-5 border border-white/5">
            <h3 className="text-sm font-semibold text-white mb-3">Lender Benchmarks</h3>
            <div className="space-y-2">
              {LENDER_BENCHMARKS.map(b => (
                <div key={b.label} className="flex items-center justify-between py-1.5 border-b border-white/5 last:border-0">
                  <span className="text-xs text-slate-400">{b.label}</span>
                  <span className="text-xs font-mono text-white">{b.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
