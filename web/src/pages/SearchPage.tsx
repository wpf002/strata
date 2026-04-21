import { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Search, Map, List, TrendingUp, SlidersHorizontal, Star, Bell, X, BookmarkCheck, Eye } from 'lucide-react';
import { getProperties, getSavedSearches, createSavedSearch, getWatchlists, createWatchlist, addToWatchlist, removeFromWatchlist } from '../api/client';
import type { Property, SearchFilters } from '../types';
import type { SavedSearch } from '../api/client';
import { ScoreBadge, RiskBadge, RegimeBadge, FlagBadge, ConfidencePill, fmt } from '../components/UI';
import { clsx } from 'clsx';
import MapView from '../components/MapView';

const SORT_OPTIONS = ['Deal Score', 'Price', 'Cap Rate', 'Cash Flow', 'Days on Market'];
const STRATEGIES = ['LTR', 'STR', 'BRRRR', 'Flip', 'House Hack'];

export default function SearchPage() {
  const navigate = useNavigate();
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [view, setView] = useState<'list' | 'map'>('list');
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<Partial<SearchFilters>>({
    query: 'Dallas, TX',
    minDealScore: 0,
    maxPrice: 600000,
    sortBy: 'Deal Score',
    strategies: ['LTR'],
  });

  // Save search modal
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveSearchName, setSaveSearchName] = useState('');
  const [saveSearchLoading, setSaveSearchLoading] = useState(false);
  const [saveToast, setSaveToast] = useState<string | null>(null);

  // Watchlist state
  const [watchedIds, setWatchedIds] = useState<Set<string>>(new Set());
  const [defaultWatchlistId, setDefaultWatchlistId] = useState<string | null>(null);
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
  const [watchlistCount, setWatchlistCount] = useState(0);

  // Map highlight
  const [highlightedId, setHighlightedId] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setFetchError(null);
    getProperties(filters)
      .then(data => setProperties(data))
      .catch(err => { setFetchError(String(err)); setProperties([]); })
      .finally(() => setLoading(false));
  }, [filters]);

  const loadWatchlistData = useCallback(async () => {
    try {
      const [searches, lists] = await Promise.all([getSavedSearches(), getWatchlists()]);
      setSavedSearches(searches);
      const defaultList = lists.find(l => l.name === 'My Watchlist') ?? lists[0];
      if (defaultList) {
        setDefaultWatchlistId(defaultList.id);
        setWatchedIds(new Set(defaultList.propertyIds));
        setWatchlistCount(defaultList.propertyIds.length);
      }
    } catch {
      // not authenticated — silent
    }
  }, []);

  useEffect(() => { loadWatchlistData(); }, [loadWatchlistData]);

  const toggleStrategy = (s: string) => {
    setFilters(f => ({
      ...f,
      strategies: f.strategies?.includes(s)
        ? f.strategies.filter(x => x !== s)
        : [...(f.strategies || []), s],
    }));
  };

  const handleSaveSearch = async () => {
    if (!saveSearchName.trim()) return;
    setSaveSearchLoading(true);
    try {
      await createSavedSearch(saveSearchName.trim(), filters as object);
      setSaveToast('Search saved!');
      setShowSaveModal(false);
      setSaveSearchName('');
      setSavedSearches(prev => [...prev, { id: Date.now().toString(), name: saveSearchName, criteria: filters as object, alertEnabled: false, createdAt: new Date().toISOString() }]);
      setTimeout(() => setSaveToast(null), 3000);
    } catch {
      setSaveToast('Sign in to save searches');
      setTimeout(() => setSaveToast(null), 3000);
    } finally {
      setSaveSearchLoading(false);
    }
  };

  const toggleWatch = async (propertyId: string) => {
    const isCurrentlyWatched = watchedIds.has(propertyId);

    // Local state is the source of truth — toggle immediately and keep it
    if (isCurrentlyWatched) {
      setWatchedIds(prev => { const n = new Set(prev); n.delete(propertyId); return n; });
      setWatchlistCount(c => Math.max(0, c - 1));
    } else {
      setWatchedIds(prev => new Set([...prev, propertyId]));
      setWatchlistCount(c => c + 1);
    }

    // Best-effort server sync — never revert local state on failure
    try {
      let wlId = defaultWatchlistId;
      if (!wlId) {
        const newList = await createWatchlist('My Watchlist');
        wlId = newList.id;
        setDefaultWatchlistId(wlId);
      }
      if (isCurrentlyWatched) {
        await removeFromWatchlist(wlId, propertyId);
      } else {
        await addToWatchlist(wlId, propertyId);
      }
    } catch {
      // sync failed silently — local state stands until next loadWatchlistData
    }
  };

  return (
    <div className="flex flex-col h-full page-fade">
      {/* Toast */}
      {saveToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-sm font-medium shadow-lg whitespace-nowrap">
          {saveToast}
        </div>
      )}

      {/* Save Search Modal */}
      {showSaveModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowSaveModal(false)}>
          <div className="glass rounded-2xl p-6 w-full max-w-sm mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-white">Save Search</h3>
              <button onClick={() => setShowSaveModal(false)} className="text-slate-500 hover:text-white transition-colors"><X size={16} /></button>
            </div>
            <p className="text-sm text-slate-400 mb-4">Give this search a name to find it later and set up alerts.</p>
            <input
              className="strata-input w-full mb-4"
              placeholder="e.g. Dallas LTR under $400K"
              value={saveSearchName}
              onChange={e => setSaveSearchName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSaveSearch()}
              autoFocus
            />
            <div className="flex gap-2">
              <button onClick={() => setShowSaveModal(false)} className="btn-ghost flex-1 justify-center text-sm">Cancel</button>
              <button onClick={handleSaveSearch} disabled={!saveSearchName.trim() || saveSearchLoading} className="btn-primary flex-1 justify-center text-sm">
                {saveSearchLoading ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Search bar */}
      <div className="px-6 py-4 border-b border-white/5 flex items-center gap-3 flex-shrink-0 min-w-0">
        <div className="flex items-center gap-2 flex-shrink-0 w-52 px-3 py-2 rounded-lg border border-white/10 bg-navy-900/80 focus-within:border-amber-500/60">
          <Search size={14} className="text-slate-500 flex-shrink-0" />
          <input
            className="flex-1 min-w-0 bg-transparent outline-none text-sm text-slate-200 placeholder-slate-500 font-sans"
            value={filters.query}
            onChange={e => setFilters(f => ({ ...f, query: e.target.value }))}
            placeholder="City, ZIP, neighborhood…"
          />
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          {STRATEGIES.map(s => (
            <button
              key={s}
              onClick={() => toggleStrategy(s)}
              className={clsx(
                'text-xs font-semibold px-3 py-1.5 rounded-full border transition-all whitespace-nowrap',
                filters.strategies?.includes(s)
                  ? 'bg-amber-500/15 text-amber-400 border-amber-500/40'
                  : 'text-slate-500 border-white/10 hover:border-white/20 hover:text-slate-400'
              )}
            >{s}</button>
          ))}
        </div>

        <div className="flex items-center gap-2 ml-auto flex-shrink-0">
          <select
            className="strata-input text-sm max-w-[140px]"
            value={filters.sortBy}
            onChange={e => setFilters(f => ({ ...f, sortBy: e.target.value }))}
          >
            {SORT_OPTIONS.map(o => <option key={o}>{o}</option>)}
          </select>

          <button
            onClick={() => setShowFilters(!showFilters)}
            className={clsx('btn-ghost text-sm flex-shrink-0', showFilters && 'border-amber-500/40 text-amber-400')}
          >
            <SlidersHorizontal size={14} /> Filters
          </button>

          <div className="flex rounded-lg overflow-hidden border border-white/10 flex-shrink-0">
            {(['list', 'map'] as const).map(v => (
              <button key={v} onClick={() => setView(v)} className={clsx('px-3 py-2 transition-all', view === v ? 'bg-amber-500/20 text-amber-400' : 'text-slate-500 hover:text-slate-400')}>
                {v === 'list' ? <List size={14} /> : <Map size={14} />}
              </button>
            ))}
          </div>
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
        {/* Results / Map */}
        <div className={clsx('flex-1 overflow-hidden', view === 'map' ? 'flex' : 'overflow-y-auto')}>
          {view === 'list' ? (
            <div className="px-6 py-4">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h1 className="text-lg font-semibold text-white">Opportunity Feed</h1>
                  <p className="text-sm text-slate-500">
                    <span className="text-amber-400 font-mono font-semibold">{properties.length}</span> properties · {filters.query} · Sorted by {filters.sortBy}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => setShowSaveModal(true)} className="btn-ghost text-xs py-1.5 px-3"><Bell size={12} /> Save Search</button>
                </div>
              </div>

              {fetchError && (
                <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm font-mono break-all">
                  {fetchError}
                </div>
              )}

              {loading ? (
                <div className="space-y-3">
                  {[1,2,3].map(i => <div key={i} className="glass rounded-xl h-36 animate-pulse" />)}
                </div>
              ) : (
                <div className="space-y-3">
                  {properties.map((p, i) => (
                    <PropertyCard
                      key={p.id}
                      property={p}
                      index={i}
                      isWatched={watchedIds.has(p.id)}
                      isHighlighted={highlightedId === p.id}
                      onSelect={() => navigate(`/intelligence/${p.id}`)}
                      onUnderwrite={() => navigate(`/underwrite?property=${p.id}`)}
                      onWatch={() => toggleWatch(p.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* Map + List split */
            <div className="flex w-full h-full">
              <div className="flex-1 relative">
                <MapView
                  properties={properties}
                  highlightedId={highlightedId}
                  onPinClick={(id: string) => {
                    setHighlightedId(id);
                    document.getElementById(`prop-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  }}
                  onUnderwrite={(id: string) => navigate(`/underwrite?property=${id}`)}
                  watchedIds={watchedIds}
                  onWatch={toggleWatch}
                />
              </div>
              <div className="w-[45%] flex-shrink-0 overflow-y-auto border-l border-white/5 px-4 py-4">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-xs text-slate-500">{properties.length} properties</p>
                  <button onClick={() => setShowSaveModal(true)} className="btn-ghost text-xs py-1 px-2"><Bell size={11} /> Save</button>
                </div>
                {loading ? (
                  <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="glass rounded-xl h-24 animate-pulse" />)}</div>
                ) : (
                  <div className="space-y-2">
                    {properties.map((p, i) => (
                      <div id={`prop-${p.id}`} key={p.id}>
                        <PropertyCard
                          property={p}
                          index={i}
                          isWatched={watchedIds.has(p.id)}
                          isHighlighted={highlightedId === p.id}
                          onSelect={() => navigate(`/intelligence/${p.id}`)}
                          onUnderwrite={() => navigate(`/underwrite?property=${p.id}`)}
                          onWatch={() => toggleWatch(p.id)}
                          compact
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Market sidebar (list view only) */}
        {view === 'list' && (
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

            {/* Saved searches + watchlist counts */}
            <div className="mt-4 space-y-2">
              <div className="flex items-center justify-between p-2.5 rounded-lg border border-white/8 glass">
                <div className="flex items-center gap-2">
                  <BookmarkCheck size={12} className="text-amber-400" />
                  <span className="text-xs text-slate-400">Saved Searches</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-mono font-semibold text-white">{savedSearches.length}</span>
                  <Link to="#" onClick={() => setShowSaveModal(true)} className="text-[10px] text-amber-400 hover:text-amber-300">View all</Link>
                </div>
              </div>
              <div className="flex items-center justify-between p-2.5 rounded-lg border border-white/8 glass">
                <div className="flex items-center gap-2">
                  <Eye size={12} className="text-amber-400" />
                  <span className="text-xs text-slate-400">Watchlist</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-mono font-semibold text-white">{watchlistCount}</span>
                  <span className="text-[10px] text-slate-500">properties</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function PropertyCard({ property: p, index: i, isWatched, isHighlighted, onSelect, onUnderwrite, onWatch, compact }: {
  property: Property; index: number; isWatched: boolean; isHighlighted: boolean;
  onSelect: () => void; onUnderwrite: () => void; onWatch: () => void; compact?: boolean;
}) {
  return (
    <div
      id={`prop-${p.id}`}
      className={clsx(
        'property-card glass rounded-xl overflow-hidden border transition-all',
        isHighlighted ? 'border-amber-500/60 bg-amber-500/5' : 'border-white/5'
      )}
      onClick={onSelect}
    >
      {compact ? (
        <div className="flex gap-3 p-3">
          <img src={p.image} alt={p.address} className="w-16 h-16 rounded-lg object-cover flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2 mb-1">
              <p className="text-white text-xs font-semibold truncate">{p.address}</p>
              <ScoreBadge score={p.dealScore} />
            </div>
            <p className="text-[10px] text-slate-500 mb-1.5">{fmt.compact(p.price)} · {fmt.pct(p.capRate)} cap · +{fmt.currency(p.cashFlow)}/mo</p>
            <div className="flex gap-1.5">
              <button className="btn-primary text-[10px] py-1 px-2" onClick={e => { e.stopPropagation(); onUnderwrite(); }}>Underwrite</button>
              <button
                className={clsx('btn-ghost text-[10px] py-1 px-2', isWatched && 'text-amber-400 border-amber-500/40')}
                onClick={e => { e.stopPropagation(); onWatch(); }}
              >
                <Star size={9} fill={isWatched ? 'currentColor' : 'none'} />
              </button>
            </div>
          </div>
        </div>
      ) : (
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
            <button
              className={clsx('text-xs py-1.5 px-3 w-full justify-center rounded-lg border transition-all flex items-center gap-1', isWatched ? 'bg-amber-500/15 text-amber-400 border-amber-500/40' : 'btn-ghost')}
              onClick={e => { e.stopPropagation(); onWatch(); }}
            >
              <Star size={11} fill={isWatched ? 'currentColor' : 'none'} /> {isWatched ? 'Watching' : 'Watch'}
            </button>
          </div>
        </div>
      )}
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
