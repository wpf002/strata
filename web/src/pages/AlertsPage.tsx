import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Search, Eye, Trash2, Settings, ChevronRight, AlertCircle } from 'lucide-react';
import { getSavedSearches, deleteSavedSearch, getWatchlists } from '../api/client';
import type { SavedSearch, Watchlist } from '../api/client';
import { clsx } from 'clsx';

export default function AlertsPage() {
  const navigate = useNavigate();
  const [searches, setSearches] = useState<SavedSearch[]>([]);
  const [watchlists, setWatchlists] = useState<Watchlist[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [s, w] = await Promise.all([getSavedSearches(), getWatchlists()]);
      setSearches(s);
      setWatchlists(w);
    } catch {
      // not signed in or no data
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleDeleteSearch = async (id: string) => {
    await deleteSavedSearch(id);
    setSearches(prev => prev.filter(s => s.id !== id));
  };

  const totalWatched = watchlists.reduce((n, w) => n + w.propertyIds.length, 0);

  return (
    <div className="flex flex-col h-full page-fade">
      <div className="px-4 md:px-6 py-3 md:py-4 border-b border-white/5 flex items-center justify-between flex-shrink-0 gap-3">
        <div>
          <h1 className="text-lg font-semibold text-white">Alerts</h1>
          <p className="text-sm text-slate-500">{searches.filter(s => s.alertEnabled).length} active · {totalWatched} properties watched</p>
        </div>
        <button onClick={() => navigate('/settings?tab=alerts')} className="btn-ghost text-sm">
          <Settings size={14} /> Preferences
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => <div key={i} className="glass rounded-xl h-16 animate-pulse" />)}
          </div>
        ) : (
          <>
            {/* Saved Search Alerts */}
            <section>
              <div className="flex items-center gap-2 mb-3">
                <Search size={14} className="text-amber-400" />
                <h2 className="text-xs font-semibold text-slate-400 tracking-widest uppercase">Saved Search Alerts</h2>
              </div>
              {searches.length === 0 ? (
                <EmptyCard
                  icon={<Search size={20} className="text-slate-600" />}
                  message="No saved searches yet"
                  action="Go to Search"
                  onAction={() => navigate('/')}
                />
              ) : (
                <div className="space-y-2">
                  {searches.map(s => (
                    <div key={s.id} className="glass rounded-xl px-4 py-3 flex items-center gap-3">
                      <div className={clsx('w-2 h-2 rounded-full flex-shrink-0', s.alertEnabled ? 'bg-emerald-400' : 'bg-slate-600')} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white truncate">{s.name || 'Unnamed Search'}</p>
                        <p className="text-xs text-slate-500">{s.alertEnabled ? 'Email alert enabled' : 'Alert off'}</p>
                      </div>
                      <button
                        onClick={() => navigate('/')}
                        className="text-slate-500 hover:text-slate-300 transition-colors p-1"
                        title="View search"
                      >
                        <ChevronRight size={14} />
                      </button>
                      <button
                        onClick={() => handleDeleteSearch(s.id)}
                        className="text-slate-600 hover:text-red-400 transition-colors p-1"
                        title="Delete"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Watchlists */}
            <section>
              <div className="flex items-center gap-2 mb-3">
                <Eye size={14} className="text-amber-400" />
                <h2 className="text-xs font-semibold text-slate-400 tracking-widest uppercase">Watchlists</h2>
              </div>
              {watchlists.length === 0 ? (
                <EmptyCard
                  icon={<Eye size={20} className="text-slate-600" />}
                  message="No watchlists yet"
                  action="Browse properties"
                  onAction={() => navigate('/')}
                />
              ) : (
                <div className="space-y-2">
                  {watchlists.map(w => (
                    <button
                      key={w.id}
                      onClick={() => navigate('/')}
                      className="glass rounded-xl px-4 py-3 flex items-center gap-3 w-full text-left hover:bg-white/5 transition-colors"
                    >
                      <Eye size={14} className="text-amber-400 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white truncate">{w.name}</p>
                        <p className="text-xs text-slate-500">{w.propertyIds.length} {w.propertyIds.length === 1 ? 'property' : 'properties'}</p>
                      </div>
                      <ChevronRight size={14} className="text-slate-400" />
                    </button>
                  ))}
                </div>
              )}
            </section>

            {/* Info banner */}
            <div className="glass rounded-xl px-4 py-3 flex items-start gap-3">
              <AlertCircle size={14} className="text-amber-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-slate-400 leading-relaxed">
                Email alerts run daily. Configure frequency and notification channels in{' '}
                <button onClick={() => navigate('/settings')} className="text-amber-400 hover:text-amber-300 underline">
                  Settings → Alert Preferences
                </button>.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function EmptyCard({ icon, message, action, onAction }: { icon: React.ReactNode; message: string; action: string; onAction: () => void }) {
  return (
    <div className="glass rounded-xl px-4 py-6 flex flex-col items-center gap-3 text-center">
      {icon}
      <p className="text-sm text-slate-500">{message}</p>
      <button onClick={onAction} className="btn-ghost text-xs py-1.5 px-3">
        <Bell size={12} /> {action}
      </button>
    </div>
  );
}
