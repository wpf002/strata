/**
 * Mobile app shell — hamburger top bar + slide-out drawer.
 *
 * Desktop keeps the existing always-visible `Sidebar`. On screens < md (768px)
 * we hide that sidebar (via `hidden md:flex` in App.tsx) and render this
 * instead: a compact top bar that opens a full-height drawer with the same
 * navigation sections.
 */
import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Settings, Bell, Zap, Menu, X, ChevronRight } from 'lucide-react';
import { clsx } from 'clsx';
import { PRIMARY_NAV, isInSection } from './sections';

// Same six destinations as the sidebar and the bottom bar — one list, so the
// three navs can't drift apart the way they had.

const PAGE_TITLES: Record<string, string> = {
  '/':            'Search',
  '/market':      'Market Pulse',
  '/intelligence':'Intelligence',
  '/underwrite':  'Underwrite',
  '/portfolio':   'Portfolio',
  '/leads':       'Leads',
  '/watchlist':   'Watchlist',
  '/copilot':     'Copilot',
  '/clients':     'Clients',
  '/settings':    'Settings',
  '/alerts':      'Alerts',
};

function titleFromPath(pathname: string): string {
  // Match longest prefix first — e.g. /intelligence/:id → "Intelligence"
  const keys = Object.keys(PAGE_TITLES).sort((a, b) => b.length - a.length);
  for (const k of keys) {
    if (pathname === k || pathname.startsWith(k + '/')) return PAGE_TITLES[k];
  }
  return 'STRATA';
}

export default function MobileNav() {
  const location = useLocation();
  const [open, setOpen] = useState(false);

  // Auto-close drawer on route change
  useEffect(() => { setOpen(false); }, [location.pathname]);

  // Prevent body scroll when drawer is open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  return (
    <>
      {/* Top bar */}
      <header className="md:hidden flex-shrink-0 h-14 px-4 flex items-center justify-between glass-dark border-b border-white/5 z-30">
        <button
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          className="p-2 -ml-2 text-slate-300 hover:text-white transition-colors"
        >
          <Menu size={22} />
        </button>

        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-amber-500 flex items-center justify-center">
            <Zap size={12} className="text-navy-950" fill="currentColor" />
          </div>
          <span className="text-sm font-bold text-white tracking-tight" style={{ fontFamily: "'DM Serif Display', serif" }}>
            {titleFromPath(location.pathname)}
          </span>
        </div>

        <Link to="/alerts" aria-label="Alerts" className="p-2 -mr-2 text-slate-300 hover:text-white transition-colors">
          <Bell size={20} />
        </Link>
      </header>

      {/* Drawer backdrop */}
      {open && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Drawer */}
      <aside
        className={clsx(
          'md:hidden fixed top-0 left-0 bottom-0 w-72 max-w-[85vw] z-50 flex flex-col glass-dark border-r border-white/5 transform transition-transform duration-200',
          open ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/5 flex-shrink-0">
          <Link to="/" className="flex items-center gap-2.5">
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
          <button
            onClick={() => setOpen(false)}
            aria-label="Close menu"
            className="p-2 -mr-2 text-slate-400 hover:text-white"
          >
            <X size={18} />
          </button>
        </div>

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
        </nav>

        <div className="px-3 pb-4 pt-3 border-t border-white/5 flex-shrink-0 space-y-1">
          <Link to="/alerts" className="nav-item"><Bell size={16} /><span>Alerts</span></Link>
          <Link to="/settings" className="nav-item"><Settings size={16} /><span>Settings</span></Link>
        </div>
      </aside>
    </>
  );
}
