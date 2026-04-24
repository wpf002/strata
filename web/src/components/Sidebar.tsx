import { Link, useLocation } from 'react-router-dom';
import { Search, BarChart3, Calculator, Briefcase, TrendingUp, Bot, Users, Flame, Settings, Bell, ChevronRight, Zap } from 'lucide-react';
import { clsx } from 'clsx';

const navSections = [
  { label: 'DISCOVER', items: [{ icon: Search, label: 'Search', path: '/' }, { icon: TrendingUp, label: 'Market Pulse', path: '/market' }] },
  { label: 'ANALYZE', items: [{ icon: BarChart3, label: 'Intelligence', path: '/intelligence' }, { icon: Calculator, label: 'Underwrite', path: '/underwrite' }] },
  { label: 'OPERATE', items: [{ icon: Briefcase, label: 'Portfolio', path: '/portfolio' }, { icon: Flame, label: 'Leads', path: '/leads' }, { icon: Bot, label: 'Copilot', path: '/copilot' }] },
  { label: 'TEAMS', items: [{ icon: Users, label: 'Clients', path: '/clients' }] },
];

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
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
        {navSections.map(section => (
          <div key={section.label}>
            <p className="text-[10px] font-semibold text-slate-600 tracking-widest px-3 mb-1.5">{section.label}</p>
            <div className="space-y-0.5">
              {section.items.map(item => {
                const active = location.pathname === item.path;
                return (
                  <Link key={item.path} to={item.path} className={clsx('nav-item', active && 'active')}>
                    <item.icon size={16} strokeWidth={active ? 2.5 : 2} />
                    <span>{item.label}</span>
                    {active && <ChevronRight size={12} className="ml-auto opacity-50" />}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
      <div className="px-3 pb-4 space-y-1 border-t border-white/5 pt-3">
        <Link to="/alerts" className="nav-item"><Bell size={16} /><span>Alerts</span></Link>
        <Link to="/settings" className="nav-item"><Settings size={16} /><span>Settings</span></Link>
        <div className="mt-3 px-1">
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
