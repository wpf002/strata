/**
 * Sub-navigation for a section that owns more than one route.
 *
 * The app had eleven top-level destinations, several of which were a single
 * view that had been promoted to its own nav entry — Watchlist is a filtered
 * property list, Leads is a stage of the client pipeline, Underwrite is a step
 * in analyzing one property. Grouping them under their parent section cuts the
 * primary nav to six without moving any of the page code.
 *
 * Routes are unchanged, so existing links and deep links keep working.
 */
import { Link, useLocation } from 'react-router-dom';
import { clsx } from 'clsx';
import type { LucideIcon } from 'lucide-react';
// sections.ts imports SectionTab from here as a type only, so this pair does
// not form a runtime cycle.
import { PRIMARY_NAV, isInSection } from './sections';

export interface SectionTab {
  label: string;
  path: string;
  icon?: LucideIcon;
  /** Extra paths that should also light this tab (e.g. /intelligence/:id). */
  matches?: (pathname: string) => boolean;
}

/**
 * Picks the right tab set for the current route and renders nothing for
 * sections that only own one page. Mounted once in the app shell so no page
 * component has to know it exists.
 */
export function SectionTabsBar() {
  const { pathname } = useLocation();
  const match = PRIMARY_NAV.find(item => item.section && isInSection(pathname, item));
  if (!match?.section) return null;
  return <SectionTabs tabs={match.section} />;
}

export default function SectionTabs({ tabs }: { tabs: SectionTab[] }) {
  const { pathname } = useLocation();

  return (
    <div className="px-4 md:px-6 border-b border-white/5 flex gap-1 flex-shrink-0 overflow-x-auto">
      {tabs.map(tab => {
        const active = tab.matches
          ? tab.matches(pathname)
          : pathname === tab.path || pathname.startsWith(tab.path + '/');
        return (
          <Link
            key={tab.path}
            to={tab.path}
            aria-current={active ? 'page' : undefined}
            className={clsx(
              'flex items-center gap-1.5 px-3 py-2.5 text-xs md:text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors',
              active
                ? 'border-amber-500 text-amber-400'
                : 'border-transparent text-slate-500 hover:text-slate-300'
            )}
          >
            {tab.icon && <tab.icon size={14} strokeWidth={active ? 2.5 : 2} />}
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
