import { useState, useEffect, useMemo } from 'react';
import { TrendingUp, TrendingDown, ChevronDown, ChevronUp, Search, Building } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { clsx } from 'clsx';
import { fmt } from '../components/UI';
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

const REGIME_STYLES: Record<string, string> = {
  'Hot': 'text-red-400 bg-red-400/10 border-red-400/30',
  'Balanced': 'text-amber-400 bg-amber-500/10 border-amber-500/30',
  'Cooling': 'text-blue-400 bg-blue-400/10 border-blue-400/30',
  "Buyer's Market": 'text-emerald-400 bg-emerald-400/10 border-emerald-400/30',
};

const REGIME_EXPLANATION: Record<string, string> = {
  'Hot': 'Inventory below 2 months — sellers hold the leverage. Properties move fast and over asking is common. Move decisively on strong deals.',
  'Balanced': 'Healthy supply-demand equilibrium with 2–3.5 months of inventory and positive price appreciation. Good environment for negotiated deals.',
  'Cooling': 'Inventory rising or prices declining. Buyers gain leverage. Extended due diligence timelines are acceptable. Watch for motivated sellers.',
  "Buyer's Market": 'Excess inventory above 5 months gives buyers maximum leverage. Negotiate aggressively, demand concessions, and require strong cash flow underwriting.',
};

function generatePriceTrend(endPrice: number, growthPct: number) {
  const months = ['May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr'];
  const startPrice = endPrice / (1 + growthPct / 100);
  return months.map((month, i) => ({
    month,
    value: Math.round(startPrice + (endPrice - startPrice) * (i / 11)),
  }));
}

function generateRentTrend(capRate: number, medianPrice: number, rentGrowthPct: number) {
  const months = ['May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr'];
  const endRent = Math.round((medianPrice * (capRate / 100)) / 12 * 1.4);
  const startRent = Math.round(endRent / (1 + rentGrowthPct / 100));
  return months.map((month, i) => ({
    month,
    value: Math.round(startRent + (endRent - startRent) * (i / 11)),
  }));
}

function MarketCard({ market, onSearch }: { market: MarketSummaryItem; onSearch: (city: string, state: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const priceTrend = generatePriceTrend(market.medianPrice, market.priceChange12Mo);
  const rentTrend = generateRentTrend(market.capRateMedian, market.medianPrice, market.rentGrowth12Mo);
  const positive = market.priceChange12Mo >= 0;

  return (
    <div className={clsx('glass rounded-2xl border transition-all duration-200', expanded ? 'border-amber-500/30' : 'border-white/5 hover:border-white/15')}>
      <div className="p-5 cursor-pointer" onClick={() => setExpanded(e => !e)}>
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-base font-semibold text-white">{market.city}, {market.state}</h3>
            <span className={clsx('inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded border mt-1', REGIME_STYLES[market.regime])}>
              {market.regime}
            </span>
          </div>
          <div className="text-right">
            <p className="text-xl font-bold font-mono text-white">{fmt.compact(market.medianPrice)}</p>
            <div className={clsx('flex items-center justify-end gap-1 text-sm font-mono font-semibold', positive ? 'text-emerald-400' : 'text-red-400')}>
              {positive ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
              {positive ? '+' : ''}{market.priceChange12Mo.toFixed(1)}% 12mo
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="glass rounded-xl p-3">
            <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-0.5">Cap Rate</p>
            <p className="text-base font-bold font-mono text-amber-400">{market.capRateMedian.toFixed(1)}%</p>
          </div>
          <div className="glass rounded-xl p-3">
            <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-0.5">Inventory</p>
            <p className="text-base font-bold font-mono text-white">{market.inventoryMonths.toFixed(1)} mo</p>
          </div>
          <div className="glass rounded-xl p-3">
            <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-0.5">DOM</p>
            <p className="text-base font-bold font-mono text-white">{market.daysOnMarket}d</p>
          </div>
        </div>

        <div className="flex justify-end mt-3">
          {expanded ? <ChevronUp size={16} className="text-slate-500" /> : <ChevronDown size={16} className="text-slate-500" />}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-white/5 p-5 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-slate-400 font-medium mb-2">Price Trend (12 months)</p>
              <div className="h-28">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={priceTrend}>
                    <defs>
                      <linearGradient id={`pg-${market.city}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={positive ? '#34d399' : '#f87171'} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={positive ? '#34d399' : '#f87171'} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="month" tick={{ fill: '#64748b', fontSize: 9 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#64748b', fontSize: 9 }} axisLine={false} tickLine={false} tickFormatter={v => `$${Math.round(v / 1000)}k`} />
                    <Tooltip contentStyle={{ background: '#112240', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 11 }} formatter={(v) => [fmt.currency(Number(v)), 'Median Price']} />
                    <Area type="monotone" dataKey="value" stroke={positive ? '#34d399' : '#f87171'} strokeWidth={2} fill={`url(#pg-${market.city})`} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div>
              <p className="text-xs text-slate-400 font-medium mb-2">Rent Trend (12 months)</p>
              <div className="h-28">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={rentTrend}>
                    <defs>
                      <linearGradient id={`rg-${market.city}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#C9A84C" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#C9A84C" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="month" tick={{ fill: '#64748b', fontSize: 9 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#64748b', fontSize: 9 }} axisLine={false} tickLine={false} tickFormatter={v => `$${v}`} />
                    <Tooltip contentStyle={{ background: '#112240', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 11 }} formatter={(v) => [fmt.currency(Number(v)), 'Avg Rent']} />
                    <Area type="monotone" dataKey="value" stroke="#C9A84C" strokeWidth={2} fill={`url(#rg-${market.city})`} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="glass rounded-xl p-3">
              <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-0.5">Rent Growth 12mo</p>
              <p className={clsx('font-bold font-mono', market.rentGrowth12Mo >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                {market.rentGrowth12Mo >= 0 ? '+' : ''}{market.rentGrowth12Mo.toFixed(1)}%
              </p>
            </div>
            <div className="glass rounded-xl p-3">
              <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-0.5">Vacancy Rate</p>
              <p className="font-bold font-mono text-white">{market.vacancyRate.toFixed(1)}%</p>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-white/3 border border-white/8">
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
  const [selectedId, setSelectedId] = useState<string>('all');
  const navigate = useNavigate();

  useEffect(() => {
    fetch(`${BASE_URL}/market/summary`)
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(setMarkets)
      .catch(() => {
        // Inline fallback if backend unavailable
        setMarkets([
          { city: 'Dallas', state: 'TX', regime: 'Balanced', medianPrice: 342000, priceChange12Mo: 4.2, inventoryMonths: 2.3, daysOnMarket: 28, capRateMedian: 5.4, rentGrowth12Mo: 3.1, vacancyRate: 4.8 },
          { city: 'Phoenix', state: 'AZ', regime: 'Balanced', medianPrice: 415000, priceChange12Mo: 2.8, inventoryMonths: 2.9, daysOnMarket: 35, capRateMedian: 5.0, rentGrowth12Mo: 2.4, vacancyRate: 5.2 },
          { city: 'Nashville', state: 'TN', regime: 'Cooling', medianPrice: 468000, priceChange12Mo: 1.2, inventoryMonths: 3.7, daysOnMarket: 42, capRateMedian: 4.8, rentGrowth12Mo: 2.8, vacancyRate: 5.8 },
          { city: 'Atlanta', state: 'GA', regime: 'Hot', medianPrice: 358000, priceChange12Mo: 5.6, inventoryMonths: 1.7, daysOnMarket: 22, capRateMedian: 5.8, rentGrowth12Mo: 4.2, vacancyRate: 4.2 },
          { city: 'Tampa', state: 'FL', regime: 'Cooling', medianPrice: 392000, priceChange12Mo: -0.8, inventoryMonths: 4.2, daysOnMarket: 56, capRateMedian: 5.1, rentGrowth12Mo: 0.6, vacancyRate: 7.1 },
        ]);
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
            value={selectedId}
            onChange={e => setSelectedId(e.target.value)}
            className="strata-input text-sm py-1.5 w-full sm:min-w-[200px]"
          >
            <option value="all">All markets with data</option>
            {supported.map(m => (
              <option key={m.marketId} value={m.marketId}>
                {m.city}, {m.stateCode}{m.isLaunchMarket ? ' ⭐' : ''}
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
        ) : visibleMarkets.length === 0 ? (
          <div className="glass rounded-2xl p-10 text-center border border-white/5">
            <p className="text-sm text-slate-400 mb-1">No live data for this market yet.</p>
            <p className="text-xs text-slate-500">
              Choose a launch market (⭐) for full analytics, or{' '}
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
