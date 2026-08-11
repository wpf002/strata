import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SectionTabsBar } from '../components/SectionTabs';
import { PRIMARY_NAV, isInSection } from '../components/sections';

function renderBar(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <SectionTabsBar />
    </MemoryRouter>
  );
}

describe('SectionTabsBar', () => {
  it('shows Feed + Watchlist inside the Search section', () => {
    renderBar('/');
    const nav = screen.getByRole('link', { name: /Opportunity Feed/ }).parentElement!;
    expect(within(nav).getByRole('link', { name: /Watchlist/ })).toBeInTheDocument();
  });

  it('keeps the Search section active while on /watchlist', () => {
    renderBar('/watchlist');
    expect(screen.getByRole('link', { name: /Watchlist/ })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: /Opportunity Feed/ })).not.toHaveAttribute('aria-current');
  });

  it('shows Intelligence + Underwrite for a property route, including /intelligence/:id', () => {
    renderBar('/intelligence/abc123');
    expect(screen.getByRole('link', { name: /Intelligence/ })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: /Underwrite/ })).toBeInTheDocument();
  });

  it('shows Clients + Leads under the Clients section', () => {
    renderBar('/leads');
    expect(screen.getByRole('link', { name: /Leads/ })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: /Clients/ })).toBeInTheDocument();
  });

  it('renders nothing for sections that own a single page', () => {
    const { container } = renderBar('/portfolio');
    expect(container).toBeEmptyDOMElement();
  });
});

describe('primary nav', () => {
  it('is six destinations', () => {
    expect(PRIMARY_NAV).toHaveLength(6);
  });

  it('routes that used to be top-level now resolve into a parent section', () => {
    const parentOf = (path: string) => PRIMARY_NAV.find(i => isInSection(path, i))?.label;
    expect(parentOf('/watchlist')).toBe('Search');
    expect(parentOf('/underwrite')).toBe('Property');
    expect(parentOf('/leads')).toBe('Clients');
  });

  it('does not light Search for every route', () => {
    const search = PRIMARY_NAV.find(i => i.label === 'Search')!;
    expect(isInSection('/', search)).toBe(true);
    expect(isInSection('/portfolio', search)).toBe(false);
    expect(isInSection('/clients', search)).toBe(false);
  });
});
