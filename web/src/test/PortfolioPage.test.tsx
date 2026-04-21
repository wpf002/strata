import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import PortfolioPage from '../pages/PortfolioPage';
import { mockPortfolioHoldings } from '../data/mockData';

vi.mock('../lib/supabase', () => ({
  supabase: { auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null } }) } },
}));
vi.stubEnv('VITE_USE_MOCK', 'true');
vi.stubEnv('VITE_API_URL', '');

vi.mock('../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/client')>();
  const holding = {
    id: 'new-1',
    address: '123 Test St, Dallas, TX',
    purchasePrice: 300000,
    purchaseDate: '2024-01-01',
    currentValue: 310000,
    loanBalance: 225000,
    equity: 85000,
    monthlyRent: 2000,
    monthlyExpenses: 1200,
    cashFlow: 800,
    capRate: 5.2,
    status: 'Active',
    recommendation: 'Hold' as const,
    recommendationNote: 'Solid performer',
    image: 'https://example.com/img.jpg',
    appreciation: 3.3,
    totalReturn: 12.1,
  };
  return {
    ...actual,
    createHolding: vi.fn().mockResolvedValue(holding),
    updateHolding: vi.fn().mockResolvedValue(holding),
  };
});

function renderPortfolio() {
  return render(<MemoryRouter><PortfolioPage /></MemoryRouter>);
}

describe('PortfolioPage — render with holdings', () => {
  it('renders Portfolio heading', async () => {
    renderPortfolio();
    await waitFor(() => expect(screen.getByText('Portfolio')).toBeInTheDocument());
  });

  it('renders Total Value stat', async () => {
    renderPortfolio();
    await waitFor(() => expect(screen.getByText('Total Value')).toBeInTheDocument());
  });

  it('renders all mock holdings in sidebar', async () => {
    renderPortfolio();
    await waitFor(() => {
      for (const h of mockPortfolioHoldings) {
        expect(screen.getByText(h.address.split(',')[0])).toBeInTheDocument();
      }
    });
  });

  it('renders Add Property button', async () => {
    renderPortfolio();
    await waitFor(() => {
      const btns = screen.getAllByRole('button', { name: /Add Property/ });
      expect(btns.length).toBeGreaterThan(0);
    });
  });

  it('renders charts area', async () => {
    renderPortfolio();
    await waitFor(() => expect(screen.getByText('Portfolio Equity Growth')).toBeInTheDocument());
  });
});

describe('PortfolioPage — Add Property modal', () => {
  it('opens modal when Add Property is clicked', async () => {
    renderPortfolio();
    await waitFor(() => screen.getAllByRole('button', { name: /Add Property/ }));
    const [addBtn] = screen.getAllByRole('button', { name: /Add Property/ });
    fireEvent.click(addBtn);
    await waitFor(() => expect(screen.getByText(/Give this search a name|Address \*/)).toBeInTheDocument());
  });

  it('modal has all required fields', async () => {
    renderPortfolio();
    await waitFor(() => screen.getAllByRole('button', { name: /Add Property/ }));
    fireEvent.click(screen.getAllByRole('button', { name: /Add Property/ })[0]);
    await waitFor(() => screen.getByPlaceholderText(/123 Main St/));
    expect(screen.getByPlaceholderText(/350000/)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/262500/)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/2200/)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/1400/)).toBeInTheDocument();
  });

  it('closes on Cancel', async () => {
    renderPortfolio();
    await waitFor(() => screen.getAllByRole('button', { name: /Add Property/ }));
    fireEvent.click(screen.getAllByRole('button', { name: /Add Property/ })[0]);
    await waitFor(() => screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByPlaceholderText(/123 Main St/)).not.toBeInTheDocument());
  });

  it('calls createHolding on Save', async () => {
    const { createHolding } = await import('../api/client');
    renderPortfolio();
    await waitFor(() => screen.getAllByRole('button', { name: /Add Property/ }));
    fireEvent.click(screen.getAllByRole('button', { name: /Add Property/ })[0]);
    await waitFor(() => screen.getByPlaceholderText(/123 Main St/));
    fireEvent.change(screen.getByPlaceholderText(/123 Main St/), { target: { value: '999 Test Ave' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Property' }));
    await waitFor(() => expect(createHolding).toHaveBeenCalledWith(
      expect.objectContaining({ address: '999 Test Ave' })
    ));
  });

  it('shows validation error if address is empty', async () => {
    renderPortfolio();
    await waitFor(() => screen.getAllByRole('button', { name: /Add Property/ }));
    fireEvent.click(screen.getAllByRole('button', { name: /Add Property/ })[0]);
    await waitFor(() => screen.getByRole('button', { name: 'Save Property' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save Property' }));
    await waitFor(() => expect(screen.getByText('Address is required')).toBeInTheDocument());
  });
});

describe('PortfolioPage — Update Actuals', () => {
  it('Update Actuals button is present in Quick Actions', async () => {
    renderPortfolio();
    await waitFor(() => expect(screen.getByText('Update Actuals')).toBeInTheDocument());
  });

  it('clicking Update Actuals opens modal pre-filled', async () => {
    renderPortfolio();
    await waitFor(() => screen.getByRole('button', { name: /Update Actuals/ }));
    fireEvent.click(screen.getByRole('button', { name: /Update Actuals/ }));
    await waitFor(() => expect(screen.getAllByText(/Update Actuals/).length).toBeGreaterThan(1));
  });
});
