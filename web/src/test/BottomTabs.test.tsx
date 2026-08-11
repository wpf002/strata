import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import BottomTabs from '../components/BottomTabs';

function renderTabs(initialPath = '/') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <BottomTabs />
    </MemoryRouter>
  );
}

describe('BottomTabs', () => {
  it('renders the five primary destinations', () => {
    renderTabs('/');
    const nav = screen.getByRole('navigation', { name: /Primary/i });
    for (const label of ['Search', 'Market', 'Portfolio', 'Copilot', 'Clients']) {
      expect(within(nav).getByRole('link', { name: label })).toBeInTheDocument();
    }
  });

  it('marks the active tab with aria-current', () => {
    renderTabs('/portfolio');
    const nav = screen.getByRole('navigation', { name: /Primary/i });
    expect(within(nav).getByRole('link', { name: 'Portfolio' })).toHaveAttribute('aria-current', 'page');
    expect(within(nav).getByRole('link', { name: 'Search' })).not.toHaveAttribute('aria-current');
  });

  it('keeps Search active only on the exact root path', () => {
    renderTabs('/clients');
    const nav = screen.getByRole('navigation', { name: /Primary/i });
    expect(within(nav).getByRole('link', { name: 'Search' })).not.toHaveAttribute('aria-current');
    expect(within(nav).getByRole('link', { name: 'Clients' })).toHaveAttribute('aria-current', 'page');
  });

  it('treats nested routes as active for their parent tab', () => {
    renderTabs('/clients/abc123');
    const nav = screen.getByRole('navigation', { name: /Primary/i });
    expect(within(nav).getByRole('link', { name: 'Clients' })).toHaveAttribute('aria-current', 'page');
  });
});
