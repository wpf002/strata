import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ErrorBoundary from '../components/ErrorBoundary';
import RoutedErrorBoundary from '../components/RoutedErrorBoundary';

function Boom(): never {
  throw new Error('kaboom from a page');
}

function Fine() {
  return <p>page content</p>;
}

/**
 * Before this existed, any uncaught render error unmounted the whole React
 * tree and left a blank white page — no message, no nav, no way back. In a
 * user test that means the session ends and you learn nothing about why.
 */
describe('ErrorBoundary', () => {
  beforeEach(() => {
    // React logs caught errors; keep the test output readable.
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it('renders children when nothing throws', () => {
    render(<ErrorBoundary><Fine /></ErrorBoundary>);
    expect(screen.getByText('page content')).toBeInTheDocument();
  });

  it('shows a readable message instead of a blank page when a child throws', () => {
    render(<ErrorBoundary><Boom /></ErrorBoundary>);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/Something broke/i)).toBeInTheDocument();
    // The page must not simply be empty.
    expect((document.body.textContent ?? '').length).toBeGreaterThan(40);
  });

  it('names the failing area so a tester can report it', () => {
    render(<ErrorBoundary label="Portfolio"><Boom /></ErrorBoundary>);
    expect(screen.getByText(/Something broke on Portfolio/i)).toBeInTheDocument();
  });

  it('offers a way to recover', () => {
    render(<ErrorBoundary><Boom /></ErrorBoundary>);
    expect(screen.getByRole('button', { name: /Try again/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Back to Search/i })).toBeInTheDocument();
  });

  it('re-renders children after Try again when the fault is transient', () => {
    let shouldThrow = true;
    function Flaky() {
      if (shouldThrow) throw new Error('transient');
      return <p>recovered</p>;
    }

    render(<ErrorBoundary><Flaky /></ErrorBoundary>);
    expect(screen.getByText(/Something broke/i)).toBeInTheDocument();

    shouldThrow = false;
    fireEvent.click(screen.getByRole('button', { name: /Try again/i }));
    expect(screen.getByText('recovered')).toBeInTheDocument();
  });

  it('keeps the technical detail available but out of the way', () => {
    render(<ErrorBoundary><Boom /></ErrorBoundary>);
    expect(screen.getByText(/Technical details/i)).toBeInTheDocument();
    expect(screen.getByText(/kaboom from a page/)).toBeInTheDocument();
  });
});

describe('RoutedErrorBoundary', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it('labels the error with the current page', () => {
    render(
      <MemoryRouter initialEntries={['/portfolio']}>
        <RoutedErrorBoundary><Boom /></RoutedErrorBoundary>
      </MemoryRouter>
    );
    expect(screen.getByText(/Something broke on Portfolio/i)).toBeInTheDocument();
  });

  it('falls back to a generic label for unknown routes', () => {
    render(
      <MemoryRouter initialEntries={['/something-else']}>
        <RoutedErrorBoundary><Boom /></RoutedErrorBoundary>
      </MemoryRouter>
    );
    expect(screen.getByText(/Something broke on this page/i)).toBeInTheDocument();
  });

  it('clears the error when the route changes', () => {
    // MemoryRouter only reads initialEntries on mount, so drive the reset key
    // directly — that is the mechanism RoutedErrorBoundary feeds it.
    const { rerender } = render(
      <ErrorBoundary resetKey="/portfolio" label="Portfolio"><Boom /></ErrorBoundary>
    );
    expect(screen.getByText(/Something broke/i)).toBeInTheDocument();

    rerender(<ErrorBoundary resetKey="/clients" label="Clients"><Fine /></ErrorBoundary>);
    expect(screen.getByText('page content')).toBeInTheDocument();
    expect(screen.queryByText(/Something broke/i)).not.toBeInTheDocument();
  });

  it('keeps showing the error while the user stays on the broken page', () => {
    const { rerender } = render(
      <ErrorBoundary resetKey="/portfolio" label="Portfolio"><Boom /></ErrorBoundary>
    );
    rerender(<ErrorBoundary resetKey="/portfolio" label="Portfolio"><Boom /></ErrorBoundary>);
    expect(screen.getByText(/Something broke on Portfolio/i)).toBeInTheDocument();
  });
});
