/**
 * ErrorBoundary that clears itself when the route changes.
 *
 * A class boundary can't read router hooks, so this thin wrapper feeds it the
 * current pathname as a reset key. Without it, hitting an error on one page
 * and navigating away would keep showing the error screen on the new page.
 */
import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import ErrorBoundary from './ErrorBoundary';

const LABELS: Record<string, string> = {
  '/': 'Search',
  '/intelligence': 'Intelligence',
  '/underwrite': 'Underwrite',
  '/portfolio': 'Portfolio',
  '/copilot': 'Copilot',
  '/market': 'Market Pulse',
  '/clients': 'Clients',
  '/leads': 'Leads',
  '/watchlist': 'Watchlist',
  '/settings': 'Settings',
  '/alerts': 'Alerts',
};

function labelFor(pathname: string): string {
  const keys = Object.keys(LABELS).sort((a, b) => b.length - a.length);
  for (const k of keys) {
    if (pathname === k || pathname.startsWith(k + '/')) return LABELS[k];
  }
  return 'this page';
}

export default function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  return (
    <ErrorBoundary resetKey={pathname} label={labelFor(pathname)}>
      {children}
    </ErrorBoundary>
  );
}
