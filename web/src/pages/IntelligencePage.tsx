import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Calculator, Star, Share2, Bell, ChevronRight, MapPin, Info, ThumbsUp, ThumbsDown, Clock, Home, TrendingUp, Shield, AlertTriangle, Landmark } from 'lucide-react';
import { getProperty } from '../api/client';
import type { Property } from '../types';
import { ScoreBadge, RiskBadge, RegimeBadge, FlagBadge, ConfidencePill, MetricRow, StatCard, ProgressBar, fmt } from '../components/UI';
import { clsx } from 'clsx';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

const TABS = ['Overview', 'Financials', 'Valuation', 'Risk', 'Market', 'History'];

const priceHistory = [
  { date: 'Jan 23', price: 295000 }, { date: 'Apr 23', price: 310000 },
  { date: 'Jul 23', price: 318000 }, { date: 'Oct 23', price: 314000 },
  { date: 'Jan 24', price: 329000 }, { date: 'Apr 24', price: 342000 },
];

export default function IntelligencePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [property, setProperty] = useState<Property | null>(null);
  const [activeTab, setActiveTab] = useState('Overview');

  useEffect(() => {
    getProperty(id || 'p1').then(setProperty);
  }, [id]);

  if (!property) return <div className="flex items-center justify-center h-full"><div className="glass rounded-xl w-96 h-48 animate-pulse" /></div>;

  const rec = property.dealScore >= 70 ? 'Buy' : property.dealScore >= 50 ? 'Negotiate' : property.dealScore >= 35 ? 'Watch' : 'Avoid';
  const recColor = { Buy: 'text-emerald-400 border-emerald-400/40 bg-emerald-400/10', Negotiate: 'text-amber-400 border-amber-500/40 bg-amber-500/10', Watch: 'text-orange-400 border-orange-400/40 bg-orange-400/10', Avoid: 'text-red-400 border-red-400/40 bg-red-400/10' }[rec];

  return (
    <div className="flex flex-col h-full page-fade">
      {/* Topbar */}
      <div className="px-6 py-3 border-b border-white/5 flex items-center gap-4 flex-shrink-0">
        <button onClick={() => navigate('/')} className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-sm">
          <ArrowLeft size={16} /> Back
        </button>
        <div className="h-4 w-px bg-white/10" />
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <MapPin size={12} />
          <span className="text-white">{property.address}</span>
          <ChevronRight size={12} />
          <span>{property.city}, {property.state}</span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button className="btn-ghost text-xs py-1.5 px-3"><Star size={12} /> Watch</button>
          <button className="btn-ghost text-xs py-1.5 px-3"><Share2 size={12} /> Share</button>
          <button className="btn-ghost text-xs py-1.5 px-3"><Bell size={12} /> Alert</button>
          <button className="btn-primary text-sm" onClick={() => navigate(`/underwrite?property=${property.id}`)}>
            <Calculator size={14} /> Run Full Analysis
          </button>
        </div>
      </div>

      {/* Hero image */}
      <div className="relative flex-shrink-0 h-48 overflow-hidden">
        <img src={property.image} alt={property.address} className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/50 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 px-6 pb-4 flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white mb-0.5">{property.address}</h1>
            <div className="flex items-center gap-2 text-slate-300 text-sm flex-wrap">
              <MapPin size={12} />
              <span>{property.city}, {property.state} {property.zip}</span>
              <span>·</span><span>{property.beds}bd/{property.baths}ba</span>
              <span>·</span><span>{fmt.num(property.sqft)} sqft</span>
              <span>·</span><span>{property.type}</span>
              <span>·</span><RegimeBadge regime={property.marketRegime} />
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="text-3xl font-bold font-mono text-white">{fmt.currency(property.price)}</div>
            <div className="flex items-center gap-2">
              <ScoreBadge score={property.dealScore} size="lg" />
              <RiskBadge score={property.riskScore} />
            </div>
          </div>
        </div>
      </div>

      {/* Recommendation bar */}
      <div className="px-6 py-2.5 border-y border-white/5 flex items-center gap-4 flex-shrink-0 bg-navy-900/30">
        <div className={clsx('px-4 py-1.5 rounded-lg border font-bold text-sm', recColor)}>STRATA: {rec.toUpperCase()}</div>
        <p className="text-sm text-slate-400">
          {rec === 'Buy' && 'Priced near fair value with strong cash flow. Meets your LTR strategy targets.'}
          {rec === 'Negotiate' && `Target offer: ${fmt.currency(property.fairValueLow)}–${fmt.currency(property.fairValueHigh)}. List price is above estimated value.`}
          {rec === 'Watch' && 'Marginal at current price. Set a price drop alert.'}
          {rec === 'Avoid' && 'Does not meet return thresholds at any reasonable assumption.'}
        </p>
        <div className="ml-auto flex items-center gap-1 text-xs text-slate-600">
          <Info size={11} /> Based on {priceHistory.length} comps · {property.riskFlags.length} risk factors · current market
        </div>
      </div>

      {/* Tabs */}
      <div className="px-6 border-b border-white/5 flex gap-6 flex-shrink-0">
        {TABS.map(t => (
          <button key={t} onClick={() => setActiveTab(t)} className={clsx('py-3 text-sm font-medium transition-all', activeTab === t ? 'tab-active' : 'tab-inactive')}>{t}</button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-5">
        {activeTab === 'Overview' && <OverviewTab p={property} />}
        {activeTab === 'Financials' && <FinancialsTab p={property} />}
        {activeTab === 'Valuation' && <ValuationTab p={property} />}
        {activeTab === 'Risk' && <RiskTab p={property} />}
        {activeTab === 'Market' && <MarketTab p={property} />}
        {activeTab === 'History' && <HistoryTab />}
      </div>
    </div>
  );
}

function OverviewTab({ p }: { p: Property }) {
  return (
    <div className="grid grid-cols-3 gap-5">
      <div className="col-span-2 space-y-4">
        <div className="grid grid-cols-4 gap-3">
          <StatCard label="Cap Rate" value={fmt.pct(p.capRate)} sub="at list price" color="gold" />
          <StatCard label="Cash Flow" value={`+${fmt.currency(p.cashFlow)}/mo`} sub="est. after expenses" color="green" />
          <StatCard label="CoC Return" value={fmt.pct(p.cashOnCash)} sub="25% down" color="green" />
          <StatCard label="Strategy Fit" value={`${p.strategyFit}/100`} sub="vs your LTR criteria" color="gold" />
        </div>
        <div className="glass rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2"><Home size={14} className="text-amber-500" /> Property Details</h3>
          <div className="grid grid-cols-2 gap-x-8">
            <div>
              <MetricRow label="List Price" value={fmt.currency(p.price)} />
              <MetricRow label="Price / SqFt" value={fmt.currency(Math.round(p.price / p.sqft))} />
              <MetricRow label="Year Built" value={String(p.yearBuilt)} />
              <MetricRow label="Living Area" value={`${fmt.num(p.sqft)} sqft`} />
              <MetricRow label="Lot Size" value={`${fmt.num(p.lotSqft)} sqft`} />
            </div>
            <div>
              <MetricRow label="Beds / Baths" value={`${p.beds} / ${p.baths}`} />
              <MetricRow label="Property Type" value={p.type} />
              <MetricRow label="Days on Market" value={`${p.daysOnMarket} days`} />
              <MetricRow label="Market Regime" value={p.marketRegime} />
              <MetricRow label="Neighborhood Score" value={`${p.neighborhoodScore}/100`} highlight />
            </div>
          </div>
        </div>
        <div className="glass rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2"><AlertTriangle size={14} className="text-amber-500" /> Risk Flags ({p.riskFlags.length})</h3>
          <div className="flex flex-wrap gap-2">
            {p.riskFlags.map((f, i) => <FlagBadge key={i} label={f.label} severity={f.severity} />)}
          </div>
        </div>
      </div>
      <div className="space-y-4">
        <div className="glass rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-2">Rent Estimate</h3>
          <p className="text-3xl font-bold font-mono text-white">{fmt.currency(p.rentEstMid)}<span className="text-sm text-slate-400">/mo</span></p>
          <p className="text-xs text-slate-500 mt-0.5">{fmt.currency(p.rentEstLow)} – {fmt.currency(p.rentEstHigh)}</p>
          <div className="mt-2"><ConfidencePill level={p.rentConfidence} /></div>
        </div>
        <div className="glass rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-2">Fair Value</h3>
          <p className="text-2xl font-bold font-mono text-white">{fmt.compact(p.fairValueLow)}–{fmt.compact(p.fairValueHigh)}</p>
          <p className={clsx('text-sm font-semibold mt-1', p.priceVsFairValue <= 0 ? 'text-emerald-400' : 'text-red-400')}>
            {p.priceVsFairValue <= 0 ? `${Math.abs(p.priceVsFairValue).toFixed(1)}% below` : `${p.priceVsFairValue.toFixed(1)}% above`} estimate
          </p>
          <div className="mt-2"><ConfidencePill level={p.valuationConfidence} /></div>
        </div>
        <div className="glass rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-3">Neighborhood</h3>
          <div className="flex items-center gap-3 mb-3">
            <div className="text-2xl font-bold font-mono text-amber-400">{p.neighborhoodScore}</div>
            <div className="flex-1"><ProgressBar value={p.neighborhoodScore} color="gold" /></div>
          </div>
          {[{ label: 'Schools', value: 72 }, { label: 'Safety', value: p.riskScore > 50 ? 55 : 78 }, { label: 'Walkability', value: 61 }, { label: 'Amenities', value: 80 }].map(s => (
            <div key={s.label} className="flex items-center gap-2 mb-2">
              <span className="text-xs text-slate-500 w-20">{s.label}</span>
              <div className="flex-1"><ProgressBar value={s.value} color={s.value >= 70 ? 'green' : s.value >= 50 ? 'gold' : 'red'} /></div>
              <span className="text-xs font-mono text-slate-400 w-6 text-right">{s.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function FinancialsTab({ p }: { p: Property }) {
  const [downPct, setDownPct] = useState(25);
  const [rate, setRate] = useState(7.25);
  const [vacPct, setVacPct] = useState(6);
  const [mgmtPct, setMgmtPct] = useState(8);

  const down = p.price * (downPct / 100);
  const loan = p.price - down;
  const mr = rate / 100 / 12;
  const mtg = loan * (mr * Math.pow(1 + mr, 360)) / (Math.pow(1 + mr, 360) - 1);
  const egi = p.rentEstMid * (1 - vacPct / 100);
  const opex = egi * (mgmtPct / 100) + (p.price * 0.022 / 12) + 140 + (p.price * 0.01 / 12);
  const noi = egi - opex;
  const cf = noi - mtg;
  const coc = ((cf * 12) / (down + 8500)) * 100;
  const cap = (noi * 12 / p.price) * 100;
  const dscr = noi / mtg;

  return (
    <div className="grid grid-cols-3 gap-5">
      <div className="space-y-4">
        <div className="glass rounded-xl p-5">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">Assumptions</p>
          {[
            { label: 'Down Payment', val: `${downPct}% · ${fmt.compact(down)}`, min: 5, max: 100, step: 1, value: downPct, set: setDownPct },
            { label: 'Interest Rate', val: `${rate.toFixed(2)}%`, min: 4, max: 12, step: 0.125, value: rate, set: setRate },
            { label: 'Vacancy Rate', val: `${vacPct}%`, min: 0, max: 20, step: 1, value: vacPct, set: setVacPct },
            { label: 'Mgmt Fee', val: `${mgmtPct}%`, min: 0, max: 15, step: 0.5, value: mgmtPct, set: setMgmtPct },
          ].map(a => (
            <div key={a.label} className="mb-4">
              <label className="text-xs text-slate-500 flex justify-between mb-1.5"><span>{a.label}</span><span className="text-amber-400 font-mono">{a.val}</span></label>
              <input type="range" min={a.min} max={a.max} step={a.step} value={a.value} onChange={e => a.set(+e.target.value)} />
            </div>
          ))}
        </div>
      </div>
      <div className="col-span-2 space-y-4">
        <div className="grid grid-cols-4 gap-3">
          <StatCard label="Cash Flow" value={`${cf >= 0 ? '+' : ''}${fmt.currency(cf)}/mo`} color={cf >= 0 ? 'green' : 'red'} />
          <StatCard label="Cap Rate" value={fmt.pct(cap)} color="gold" />
          <StatCard label="CoC Return" value={fmt.pct(coc)} color={coc >= 6 ? 'green' : 'default'} />
          <StatCard label="DSCR" value={dscr.toFixed(2)} sub={dscr >= 1.25 ? '✓ Qualifies' : '✗ Below min'} color={dscr >= 1.25 ? 'green' : 'red'} />
        </div>
        <div className="glass rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-4">Monthly P&L</h3>
          <div className="grid grid-cols-2 gap-8">
            <div>
              <p className="text-xs text-emerald-400 font-semibold mb-2 uppercase tracking-wide">Income</p>
              <MetricRow label="Gross Rent" value={fmt.currency(p.rentEstMid)} />
              <MetricRow label="Vacancy Loss" value={`-${fmt.currency(p.rentEstMid * vacPct / 100)}`} />
              <MetricRow label="Eff. Gross Income" value={fmt.currency(egi)} highlight />
            </div>
            <div>
              <p className="text-xs text-red-400 font-semibold mb-2 uppercase tracking-wide">Expenses</p>
              <MetricRow label="Mortgage" value={fmt.currency(mtg)} />
              <MetricRow label="Tax + Insurance" value={fmt.currency(p.price * 0.022 / 12 + 140)} />
              <MetricRow label="Mgmt + Maint." value={fmt.currency(opex - (p.price * 0.022 / 12 + 140))} />
              <MetricRow label="Total" value={fmt.currency(mtg + opex)} highlight />
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-white/10 flex items-center justify-between">
            <span className="text-sm font-semibold text-white">Net Monthly Cash Flow</span>
            <span className={clsx('text-2xl font-bold font-mono', cf >= 0 ? 'text-emerald-400' : 'text-red-400')}>{cf >= 0 ? '+' : ''}{fmt.currency(cf)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function ValuationTab({ p }: { p: Property }) {
  return (
    <div className="grid grid-cols-3 gap-5">
      <div className="col-span-2 space-y-4">
        <div className="glass rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-white">STRATA Fair Value Estimate</h3>
            <ConfidencePill level={p.valuationConfidence} />
          </div>
          <p className="text-3xl font-bold font-mono text-white mb-1">{fmt.currency(p.fairValueLow)} – {fmt.currency(p.fairValueHigh)}</p>
          <p className={clsx('text-base font-semibold', p.priceVsFairValue <= 0 ? 'text-emerald-400' : 'text-red-400')}>
            List price is {p.priceVsFairValue <= 0 ? `${Math.abs(p.priceVsFairValue).toFixed(1)}% below` : `${p.priceVsFairValue.toFixed(1)}% above`} mid-point estimate
          </p>
        </div>
        <div className="glass rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-3">How We Got Here</h3>
          {[
            { method: 'Comp-Based AVM (60% weight)', result: fmt.currency(Math.round((p.fairValueLow + p.fairValueHigh) / 2 - 3000)), note: '9 comps · avg. 72 days old' },
            { method: 'Income Approach (25% weight)', result: fmt.currency(Math.round((p.fairValueLow + p.fairValueHigh) / 2 + 2000)), note: `Based on ${fmt.currency(p.rentEstMid)}/mo rent at 5.4% cap rate` },
            { method: 'Hedonic Pricing (15% weight)', result: fmt.currency(Math.round((p.fairValueLow + p.fairValueHigh) / 2 - 5000)), note: `School quality 72 · walkability 61` },
          ].map(m => (
            <div key={m.method} className="flex items-center justify-between p-3 rounded-lg bg-white/3 border border-white/5 mb-2">
              <div><p className="text-sm text-white font-medium">{m.method}</p><p className="text-xs text-slate-500">{m.note}</p></div>
              <span className="text-sm font-mono font-bold text-amber-400">{m.result}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="space-y-4">
        <div className="glass rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-3">Price History</h3>
          <div className="h-36">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={priceHistory}>
                <defs><linearGradient id="pg" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#C9A84C" stopOpacity={0.3} /><stop offset="95%" stopColor="#C9A84C" stopOpacity={0} /></linearGradient></defs>
                <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#64748b', fontSize: 9 }} axisLine={false} tickLine={false} tickFormatter={v => `$${fmt.compact(v)}`} />
                <Tooltip contentStyle={{ background: '#112240', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 11 }} formatter={(v: any) => [fmt.currency(v), 'Price']} />
                <Area type="monotone" dataKey="price" stroke="#C9A84C" strokeWidth={2} fill="url(#pg)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="glass rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-3">Comparable Sales</h3>
          {[{ address: '4490 Oak Creek Dr', price: 338000, sqft: 1820, daysAgo: 34 }, { address: '521 Hillcrest Ave', price: 318000, sqft: 1760, daysAgo: 61 }, { address: '6102 Lakeview Blvd', price: 352000, sqft: 1910, daysAgo: 48 }].map(c => (
            <div key={c.address} className="flex justify-between items-center py-2 border-b border-white/5 last:border-0">
              <div><p className="text-xs text-white">{c.address}</p><p className="text-[10px] text-slate-500">{fmt.num(c.sqft)} sqft · {c.daysAgo}d ago</p></div>
              <div className="text-right"><p className="text-xs font-mono font-semibold text-white">{fmt.currency(c.price)}</p><p className="text-[10px] text-slate-500">{fmt.currency(Math.round(c.price / c.sqft))}/sqft</p></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function RiskTab({ p }: { p: Property }) {
  const risks = [
    { category: 'Market Risk', score: 28, note: 'Balanced market with stable price velocity.', icon: TrendingUp },
    { category: 'Pricing Risk', score: p.priceVsFairValue <= 0 ? 20 : 55, note: `List price ${Math.abs(p.priceVsFairValue).toFixed(1)}% ${p.priceVsFairValue <= 0 ? 'below' : 'above'} fair value estimate.`, icon: Home },
    { category: 'Tenant Risk', score: 32, note: 'Strong rental demand in this submarket.', icon: Shield },
    { category: 'Climate / Flood Risk', score: 22, note: 'Not in a FEMA flood zone. Moderate hail risk.', icon: AlertTriangle },
    { category: 'Condition Risk', score: p.riskFlags.find(f => f.severity === 'High') ? 62 : 38, note: `Est. ${p.riskFlags.find(f => f.severity === 'High') ? '$18K–$28K' : '$8K–$15K'} deferred maintenance.`, icon: Home },
    { category: 'Tax / Assessment Risk', score: 35, note: 'TX 2.2% effective rate. No reassessment flag.', icon: Landmark },
  ];
  const composite = Math.round(risks.reduce((s, r) => s + r.score, 0) / risks.length);

  return (
    <div className="grid grid-cols-3 gap-5">
      <div className="col-span-2 space-y-3">
        <div className="glass rounded-xl p-5 mb-2">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-white">Composite Risk Score</h3>
            <RiskBadge score={composite} />
          </div>
          <ProgressBar value={composite} color={composite <= 30 ? 'green' : composite <= 55 ? 'gold' : 'red'} />
          <p className="text-xs text-slate-500 mt-2">Based on {risks.length} risk dimensions. Lower is better.</p>
        </div>
        {risks.map(r => (
          <div key={r.category} className="glass rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2"><r.icon size={14} className="text-slate-400" /><span className="text-sm font-medium text-white">{r.category}</span></div>
              <span className={clsx('text-xs font-semibold font-mono', r.score <= 30 ? 'text-emerald-400' : r.score <= 55 ? 'text-amber-400' : 'text-red-400')}>{r.score}/100</span>
            </div>
            <ProgressBar value={r.score} color={r.score <= 30 ? 'green' : r.score <= 55 ? 'gold' : 'red'} />
            <p className="text-xs text-slate-500 mt-1.5">{r.note}</p>
          </div>
        ))}
      </div>
      <div className="space-y-4">
        <div className="glass rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2"><ThumbsUp size={14} className="text-emerald-400" /> Strengths</h3>
          {['Strong rental demand', 'No flood zone exposure', 'Carrier availability in Texas', 'Tax rate in line with market'].map((s, i) => (
            <div key={i} className="flex items-start gap-2 mb-2"><span className="text-emerald-400">✓</span><span className="text-xs text-slate-400">{s}</span></div>
          ))}
        </div>
        <div className="glass rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2"><ThumbsDown size={14} className="text-red-400" /> Watch Points</h3>
          {p.riskFlags.map((f, i) => (
            <div key={i} className="flex items-start gap-2 mb-2"><span className="text-amber-400">!</span><span className="text-xs text-slate-400">{f.label}</span></div>
          ))}
        </div>
        <div className="glass rounded-xl p-4 border border-amber-500/20">
          <h3 className="text-xs font-semibold text-amber-400 mb-1 flex items-center gap-2"><Clock size={12} /> Data Freshness</h3>
          <p className="text-xs text-slate-400">Risk assessment updated <span className="text-white">2 hours ago</span>. Comp avg: <span className="text-white">72 days</span>.</p>
        </div>
      </div>
    </div>
  );
}

function MarketTab({ p }: { p: Property }) {
  return (
    <div className="grid grid-cols-2 gap-5">
      <div className="glass rounded-xl p-5">
        <h3 className="text-sm font-semibold text-white mb-4">Dallas Market Overview</h3>
        <MetricRow label="Market Regime" value="Balanced" />
        <MetricRow label="Median Price" value="$342,000" />
        <MetricRow label="Price Growth 12mo" value="+4.2%" highlight />
        <MetricRow label="Active Inventory" value="2.3 months" />
        <MetricRow label="Median DOM" value="28 days" />
        <MetricRow label="List-to-Sale Ratio" value="97.2%" />
        <MetricRow label="Price Reductions" value="31% of listings" />
      </div>
      <div className="glass rounded-xl p-5">
        <h3 className="text-sm font-semibold text-white mb-4">Rental Market — {p.zip}</h3>
        <MetricRow label="Median Rent (3/2 SFR)" value={fmt.currency(p.rentEstMid)} />
        <MetricRow label="Rent Growth 12mo" value="+3.1%" highlight />
        <MetricRow label="Vacancy Rate" value="4.8%" />
        <MetricRow label="Rent Yield" value={fmt.pct(p.capRate + 1.2)} />
        <MetricRow label="New Supply in Pipeline" value="240 units (12mo)" />
      </div>
    </div>
  );
}

function HistoryTab() {
  return (
    <div className="space-y-4">
      <div className="glass rounded-xl p-5">
        <h3 className="text-sm font-semibold text-white mb-4">Price History</h3>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={priceHistory}>
              <defs><linearGradient id="pg2" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#C9A84C" stopOpacity={0.3} /><stop offset="95%" stopColor="#C9A84C" stopOpacity={0} /></linearGradient></defs>
              <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `$${fmt.compact(v)}`} />
              <Tooltip contentStyle={{ background: '#112240', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 }} formatter={(v: any) => [fmt.currency(v), 'Price']} />
              <Area type="monotone" dataKey="price" stroke="#C9A84C" strokeWidth={2} fill="url(#pg2)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="glass rounded-xl p-5">
        <h3 className="text-sm font-semibold text-white mb-4">Ownership History</h3>
        {[
          { date: 'Apr 2024', event: 'Listed for sale', price: '$342,000', detail: 'MLS #DL2400823' },
          { date: 'Jun 2019', event: 'Sold', price: '$268,000', detail: 'Conventional loan · Warranty deed' },
          { date: 'Mar 2012', event: 'Sold', price: '$198,000', detail: 'Conventional loan' },
          { date: 'Nov 2001', event: 'New construction', price: '$164,000', detail: 'Original sale' },
        ].map((e, i) => (
          <div key={i} className="flex items-start gap-4 py-3 border-b border-white/5 last:border-0">
            <div className="text-xs text-slate-500 w-20 flex-shrink-0 pt-0.5">{e.date}</div>
            <div className="w-2 h-2 rounded-full bg-amber-500 mt-1.5 flex-shrink-0" />
            <div className="flex-1"><p className="text-sm text-white font-medium">{e.event}</p><p className="text-xs text-slate-500">{e.detail}</p></div>
            <div className="text-sm font-mono font-semibold text-amber-400">{e.price}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
