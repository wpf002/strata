import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
  },
}));
vi.stubEnv('VITE_USE_MOCK', 'true');
vi.stubEnv('VITE_API_URL', '');

const { AuthProvider } = await import('../contexts/AuthContext');

const [WatchlistPage, LeadsPage, AlertsPage, SettingsPage, MarketPulsePage, ClientsPage, PortfolioPage] =
  await Promise.all([
    import('../pages/WatchlistPage').then(m => m.default),
    import('../pages/LeadsPage').then(m => m.default),
    import('../pages/AlertsPage').then(m => m.default),
    import('../pages/SettingsPage').then(m => m.default),
    import('../pages/MarketPulsePage').then(m => m.default),
    import('../pages/ClientsPage').then(m => m.default),
    import('../pages/PortfolioPage').then(m => m.default),
  ]);

function renderAt(path: string, element: React.ReactNode) {
  // SettingsPage reads useAuth(), so every page renders inside the provider —
  // matching how App.tsx mounts them.
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <Routes>
          <Route path={path} element={element} />
          <Route path="*" element={element} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  );
}

/**
 * Smoke coverage for the pages that had none.
 *
 * These aren't deep behavioural tests — they assert the things that break
 * loudest and most often: the page mounts without throwing, it doesn't paint
 * NaN/undefined/[object Object] into the DOM, and an unauthenticated or empty
 * response produces a stated empty state rather than a blank screen.
 */

const PAGES: Array<[string, string, React.ReactNode]> = [
  ['WatchlistPage', '/watchlist', <WatchlistPage />],
  ['LeadsPage', '/leads', <LeadsPage />],
  ['AlertsPage', '/alerts', <AlertsPage />],
  ['SettingsPage', '/settings', <SettingsPage />],
  ['MarketPulsePage', '/market', <MarketPulsePage />],
  ['ClientsPage', '/clients', <ClientsPage />],
  ['PortfolioPage', '/portfolio', <PortfolioPage />],
];

describe('page smoke tests', () => {
  beforeEach(() => {
    // Unauthenticated + no backend: the state a broken deploy actually lands in.
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 401, json: async () => ({}), text: async () => 'unauthorized',
    }));
  });

  for (const [name, path, element] of PAGES) {
    it(`${name} mounts without throwing`, async () => {
      expect(() => renderAt(path, element)).not.toThrow();
      // Let effects settle so async failures surface as rejections, not warnings.
      await waitFor(() => expect(document.body.textContent).toBeTruthy());
    });

    it(`${name} paints no placeholder garbage`, async () => {
      renderAt(path, element);
      await waitFor(() => expect(document.body.textContent).toBeTruthy());
      const text = document.body.textContent ?? '';
      expect(text, `${name} rendered NaN`).not.toMatch(/NaN/);
      expect(text, `${name} rendered undefined`).not.toMatch(/undefined/);
      expect(text, `${name} rendered [object Object]`).not.toMatch(/\[object Object\]/);
      expect(text, `${name} rendered Infinity`).not.toMatch(/Infinity/);
    });
  }
});

describe('empty and error states are stated, not blank', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 401, json: async () => ({}), text: async () => 'unauthorized',
    }));
  });

  it('Leads explains itself when it cannot load', async () => {
    renderAt('/leads', <LeadsPage />);
    await waitFor(() =>
      expect(screen.getByText(/Failed to load leads|No leads yet/i)).toBeInTheDocument()
    );
  });

  it('Watchlist renders a heading even with nothing watched', async () => {
    renderAt('/watchlist', <WatchlistPage />);
    await waitFor(() => expect(screen.getByText(/Watchlist/i)).toBeInTheDocument());
  });

  it('Market Pulse degrades to a message rather than fabricated markets', async () => {
    renderAt('/market', <MarketPulsePage />);
    await waitFor(() => expect(document.body.textContent).toBeTruthy());
    // The old failure mode was inventing plausible market numbers offline.
    expect(document.body.textContent).not.toMatch(/\$342K/);
  });
});
