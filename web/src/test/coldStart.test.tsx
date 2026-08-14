import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

/**
 * The first five minutes of a user test.
 *
 * A tester signs up and every collection is empty: no portfolio, no clients,
 * no watchlist, no leads, no saved searches, no alerts. That is a completely
 * different code path from "logged out" (401s) — the requests succeed and
 * return `[]`, so pages that only guard the error case fall through to
 * rendering nothing, or to `.map()` on an empty array with no message.
 *
 * Every page must say something rather than show a blank panel.
 */

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: 'test-token', user: { id: 'u1', email: 'new@user.test' } } },
      }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
  },
}));
vi.stubEnv('VITE_USE_MOCK', 'false');
vi.stubEnv('VITE_API_URL', '');

const { AuthProvider } = await import('../contexts/AuthContext');

const [WatchlistPage, LeadsPage, AlertsPage, ClientsPage, PortfolioPage, MarketPulsePage, SettingsPage] =
  await Promise.all([
    import('../pages/WatchlistPage').then(m => m.default),
    import('../pages/LeadsPage').then(m => m.default),
    import('../pages/AlertsPage').then(m => m.default),
    import('../pages/ClientsPage').then(m => m.default),
    import('../pages/PortfolioPage').then(m => m.default),
    import('../pages/MarketPulsePage').then(m => m.default),
    import('../pages/SettingsPage').then(m => m.default),
  ]);

/** Everything succeeds; everything is empty. */
function mockEmptyBackend() {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const empty: unknown =
      url.includes('/users/me')
        ? { id: 'u1', email: 'new@user.test', name: null, strategySettings: {} }
        : url.includes('/portfolio')
          ? { holdings: [], totalValue: 0, totalEquity: 0, totalDebt: 0, totalCashFlow: 0, healthScore: 0 }
          : [];
    return {
      ok: true,
      status: 200,
      json: async () => empty,
      text: async () => JSON.stringify(empty),
    } as Response;
  }));
}

function renderAt(path: string, element: React.ReactNode) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <Routes>
          <Route path="*" element={element} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  );
}

const PAGES: Array<[string, string, React.ReactNode]> = [
  ['Watchlist', '/watchlist', <WatchlistPage />],
  ['Leads', '/leads', <LeadsPage />],
  ['Alerts', '/alerts', <AlertsPage />],
  ['Clients', '/clients', <ClientsPage />],
  ['Portfolio', '/portfolio', <PortfolioPage />],
  ['Market Pulse', '/market', <MarketPulsePage />],
  ['Settings', '/settings', <SettingsPage />],
];

describe('cold start — a new account with no data', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    mockEmptyBackend();
  });

  for (const [name, path, element] of PAGES) {
    it(`${name} renders something a person can read`, async () => {
      renderAt(path, element);

      await waitFor(() => {
        const text = (document.body.textContent ?? '').trim();
        // Not blank, and not just a spinner shell.
        expect(text.length, `${name} rendered an empty page`).toBeGreaterThan(20);
      }, { timeout: 3000 });
    });

    it(`${name} shows no broken values with zero data`, async () => {
      renderAt(path, element);
      await waitFor(() => expect((document.body.textContent ?? '').length).toBeGreaterThan(20));

      const text = document.body.textContent ?? '';
      expect(text, `${name} rendered NaN`).not.toMatch(/NaN/);
      expect(text, `${name} rendered undefined`).not.toMatch(/undefined/);
      expect(text, `${name} rendered Infinity`).not.toMatch(/Infinity/);
      expect(text, `${name} rendered [object Object]`).not.toMatch(/\[object Object\]/);
      // "$NaN" and "0/100" style artifacts of dividing by an empty set.
      expect(text, `${name} rendered a NaN currency`).not.toMatch(/\$NaN/);
    });
  }
});

describe('cold start — empty states name the next action', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    mockEmptyBackend();
  });

  it('Portfolio invites the first property rather than showing a blank dashboard', async () => {
    renderAt('/portfolio', <PortfolioPage />);
    await waitFor(() =>
      expect(screen.getAllByText(/Add Property|No properties|first property/i).length).toBeGreaterThan(0)
    );
  });

  it('Clients invites the first client', async () => {
    renderAt('/clients', <ClientsPage />);
    await waitFor(() =>
      expect(screen.getAllByText(/Add Client|No clients/i).length).toBeGreaterThan(0)
    );
  });

  it('Leads explains that activity populates it', async () => {
    renderAt('/leads', <LeadsPage />);
    await waitFor(() => expect(screen.getByText(/No leads yet/i)).toBeInTheDocument());
    expect(screen.getAllByText(/Search|Intelligence/).length).toBeGreaterThan(0);
  });

  it('Watchlist does not claim a count it does not have', async () => {
    renderAt('/watchlist', <WatchlistPage />);
    await waitFor(() => expect(screen.getByText(/Watchlist/i)).toBeInTheDocument());
    expect(document.body.textContent).not.toMatch(/NaN|undefined/);
  });

  it('Portfolio health score reads 0, not NaN, with no holdings', async () => {
    renderAt('/portfolio', <PortfolioPage />);
    await waitFor(() => expect((document.body.textContent ?? '').length).toBeGreaterThan(20));
    const text = document.body.textContent ?? '';
    if (/Health Score/i.test(text)) {
      expect(text).not.toMatch(/Health Score:\s*NaN/i);
    }
  });
});
