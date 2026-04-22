import { useState, useEffect } from 'react';
import { Plus, ArrowUpRight, RefreshCw, AlertCircle, DollarSign, Building2, TrendingUp, X, Home, Trash2 } from 'lucide-react';
import { getPortfolio, createHolding, updateHolding, deleteHolding } from '../api/client';
import type { Portfolio, PortfolioHolding } from '../types';
import { StatCard, MetricRow, ProgressBar, fmt } from '../components/UI';
import { clsx } from 'clsx';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, Cell } from 'recharts';
import { chartDataPortfolioEquity } from '../data/mockData';

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
          <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors"><X size={16} /></button>
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
              <input className="strata-input w-full" type="date" value={form.purchaseDate} onChange={set('purchaseDate')} />
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

export default function PortfolioPage() {
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [activeId, setActiveId] = useState<string>('ph1');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingHolding, setEditingHolding] = useState<PortfolioHolding | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
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
        <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between flex-shrink-0">
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

      <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-lg font-semibold text-white">Portfolio</h1>
          <p className="text-sm text-slate-500">{portfolio.holdings.length} properties · Health Score: <span className="text-amber-400 font-mono font-semibold">{portfolio.healthScore}/100</span></p>
        </div>
        <div className="flex items-center gap-3">
          <button className="btn-ghost text-sm" onClick={load}><RefreshCw size={14} /> Refresh Values</button>
          <button className="btn-primary text-sm" onClick={() => setShowAddModal(true)}><Plus size={14} /> Add Property</button>
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
                  <img src={h.image} alt="" className="w-14 h-14 rounded-lg object-cover flex-shrink-0" onError={e => { (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=200&q=60'; }} />
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
                    { icon: RefreshCw, label: 'Model a Refinance', color: 'text-amber-400', onClick: undefined },
                    { icon: ArrowUpRight, label: 'Run Disposition Analysis', color: 'text-emerald-400', onClick: undefined },
                    { icon: DollarSign, label: 'Tax & Depreciation View', color: 'text-blue-400', onClick: undefined },
                    { icon: Building2, label: 'Update Actuals', color: 'text-slate-400', onClick: () => setEditingHolding(active) },
                  ].map(a => (
                    <button key={a.label} className="w-full btn-ghost text-sm justify-start gap-3" onClick={a.onClick}>
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
