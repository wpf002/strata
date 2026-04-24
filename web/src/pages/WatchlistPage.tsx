import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Star, Eye } from 'lucide-react';
import { clsx } from 'clsx';
import {
  getWatchlists, getProperty, removeFromWatchlist, removeActivity,
} from '../api/client';
import type { Watchlist } from '../api/client';
import type { Property } from '../types';
import { ScoreBadge, RiskBadge, ConfidencePill, fmt } from '../components/UI';

export default function WatchlistPage() {
  const navigate = useNavigate();
  const [list, setList] = useState<Watchlist | null>(null);
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [missingIds, setMissingIds] = useState<string[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setProperties([]);
    setMissingIds([]);
    try {
      const lists = await getWatchlists();
      const primary = lists.find(l => l.name === 'My Watchlist') ?? lists[0];
      setList(primary ?? null);
      if (!primary || primary.propertyIds.length === 0) {
        return;
      }
      // Hydrate each id; tolerate 404s for ids that no longer resolve.
      const results = await Promise.allSettled(
        primary.propertyIds.map(id => getProperty(id)),
      );
      const ok: Property[] = [];
      const missing: string[] = [];
      results.forEach((r, i) => {
        if (r.status === 'fulfilled') ok.push(r.value);
        else missing.push(primary.propertyIds[i]);
      });
      setProperties(ok);
      setMissingIds(missing);
    } catch {
      setList(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const unstar = async (propertyId: string) => {
    if (!list) return;
    setProperties(prev => prev.filter(p => p.id !== propertyId));
    try {
      await removeFromWatchlist(list.id, propertyId);
      removeActivity(propertyId, 'saved');
    } catch { /* silent — local state already reflects intent */ }
  };

  const cleanupMissing = async () => {
    if (!list || missingIds.length === 0) return;
    await Promise.allSettled(missingIds.map(id => removeFromWatchlist(list.id, id)));
    setMissingIds([]);
    load();
  };

  return (
    <div className="flex flex-col h-full page-fade">
      <div className="px-4 md:px-6 py-3 md:py-4 border-b border-white/5 flex items-center justify-between flex-shrink-0 gap-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-amber-500/15 flex items-center justify-center">
            <Eye size={16} className="text-amber-400" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-white">Watchlist</h1>
            <p className="text-sm text-slate-500">
              {loading
                ? 'Loading…'
                : `${properties.length} ${properties.length === 1 ? 'property' : 'properties'} watched`}
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 md:px-6 py-4 md:py-5">
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => <div key={i} className="glass rounded-xl h-36 animate-pulse" />)}
          </div>
        ) : properties.length === 0 ? (
          <div className="glass rounded-2xl p-10 text-center border border-white/5 max-w-xl mx-auto">
            <Star size={28} className="text-slate-600 mx-auto mb-3" />
            <p className="text-base font-semibold text-white mb-1">No watchlisted properties yet</p>
            <p className="text-sm text-slate-500 mb-5">
              Tap the ⭐ Watch button on any property card to save it here.
            </p>
            <button onClick={() => navigate('/')} className="btn-primary text-sm">Browse Properties</button>
          </div>
        ) : (
          <>
            {missingIds.length > 0 && (
              <div className="glass rounded-xl p-3 mb-4 border border-amber-500/30 bg-amber-500/5 flex items-center gap-3">
                <p className="text-xs text-amber-400 flex-1">
                  {missingIds.length} watchlisted {missingIds.length === 1 ? 'property is' : 'properties are'} no longer available — listings may have been removed.
                </p>
                <button onClick={cleanupMissing} className="btn-ghost text-xs">Remove</button>
              </div>
            )}
            <div className="space-y-3">
              {properties.map(p => (
                <WatchlistCard
                  key={p.id}
                  property={p}
                  onSelect={() => navigate(`/intelligence/${p.id}`)}
                  onUnderwrite={() => navigate(`/underwrite?property=${p.id}`)}
                  onUnstar={() => unstar(p.id)}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function WatchlistCard({
  property: p,
  onSelect,
  onUnderwrite,
  onUnstar,
}: {
  property: Property;
  onSelect: () => void;
  onUnderwrite: () => void;
  onUnstar: () => void;
}) {
  return (
    <div
      onClick={onSelect}
      className="glass rounded-xl overflow-hidden border border-white/5 hover:border-white/15 transition-colors cursor-pointer flex flex-col sm:flex-row"
    >
      <img
        src={p.image}
        alt={p.address}
        className="w-full sm:w-44 h-40 sm:h-auto object-cover flex-shrink-0"
        style={{ minHeight: 148 }}
      />
      <div className="flex-1 p-4 min-w-0">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-white truncate">{p.address}</p>
            <p className="text-xs text-slate-400 truncate">{p.city}, {p.state} {p.zip}</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <ScoreBadge score={p.dealScore} />
            <RiskBadge score={p.riskScore} />
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-2 mb-3">
          <Stat label="Price" value={fmt.compact(p.price)} />
          <Stat label="Cap Rate" value={fmt.pct(p.capRate)} highlight />
          <Stat label="Cash Flow" value={`${p.cashFlow >= 0 ? '+' : ''}${fmt.currency(p.cashFlow)}/mo`} positive={p.cashFlow >= 0} />
          <Stat label="DOM" value={`${p.daysOnMarket}d`} />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <ConfidencePill level={p.valuationConfidence} />
          <span className="text-xs text-slate-500">{p.beds} bd · {p.baths} ba · {fmt.num(p.sqft)} sqft</span>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={e => { e.stopPropagation(); onUnderwrite(); }}
              className="btn-primary text-xs py-1.5 px-3"
            >
              Underwrite
            </button>
            <button
              onClick={e => { e.stopPropagation(); onUnstar(); }}
              className="text-xs py-1.5 px-3 rounded-lg border bg-amber-500/15 text-amber-400 border-amber-500/40 flex items-center gap-1 hover:bg-red-500/15 hover:text-red-400 hover:border-red-500/40 transition-colors"
              title="Remove from watchlist"
            >
              <Star size={11} fill="currentColor" /> Watching
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, positive, highlight }: { label: string; value: string; positive?: boolean; highlight?: boolean }) {
  const color = positive === true ? 'text-emerald-400' : positive === false ? 'text-red-400' : highlight ? 'text-amber-400' : 'text-white';
  return (
    <div>
      <p className="text-[10px] text-slate-500 mb-0.5">{label}</p>
      <p className={clsx('text-sm font-semibold font-mono', color)}>{value}</p>
    </div>
  );
}
