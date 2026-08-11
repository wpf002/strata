import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Search, Map, List, TrendingUp, SlidersHorizontal, Star, Bell, X, BookmarkCheck, Eye, Zap, ChevronDown, ChevronUp, Flame, GitCompareArrows } from 'lucide-react';
import {
  getProperties, getSavedSearches, createSavedSearch, getWatchlists, createWatchlist,
  addToWatchlist, removeFromWatchlist, getSupportedMarkets, logActivity, removeActivity,
  getDemandSignalsBatch, getMarketFor,
} from '../api/client';
import type { Property, SearchFilters, SupportedMarket, MarketSummary } from '../types';
import type { SavedSearch, DemandSignalSummary } from '../api/client';
import { ScoreBadge, RiskBadge, RegimeBadge, FlagBadge, ConfidencePill, fmt } from '../components/UI';
import { clsx } from 'clsx';
import MapView from '../components/MapView';

const SORT_OPTIONS = ['Deal Score', 'Price', 'Cap Rate', 'Cash Flow', 'Days on Market', 'Motivation Score', 'Competition'];
const STRATEGIES = ['LTR', 'STR', 'BRRRR', 'Flip', 'House Hack'];

// Short label for the chip, canonical value for the API. The backend
// normalizes dialects ("single_family" from RapidAPI vs "Single Family" from
// the mock set), so send the readable form.
const PROPERTY_TYPES = [
  { label: 'SFR', value: 'Single Family' },
  { label: 'Condo', value: 'Condo' },
  { label: 'Townhouse', value: 'Townhouse' },
  { label: 'Multi', value: 'Multi-Family' },
];

const REGIME_NOTE: Record<string, string> = {
  'Hot': 'Inventory under 2 months — sellers hold leverage. Move decisively on strong deals.',
  'Balanced': 'Supply and demand roughly matched. Good conditions for negotiated deals.',
  'Cooling': 'Inventory rising or prices softening. Buyers are gaining leverage.',
  "Buyer's Market": 'Excess inventory. Negotiate hard and require strong cash flow.',
};

/** "Dallas, TX" → "Dallas Market"; empty query → a neutral heading. */
function marketLabelFromQuery(query?: string): string {
  const city = query?.split(',')[0]?.trim();
  return city ? `${city} Market` : 'Market';
}

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
    strategies: [],
    offMarketOnly: false,
  });

  // Default query from the user's strategy settings — only when no URL query
  // is present, and only on first load (don't clobber the user's picks).
  const defaultedFromProfile = useRef(false);
  useEffect(() => {
    if (urlQuery || defaultedFromProfile.current) return;
    defaultedFromProfile.current = true;
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (!token) return;
        const BASE = import.meta.env.VITE_API_URL ?? '';
        const res = await fetch(`${BASE}/users/me`, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) return;
        const profile = await res.json();
        const targets: string = profile.strategySettings?.targetMarkets ?? '';
        const first = targets.split(',')[0]?.trim();
        if (first) setFilters(f => ({ ...f, query: first }));
      } catch { /* silent — just stay on Dallas default */ }
    })();
  }, [urlQuery]);

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

  // Demand signals keyed by property id — drives both the High Demand badge
  // and the Competition sort option.
  const [demand, setDemand] = useState<Record<string, DemandSignalSummary>>({});

  // Property comparison — up to 3 at a time
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [showCompare, setShowCompare] = useState(false);

  // Active-saved-search tag (when a user applies a saved search)
  const [activeSavedSearch, setActiveSavedSearch] = useState<SavedSearch | null>(null);

  useEffect(() => {
    setLoading(true);
    setFetchError(null);
    getProperties(filters)
      .then(data => setProperties(data))
      .catch(err => { setFetchError(String(err)); setProperties([]); })
      .finally(() => setLoading(false));
  }, [filters]);

  // Live market stats for the sidebar, keyed off whatever market is searched.
  // Null means we don't cover it — the sidebar says so rather than inventing
  // numbers, which is what it used to do (a permanent hardcoded Dallas).
  const [market, setMarket] = useState<MarketSummary | null>(null);
  const [marketLoading, setMarketLoading] = useState(false);
  useEffect(() => {
    const [city, state] = (filters.query ?? '').split(',').map(s => s.trim());
    if (!city) { setMarket(null); return; }
    let cancelled = false;
    setMarketLoading(true);
    getMarketFor(city, state)
      .then(m => { if (!cancelled) setMarket(m); })
      .catch(() => { if (!cancelled) setMarket(null); })
      .finally(() => { if (!cancelled) setMarketLoading(false); });
    return () => { cancelled = true; };
  }, [filters.query]);

  // Fetch demand signals for the visible set so we can decorate + sort.
  useEffect(() => {
    const ids = properties.map(p => p.id);
    if (ids.length === 0) { setDemand({}); return; }
    getDemandSignalsBatch(ids).then(setDemand).catch(() => setDemand({}));
  }, [properties]);

  // Strategy pills filter client-side: only properties that meet the fit
  // threshold for at least one selected strategy survive. Empty selection = no
  // filter.
  const visibleProperties = useMemo(() => {
    const sel = filters.strategies ?? [];
    let result = sel.length === 0
      ? [...properties]
      : properties.filter(p => sel.some(s => strategyFit(p, s) >= STRATEGY_FIT_THRESHOLD));

    // "Competition" sorts ascending by demand_score so low-competition deals
    // (what other investors haven't noticed yet) surface first.
    if (filters.sortBy === 'Competition') {
      result = [...result].sort((a, b) =>
        (demand[a.id]?.demandScore ?? 0) - (demand[b.id]?.demandScore ?? 0),
      );
    }
    return result;
  }, [properties, filters.strategies, filters.sortBy, demand]);

  const toggleCompare = (id: string) => {
    setCompareIds(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id);
      if (prev.length >= 3) return prev; // cap at 3
      return [...prev, id];
    });
  };

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
      removeActivity(propertyId, 'saved');
    } else {
      setWatchedIds(prev => new Set([...prev, propertyId]));
      setWatchlistCount(c => c + 1);
      logActivity(propertyId, 'saved');
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
              <button onClick={() => setShowSaveModal(false)} aria-label="Close" className="text-slate-500 hover:text-white transition-colors"><X size={16} /></button>
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
            aria-label="Sort properties"
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

          <div className="flex rounded-lg overflow-hidden border border-white/10 flex-shrink-0">
            {(['list', 'map'] as const).map(v => (
              <button
                key={v}
                onClick={() => setView(v)}
                aria-label={v === 'list' ? 'List view' : 'Map view'}
                aria-pressed={view === v}
                className={clsx('px-3 py-2 transition-all', view === v ? 'bg-amber-500/20 text-amber-400' : 'text-slate-500 hover:text-slate-400')}
              >
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
            <input type="range" aria-label="Minimum deal score" min={0} max={100} value={filters.minDealScore} onChange={e => setFilters(f => ({ ...f, minDealScore: +e.target.value }))} />
          </div>
          <div className="flex flex-col gap-1 min-w-[160px] flex-1 md:flex-none md:min-w-[200px]">
            <label className="text-xs text-slate-500 font-medium">Max Price: <span className="text-amber-400 font-mono">{fmt.currency(filters.maxPrice || 600000)}</span></label>
            <input type="range" aria-label="Maximum price" min={100000} max={1000000} step={10000} value={filters.maxPrice} onChange={e => setFilters(f => ({ ...f, maxPrice: +e.target.value }))} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-500 font-medium">Property Type</label>
            <div className="flex gap-2">
              {PROPERTY_TYPES.map(({ label, value }) => {
                const active = filters.propertyTypes?.includes(value) ?? false;
                return (
                  <button
                    key={value}
                    aria-pressed={active}
                    onClick={() => setFilters(f => {
                      const current = f.propertyTypes ?? [];
                      return {
                        ...f,
                        propertyTypes: active
                          ? current.filter(t => t !== value)
                          : [...current, value],
                      };
                    })}
                    className={clsx(
                      'text-xs px-2.5 py-1.5 rounded border transition-all',
                      active
                        ? 'bg-amber-500/15 text-amber-400 border-amber-500/40'
                        : 'text-slate-400 border-white/10 hover:border-amber-500/30 hover:text-amber-400'
                    )}
                  >{label}</button>
                );
              })}
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-500 font-medium">Min Cap Rate</label>
            <select
              aria-label="Minimum cap rate"
              className="strata-input w-28 text-sm py-1.5"
              value={filters.minCapRate ?? 0}
              onChange={e => setFilters(f => ({ ...f, minCapRate: +e.target.value }))}
            >
              <option value={0}>Any</option>
              {[4, 5, 6, 7].map(v => <option key={v} value={v}>{v}%+</option>)}
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

      {/* Floating Compare bar — appears when 1+ properties selected. z-[2000]
          keeps it above Leaflet tile layers (which can climb to z-650). */}
      {compareIds.length > 0 && (
        <div className="fixed bottom-[72px] md:bottom-4 left-1/2 -translate-x-1/2 z-[2000] flex items-center gap-3 rounded-full border border-amber-500/40 bg-navy-950 px-4 py-2.5 shadow-2xl max-w-[calc(100vw-1.5rem)]">
          <GitCompareArrows size={14} className="text-amber-400" />
          <span className="text-sm text-white font-medium">
            Compare <span className="text-amber-400 font-mono">({compareIds.length})</span>
            {compareIds.length === 3 && <span className="text-[10px] text-slate-500 ml-1">max</span>}
          </span>
          <button
            onClick={() => setShowCompare(true)}
            disabled={compareIds.length < 2}
            className="btn-primary text-xs py-1.5 px-3 disabled:opacity-50"
          >
            Open Comparison
          </button>
          <button onClick={() => setCompareIds([])} className="text-slate-500 hover:text-white transition-colors" aria-label="Clear comparison">
            <X size={14} />
          </button>
        </div>
      )}

      {showCompare && (
        <ComparisonModal
          properties={properties.filter(p => compareIds.includes(p.id))}
          demand={demand}
          onClose={() => setShowCompare(false)}
          onUnderwrite={id => { setShowCompare(false); navigate(`/underwrite?property=${id}`); }}
        />
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

              {/* Your Collections — active saved search + quick-access pills */}
              {(activeSavedSearch || savedSearches.length > 0) && (
                <div className="mb-4 flex items-center gap-2 flex-wrap">
                  {activeSavedSearch ? (
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-semibold">
                      <BookmarkCheck size={12} />
                      <span>Viewing: {activeSavedSearch.name ?? 'Saved search'}</span>
                      <button
                        onClick={() => {
                          setActiveSavedSearch(null);
                          setFilters(f => ({
                            query: 'Dallas, TX', minDealScore: 0, maxPrice: 600000,
                            sortBy: f.sortBy, strategies: ['LTR'], offMarketOnly: false,
                          }));
                        }}
                        className="text-amber-400/70 hover:text-amber-400"
                        aria-label="Clear saved search"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ) : (
                    <>
                      <span className="text-[10px] uppercase tracking-wider text-slate-600 font-semibold">Your Collections</span>
                      {savedSearches.slice(0, 4).map(s => (
                        <button
                          key={s.id}
                          onClick={() => {
                            setActiveSavedSearch(s);
                            setFilters(f => ({ ...f, ...(s.criteria as object) }));
                          }}
                          className="px-2.5 py-1 rounded-lg border border-white/10 bg-white/3 text-xs text-slate-300 hover:border-amber-500/30 hover:text-amber-400 transition-colors"
                        >
                          {s.name ?? 'Unnamed'}
                        </button>
                      ))}
                    </>
                  )}
                </div>
              )}

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
                      isCompared={compareIds.includes(p.id)}
                      demandScore={demand[p.id]?.demandScore}
                      onSelect={() => navigate(`/intelligence/${p.id}`)}
                      onUnderwrite={() => navigate(`/underwrite?property=${p.id}`)}
                      onWatch={() => toggleWatch(p.id)}
                      onCompare={() => toggleCompare(p.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* Map + List split — side-by-side on desktop, stacked on mobile
               (map on top at a fixed 45vh, list scrolls beneath it). */
            <div className="flex flex-col md:flex-row w-full h-full">
              <div className="h-[45vh] md:h-auto flex-shrink-0 md:flex-shrink md:flex-1 relative">
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
              <div className="flex-1 md:flex-none md:w-[45%] md:flex-shrink-0 overflow-y-auto border-t md:border-t-0 md:border-l border-white/5 px-4 py-4">
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
                          isCompared={compareIds.includes(p.id)}
                          demandScore={demand[p.id]?.demandScore}
                          onSelect={() => navigate(`/intelligence/${p.id}`)}
                          onUnderwrite={() => navigate(`/underwrite?property=${p.id}`)}
                          onWatch={() => toggleWatch(p.id)}
                          onCompare={() => toggleCompare(p.id)}
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
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
              {market ? `${market.city} Market` : marketLabelFromQuery(filters.query)}
            </p>
            {market ? (
              <>
                <div className="space-y-0.5">
                  {[
                    { label: 'Regime', value: market.regime, color: 'text-amber-400' },
                    { label: 'Median Price', value: fmt.compact(market.medianPrice), color: 'text-white' },
                    { label: 'Price Trend 12mo', value: fmt.signedPct(market.priceChange12Mo), color: market.priceChange12Mo >= 0 ? 'text-emerald-400' : 'text-red-400' },
                    { label: 'Inventory', value: `${market.inventoryMonths.toFixed(1)} mo`, color: 'text-white' },
                    { label: 'Avg DOM', value: `${Math.round(market.daysOnMarket)} days`, color: 'text-white' },
                    { label: 'Cap Rate Median', value: fmt.pct(market.capRateMedian), color: 'text-amber-400' },
                    { label: 'Rent Growth 12mo', value: fmt.signedPct(market.rentGrowth12Mo), color: market.rentGrowth12Mo >= 0 ? 'text-emerald-400' : 'text-red-400' },
                    { label: 'Vacancy Rate', value: fmt.pct(market.vacancyRate), color: 'text-white' },
                  ].map(m => (
                    <div key={m.label} className="flex justify-between items-center py-2 border-b border-white/5 last:border-0">
                      <span className="text-xs text-slate-500">{m.label}</span>
                      <span className={clsx('text-xs font-mono font-semibold whitespace-nowrap', m.color)}>{m.value}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-4 p-3 rounded-lg border border-amber-500/20 bg-amber-500/5">
                  <div className="flex items-center gap-2 mb-1">
                    <TrendingUp size={12} className="text-amber-400" />
                    <span className="text-xs font-semibold text-amber-400">{market.regime} Market</span>
                  </div>
                  <p className="text-xs text-slate-400">{REGIME_NOTE[market.regime]}</p>
                </div>
              </>
            ) : (
              <p className="text-xs text-slate-600 leading-relaxed py-2">
                {marketLoading
                  ? 'Loading market data…'
                  : 'No market data for this search. STRATA tracks a fixed set of markets — see Market Pulse for the full list.'}
              </p>
            )}

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

function PropertyCard({ property: p, index: i, isWatched, isHighlighted, isCompared, demandScore, onSelect, onUnderwrite, onWatch, onCompare, compact }: {
  property: Property; index: number; isWatched: boolean; isHighlighted: boolean;
  isCompared: boolean; demandScore?: number;
  onSelect: () => void; onUnderwrite: () => void; onWatch: () => void; onCompare: () => void;
  compact?: boolean;
}) {
  const isHighDemand = (demandScore ?? 0) >= 70;
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
        <div className="flex gap-3 p-3 relative">
          {isHighDemand && (
            <div className="absolute top-1 right-1 bg-red-500/90 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-1">
              <Flame size={8} fill="currentColor" />
            </div>
          )}
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
                aria-label={isWatched ? 'Remove from watchlist' : 'Add to watchlist'}
                className={clsx('btn-ghost text-[10px] py-1 px-2', isWatched && 'text-amber-400 border-amber-500/40')}
                onClick={e => { e.stopPropagation(); onWatch(); }}
              >
                <Star size={9} fill={isWatched ? 'currentColor' : 'none'} />
              </button>
              <button
                aria-label="Compare property"
                className={clsx('btn-ghost text-[10px] py-1 px-2', isCompared && 'text-blue-400 border-blue-500/40')}
                onClick={e => { e.stopPropagation(); onCompare(); }}
              >
                <GitCompareArrows size={9} />
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col sm:flex-row">
          <div className="w-full sm:w-44 flex-shrink-0 relative">
            <img src={p.image} alt={p.address} className="w-full h-40 sm:h-full object-cover min-h-[148px]" />
            <div className="absolute inset-0 bg-gradient-to-r from-transparent to-navy-900/40" />
            {i === 0 && <div className="absolute top-2 left-2 bg-amber-500 text-slate-900 text-[10px] font-bold px-2 py-0.5 rounded-full">TOP PICK</div>}
            {isHighDemand && (
              <div className="absolute top-2 right-2 bg-red-500/90 text-white text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 backdrop-blur">
                <Flame size={9} fill="currentColor" /> HIGH DEMAND
              </div>
            )}
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
                <p className="text-xs font-mono text-white whitespace-nowrap">{fmt.compact(p.fairValueLow)}–{fmt.compact(p.fairValueHigh)}</p>
                <p className={clsx('text-[10px] font-semibold', p.priceVsFairValue <= 0 ? 'text-emerald-400' : 'text-red-400')}>
                  {p.priceVsFairValue <= 0 ? <ChevronDown size={12} className="inline" /> : <ChevronUp size={12} className="inline" />} {Math.abs(p.priceVsFairValue).toFixed(1)}% vs est.
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

          <div className="hidden md:flex w-32 flex-shrink-0 flex-col items-center justify-center bg-navy-900/40 border-l border-white/5 gap-2 px-3 py-4">
            <div className="text-center">
              <p className="text-[10px] text-slate-500 mb-0.5">Fair Value</p>
              <p className="text-xs font-mono text-white whitespace-nowrap">{fmt.compact(p.fairValueLow)}–{fmt.compact(p.fairValueHigh)}</p>
              <p className={clsx('text-xs font-semibold mt-0.5', p.priceVsFairValue <= 0 ? 'text-emerald-400' : 'text-red-400')}>
                {p.priceVsFairValue <= 0 ? <ChevronDown size={12} className="inline" /> : <ChevronUp size={12} className="inline" />} {Math.abs(p.priceVsFairValue).toFixed(1)}% vs est.
              </p>
            </div>
            <button className="btn-primary text-xs py-2 px-3 w-full justify-center" onClick={e => { e.stopPropagation(); onUnderwrite(); }}>Underwrite</button>
            <button
              className={clsx('text-xs py-1.5 px-3 w-full justify-center rounded-lg border transition-all flex items-center gap-1', isWatched ? 'bg-amber-500/15 text-amber-400 border-amber-500/40' : 'btn-ghost')}
              onClick={e => { e.stopPropagation(); onWatch(); }}
            >
              <Star size={11} fill={isWatched ? 'currentColor' : 'none'} /> {isWatched ? 'Watching' : 'Watch'}
            </button>
            <button
              className={clsx('text-xs py-1.5 px-3 w-full justify-center rounded-lg border transition-all flex items-center gap-1', isCompared ? 'bg-blue-500/15 text-blue-400 border-blue-500/40' : 'btn-ghost')}
              onClick={e => { e.stopPropagation(); onCompare(); }}
              aria-label={isCompared ? 'Remove from comparison' : 'Add to comparison'}
            >
              <GitCompareArrows size={11} /> {isCompared ? 'Comparing' : 'Compare'}
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

// ── Comparison Modal ─────────────────────────────────────────────────────────

function ComparisonModal({
  properties,
  demand,
  onClose,
  onUnderwrite,
}: {
  properties: Property[];
  demand: Record<string, DemandSignalSummary>;
  onClose: () => void;
  onUnderwrite: (id: string) => void;
}) {
  if (properties.length === 0) return null;
  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="rounded-2xl w-full max-w-6xl max-h-[92vh] flex flex-col border border-white/10 bg-navy-950" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between flex-shrink-0">
          <div>
            <h3 className="text-base font-semibold text-white">Compare Properties</h3>
            <p className="text-xs text-slate-500">Side-by-side view of {properties.length} {properties.length === 1 ? 'property' : 'properties'}</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-slate-500 hover:text-white transition-colors"><X size={16} /></button>
        </div>

        <div className="flex-1 overflow-auto p-4 md:p-5">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10">
                <th className="text-left text-xs text-slate-500 font-medium pb-3 pr-4">Metric</th>
                {properties.map(p => (
                  <th key={p.id} className="text-left pb-3 pr-4 min-w-[180px]">
                    <img src={p.image} alt="" className="w-full h-24 rounded-lg object-cover mb-2" />
                    <p className="text-sm font-semibold text-white truncate">{p.address}</p>
                    <p className="text-xs text-slate-500 truncate">{p.city}, {p.state}</p>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="[&>tr]:border-b [&>tr]:border-white/5 [&_td]:py-2.5 [&_td]:pr-4 [&_td]:align-middle">
              <tr>
                <td className="text-xs text-slate-500">List Price</td>
                {properties.map(p => <td key={p.id} className="font-mono text-white">{fmt.currency(p.price)}</td>)}
              </tr>
              <tr>
                <td className="text-xs text-slate-500">Deal Score</td>
                {properties.map(p => <td key={p.id}><ScoreBadge score={p.dealScore} /></td>)}
              </tr>
              <tr>
                <td className="text-xs text-slate-500">Risk Score</td>
                {properties.map(p => <td key={p.id}><RiskBadge score={p.riskScore} /></td>)}
              </tr>
              <tr>
                <td className="text-xs text-slate-500">Cap Rate</td>
                {properties.map(p => <td key={p.id} className="font-mono text-amber-400">{fmt.pct(p.capRate)}</td>)}
              </tr>
              <tr>
                <td className="text-xs text-slate-500">Cash Flow</td>
                {properties.map(p => (
                  <td key={p.id} className={clsx('font-mono', (p.cashFlow ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                    {(p.cashFlow ?? 0) >= 0 ? '+' : ''}{fmt.currency(p.cashFlow)}/mo
                  </td>
                ))}
              </tr>
              <tr>
                <td className="text-xs text-slate-500">Cash-on-Cash</td>
                {properties.map(p => <td key={p.id} className="font-mono text-white">{fmt.pct(p.cashOnCash)}</td>)}
              </tr>
              <tr>
                <td className="text-xs text-slate-500">Rent Estimate</td>
                {properties.map(p => <td key={p.id} className="font-mono text-white">{fmt.currency(p.rentEstMid)}/mo</td>)}
              </tr>
              <tr>
                <td className="text-xs text-slate-500">Neighborhood Score</td>
                {properties.map(p => (
                  <td key={p.id} className="font-mono text-white">
                    {p.neighborhoodScore ? `${p.neighborhoodScore}/100` : '—'}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="text-xs text-slate-500">Fair Value Range</td>
                {properties.map(p => (
                  <td key={p.id} className="font-mono text-white text-xs whitespace-nowrap">
                    {fmt.compact(p.fairValueLow)}–{fmt.compact(p.fairValueHigh)}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="text-xs text-slate-500">Price vs Fair Value</td>
                {properties.map(p => {
                  // Trust the backend value when present; otherwise derive from
                  // fairValueLow/High so comparisons never show a meaningless 0.
                  const fvMid = (p.fairValueLow + p.fairValueHigh) / 2;
                  const derived = fvMid > 0 ? ((p.price - fvMid) / fvMid) * 100 : 0;
                  const pct = p.priceVsFairValue !== 0 ? p.priceVsFairValue : derived;
                  if (!Number.isFinite(pct) || (pct === 0 && fvMid === 0)) {
                    return <td key={p.id} className="font-mono text-slate-500 text-xs">—</td>;
                  }
                  return (
                    <td key={p.id} className={clsx('font-mono text-xs whitespace-nowrap', pct <= 0 ? 'text-emerald-400' : 'text-red-400')}>
                      {pct <= 0 ? <ChevronDown size={12} className="inline" /> : <ChevronUp size={12} className="inline" />} {Math.abs(pct).toFixed(1)}%
                    </td>
                  );
                })}
              </tr>
              <tr>
                <td className="text-xs text-slate-500">Days on Market</td>
                {properties.map(p => (
                  <td key={p.id} className="font-mono text-white">
                    {p.daysOnMarket > 0 ? `${p.daysOnMarket}d` : '—'}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="text-xs text-slate-500">Competition</td>
                {properties.map(p => {
                  const score = demand[p.id]?.demandScore ?? 0;
                  const color = score >= 70 ? 'text-red-400' : score >= 35 ? 'text-amber-400' : 'text-slate-500';
                  const label = score >= 70 ? `${score}/100` : score >= 35 ? `${score}/100` : score > 0 ? `${score}/100` : 'Low';
                  return <td key={p.id} className={clsx('font-mono text-xs', color)}>{label}</td>;
                })}
              </tr>
              <tr>
                <td></td>
                {properties.map(p => (
                  <td key={p.id}>
                    <button onClick={() => onUnderwrite(p.id)} className="btn-primary text-xs py-1.5 px-3 mt-2">
                      Underwrite
                    </button>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
