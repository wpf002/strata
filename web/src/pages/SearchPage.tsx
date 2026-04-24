import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { Search, Map, List, TrendingUp, SlidersHorizontal, Star, Bell, X, BookmarkCheck, Eye, Zap, ChevronDown } from 'lucide-react';
import {
  getProperties, getSavedSearches, createSavedSearch, getWatchlists, createWatchlist,
  addToWatchlist, removeFromWatchlist, getSupportedMarkets,
} from '../api/client';
import type { Property, SearchFilters, SupportedMarket } from '../types';
import type { SavedSearch } from '../api/client';
import { ScoreBadge, RiskBadge, RegimeBadge, FlagBadge, ConfidencePill, fmt } from '../components/UI';
import { clsx } from 'clsx';
import MapView from '../components/MapView';

const SORT_OPTIONS = ['Deal Score', 'Price', 'Cap Rate', 'Cash Flow', 'Days on Market', 'Motivation Score'];
const STRATEGIES = ['LTR', 'STR', 'BRRRR', 'Flip', 'House Hack'];

// Per-strategy fit score (0-100) derived from property attributes. Used to
// filter the Opportunity Feed when strategy pills are selected. Keep >= 50 for
// inclusion — anything lower doesn't clearly fit that playbook.
function strategyFit(p: Property, strategy: string): number {
  switch (strategy) {
    case 'LTR': {
      // Favors positive cash flow + healthy cap rate + confident rent estimate.
      let s = 0;
      s += Math.min(50, Math.max(0, p.capRate * 7));            // 7% cap rate → +49
      s += p.cashFlow > 0 ? 25 : p.cashFlow > -150 ? 10 : 0;
      s += p.rentConfidence === 'High' ? 20 : p.rentConfidence === 'Medium' ? 10 : 0;
      return Math.min(100, s);
    }
    case 'STR': {
      // Favors tourist-friendly neighborhoods + hot markets + enough bedrooms.
      let s = 0;
      s += Math.min(50, (p.neighborhoodScore ?? 50) * 0.6);
      s += p.marketRegime === 'Hot' ? 20 : p.marketRegime === 'Balanced' ? 10 : 0;
      s += p.beds >= 3 ? 20 : p.beds >= 2 ? 10 : 0;
      // STR is a poor fit for condos with HOA restrictions; dock those.
      if (p.type === 'Condo') s -= 20;
      return Math.min(100, Math.max(0, s));
    }
    case 'BRRRR': {
      // Favors underpriced + older homes with value-add headroom.
      let s = 0;
      s += p.priceVsFairValue < -2 ? 35 : p.priceVsFairValue < 1 ? 20 : 0;
      s += p.yearBuilt && p.yearBuilt < 2005 ? 25 : p.yearBuilt && p.yearBuilt < 2015 ? 10 : 0;
      s += Math.min(25, Math.max(0, p.capRate * 4));
      s += p.dealScore >= 65 ? 15 : 0;
      return Math.min(100, s);
    }
    case 'Flip': {
      // Favors significantly undervalued older homes with a high deal score.
      let s = 0;
      s += p.priceVsFairValue < -4 ? 40 : p.priceVsFairValue < -1 ? 20 : 0;
      s += p.yearBuilt && p.yearBuilt < 1990 ? 30 : p.yearBuilt && p.yearBuilt < 2005 ? 15 : 0;
      s += p.dealScore >= 70 ? 25 : p.dealScore >= 55 ? 10 : 0;
      return Math.min(100, s);
    }
    case 'House Hack': {
      // Favors multi-unit or 4+ bed SFH under owner-occupied loan limits (~$500K).
      let s = 0;
      if (p.type === 'Multi-Family') s += 50;
      else if (p.beds >= 4) s += 35;
      else if (p.beds === 3) s += 15;
      s += p.price < 400000 ? 30 : p.price < 500000 ? 15 : 0;
      s += p.cashFlow > -200 ? 15 : 0;  // owner occupying, so breakeven is acceptable
      return Math.min(100, s);
    }
    default:
      return 0;
  }
}

const STRATEGY_FIT_THRESHOLD = 50;

const RECENT_MARKETS_KEY = 'strata.recentMarkets';

function loadRecentMarkets(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_MARKETS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function pushRecentMarket(marketId: string) {
  const recents = loadRecentMarkets().filter(m => m !== marketId);
  recents.unshift(marketId);
  try {
    localStorage.setItem(RECENT_MARKETS_KEY, JSON.stringify(recents.slice(0, 5)));
  } catch { /* ignore */ }
}

export default function SearchPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const urlQuery = new URLSearchParams(location.search).get('q');

  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [view, setView] = useState<'list' | 'map'>('list');
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<Partial<SearchFilters>>({
    query: urlQuery ?? 'Dallas, TX',
    minDealScore: 0,
    maxPrice: 600000,
    sortBy: 'Deal Score',
    strategies: ['LTR'],
    offMarketOnly: false,
  });

  // Supported-markets dropdown
  const [markets, setMarkets] = useState<SupportedMarket[]>([]);
  const [showMarketPicker, setShowMarketPicker] = useState(false);
  const [marketSearch, setMarketSearch] = useState('');
  const [recentMarkets, setRecentMarkets] = useState<string[]>(loadRecentMarkets());
  const marketPickerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    getSupportedMarkets().then(setMarkets).catch(() => setMarkets([]));
  }, []);

  // Close picker on outside click
  useEffect(() => {
    if (!showMarketPicker) return;
    const onClick = (e: MouseEvent) => {
      if (marketPickerRef.current && !marketPickerRef.current.contains(e.target as Node)) {
        setShowMarketPicker(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [showMarketPicker]);

  const filteredMarkets = useMemo(() => {
    const q = marketSearch.trim().toLowerCase();
    if (!q) return markets;
    return markets.filter(m =>
      m.city.toLowerCase().includes(q) ||
      m.state.toLowerCase().includes(q) ||
      m.stateCode.toLowerCase().includes(q) ||
      m.marketId.includes(q)
    );
  }, [markets, marketSearch]);

  const recentMarketsList = useMemo(() => {
    const byId: Record<string, SupportedMarket> = {};
    for (const m of markets) byId[m.marketId] = m;
    return recentMarkets.map(id => byId[id]).filter((m): m is SupportedMarket => !!m);
  }, [markets, recentMarkets]);

  const currentMarketLabel = filters.query?.trim() || 'Choose market';

  const selectMarket = (m: SupportedMarket | null) => {
    if (m) {
      pushRecentMarket(m.marketId);
      setRecentMarkets(loadRecentMarkets());
      setFilters(f => ({ ...f, query: `${m.city}, ${m.stateCode}` }));
    } else {
      setFilters(f => ({ ...f, query: '' }));
    }
    setMarketSearch('');
    setShowMarketPicker(false);
  };

  // Save search modal
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveSearchName, setSaveSearchName] = useState('');
  const [saveSearchLoading, setSaveSearchLoading] = useState(false);

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

  // Strategy pills filter client-side: only properties that meet the fit
  // threshold for at least one selected strategy survive. Empty selection = no
  // filter.
  const visibleProperties = useMemo(() => {
    const sel = filters.strategies ?? [];
    if (sel.length === 0) return properties;
    return properties.filter(p => sel.some(s => strategyFit(p, s) >= STRATEGY_FIT_THRESHOLD));
  }, [properties, filters.strategies]);

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
      setShowSaveModal(false);
      setSaveSearchName('');
      setSavedSearches(prev => [...prev, { id: Date.now().toString(), name: saveSearchName, criteria: filters as object, alertEnabled: false, createdAt: new Date().toISOString() }]);
    } catch {
      // save failed silently
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
      <div className="px-4 md:px-6 py-3 md:py-4 border-b border-white/5 flex flex-wrap items-center gap-2 md:gap-3 flex-shrink-0 min-w-0">
        {/* Market selector */}
        <div ref={marketPickerRef} className="relative flex-shrink-0 order-1">
          <button
            onClick={() => setShowMarketPicker(v => !v)}
            className={clsx(
              'flex items-center gap-2 w-44 sm:w-60 px-3 py-2 rounded-lg border bg-navy-900/80 text-sm text-slate-200 transition-colors',
              showMarketPicker ? 'border-amber-500/60' : 'border-white/10 hover:border-white/20'
            )}
          >
            <Search size={14} className="text-slate-500" />
            <span className="flex-1 text-left truncate">{currentMarketLabel}</span>
            <ChevronDown size={14} className="text-slate-500" />
          </button>

          {showMarketPicker && (
            <div className="absolute top-full left-0 mt-2 w-80 glass rounded-xl border border-white/10 shadow-2xl z-50 overflow-hidden">
              <div className="p-2 border-b border-white/5">
                <input
                  autoFocus
                  value={marketSearch}
                  onChange={e => setMarketSearch(e.target.value)}
                  placeholder="Search markets…"
                  className="strata-input w-full text-sm"
                />
              </div>
              <div className="max-h-80 overflow-y-auto">
                <button
                  onClick={() => selectMarket(null)}
                  className="w-full px-3 py-2 text-left text-xs text-slate-400 hover:bg-white/5 transition-colors border-b border-white/5"
                >
                  <span className="font-semibold text-white">All Markets</span>
                  <span className="text-slate-500 block">Nationwide search</span>
                </button>

                {!marketSearch && recentMarketsList.length > 0 && (
                  <div className="border-b border-white/5">
                    <p className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wider text-slate-600 font-semibold">Recent</p>
                    {recentMarketsList.map(m => (
                      <button
                        key={`r-${m.marketId}`}
                        onClick={() => selectMarket(m)}
                        className="w-full px-3 py-1.5 text-left text-sm text-slate-200 hover:bg-white/5 transition-colors flex items-center justify-between"
                      >
                        <span>{m.city}, {m.stateCode}</span>
                      </button>
                    ))}
                  </div>
                )}

                <p className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wider text-slate-600 font-semibold">
                  Supported Markets ({filteredMarkets.length})
                </p>
                {filteredMarkets.length === 0 ? (
                  <p className="px-3 py-4 text-sm text-slate-500 text-center">No matches.</p>
                ) : (
                  filteredMarkets.map(m => (
                    <button
                      key={m.marketId}
                      onClick={() => selectMarket(m)}
                      className="w-full px-3 py-1.5 text-left text-sm text-slate-200 hover:bg-white/5 transition-colors flex items-center justify-between"
                    >
                      <span>{m.city}, {m.stateCode}</span>
                      {m.isLaunchMarket && <span className="text-[10px] text-amber-400 font-semibold px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/20">Launch</span>}
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0 order-3 md:order-2 w-full md:w-auto overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0 md:overflow-visible">
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

        <div className="flex items-center gap-2 ml-auto flex-shrink-0 order-2 md:order-3">
          <select
            className="strata-input text-sm max-w-[120px] sm:max-w-[140px]"
            value={filters.sortBy}
            onChange={e => setFilters(f => ({ ...f, sortBy: e.target.value }))}
          >
            {SORT_OPTIONS.map(o => <option key={o}>{o}</option>)}
          </select>

          <button
            onClick={() => setShowFilters(!showFilters)}
            className={clsx('btn-ghost text-sm flex-shrink-0 px-3', showFilters && 'border-amber-500/40 text-amber-400')}
            aria-label="Filters"
          >
            <SlidersHorizontal size={14} /> <span className="hidden sm:inline">Filters</span>
          </button>

          <div className="hidden sm:flex rounded-lg overflow-hidden border border-white/10 flex-shrink-0">
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
        <div className="px-4 md:px-6 py-4 border-b border-white/5 glass flex flex-wrap items-start gap-4 md:gap-8 flex-shrink-0">
          <div className="flex flex-col gap-1 min-w-[160px] flex-1 md:flex-none md:min-w-[200px]">
            <label className="text-xs text-slate-500 font-medium">Min Deal Score: <span className="text-amber-400 font-mono">{filters.minDealScore}</span></label>
            <input type="range" min={0} max={100} value={filters.minDealScore} onChange={e => setFilters(f => ({ ...f, minDealScore: +e.target.value }))} />
          </div>
          <div className="flex flex-col gap-1 min-w-[160px] flex-1 md:flex-none md:min-w-[200px]">
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
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-500 font-medium flex items-center gap-1.5">
              <Zap size={10} className="text-amber-400" /> Off-Market Signals
            </label>
            <button
              onClick={() => setFilters(f => ({ ...f, offMarketOnly: !f.offMarketOnly }))}
              className={clsx(
                'text-xs px-3 py-1.5 rounded-lg border transition-all self-start whitespace-nowrap',
                filters.offMarketOnly
                  ? 'bg-amber-500/15 text-amber-400 border-amber-500/40'
                  : 'text-slate-500 border-white/10 hover:border-white/20'
              )}
            >
              {filters.offMarketOnly ? 'Motivated Sellers Only' : 'Show All Listings'}
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* Results / Map */}
        <div className={clsx('flex-1 overflow-hidden', view === 'map' ? 'flex' : 'overflow-y-auto')}>
          {view === 'list' ? (
            <div className="px-4 md:px-6 py-4">
              <div className="flex items-start justify-between mb-4 gap-3">
                <div className="min-w-0 flex-1">
                  <h1 className="text-lg font-semibold text-white">Opportunity Feed</h1>
                  <p className="text-xs md:text-sm text-slate-500 truncate">
                    <span className="text-amber-400 font-mono font-semibold">{visibleProperties.length}</span> properties · {filters.query} · Sorted by {filters.sortBy}
                    {(filters.strategies?.length ?? 0) > 0 && visibleProperties.length < properties.length && (
                      <span className="text-slate-600"> · {properties.length - visibleProperties.length} hidden by strategy</span>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button onClick={() => setShowSaveModal(true)} className="btn-ghost text-xs py-1.5 px-3">
                    <Bell size={12} /> <span className="hidden sm:inline">Save Search</span><span className="sm:hidden">Save</span>
                  </button>
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
              ) : visibleProperties.length === 0 ? (
                <div className="glass rounded-2xl p-8 text-center border border-white/5">
                  <p className="text-sm text-white font-semibold mb-1">No properties match the selected strategies</p>
                  <p className="text-xs text-slate-500">Clear a strategy pill above to broaden the feed.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {visibleProperties.map((p, i) => (
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
                  properties={visibleProperties}
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
                  <p className="text-xs text-slate-500">{visibleProperties.length} properties</p>
                  <button onClick={() => setShowSaveModal(true)} className="btn-ghost text-xs py-1 px-2"><Bell size={11} /> Save</button>
                </div>
                {loading ? (
                  <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="glass rounded-xl h-24 animate-pulse" />)}</div>
                ) : (
                  <div className="space-y-2">
                    {visibleProperties.map((p, i) => (
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

        {/* Market sidebar (list view, desktop only) */}
        {view === 'list' && (
          <div className="hidden lg:block w-60 flex-shrink-0 border-l border-white/5 overflow-y-auto px-4 py-4">
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
        <div className="flex flex-col sm:flex-row">
          <div className="w-full sm:w-44 flex-shrink-0 relative">
            <img src={p.image} alt={p.address} className="w-full h-40 sm:h-full object-cover" style={{ minHeight: 148 }} />
            <div className="absolute inset-0 bg-gradient-to-r from-transparent to-navy-900/40" />
            {i === 0 && <div className="absolute top-2 left-2 bg-amber-500 text-slate-900 text-[10px] font-bold px-2 py-0.5 rounded-full">TOP PICK</div>}
          </div>

          <div className="flex-1 px-4 sm:px-5 py-3.5 min-w-0">
            <div className="flex items-start justify-between mb-2 gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-white font-semibold flex items-center gap-2 flex-wrap">
                  <span className="truncate">{p.address}</span>
                  {(p.motivationScore ?? 0) > 50 && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/40 flex-shrink-0">
                      <Zap size={9} /> MOTIVATED
                    </span>
                  )}
                </p>
                <p className="text-slate-400 text-xs mt-0.5 truncate">{p.city}, {p.state} {p.zip} · {p.neighborhood} · <RegimeBadge regime={p.marketRegime} /></p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <ScoreBadge score={p.dealScore} />
                <RiskBadge score={p.riskScore} />
              </div>
            </div>

            <div className="grid grid-cols-3 md:grid-cols-6 gap-x-3 gap-y-2 mb-3">
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

            {/* Mobile-only actions (the desktop sidebar below handles this at md+) */}
            <div className="md:hidden mt-3 pt-3 border-t border-white/5 flex items-center gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-slate-500">Fair Value</p>
                <p className="text-xs font-mono text-white truncate">{fmt.compact(p.fairValueLow)}–{fmt.compact(p.fairValueHigh)}</p>
                <p className={clsx('text-[10px] font-semibold', p.priceVsFairValue <= 0 ? 'text-emerald-400' : 'text-red-400')}>
                  {p.priceVsFairValue <= 0 ? '▼' : '▲'} {Math.abs(p.priceVsFairValue).toFixed(1)}% vs est.
                </p>
              </div>
              <button className="btn-primary text-xs py-2 px-3 flex-shrink-0" onClick={e => { e.stopPropagation(); onUnderwrite(); }}>Underwrite</button>
              <button
                className={clsx('text-xs py-2 px-3 rounded-lg border transition-all flex items-center gap-1 flex-shrink-0', isWatched ? 'bg-amber-500/15 text-amber-400 border-amber-500/40' : 'btn-ghost')}
                onClick={e => { e.stopPropagation(); onWatch(); }}
                aria-label={isWatched ? 'Unwatch property' : 'Watch property'}
              >
                <Star size={13} fill={isWatched ? 'currentColor' : 'none'} />
              </button>
            </div>
          </div>

          <div className="hidden md:flex w-32 flex-shrink-0 flex-col items-center justify-center bg-navy-900/40 border-l border-white/5 gap-3 px-3">
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
