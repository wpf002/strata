/**
 * Which routes belong to which primary section.
 *
 * Single source of truth for the sidebar, the mobile drawer, the bottom tabs
 * and the section tab strips — previously each of those kept its own copy of
 * the nav list, which is how Watchlist ended up in one and not another.
 */
import { Search, Eye, BarChart3, Calculator, Briefcase, Flame, Users, Bot, TrendingUp } from 'lucide-react';
import type { SectionTab } from './SectionTabs';

export const DISCOVER_TABS: SectionTab[] = [
  { label: 'Opportunity Feed', path: '/', icon: Search, matches: p => p === '/' },
  { label: 'Watchlist', path: '/watchlist', icon: Eye },
];

export const PROPERTY_TABS: SectionTab[] = [
  { label: 'Intelligence', path: '/intelligence', icon: BarChart3 },
  { label: 'Underwrite', path: '/underwrite', icon: Calculator },
];

export const CLIENT_TABS: SectionTab[] = [
  { label: 'Clients', path: '/clients', icon: Users },
  { label: 'Leads', path: '/leads', icon: Flame },
];

/** The six destinations that earn a permanent slot in the primary nav. */
export const PRIMARY_NAV = [
  { icon: Search, label: 'Search', path: '/', section: DISCOVER_TABS },
  { icon: TrendingUp, label: 'Market Pulse', path: '/market' },
  { icon: BarChart3, label: 'Property', path: '/intelligence', section: PROPERTY_TABS },
  { icon: Briefcase, label: 'Portfolio', path: '/portfolio' },
  { icon: Bot, label: 'Copilot', path: '/copilot' },
  { icon: Users, label: 'Clients', path: '/clients', section: CLIENT_TABS },
];

/** True when `pathname` sits anywhere inside the given primary destination. */
export function isInSection(pathname: string, item: (typeof PRIMARY_NAV)[number]): boolean {
  const paths = item.section ? item.section.map(t => t.path) : [item.path];
  return paths.some(p => (p === '/' ? pathname === '/' : pathname === p || pathname.startsWith(p + '/')));
}
