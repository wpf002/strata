import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import CopilotPage from '../pages/CopilotPage';

vi.mock('../lib/supabase', () => ({
  supabase: { auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null } }) } },
}));
vi.stubEnv('VITE_USE_MOCK', 'true');
vi.stubEnv('VITE_API_URL', 'http://localhost:8080');

function renderCopilot(search = '') {
  return render(
    <MemoryRouter initialEntries={[`/copilot${search}`]}>
      <Routes>
        <Route path="/copilot" element={<CopilotPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('CopilotPage — initial state', () => {
  it('renders STRATA Copilot header', () => {
    renderCopilot();
    expect(screen.getByText('STRATA Copilot')).toBeInTheDocument();
  });

  it('renders all 6 suggestion chips', () => {
    renderCopilot();
    expect(screen.getByText('What are the 5 best cash flow deals in Dallas right now?')).toBeInTheDocument();
    expect(screen.getByText('Should I buy 4521 Oak Creek Drive?')).toBeInTheDocument();
    expect(screen.getAllByRole('button').length).toBeGreaterThanOrEqual(6);
  });

  it('renders input field and send button', () => {
    renderCopilot();
    expect(screen.getByPlaceholderText(/Ask about any property/)).toBeInTheDocument();
  });

  it('renders disclaimer text', () => {
    renderCopilot();
    expect(screen.getByText(/not investment advice/)).toBeInTheDocument();
  });

  it('renders "Powered by Claude" label', () => {
    renderCopilot();
    expect(screen.getByText('Powered by Claude')).toBeInTheDocument();
  });
});

describe('CopilotPage — property context banner', () => {
  it('shows banner when ?property=p1 is in URL', () => {
    renderCopilot('?property=p1');
    expect(screen.getByText('Analyzing:')).toBeInTheDocument();
    // banner shows address in a <span> with specific class — use getAllByText and check first match
    const matches = screen.getAllByText(/4521 Oak Creek Drive/);
    expect(matches.length).toBeGreaterThan(0);
  });

  it('shows View Intelligence link', () => {
    renderCopilot('?property=p1');
    expect(screen.getByText('View Intelligence')).toBeInTheDocument();
  });

  it('does not show banner when no property param', () => {
    renderCopilot();
    expect(screen.queryByText('Analyzing:')).not.toBeInTheDocument();
  });
});

describe('CopilotPage — SSE streaming (fetch mock)', () => {
  beforeEach(() => {
    // Mock a streaming fetch response
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"text":"Hello"}\n\n'));
        controller.enqueue(encoder.encode('data: {"text":" world"}\n\n'));
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      },
    });
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: stream,
      status: 200,
    } as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows user message after sending', async () => {
    renderCopilot();
    const input = screen.getByPlaceholderText(/Ask about any property/);
    fireEvent.change(input, { target: { value: 'What is the best deal?' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => screen.getByText('What is the best deal?'));
  });

  it('streams assistant response token by token', async () => {
    renderCopilot();
    const input = screen.getByPlaceholderText(/Ask about any property/);
    fireEvent.change(input, { target: { value: 'Tell me about Oak Creek' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => screen.getByText('Hello world'), { timeout: 3000 });
  });

  it('calls /copilot/chat endpoint', async () => {
    renderCopilot();
    const input = screen.getByPlaceholderText(/Ask about any property/);
    fireEvent.change(input, { target: { value: 'test question' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/copilot/chat'),
        expect.objectContaining({ method: 'POST' })
      );
    });
  });

  it('includes property_id in request when property context active', async () => {
    renderCopilot('?property=p1');
    const input = screen.getByPlaceholderText(/Ask about any property/);
    fireEvent.change(input, { target: { value: 'test' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => {
      const body = JSON.parse((globalThis.fetch as any).mock.calls[0][1].body);
      expect(body.property_id).toBe('p1');
    });
  });

  it('shows error banner when fetch fails', async () => {
    globalThis.fetch = vi.fn().mockRejectedValueOnce(new Error('Network error'));
    renderCopilot();
    const input = screen.getByPlaceholderText(/Ask about any property/);
    fireEvent.change(input, { target: { value: 'test' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => screen.getByText(/Failed to reach STRATA Copilot/));
  });
});
