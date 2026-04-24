import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Flame, Eye, Calculator, FileText, Bookmark, Bot, ChevronRight, Inbox } from 'lucide-react';
import { clsx } from 'clsx';
import { listLeads } from '../api/client';
import type { Lead, ActivityType } from '../api/client';
import { fmt } from '../components/UI';

const ACTIVITY_META: Record<ActivityType, { label: string; icon: typeof Eye; color: string }> = {
  viewed:        { label: 'Views',       icon: Eye,        color: 'text-slate-400' },
  underwritten:  { label: 'Underwrites', icon: Calculator, color: 'text-amber-400' },
  reported:      { label: 'Reports',     icon: FileText,   color: 'text-emerald-400' },
  saved:         { label: 'Saved',       icon: Bookmark,   color: 'text-blue-400' },
  copilot_asked: { label: 'Copilot',     icon: Bot,        color: 'text-purple-400' },
};

function relativeTime(iso: string | null): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function Temperature({ score }: { score: number }) {
  const tier = score >= 10 ? 'Hot' : score >= 4 ? 'Warm' : 'Cold';
  const styles = {
    Hot:  'bg-red-500/15 text-red-400 border-red-500/40',
    Warm: 'bg-amber-500/15 text-amber-400 border-amber-500/40',
    Cold: 'bg-slate-500/10 text-slate-400 border-slate-500/30',
  }[tier];
  return (
    <span className={clsx('inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-semibold uppercase tracking-wider', styles)}>
      <Flame size={10} /> {tier}
    </span>
  );
}

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listLeads().then(setLeads).catch(() => setError('Failed to load leads. Are you signed in?'));
  }, []);

  const totals = useMemo(() => {
    if (!leads) return null;
    const total = leads.length;
    const hot = leads.filter(l => l.engagementScore >= 10).length;
    const warm = leads.filter(l => l.engagementScore >= 4 && l.engagementScore < 10).length;
    return { total, hot, warm };
  }, [leads]);

  return (
    <div className="flex flex-col h-full overflow-hidden page-fade">
      <div className="px-4 md:px-6 py-3 md:py-4 border-b border-white/5 flex-shrink-0 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-white">Leads</h1>
          <p className="text-sm text-slate-500 hidden sm:block">Properties you've engaged with, ranked by interest.</p>
        </div>
        {totals && (
          <div className="flex items-center gap-3 text-xs text-slate-400">
            <span><span className="text-white font-semibold">{totals.total}</span> total</span>
            <span className="text-red-400">{totals.hot} hot</span>
            <span className="text-amber-400">{totals.warm} warm</span>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 md:px-6 py-4 md:py-6">
        {error ? (
          <div className="glass rounded-2xl p-8 text-center border border-red-500/20 max-w-md mx-auto">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        ) : leads === null ? (
          <div className="space-y-2 max-w-3xl">
            {[1, 2, 3].map(i => <div key={i} className="glass rounded-xl h-20 animate-pulse" />)}
          </div>
        ) : leads.length === 0 ? (
          <div className="glass rounded-2xl p-10 text-center border border-white/5 max-w-md mx-auto">
            <Inbox size={28} className="text-slate-600 mx-auto mb-3" />
            <p className="text-sm text-white font-semibold mb-1">No leads yet</p>
            <p className="text-xs text-slate-500">Browse properties from <Link to="/" className="text-amber-400 hover:underline">Search</Link> or open an Intelligence page — your activity will show up here.</p>
          </div>
        ) : (
          <div className="space-y-2 max-w-3xl">
            {leads.map(lead => (
              <Link
                key={lead.propertyId}
                to={`/intelligence/${lead.propertyId}`}
                className="glass rounded-xl p-3 md:p-4 border border-white/5 hover:border-amber-500/30 transition-colors flex items-center gap-3 md:gap-4"
              >
                {lead.image ? (
                  <img src={lead.image} alt="" className="w-16 h-16 md:w-20 md:h-20 rounded-lg object-cover flex-shrink-0" />
                ) : (
                  <div className="w-16 h-16 md:w-20 md:h-20 rounded-lg bg-navy-800 flex-shrink-0" />
                )}

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <p className="text-sm font-semibold text-white truncate">{lead.address}</p>
                    <Temperature score={lead.engagementScore} />
                  </div>
                  <div className="flex items-center gap-3 text-xs text-slate-500 mb-2 flex-wrap">
                    {lead.city && lead.state && <span>{lead.city}, {lead.state}</span>}
                    {lead.price != null && <span className="text-slate-300 font-mono">{fmt.currency(lead.price)}</span>}
                    <span>Last active {relativeTime(lead.lastActive)}</span>
                  </div>
                  <div className="flex items-center gap-3 flex-wrap">
                    {(Object.keys(ACTIVITY_META) as ActivityType[]).map(type => {
                      const bucket = lead.activities[type];
                      if (!bucket) return null;
                      const meta = ACTIVITY_META[type];
                      const Icon = meta.icon;
                      return (
                        <span key={type} className={clsx('inline-flex items-center gap-1 text-xs', meta.color)}>
                          <Icon size={12} />
                          <span className="font-mono">{bucket.count}</span>
                          <span className="text-slate-500 hidden md:inline">{meta.label}</span>
                        </span>
                      );
                    })}
                  </div>
                </div>

                <ChevronRight size={16} className="text-slate-600 flex-shrink-0" />
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
