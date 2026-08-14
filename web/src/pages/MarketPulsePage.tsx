import { useState, useEffect, useMemo } from 'react';
import { TrendingUp, TrendingDown, ChevronDown, ChevronUp, Search, Building, Star } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { clsx } from 'clsx';
import { fmt, RegimeBadge } from '../components/UI';
import { getSupportedMarkets } from '../api/client';
import type { SupportedMarket } from '../types';

interface MarketSummaryItem {
  city: string;
  state: string;
  regime: 'Hot' | 'Balanced' | 'Cooling' | "Buyer's Market";
  medianPrice: number;
  priceChange12Mo: number;
  inventoryMonths: number;
  daysOnMarket: number;
  capRateMedian: number;
  rentGrowth12Mo: number;
  vacancyRate: number;
}

const REGIME_EXPLANATION: Record<string, string> = {
  'Hot': 'Inventory below 2 months — sellers hold the leverage. Properties move fast and over asking is common. Move decisively on strong deals.',
  'Balanced': 'Healthy supply-demand equilibrium with 2–3.5 months of inventory and positive price appreciation. Good environment for negotiated deals.',
  'Cooling': 'Inventory rising or prices declining. Buyers gain leverage. Extended due diligence timelines are acceptable. Watch for motivated sellers.',
  "Buyer's Market": 'Excess inventory above 5 months gives buyers maximum leverage. Negotiate aggressively, demand concessions, and require strong cash flow underwriting.',
};


// Inner tile matching the look of StatCard from components/UI.tsx (uppercase
// tracking-wider label, JetBrains Mono value). Compact + bordered so a 2x2
// grid of these reads as a clear dashboard.
function MetricTile({ label, value, valueColor, trend }: {
  label: string; value: string; valueColor: string; trend?: 'up' | 'down';
}) {
  return (
    <div className="rounded-lg bg-white/[0.02] border border-white/5 p-3">
      <p className="text-[10px] text-slate-500 font-medium uppercase tracking-wider mb-1.5">{label}</p>
      <div className="flex items-center gap-1.5">
        {trend === 'up' && <TrendingUp size={13} className="text-emerald-400 flex-shrink-0" />}
        {trend === 'down' && <TrendingDown size={13} className="text-red-400 flex-shrink-0" />}
        <p className={clsx('text-lg font-bold font-mono', valueColor)}>{value}</p>
      </div>
    </div>
  );
}

function MarketCard({ market, onSearch }: { market: MarketSummaryItem; onSearch: (city: string, state: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const positive = market.priceChange12Mo >= 0;

  return (
    <div className={clsx('glass rounded-xl border transition-colors', expanded ? 'border-amber-500/30' : 'border-white/5 hover:border-white/15')}>
      <div className="p-5 cursor-pointer" onClick={() => setExpanded(e => !e)}>
        {/* Header — sans-serif title matching SearchPage/PortfolioPage style */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-white truncate">
              {market.city}, {market.state}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Live conditions · updated daily
            </p>
          </div>
          <RegimeBadge regime={market.regime} />
        </div>

        {/* 2x2 metric grid — the 4 key dimensions */}
        <div className="grid grid-cols-2 gap-2.5">
          <MetricTile
            label="Median Price"
            value={fmt.compact(market.medianPrice)}
            valueColor="text-white"
          />
          <MetricTile
            label="Price Change 12mo"
            value={`${positive ? '+' : ''}${market.priceChange12Mo.toFixed(1)}%`}
            valueColor={positive ? 'text-emerald-400' : 'text-red-400'}
            trend={positive ? 'up' : 'down'}
          />
          <MetricTile
            label="Inventory"
            value={`${market.inventoryMonths.toFixed(1)} mo`}
            valueColor="text-white"
          />
          <MetricTile
            label="Cap Rate Median"
            value={`${market.capRateMedian.toFixed(1)}%`}
            valueColor="text-amber-400"
          />
        </div>

        <div className="flex items-center justify-end mt-4 text-[10px] text-slate-500 uppercase tracking-wider gap-1 hover:text-amber-400 transition-colors">
          {expanded ? 'Hide Details' : 'View Details'}
          {expanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-white/5 px-5 py-4 space-y-4">
          {/* Secondary metrics */}
          <div className="grid grid-cols-3 gap-2.5">
            <MetricTile
              label="Days on Market"
              value={`${market.daysOnMarket}d`}
              valueColor="text-white"
            />
            <MetricTile
              label="Rent Growth 12mo"
              value={`${market.rentGrowth12Mo >= 0 ? '+' : ''}${market.rentGrowth12Mo.toFixed(1)}%`}
              valueColor={market.rentGrowth12Mo >= 0 ? 'text-emerald-400' : 'text-red-400'}
            />
            <MetricTile
              label="Vacancy Rate"
              value={`${market.vacancyRate.toFixed(1)}%`}
              valueColor="text-white"
            />
          </div>

          <div className="p-3 rounded-lg bg-white/[0.02] border border-white/5">
            <p className="text-xs font-semibold text-slate-300 mb-1">Market Analysis</p>
            <p className="text-xs text-slate-400 leading-relaxed">{REGIME_EXPLANATION[market.regime]}</p>
          </div>

          <button
            className="btn-primary w-full justify-center text-sm"
            onClick={e => { e.stopPropagation(); onSearch(market.city, market.state); }}
          >
            <Search size={14} /> Search {market.city} Properties
          </button>
        </div>
      )}
    </div>
  );
}

const BASE_URL = import.meta.env.VITE_API_URL ?? '';

export default function MarketPulsePage() {
  const [markets, setMarkets] = useState<MarketSummaryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [supported, setSupported] = useState<SupportedMarket[]>([]);
  const navigate = useNavigate();

  // URL-synced market selector so views are bookmarkable:
  //   /market                           → all markets
  //   /market?market=phoenix-az         → single market by id
  //   /market?city=Phoenix&state=AZ     → single market by city/state (agent-friendly)
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedId = searchParams.get('market')
    ?? (searchParams.get('city') && searchParams.get('state')
        ? `${searchParams.get('city')!.toLowerCase()}-${searchParams.get('state')!.toLowerCase()}`
        : 'all');
  const setSelectedId = (id: string) => {
    if (id === 'all') {
      setSearchParams({});
    } else {
      setSearchParams({ market: id });
    }
  };

  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    // On failure this used to substitute five hardcoded markets — Dallas
    // $342K, Phoenix $415K and so on — which the cards then presented under
    // "Live conditions · updated daily". Invented market data labelled live is
    // worse than no data, so a failure now says so.
    fetch(`${BASE_URL}/market/summary`)
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(data => { setMarkets(data); setLoadError(null); })
      .catch(() => {
        setMarkets([]);
        setLoadError('Market data is unavailable right now. Check that the API is running.');
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    getSupportedMarkets().then(setSupported).catch(() => setSupported([]));
  }, []);

  const visibleMarkets = useMemo(() => {
    if (selectedId === 'all') return markets;
    const target = supported.find(s => s.marketId === selectedId);
    if (!target) return markets;
    const match = markets.find(m => m.city.toLowerCase() === target.city.toLowerCase() && m.state.toUpperCase() === target.stateCode.toUpperCase());
    return match ? [match] : [];
  }, [markets, supported, selectedId]);

  const handleSearch = (city: string, state: string) => {
    navigate(`/?q=${encodeURIComponent(`${city}, ${state}`)}`);
  };

  const subtitle = selectedId === 'all'
    ? `Live conditions across ${markets.length} markets`
    : `Detailed view for ${visibleMarkets[0]?.city ?? 'selected market'}, ${visibleMarkets[0]?.state ?? ''}`;

  return (
    <div className="flex flex-col h-full page-fade overflow-hidden">
      <div className="px-4 md:px-6 py-3 md:py-4 border-b border-white/5 flex-shrink-0 flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-blue-500/15 flex items-center justify-center">
            <Building size={16} className="text-blue-400" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-white">Market Pulse</h1>
            <p className="text-sm text-slate-500">{subtitle}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <label className="text-xs text-slate-500">View</label>
          <select
            aria-label="Select market"
            value={selectedId}
            onChange={e => setSelectedId(e.target.value)}
            className="strata-input text-sm py-1.5 w-full sm:min-w-[200px]"
          >
            <option value="all">All markets with data</option>
            {supported.map(m => (
              <option key={m.marketId} value={m.marketId}>
                {m.city}, {m.stateCode}{m.isLaunchMarket ? ' (launch)' : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 md:px-6 py-4 md:py-5">
        {loading ? (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="glass rounded-2xl h-48 animate-pulse" />
            ))}
          </div>
        ) : loadError ? (
          <div className="glass rounded-2xl p-10 text-center border border-red-500/20">
            <p className="text-sm text-red-400 mb-1">{loadError}</p>
            <p className="text-xs text-slate-500">
              Nothing is shown rather than estimated — market figures here should
              only ever come from the live feed.
            </p>
          </div>
        ) : visibleMarkets.length === 0 ? (
          <div className="glass rounded-2xl p-10 text-center border border-white/5">
            <p className="text-sm text-slate-400 mb-1">No live data for this market yet.</p>
            <p className="text-xs text-slate-500">
              Choose a launch market (<Star size={12} className="inline align-text-bottom" />) for full analytics, or{' '}
              <button onClick={() => setSelectedId('all')} className="text-amber-400 hover:underline">view all markets</button>.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {visibleMarkets.map(m => (
              <MarketCard key={`${m.city}-${m.state}`} market={m} onSearch={handleSearch} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
