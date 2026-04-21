import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import IntelligencePage from '../pages/IntelligencePage';

vi.mock('../lib/supabase', () => ({
  supabase: { auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null } }) } },
}));
vi.stubEnv('VITE_USE_MOCK', 'true');
vi.stubEnv('VITE_API_URL', '');

// Mock getValuation and getRisk (not called in mock mode from getProperty, but called on tab switch)
vi.mock('../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/client')>();
  return {
    ...actual,
    getProperty: vi.fn().mockImplementation((id: string) =>
      (actual as any).getProperty(id)
    ),
    getValuation: vi.fn().mockResolvedValue({
      propertyId: 'p1',
      fairValueLow: 318000,
      fairValueHigh: 347000,
      fairValueMid: 332500,
      confidence: 'High',
      compCount: 5,
      comps: [],
      adjustmentPerSqft: 60,
    }),
    getRisk: vi.fn().mockResolvedValue({
      propertyId: 'p1',
      compositeScore: 31,
      dimensions: [
        { name: 'Pricing', score: 30, description: '-1.4% vs AVM' },
        { name: 'Days on Market', score: 28, description: '23d (zip median 30d)' },
        { name: 'Condition', score: 38, description: 'Built 2001 (23 yrs old)' },
      ],
      flags: [{ label: 'HVAC age est. 14 yrs', severity: 'Medium' }],
      floodRisk: { zone: 'X', inSfha: false, riskLabel: 'Low Risk', description: 'Minimal flood risk' },
    }),
  };
});

function renderPage(id = 'p1') {
  return render(
    <MemoryRouter initialEntries={[`/intelligence/${id}`]}>
      <Routes>
        <Route path="/intelligence/:id" element={<IntelligencePage />} />
        <Route path="/" element={<div>Search Page</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('IntelligencePage', () => {
  it('shows loading skeleton initially', () => {
    renderPage();
    // skeleton divs have animate-pulse class
    const skeletons = document.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('renders property address after load', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByRole('heading', { name: '4521 Oak Creek Drive' })).toBeInTheDocument());
  });

  it('renders deal score badge', async () => {
    renderPage();
    await waitFor(() => expect(screen.getAllByText(/81/)[0]).toBeInTheDocument());
  });

  it('renders all six tab buttons', async () => {
    renderPage();
    await waitFor(() => screen.getByRole('heading', { name: '4521 Oak Creek Drive' }));
    for (const tab of ['Overview', 'Financials', 'Valuation', 'Risk', 'Market', 'History']) {
      expect(screen.getByRole('button', { name: tab })).toBeInTheDocument();
    }
  });

  it('Overview tab shows cap rate stat card', async () => {
    renderPage();
    await waitFor(() => screen.getByRole('heading', { name: '4521 Oak Creek Drive' }));
    expect(screen.getByText('Cap Rate')).toBeInTheDocument();
  });

  it('Overview tab shows rent estimate', async () => {
    renderPage();
    await waitFor(() => screen.getByText('Rent Estimate'));
  });

  it('clicking Financials tab renders DSCR card', async () => {
    renderPage();
    await waitFor(() => screen.getByRole('heading', { name: '4521 Oak Creek Drive' }));
    fireEvent.click(screen.getByRole('button', { name: 'Financials' }));
    expect(screen.getByText('DSCR')).toBeInTheDocument();
  });

  it('clicking Valuation tab calls getValuation and shows estimate', async () => {
    const { getValuation } = await import('../api/client');
    renderPage();
    await waitFor(() => screen.getByRole('heading', { name: '4521 Oak Creek Drive' }));
    fireEvent.click(screen.getByRole('button', { name: 'Valuation' }));
    await waitFor(() => expect(getValuation).toHaveBeenCalledWith('p1'));
    await waitFor(() => screen.getByText(/STRATA Fair Value Estimate/));
  });

  it('clicking Risk tab calls getRisk and shows composite score', async () => {
    const { getRisk } = await import('../api/client');
    renderPage();
    await waitFor(() => screen.getByRole('heading', { name: '4521 Oak Creek Drive' }));
    fireEvent.click(screen.getByRole('button', { name: 'Risk' }));
    await waitFor(() => expect(getRisk).toHaveBeenCalledWith('p1'));
    await waitFor(() => screen.getByText('Composite Risk Score'));
  });

  it('Risk tab shows FEMA flood zone badge', async () => {
    renderPage();
    await waitFor(() => screen.getByRole('heading', { name: '4521 Oak Creek Drive' }));
    fireEvent.click(screen.getByRole('button', { name: 'Risk' }));
    await waitFor(() => screen.getByText('FEMA Flood Zone'));
    expect(screen.getAllByText('Low Risk').length).toBeGreaterThan(0);
  });

  it('Ask Copilot button is present', async () => {
    renderPage();
    await waitFor(() => screen.getByRole('button', { name: /Ask Copilot/ }));
  });

  it('Run Full Analysis button is present', async () => {
    renderPage();
    await waitFor(() => screen.getByRole('button', { name: /Run Full Analysis/ }));
  });

  it('redirects to / on 404', async () => {
    const { getProperty } = await import('../api/client');
    vi.mocked(getProperty).mockRejectedValueOnce(new Error('API error 404: not found'));
    renderPage('nonexistent');
    await waitFor(() => screen.getByText(/Property not found/), { timeout: 4000 });
  });
});
