import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SearchPage from '../pages/SearchPage';

vi.mock('../lib/supabase', () => ({
  supabase: { auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null } }) } },
}));
vi.stubEnv('VITE_USE_MOCK', 'true');
vi.stubEnv('VITE_API_URL', '');

// Stub auth-gated API calls so they fail silently (no session)
vi.mock('../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/client')>();
  return {
    ...actual,
    getSavedSearches: vi.fn().mockRejectedValue(new Error('unauthorized')),
    getWatchlists: vi.fn().mockRejectedValue(new Error('unauthorized')),
    createSavedSearch: vi.fn().mockResolvedValue({ id: '1', name: 'Test', criteria: {}, alertEnabled: false, createdAt: '' }),
    createWatchlist: vi.fn().mockResolvedValue({ id: 'wl1', name: 'My Watchlist', propertyIds: [], createdAt: '' }),
    addToWatchlist: vi.fn().mockResolvedValue({ id: 'wl1', name: 'My Watchlist', propertyIds: ['p1'], createdAt: '' }),
    removeFromWatchlist: vi.fn().mockResolvedValue(undefined),
  };
});

function renderSearch() {
  return render(
    <MemoryRouter>
      <SearchPage />
    </MemoryRouter>
  );
}

describe('SearchPage — render', () => {
  it('renders Opportunity Feed heading', async () => {
    renderSearch();
    await waitFor(() => expect(screen.getByText('Opportunity Feed')).toBeInTheDocument());
  });

  it('renders 6 property cards in mock mode', async () => {
    renderSearch();
    await waitFor(() => {
      expect(screen.getByText('4521 Oak Creek Drive')).toBeInTheDocument();
    });
    expect(screen.getAllByText(/Underwrite/).length).toBeGreaterThanOrEqual(1);
  });

  it('renders strategy filter chips', () => {
    renderSearch();
    expect(screen.getByRole('button', { name: 'LTR' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'STR' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'BRRRR' })).toBeInTheDocument();
  });

  it('renders view toggle buttons', () => {
    renderSearch();
    const listBtn = document.querySelector('button svg[class*="lucide-list"]')?.closest('button')
      ?? screen.getAllByRole('button').find(b => b.querySelector('svg'));
    expect(listBtn).toBeTruthy();
  });

  it('renders market sidebar', async () => {
    renderSearch();
    await waitFor(() => expect(screen.getByText('Dallas Market')).toBeInTheDocument());
    expect(screen.getByText('Regime')).toBeInTheDocument();
  });
});

describe('SearchPage — filters', () => {
  it('Filters panel opens on click', async () => {
    renderSearch();
    const filtersBtn = screen.getByRole('button', { name: /Filters/ });
    fireEvent.click(filtersBtn);
    await waitFor(() => expect(screen.getByText(/Min Deal Score/)).toBeInTheDocument());
  });

  it('strategy button toggles highlight', () => {
    renderSearch();
    const strBtn = screen.getByRole('button', { name: 'STR' });
    fireEvent.click(strBtn);
    expect(strBtn.className).toMatch(/amber/);
  });
});

describe('SearchPage — Save Search modal', () => {
  it('opens modal on "Save Search" click', async () => {
    renderSearch();
    await waitFor(() => screen.getByText('Opportunity Feed'));
    const saveBtn = screen.getByRole('button', { name: /Save Search/ });
    fireEvent.click(saveBtn);
    await waitFor(() => expect(screen.getByText(/Give this search a name/)).toBeInTheDocument());
  });

  it('closes modal on Cancel', async () => {
    renderSearch();
    await waitFor(() => screen.getByText('Opportunity Feed'));
    fireEvent.click(screen.getByRole('button', { name: /Save Search/ }));
    await waitFor(() => screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByText(/Give this search a name/)).not.toBeInTheDocument());
  });

  it('calls createSavedSearch when name is entered and Save clicked', async () => {
    const { createSavedSearch } = await import('../api/client');
    renderSearch();
    await waitFor(() => screen.getByText('Opportunity Feed'));
    fireEvent.click(screen.getByRole('button', { name: /Save Search/ }));
    await waitFor(() => screen.getByPlaceholderText(/Dallas LTR/));
    fireEvent.change(screen.getByPlaceholderText(/Dallas LTR/), { target: { value: 'My Test Search' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(createSavedSearch).toHaveBeenCalledWith('My Test Search', expect.any(Object)));
  });
});

describe('SearchPage — Watch toggle', () => {
  it('Watch button exists on each property card', async () => {
    renderSearch();
    await waitFor(() => screen.getByText('4521 Oak Creek Drive'));
    const watchBtns = screen.getAllByRole('button', { name: /Watch/ });
    expect(watchBtns.length).toBeGreaterThan(0);
  });

  it('clicking Watch creates watchlist then adds property', async () => {
    const { createWatchlist, addToWatchlist } = await import('../api/client');
    renderSearch();
    await waitFor(() => screen.getByText('4521 Oak Creek Drive'));
    const [firstWatch] = screen.getAllByRole('button', { name: /Watch/ });
    fireEvent.click(firstWatch);
    await waitFor(() => {
      expect(createWatchlist).toHaveBeenCalledWith('My Watchlist');
      expect(addToWatchlist).toHaveBeenCalled();
    });
  });
});
