/**
 * Mobile bottom tab bar — primary destinations only.
 *
 * Sits below `md` (768px) as a flex sibling of `<main>`, so it reserves its own
 * layout height instead of overlaying page content. The hamburger drawer in
 * `MobileNav` keeps the full navigation (Watchlist, Intelligence, Alerts,
 * Settings, …); these five are the ones worth a permanent thumb target.
 */
import { Link, useLocation } from 'react-router-dom';
import { clsx } from 'clsx';
import { PRIMARY_NAV, isInSection } from './sections';

// Six primary destinations now fit, because Watchlist / Underwrite / Leads
// moved into their parent sections instead of competing for a slot here.
const TABS = PRIMARY_NAV.map(item => ({
  ...item,
  // The bar is narrow; a couple of labels need a shorter form.
  label: item.label === 'Market Pulse' ? 'Market' : item.label,
}));

export default function BottomTabs() {
  const { pathname } = useLocation();

  return (
    <nav
      aria-label="Primary"
      className="md:hidden flex-shrink-0 flex items-stretch glass-dark border-t border-white/5 pb-[env(safe-area-inset-bottom)] z-30"
    >
      {TABS.map(tab => {
        const active = isInSection(pathname, tab);
        return (
          <Link
            key={tab.path}
            to={tab.path}
            aria-current={active ? 'page' : undefined}
            className={clsx(
              'flex-1 flex flex-col items-center justify-center gap-1 py-2 min-h-[56px] transition-colors',
              active ? 'text-amber-400' : 'text-slate-500 hover:text-slate-300'
            )}
          >
            <tab.icon size={20} strokeWidth={active ? 2.5 : 2} />
            <span className="text-[10px] font-medium leading-none">{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
