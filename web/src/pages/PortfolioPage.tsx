import { useState, useEffect } from 'react';
import { Plus, ArrowUpRight, RefreshCw, AlertCircle, DollarSign, Building2, TrendingUp } from 'lucide-react';
import { getPortfolio } from '../api/client';
import type { Portfolio, PortfolioHolding } from '../types';
import { StatCard, MetricRow, ProgressBar, fmt } from '../components/UI';
import { clsx } from 'clsx';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, Cell } from 'recharts';
import { chartDataPortfolioEquity } from '../data/mockData';

export default function PortfolioPage() {
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [activeId, setActiveId] = useState<string>('ph1');

  useEffect(() => {
    getPortfolio().then(p => { setPortfolio(p); setActiveId(p.holdings[0]?.id); });
  }, []);

  if (!portfolio) return <div className="flex items-center justify-center h-full"><div className="glass rounded-xl w-80 h-40 animate-pulse" /></div>;

  const active = portfolio.holdings.find(h => h.id === activeId) || portfolio.holdings[0];
  const cashFlowData = portfolio.holdings.map(h => ({
    name: h.address.split(',')[0].split(' ').slice(-2).join(' '),
    value: h.cashFlow,
  }));

  return (
    <div className="flex flex-col h-full page-fade overflow-hidden">
      <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-lg font-semibold text-white">Portfolio</h1>
          <p className="text-sm text-slate-500">{portfolio.holdings.length} properties · Health Score: <span className="text-amber-400 font-mono font-semibold">{portfolio.healthScore}/100</span></p>
        </div>
        <div className="flex items-center gap-3">
          <button className="btn-ghost text-sm"><RefreshCw size={14} /> Refresh Values</button>
          <button className="btn-primary text-sm"><Plus size={14} /> Add Property</button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar */}
        <div className="w-[360px] flex-shrink-0 border-r border-white/5 flex flex-col overflow-hidden">
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
                  <img src={h.image} alt="" className="w-14 h-14 rounded-lg object-cover flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{h.address.split(',')[0]}</p>
                    <p className="text-xs text-slate-500 truncate">{h.address.split(',').slice(1).join(',').trim()}</p>
                    <div className="flex items-center gap-3 mt-2">
                      <div><p className="text-[10px] text-slate-500">Equity</p><p className="text-sm font-bold font-mono text-white">{fmt.compact(h.equity)}</p></div>
                      <div><p className="text-[10px] text-slate-500">Cash Flow</p><p className="text-sm font-bold font-mono text-emerald-400">+{fmt.currency(h.cashFlow)}</p></div>
                      <div className="ml-auto"><RecBadge rec={h.recommendation} /></div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
            <div className="border border-dashed border-white/10 rounded-xl p-4 flex items-center justify-center gap-2 text-slate-600 hover:text-slate-400 hover:border-white/20 cursor-pointer transition-all">
              <Plus size={14} /><span className="text-sm">Add Property</span>
            </div>
          </div>
        </div>

        {/* Right detail */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <div className="grid grid-cols-3 gap-4 mb-5">
            <StatCard label="Current Value" value={fmt.compact(active.currentValue)} sub={`Purchased ${fmt.compact(active.purchasePrice)}`} color="gold" trend={active.appreciation} />
            <StatCard label="Equity" value={fmt.compact(active.equity)} sub={`${fmt.pct((active.equity / active.currentValue) * 100)} equity`} color="green" />
            <StatCard label="Total Return" value={fmt.pct(active.totalReturn)} sub="appreciation + cash flow" color="green" />
          </div>

          <div className="grid grid-cols-2 gap-5 mb-5">
            <div className="glass rounded-xl p-5">
              <h3 className="text-sm font-semibold text-white mb-3">Portfolio Equity Growth</h3>
              <div className="h-36">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartDataPortfolioEquity}>
                    <defs><linearGradient id="eqg" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#34d399" stopOpacity={0.3} /><stop offset="95%" stopColor="#34d399" stopOpacity={0} /></linearGradient></defs>
                    <XAxis dataKey="month" tick={{ fill: '#64748b', fontSize: 9 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#64748b', fontSize: 9 }} axisLine={false} tickLine={false} tickFormatter={v => `$${fmt.compact(v)}`} />
                    <Tooltip contentStyle={{ background: '#112240', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 11 }} formatter={(v: any) => [fmt.currency(v), 'Equity']} />
                    <Area type="monotone" dataKey="value" stroke="#34d399" strokeWidth={2} fill="url(#eqg)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
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

          <div className="grid grid-cols-2 gap-5">
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
              <div className="glass rounded-xl p-5">
                <h3 className="text-sm font-semibold text-white mb-3">Portfolio Concentration</h3>
                {[{ label: 'Texas', pct: 67, warn: true }, { label: 'Arizona', pct: 33, warn: false }].map(c => (
                  <div key={c.label} className="mb-3">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-slate-400">{c.label}</span>
                      <span className={clsx('font-mono font-semibold', c.warn ? 'text-amber-400' : 'text-white')}>{c.pct}%</span>
                    </div>
                    <ProgressBar value={c.pct} color={c.warn ? 'gold' : 'green'} />
                  </div>
                ))}
                <div className="flex items-start gap-2 mt-3 p-2.5 rounded-lg bg-amber-400/5 border border-amber-400/20">
                  <AlertCircle size={12} className="text-amber-400 mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-amber-400/80">Texas at 67% — above recommended 50% max. Diversify next acquisition.</p>
                </div>
              </div>
              <div className="glass rounded-xl p-5">
                <h3 className="text-sm font-semibold text-white mb-3">Quick Actions</h3>
                <div className="space-y-2">
                  {[
                    { icon: RefreshCw, label: 'Model a Refinance', color: 'text-amber-400' },
                    { icon: ArrowUpRight, label: 'Run Disposition Analysis', color: 'text-emerald-400' },
                    { icon: DollarSign, label: 'Tax & Depreciation View', color: 'text-blue-400' },
                    { icon: Building2, label: 'Update Actuals', color: 'text-slate-400' },
                  ].map(a => (
                    <button key={a.label} className="w-full btn-ghost text-sm justify-start gap-3">
                      <a.icon size={14} className={a.color} /> {a.label}
                    </button>
                  ))}
                </div>
              </div>
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
