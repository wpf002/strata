import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Map, List, TrendingUp, SlidersHorizontal, Star, Bell } from 'lucide-react';
import { getProperties } from '../api/client';
import type { Property, SearchFilters } from '../types';
import { ScoreBadge, RiskBadge, RegimeBadge, FlagBadge, ConfidencePill, fmt } from '../components/UI';
import { clsx } from 'clsx';

const SORT_OPTIONS = ['Deal Score', 'Price', 'Cap Rate', 'Cash Flow', 'Days on Market'];
const STRATEGIES = ['LTR', 'STR', 'BRRRR', 'Flip', 'House Hack'];

export default function SearchPage() {
  const navigate = useNavigate();
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'list' | 'map'>('list');
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<Partial<SearchFilters>>({
    query: 'Dallas, TX',
    minDealScore: 0,
    maxPrice: 600000,
    sortBy: 'Deal Score',
    strategies: ['LTR'],
  });

  useEffect(() => {
    setLoading(true);
    getProperties(filters).then(data => {
      setProperties(data);
      setLoading(false);
    });
  }, [filters]);

  const toggleStrategy = (s: string) => {
    setFilters(f => ({
      ...f,
      strategies: f.strategies?.includes(s)
        ? f.strategies.filter(x => x !== s)
        : [...(f.strategies || []), s],
    }));
  };

  return (
    <div className="flex flex-col h-full page-fade">
      {/* Search bar */}
      <div className="px-6 py-4 border-b border-white/5 flex items-center gap-3 flex-shrink-0">
        <div className="relative flex-1 max-w-sm">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            className="strata-input pl-9"
            value={filters.query}
            onChange={e => setFilters(f => ({ ...f, query: e.target.value }))}
            placeholder="City, ZIP, neighborhood…"
          />
        </div>

        <div className="flex items-center gap-1.5">
          {STRATEGIES.map(s => (
            <button
              key={s}
              onClick={() => toggleStrategy(s)}
              className={clsx(
                'text-xs font-semibold px-3 py-1.5 rounded-full border transition-all',
                filters.strategies?.includes(s)
                  ? 'bg-amber-500/15 text-amber-400 border-amber-500/40'
                  : 'text-slate-500 border-white/10 hover:border-white/20 hover:text-slate-400'
              )}
            >{s}</button>
          ))}
        </div>

        <select
          className="strata-input w-auto text-sm"
          value={filters.sortBy}
          onChange={e => setFilters(f => ({ ...f, sortBy: e.target.value }))}
        >
          {SORT_OPTIONS.map(o => <option key={o}>{o}</option>)}
        </select>

        <button
          onClick={() => setShowFilters(!showFilters)}
          className={clsx('btn-ghost text-sm', showFilters && 'border-amber-500/40 text-amber-400')}
        >
          <SlidersHorizontal size={14} /> Filters
        </button>

        <div className="flex rounded-lg overflow-hidden border border-white/10">
          {(['list', 'map'] as const).map(v => (
            <button key={v} onClick={() => setView(v)} className={clsx('px-3 py-2 transition-all', view === v ? 'bg-amber-500/20 text-amber-400' : 'text-slate-500 hover:text-slate-400')}>
              {v === 'list' ? <List size={14} /> : <Map size={14} />}
            </button>
          ))}
        </div>
      </div>

      {/* Filter panel */}
      {showFilters && (
        <div className="px-6 py-4 border-b border-white/5 glass flex items-center gap-8 flex-shrink-0">
          <div className="flex flex-col gap-1 min-w-[200px]">
            <label className="text-xs text-slate-500 font-medium">Min Deal Score: <span className="text-amber-400 font-mono">{filters.minDealScore}</span></label>
            <input type="range" min={0} max={100} value={filters.minDealScore} onChange={e => setFilters(f => ({ ...f, minDealScore: +e.target.value }))} />
          </div>
          <div className="flex flex-col gap-1 min-w-[200px]">
            <label className="text-xs text-slate-500 font-medium">Max Price: <span className="text-amber-400 font-mono">{fmt.currency(filters.maxPrice || 600000)}</span></label>
            <input type="range" min={100000} max={1000000} step={10000} value={filters.maxPrice} onChange={e => setFilters(f => ({ ...f, maxPrice: +e.target.value }))} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-500 font-medium">Property Type</label>
            <div className="flex gap-2">
              {['SFR', 'Condo', 'Duplex', 'Multi'].map(t => (
                <button key={t} className="text-xs px-2.5 py-1.5 rounded border border-white/10 text-slate-400 hover:border-amber-500/30 hover:text-amber-400 transition-all">{t}</button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-500 font-medium">Min Cap Rate</label>
            <select className="strata-input w-28 text-sm py-1.5">
              <option>Any</option><option>4%+</option><option>5%+</option><option>6%+</option><option>7%+</option>
            </select>
          </div>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* Results */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-lg font-semibold text-white">Opportunity Feed</h1>
              <p className="text-sm text-slate-500">
                <span className="text-amber-400 font-mono font-semibold">{properties.length}</span> properties · {filters.query} · Sorted by {filters.sortBy}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button className="btn-ghost text-xs py-1.5 px-3"><Bell size={12} /> Save Search</button>
              <button className="btn-ghost text-xs py-1.5 px-3"><Star size={12} /> Watchlist</button>
            </div>
          </div>

          {loading ? (
            <div className="space-y-3">
              {[1,2,3].map(i => <div key={i} className="glass rounded-xl h-36 animate-pulse" />)}
            </div>
          ) : (
            <div className="space-y-3">
              {properties.map((p, i) => (
                <PropertyCard key={p.id} property={p} index={i} onSelect={() => navigate(`/intelligence/${p.id}`)} onUnderwrite={() => navigate(`/underwrite?property=${p.id}`)} />
              ))}
            </div>
          )}
        </div>

        {/* Market sidebar */}
        <div className="w-60 flex-shrink-0 border-l border-white/5 overflow-y-auto px-4 py-4">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Dallas Market</p>
          <div className="space-y-0.5">
            {[
              { label: 'Regime', value: 'Balanced', color: 'text-amber-400' },
              { label: 'Median Price', value: '$342K', color: 'text-white' },
              { label: 'Price Trend 12mo', value: '+4.2%', color: 'text-emerald-400' },
              { label: 'Inventory', value: '2.3 mo', color: 'text-white' },
              { label: 'Avg DOM', value: '28 days', color: 'text-white' },
              { label: 'List/Sale Ratio', value: '97.2%', color: 'text-white' },
              { label: 'Cap Rate Median', value: '5.4%', color: 'text-amber-400' },
              { label: 'Rent Growth 12mo', value: '+3.1%', color: 'text-emerald-400' },
              { label: 'Vacancy Rate', value: '4.8%', color: 'text-white' },
            ].map(m => (
              <div key={m.label} className="flex justify-between items-center py-2 border-b border-white/5 last:border-0">
                <span className="text-xs text-slate-500">{m.label}</span>
                <span className={clsx('text-xs font-mono font-semibold', m.color)}>{m.value}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 p-3 rounded-lg border border-amber-500/20 bg-amber-500/5">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp size={12} className="text-amber-400" />
              <span className="text-xs font-semibold text-amber-400">Market Alert</span>
            </div>
            <p className="text-xs text-slate-400">Inventory down 18% in 60 days. Act on quality deals before competition increases.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function PropertyCard({ property: p, index: i, onSelect, onUnderwrite }: {
  property: Property; index: number; onSelect: () => void; onUnderwrite: () => void;
}) {
  return (
    <div className="property-card glass rounded-xl overflow-hidden border border-white/5" onClick={onSelect}>
      <div className="flex">
        <div className="w-44 flex-shrink-0 relative">
          <img src={p.image} alt={p.address} className="w-full h-full object-cover" style={{ height: 148 }} />
          <div className="absolute inset-0 bg-gradient-to-r from-transparent to-navy-900/40" />
          {i === 0 && <div className="absolute top-2 left-2 bg-amber-500 text-slate-900 text-[10px] font-bold px-2 py-0.5 rounded-full">TOP PICK</div>}
        </div>

        <div className="flex-1 px-5 py-3.5">
          <div className="flex items-start justify-between mb-2">
            <div>
              <p className="text-white font-semibold">{p.address}</p>
              <p className="text-slate-400 text-xs mt-0.5">{p.city}, {p.state} {p.zip} · {p.neighborhood} · <RegimeBadge regime={p.marketRegime} /></p>
            </div>
            <div className="flex items-center gap-2 ml-4 flex-shrink-0">
              <ScoreBadge score={p.dealScore} />
              <RiskBadge score={p.riskScore} />
            </div>
          </div>

          <div className="grid grid-cols-6 gap-3 mb-3">
            <Metric label="Price" value={fmt.compact(p.price)} />
            <Metric label="Cap Rate" value={fmt.pct(p.capRate)} highlight />
            <Metric label="Cash Flow" value={`${p.cashFlow >= 0 ? '+' : ''}${fmt.currency(p.cashFlow)}/mo`} positive={p.cashFlow >= 0} />
            <Metric label="CoC" value={fmt.pct(p.cashOnCash)} />
            <Metric label="Rent Est." value={fmt.compact(p.rentEstMid)} />
            <Metric label="DOM" value={`${p.daysOnMarket}d`} />
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {p.riskFlags.slice(0, 2).map((f, fi) => <FlagBadge key={fi} label={f.label} severity={f.severity} />)}
            {p.riskFlags.length > 2 && <span className="text-xs text-slate-500">+{p.riskFlags.length - 2} more</span>}
            <div className="ml-auto"><ConfidencePill level={p.valuationConfidence} /></div>
          </div>
        </div>

        <div className="w-32 flex-shrink-0 flex flex-col items-center justify-center bg-navy-900/40 border-l border-white/5 gap-3 px-3">
          <div className="text-center">
            <p className="text-[10px] text-slate-500 mb-0.5">Fair Value</p>
            <p className="text-xs font-mono text-white">{fmt.compact(p.fairValueLow)}–{fmt.compact(p.fairValueHigh)}</p>
            <p className={clsx('text-xs font-semibold mt-0.5', p.priceVsFairValue <= 0 ? 'text-emerald-400' : 'text-red-400')}>
              {p.priceVsFairValue <= 0 ? '▼' : '▲'} {Math.abs(p.priceVsFairValue).toFixed(1)}% vs est.
            </p>
          </div>
          <button className="btn-primary text-xs py-2 px-3 w-full justify-center" onClick={e => { e.stopPropagation(); onUnderwrite(); }}>Underwrite</button>
          <button className="btn-ghost text-xs py-1.5 px-3 w-full justify-center" onClick={e => e.stopPropagation()}><Star size={11} /> Watch</button>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value, positive, highlight }: { label: string; value: string; positive?: boolean; highlight?: boolean }) {
  const color = positive === true ? 'text-emerald-400' : positive === false ? 'text-red-400' : highlight ? 'text-amber-400' : 'text-white';
  return (
    <div>
      <p className="text-[10px] text-slate-500 mb-0.5">{label}</p>
      <p className={clsx('text-sm font-semibold font-mono', color)}>{value}</p>
    </div>
  );
}
