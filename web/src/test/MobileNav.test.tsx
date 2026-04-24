import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import MobileNav from '../components/MobileNav';

function renderNav(initialPath = '/') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <MobileNav />
    </MemoryRouter>
  );
}

describe('MobileNav', () => {
  beforeEach(() => {
    document.body.style.overflow = '';
  });

  it('renders the hamburger button and page title in the top bar', () => {
    renderNav('/');
    // Scope to the banner (top bar <header>) so drawer contents don't match.
    const topbar = screen.getByRole('banner');
    expect(within(topbar).getByRole('button', { name: /Open menu/i })).toBeInTheDocument();
    expect(within(topbar).getByText('Search')).toBeInTheDocument();
  });

  it('shows a different title for Portfolio route', () => {
    renderNav('/portfolio');
    const topbar = screen.getByRole('banner');
    expect(within(topbar).getByText('Portfolio')).toBeInTheDocument();
  });

  it('derives title for intelligence/:id nested route', () => {
    renderNav('/intelligence/p1');
    const topbar = screen.getByRole('banner');
    expect(within(topbar).getByText('Intelligence')).toBeInTheDocument();
  });

  it('opens the drawer on hamburger click and shows all nav sections', async () => {
    renderNav('/');
    const topbar = screen.getByRole('banner');
    fireEvent.click(within(topbar).getByRole('button', { name: /Open menu/i }));

    // Section labels live in the drawer (<aside>, role=complementary)
    await waitFor(() => {
      expect(screen.getByText('DISCOVER')).toBeInTheDocument();
      expect(screen.getByText('ANALYZE')).toBeInTheDocument();
      expect(screen.getByText('OPERATE')).toBeInTheDocument();
      expect(screen.getByText('TEAMS')).toBeInTheDocument();
    });

    // And a close button — should be inside the drawer
    expect(screen.getByRole('button', { name: /Close menu/i })).toBeInTheDocument();
  });

  it('locks body scroll while drawer is open and restores on close', async () => {
    renderNav('/');
    const topbar = screen.getByRole('banner');
    expect(document.body.style.overflow).toBe('');
    fireEvent.click(within(topbar).getByRole('button', { name: /Open menu/i }));
    await waitFor(() => expect(document.body.style.overflow).toBe('hidden'));
    fireEvent.click(screen.getByRole('button', { name: /Close menu/i }));
    await waitFor(() => expect(document.body.style.overflow).toBe(''));
  });

  it('renders the alerts link in the top bar', () => {
    renderNav('/');
    const topbar = screen.getByRole('banner');
    expect(within(topbar).getByRole('link', { name: /Alerts/i })).toBeInTheDocument();
  });
});
