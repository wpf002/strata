import { Link, useLocation } from 'react-router-dom';
import { Settings, Bell, ChevronRight, Zap } from 'lucide-react';
import { clsx } from 'clsx';
import { PRIMARY_NAV, isInSection } from './sections';

// Four labelled groups over eleven entries became a flat six. Watchlist,
// Underwrite and Leads now live as tabs inside the section they belong to
// rather than competing for space in the sidebar.

export default function Sidebar() {
  const location = useLocation();
  return (
    <aside className="hidden md:flex w-[220px] flex-shrink-0 flex-col h-full glass-dark border-r border-white/5">
      <div className="px-5 py-5 border-b border-white/5">
        <Link to="/" className="flex items-center gap-2.5 hover:opacity-80 transition-opacity">
          <div className="w-8 h-8 rounded-lg bg-amber-500 flex items-center justify-center">
            <Zap size={16} className="text-navy-950" fill="currentColor" />
          </div>
          <div>
            <span className="text-white font-bold text-lg tracking-tight" style={{ fontFamily: "'DM Serif Display', serif" }}>STRATA</span>
            <div className="flex items-center gap-1 -mt-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 pulse-dot" />
              <span className="text-[10px] text-emerald-400 font-medium">LIVE</span>
            </div>
          </div>
        </Link>
      </div>
      {/* Alerts and Settings sit directly under the primary nav — they're
          navigation too. Pinning them to the bottom alongside the profile card
          left a ~500px void once the nav dropped from eleven entries to six:
          two separate bottom-anchored groups read as missing content, where
          empty space below a single anchored card reads as intentional. */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
        {PRIMARY_NAV.map(item => {
          const active = isInSection(location.pathname, item);
          return (
            <Link key={item.path} to={item.path} className={clsx('nav-item', active && 'active')}>
              <item.icon size={16} strokeWidth={active ? 2.5 : 2} />
              <span>{item.label}</span>
              {active && <ChevronRight size={12} className="ml-auto opacity-50" />}
            </Link>
          );
        })}

        <div className="pt-3 mt-3 border-t border-white/5 space-y-0.5">
          <Link
            to="/alerts"
            className={clsx('nav-item', location.pathname.startsWith('/alerts') && 'active')}
          >
            <Bell size={16} /><span>Alerts</span>
          </Link>
          <Link
            to="/settings"
            className={clsx('nav-item', location.pathname.startsWith('/settings') && 'active')}
          >
            <Settings size={16} /><span>Settings</span>
          </Link>
        </div>
      </nav>
      <div className="px-3 pb-4">
        <div className="px-1">
          <div className="glass rounded-xl p-3">
            <div className="flex items-center gap-2.5 mb-2">
              <div className="w-7 h-7 rounded-full bg-navy-700 flex items-center justify-center text-xs font-bold text-amber-500">W</div>
              <div><p className="text-xs font-semibold text-white">Will</p><p className="text-[10px] text-slate-500">Investor Pro</p></div>
            </div>
            <div className="flex items-center gap-1">
              <div className="flex-1 h-1 bg-white/5 rounded-full overflow-hidden"><div className="h-full w-3/4 bg-amber-500 rounded-full" /></div>
              <span className="text-[10px] text-slate-500">Pro</span>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
