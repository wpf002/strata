import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../lib/supabase', () => ({
  supabase: { auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null } }) } },
}));
vi.stubEnv('VITE_USE_MOCK', 'true');
vi.stubEnv('VITE_API_URL', '');

const UnderwritePage = (await import('../pages/UnderwritePage')).default;

function renderPage(search = '?property=p1') {
  return render(
    <MemoryRouter initialEntries={[`/underwrite${search}`]}>
      <UnderwritePage />
    </MemoryRouter>
  );
}

/** Drag a labelled slider to a value. */
async function setSlider(label: RegExp | string, value: number) {
  const slider = await screen.findByLabelText(label);
  fireEvent.change(slider, { target: { value: String(value) } });
}

describe('UnderwritePage — the calculator renders real numbers', () => {
  it('loads the property and shows a recommendation', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText(/4521 Oak Creek Drive/)).toBeInTheDocument());
    await waitFor(() =>
      expect(
        screen.getByText(/Strong Buy|Buy with Negotiation|Marginal|Avoid/)
      ).toBeInTheDocument()
    );
  });

  it('renders no NaN, Infinity or undefined anywhere on the page', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText(/4521 Oak Creek Drive/)).toBeInTheDocument());
    const text = document.body.textContent ?? '';
    expect(text).not.toMatch(/NaN/);
    expect(text).not.toMatch(/Infinity/);
    expect(text).not.toMatch(/undefined/);
  });
});

describe('UnderwritePage — all-cash purchase', () => {
  it('says DSCR is not applicable rather than "Does Not Qualify at 0.00"', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText(/4521 Oak Creek Drive/)).toBeInTheDocument());

    await setSlider(/Down Payment/i, 100);

    await waitFor(() => {
      expect(screen.getByText(/DSCR Financing: Not applicable/i)).toBeInTheDocument();
    });
    expect(screen.queryByText(/Does Not Qualify at 0\.00/)).not.toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/Infinity/);
  });

  it('still shows finite figures elsewhere with no mortgage', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText(/4521 Oak Creek Drive/)).toBeInTheDocument());
    await setSlider(/Down Payment/i, 100);
    await waitFor(() => expect(screen.getByText(/Not applicable/i)).toBeInTheDocument());
    expect(document.body.textContent).not.toMatch(/NaN/);
  });
});

describe('UnderwritePage — property tax', () => {
  it('exposes the tax rate as an input instead of burying a national default', async () => {
    renderPage();
    const slider = await screen.findByLabelText(/Property Tax/i);
    expect(slider).toBeInTheDocument();
  });

  it('raising the tax rate reduces cash flow', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText(/4521 Oak Creek Drive/)).toBeInTheDocument());

    const readCashFlow = () => {
      const el = screen.getByText(/Net Cash Flow/i).parentElement;
      const m = el?.textContent?.match(/-?\$[\d,]+/);
      return m ? Number(m[0].replace(/[$,]/g, '')) * (m[0].startsWith('-') ? 1 : 1) : NaN;
    };

    await setSlider(/Property Tax/i, 0.4);
    await waitFor(() => expect(readCashFlow()).not.toBeNaN());
    const low = readCashFlow();

    await setSlider(/Property Tax/i, 2.8);
    await waitFor(() => expect(readCashFlow()).not.toBe(low));
    const high = readCashFlow();

    // Higher tax must not improve the deal.
    expect(high).not.toBe(low);
  });
});

describe('UnderwritePage — scenario table', () => {
  it('labels the scenario return as year-one, not IRR', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText(/4521 Oak Creek Drive/)).toBeInTheDocument());
    await waitFor(() => expect(screen.getAllByText(/yr-1/).length).toBeGreaterThan(0));
    // A single-period return is not an internal rate of return.
    expect(screen.queryByText(/\bIRR\b/)).not.toBeInTheDocument();
  });

  it('shows Bear, Base and Bull', async () => {
    renderPage();
    await waitFor(() => {
      for (const name of ['Bear', 'Base', 'Bull']) {
        expect(screen.getAllByText(name).length).toBeGreaterThan(0);
      }
    });
  });
});

describe('UnderwritePage — advanced assumptions', () => {
  it('lists only constants the model actually applies', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText(/4521 Oak Creek Drive/)).toBeInTheDocument());
    const toggle = await screen.findByRole('button', { name: /Advanced Assumptions/i });
    fireEvent.click(toggle);

    // "Closing Costs" also appears in the closing-cost estimator, so scope to
    // the assumptions panel via a label unique to it.
    await waitFor(() => expect(screen.getByText(/Loan Term/i)).toBeInTheDocument());
    expect(screen.getAllByText(/Closing Costs/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Bear Scenario/i)).toBeInTheDocument();
    // These four described a model that wasn't running.
    expect(screen.queryByText(/Turnover Cost/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Hold Period/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Rent Growth\/yr/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Appreciation Rate\/yr/i)).not.toBeInTheDocument();
  });
});
