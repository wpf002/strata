import { useState, useRef, useEffect, useCallback } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Bot, Send, Sparkles, ExternalLink, AlertCircle, FileText, Download, Copy, Check, ChevronDown, ChevronUp, X, UserPlus, Loader2, History, Trash2, PlusCircle } from 'lucide-react';
import { clsx } from 'clsx';
import {
  logActivity, listClientPortals, createClientPortal, addPortalProperty,
  saveCopilotConversation, listCopilotConversations, getCopilotConversation, deleteCopilotConversation,
  getProperty,
} from '../api/client';
import type { ClientPortalSummary, CopilotConversationSummary } from '../api/client';
import type { Property } from '../types';
import { supabase } from '../lib/supabase';

const BASE_URL = import.meta.env.VITE_API_URL ?? '';

type Message = { role: 'user' | 'assistant'; content: string };

interface InvestmentMemo {
  title: string;
  executiveSummary: string;
  propertyOverview: string;
  marketContext: string;
  financialAnalysis: string;
  riskAssessment: string;
  recommendation: string;
  disclaimer: string;
}

const MEMO_SECTIONS: { key: keyof InvestmentMemo; label: string }[] = [
  { key: 'executiveSummary', label: 'Executive Summary' },
  { key: 'propertyOverview', label: 'Property Overview' },
  { key: 'marketContext', label: 'Market Context' },
  { key: 'financialAnalysis', label: 'Financial Analysis' },
  { key: 'riskAssessment', label: 'Risk Assessment' },
  { key: 'recommendation', label: 'Recommendation' },
  { key: 'disclaimer', label: 'Disclaimer' },
];

const SUGGESTIONS_NO_CONTEXT = [
  'What are the best cash flow deals in Dallas right now?',
  'Should I invest in Dallas or Phoenix right now?',
  'Explain BRRRR strategy to me',
  'What markets should I target for STR?',
  'How do I evaluate a DSCR loan?',
];

const SUGGESTIONS_WITH_PROPERTY = [
  'Is this a good deal at this price?',
  "What's the downside on this property?",
  'What offer should I make?',
  'Generate an investment memo for this property',
  'How does this compare to the Dallas market?',
];

const BASE_URL_API = import.meta.env.VITE_API_URL ?? '';

// ── Send-to-Client Modal ─────────────────────────────────────────────────────
// Connects Copilot → Client Portal: attach the current property to an existing
// portal or spin up a new portal for a selected client.

interface ClientOption { id: string; name: string; email: string | null }

function SendToClientModal({
  propertyId,
  propertyAddress,
  onClose,
}: {
  propertyId: string;
  propertyAddress: string;
  onClose: () => void;
}) {
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [portals, setPortals] = useState<ClientPortalSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<'existing' | 'new'>('existing');
  const [targetPortalId, setTargetPortalId] = useState<string>('');
  const [selectedClientId, setSelectedClientId] = useState<string>('');
  const [portalName, setPortalName] = useState('');
  const [result, setResult] = useState<{ shareUrl: string; portalName: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
        const [clientsRes, portalsList] = await Promise.all([
          fetch(`${BASE_URL_API}/clients`, { headers }).then(r => r.ok ? r.json() : []),
          listClientPortals().catch(() => []),
        ]);
        setClients(clientsRes);
        setPortals(portalsList);
        if (portalsList.length > 0) {
          setTargetPortalId(portalsList[0].id);
        } else {
          setMode('new');
        }
        if (clientsRes.length > 0) setSelectedClientId(clientsRes[0].id);
      } catch {
        setError('Unable to load clients. Are you signed in?');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      let portal: ClientPortalSummary;
      if (mode === 'existing') {
        if (!targetPortalId) throw new Error('Select a portal');
        const detail = await addPortalProperty(targetPortalId, propertyId);
        portal = detail;
      } else {
        if (!selectedClientId) throw new Error('Select a client');
        const clientName = clients.find(c => c.id === selectedClientId)?.name ?? 'Client';
        portal = await createClientPortal(
          selectedClientId,
          portalName.trim() || `${clientName}'s Properties`,
          [propertyId],
        );
      }
      setResult({
        shareUrl: `${window.location.origin}/portal/${portal.magicLinkToken}`,
        portalName: portal.name,
      });
    } catch (e: any) {
      setError(e?.message ?? 'Failed to send to client');
    } finally {
      setSaving(false);
    }
  };

  const copyLink = () => {
    if (!result) return;
    navigator.clipboard.writeText(result.shareUrl).then(() => {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    });
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="glass rounded-2xl w-full max-w-md border border-white/10" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-white">Send to Client</h3>
            <p className="text-xs text-slate-500 truncate">{propertyAddress}</p>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors"><X size={16} /></button>
        </div>

        <div className="p-5 space-y-4">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 size={14} className="animate-spin" /> Loading clients…
            </div>
          ) : result ? (
            <div className="space-y-3">
              <div className="glass rounded-xl p-3 border border-emerald-500/30 bg-emerald-500/5">
                <p className="text-sm font-semibold text-white">Added to {result.portalName}</p>
                <p className="text-xs text-slate-400 mt-0.5">Your client can view this portal without logging in.</p>
              </div>
              <div className="glass rounded-lg p-3 border border-white/8">
                <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Shareable link</p>
                <p className="text-xs text-slate-300 font-mono break-all">{result.shareUrl}</p>
              </div>
              <div className="flex gap-2">
                <button onClick={copyLink} className="btn-primary flex-1 justify-center text-sm">
                  {linkCopied ? <><Check size={13} /> Copied</> : <><Copy size={13} /> Copy Link</>}
                </button>
                <button onClick={onClose} className="btn-ghost flex-1 justify-center text-sm">Done</button>
              </div>
            </div>
          ) : (
            <>
              {error && <p className="text-xs text-red-400 p-2 rounded bg-red-400/10 border border-red-400/20">{error}</p>}

              {/* Mode toggle */}
              <div className="flex gap-1 p-1 rounded-lg bg-white/5">
                <button
                  onClick={() => setMode('existing')}
                  disabled={portals.length === 0}
                  className={clsx('flex-1 text-xs py-1.5 rounded transition-colors',
                    mode === 'existing' ? 'bg-amber-500/20 text-amber-400' : 'text-slate-400 hover:text-white',
                    portals.length === 0 && 'opacity-40 cursor-not-allowed',
                  )}
                >
                  Add to Existing Portal
                </button>
                <button
                  onClick={() => setMode('new')}
                  className={clsx('flex-1 text-xs py-1.5 rounded transition-colors',
                    mode === 'new' ? 'bg-amber-500/20 text-amber-400' : 'text-slate-400 hover:text-white',
                  )}
                >
                  Create New Portal
                </button>
              </div>

              {mode === 'existing' ? (
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Portal</label>
                  <select className="strata-input w-full" value={targetPortalId} onChange={e => setTargetPortalId(e.target.value)}>
                    {portals.map(p => (
                      <option key={p.id} value={p.id}>{p.name} {p.clientName ? `· ${p.clientName}` : ''} ({p.propertyCount})</option>
                    ))}
                  </select>
                </div>
              ) : (
                <>
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">Client</label>
                    {clients.length === 0 ? (
                      <p className="text-xs text-slate-500 p-2 rounded bg-white/5 border border-white/10">
                        Add a client first on the Clients page.
                      </p>
                    ) : (
                      <select className="strata-input w-full" value={selectedClientId} onChange={e => setSelectedClientId(e.target.value)}>
                        {clients.map(c => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    )}
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">Portal Name (optional)</label>
                    <input
                      className="strata-input w-full"
                      placeholder="Defaults to ‘{Client}'s Properties’"
                      value={portalName}
                      onChange={e => setPortalName(e.target.value)}
                    />
                  </div>
                </>
              )}

              <div className="flex gap-2 pt-1">
                <button onClick={onClose} className="btn-ghost flex-1 justify-center text-sm">Cancel</button>
                <button
                  onClick={submit}
                  disabled={saving || (mode === 'existing' && !targetPortalId) || (mode === 'new' && !selectedClientId)}
                  className="btn-primary flex-1 justify-center text-sm"
                >
                  {saving ? <><Loader2 size={13} className="animate-spin" /> Sending…</> : 'Send'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function MemoSection({ label, content }: { label: string; content: string }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="border border-white/8 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-white/3 hover:bg-white/5 transition-colors"
      >
        <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">{label}</span>
        {open ? <ChevronUp size={13} className="text-slate-500" /> : <ChevronDown size={13} className="text-slate-500" />}
      </button>
      {open && (
        <div className="px-4 py-3">
          <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-line">{content}</p>
        </div>
      )}
    </div>
  );
}

function MemoPanel({
  memo,
  propertyAddress,
  onClose,
  onSendToClient,
}: {
  memo: InvestmentMemo;
  propertyAddress: string;
  onClose: () => void;
  onSendToClient: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const memoText = MEMO_SECTIONS.map(s => `## ${s.label}\n\n${memo[s.key]}`).join('\n\n---\n\n');

  const handleCopy = async () => {
    await navigator.clipboard.writeText(`# ${memo.title}\n\n${memoText}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePrint = () => window.print();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm print:relative print:inset-auto print:bg-transparent print:p-0">
      <div className="w-full max-w-2xl max-h-[90vh] flex flex-col glass rounded-2xl border border-white/10 shadow-2xl print:shadow-none print:max-h-none print:overflow-visible">
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-white/8 flex-shrink-0 print:hidden">
          <div>
            <h2 className="text-base font-semibold text-white">{memo.title}</h2>
            <p className="text-xs text-slate-500 mt-0.5">{propertyAddress} · Investment Memo</p>
          </div>
          <div className="flex items-center gap-2 ml-4">
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 text-xs text-slate-400 hover:text-white hover:border-white/20 transition-colors"
            >
              {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
              {copied ? 'Copied' : 'Copy'}
            </button>
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 text-xs text-slate-400 hover:text-white hover:border-white/20 transition-colors"
            >
              <Download size={12} />
              PDF
            </button>
            <button
              onClick={onSendToClient}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/15 border border-amber-500/30 text-xs text-amber-400 hover:bg-amber-500/25 transition-colors"
            >
              <UserPlus size={12} />
              Send to Client
            </button>
            <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-500 hover:text-white hover:bg-white/8 transition-colors">
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Print-only header */}
        <div className="hidden print:block p-8">
          <h1 style={{ fontFamily: 'Georgia, serif', fontSize: '22px', fontWeight: 700, marginBottom: 4 }}>{memo.title}</h1>
          <p style={{ fontSize: '12px', color: '#64748b' }}>{propertyAddress} · Generated by STRATA</p>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3 print:overflow-visible print:px-8">
          {MEMO_SECTIONS.map(s => (
            <MemoSection key={s.key} label={s.label} content={memo[s.key]} />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function CopilotPage() {
  const [searchParams] = useSearchParams();
  const propertyId = searchParams.get('property');
  // Resolve the ?property= id against the API, not the mock set — arriving here
  // from a live listing used to yield null, silently dropping the property
  // banner and the memo's address. getProperty falls back to mock data itself
  // when VITE_USE_MOCK is on, so both modes work through one path.
  const [contextProperty, setContextProperty] = useState<Property | null>(null);
  useEffect(() => {
    if (!propertyId) { setContextProperty(null); return; }
    let cancelled = false;
    getProperty(propertyId)
      .then(p => { if (!cancelled) setContextProperty(p); })
      .catch(() => { if (!cancelled) setContextProperty(null); });
    return () => { cancelled = true; };
  }, [propertyId]);

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);

  const [memo, setMemo] = useState<InvestmentMemo | null>(null);
  const [memoLoading, setMemoLoading] = useState(false);
  const [memoError, setMemoError] = useState<string | null>(null);
  const [showMemo, setShowMemo] = useState(false);
  const [showSendModal, setShowSendModal] = useState(false);

  // Conversation persistence + history
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [history, setHistory] = useState<CopilotConversationSummary[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const saveDebounceRef = useRef<number | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const suggestions = propertyId ? SUGGESTIONS_WITH_PROPERTY : SUGGESTIONS_NO_CONTEXT;

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, isStreaming]);

  // Loading a property context in Copilot counts as intent — log it once.
  const copilotAskTracked = useRef(false);
  useEffect(() => {
    if (!propertyId || copilotAskTracked.current) return;
    copilotAskTracked.current = true;
    logActivity(propertyId, 'copilot_asked');
  }, [propertyId]);

  const loadHistory = useCallback(async () => {
    try {
      const data = await listCopilotConversations();
      setHistory(data);
    } catch {
      setHistory([]);
    }
  }, []);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  // Auto-save the conversation after the assistant finishes responding. Debounced
  // so a rapid stream of chat turns only writes once the exchange settles.
  useEffect(() => {
    if (messages.length === 0 || isStreaming) return;
    if (saveDebounceRef.current) window.clearTimeout(saveDebounceRef.current);
    saveDebounceRef.current = window.setTimeout(async () => {
      try {
        const saved = await saveCopilotConversation({
          id: conversationId ?? undefined,
          propertyId: propertyId ?? null,
          messages,
        });
        setConversationId(saved.id);
        loadHistory();
      } catch { /* silent — history is best-effort */ }
    }, 1500);
    return () => {
      if (saveDebounceRef.current) window.clearTimeout(saveDebounceRef.current);
    };
  }, [messages, isStreaming, conversationId, propertyId, loadHistory]);

  const restoreConversation = async (id: string) => {
    try {
      const conv = await getCopilotConversation(id);
      setMessages(conv.messages);
      setConversationId(conv.id);
      setShowHistory(false);
      // propertyId is in the URL, not state — let user navigate away if needed
    } catch { /* silent */ }
  };

  const newConversation = () => {
    setMessages([]);
    setConversationId(null);
    setInput('');
    setShowHistory(false);
  };

  const removeConversation = async (id: string) => {
    if (!window.confirm('Delete this conversation?')) return;
    try {
      await deleteCopilotConversation(id);
      setHistory(prev => prev.filter(c => c.id !== id));
      if (conversationId === id) newConversation();
    } catch { /* silent */ }
  };

  const generateMemo = useCallback(async () => {
    if (!propertyId || memoLoading) return;
    setMemoError(null);
    setMemoLoading(true);
    try {
      const res = await fetch(`${BASE_URL}/copilot/generate-memo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ property_id: propertyId }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const data: InvestmentMemo = await res.json();
      setMemo(data);
      setShowMemo(true);
    } catch {
      setMemoError('Memo generation failed. Check that the backend and Claude API key are configured.');
    } finally {
      setMemoLoading(false);
    }
  }, [propertyId, memoLoading]);

  const send = async (text: string) => {
    if (!text.trim() || isStreaming) return;
    setStreamError(null);

    const userMsg: Message = { role: 'user', content: text };
    const allMessages = [...messages, userMsg];
    setMessages(allMessages);
    setInput('');
    setIsStreaming(true);

    const assistantMsg: Message = { role: 'assistant', content: '' };
    setMessages(prev => [...prev, assistantMsg]);

    abortRef.current = new AbortController();

    try {
      const res = await fetch(`${BASE_URL}/copilot/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: allMessages,
          property_id: propertyId ?? undefined,
        }),
        signal: abortRef.current.signal,
      });

      if (!res.ok || !res.body) {
        throw new Error(`API error ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const payload = line.slice(6).trim();
          if (payload === '[DONE]') break;
          try {
            const { text: chunk } = JSON.parse(payload);
            setMessages(prev => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              if (last.role === 'assistant') {
                updated[updated.length - 1] = { ...last, content: last.content + chunk };
              }
              return updated;
            });
          } catch {
            // ignore malformed SSE
          }
        }
      }
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      setStreamError('Failed to reach STRATA Copilot. Check that the backend is running.');
      setMessages(prev => prev.slice(0, -1));
    } finally {
      setIsStreaming(false);
    }
  };

  // Strip a Claude response into HTML the chat bubble can render. We split out
  // the trailing confidence/disclaimer paragraph (if present) so it can be
  // visually de-emphasized — readers should focus on the substance, not the
  // boilerplate. Numbers/currency get JetBrains Mono via the .copilot-num span.
  const renderContent = (content: string) => {
    const disclaimerRe = /\n\n(_[\s\S]+_|\*[^*]+\*|Confidence:[\s\S]+|Disclaimer:[\s\S]+)$/;
    const dmatch = content.match(disclaimerRe);
    const body = dmatch ? content.slice(0, dmatch.index) : content;
    const trail = dmatch ? dmatch[1].replace(/^[_*]|[_*]$/g, '').trim() : '';

    const renderInline = (s: string) =>
      s
        .replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold text-white">$1</strong>')
        .replace(/\*(.+?)\*/g, '<em class="text-slate-400">$1</em>')
        // Wrap currency + percentage tokens in JetBrains Mono.
        .replace(/(\$\d[\d,]*(?:\.\d+)?[KkMmBb]?|\b\d+(?:\.\d+)?%|\b\d{1,3}(?:,\d{3})+)/g,
                 '<span class="font-mono text-white">$1</span>');

    const lines = body.split('\n');
    const out: string[] = [];
    let inList = false;
    const closeList = () => { if (inList) { out.push('</ul>'); inList = false; } };

    for (const raw of lines) {
      const line = raw.trimEnd();
      if (!line.trim()) { closeList(); out.push('<div class="h-2"></div>'); continue; }
      // Headings
      let m = line.match(/^### (.*)$/);
      if (m) { closeList(); out.push(`<p class="text-sm font-semibold text-white mt-4 mb-1.5">${renderInline(m[1])}</p>`); continue; }
      m = line.match(/^## (.*)$/);
      if (m) { closeList(); out.push(`<p class="text-xs font-bold text-amber-400 mt-4 mb-2 tracking-widest uppercase">${renderInline(m[1])}</p>`); continue; }
      m = line.match(/^# (.*)$/);
      if (m) { closeList(); out.push(`<p class="text-base font-bold text-white mt-4 mb-2">${renderInline(m[1])}</p>`); continue; }
      // Bullets
      m = line.match(/^[-*] (.*)$/);
      if (m) {
        if (!inList) { out.push('<ul class="space-y-1.5 my-2 ml-1">'); inList = true; }
        out.push(`<li class="flex gap-2.5 leading-relaxed"><span class="text-amber-400 flex-shrink-0 mt-1">•</span><span class="text-slate-200 flex-1">${renderInline(m[1])}</span></li>`);
        continue;
      }
      // Numbered list — convert to bullets for visual consistency
      m = line.match(/^\d+\.\s+(.*)$/);
      if (m) {
        if (!inList) { out.push('<ul class="space-y-1.5 my-2 ml-1">'); inList = true; }
        out.push(`<li class="flex gap-2.5 leading-relaxed"><span class="text-amber-400 flex-shrink-0 mt-1">•</span><span class="text-slate-200 flex-1">${renderInline(m[1])}</span></li>`);
        continue;
      }
      // Paragraph
      closeList();
      out.push(`<p class="text-slate-200 leading-relaxed my-1.5">${renderInline(line)}</p>`);
    }
    closeList();

    if (trail) {
      out.push(`<p class="text-[11px] text-slate-500 italic mt-4 pt-3 border-t border-white/5 leading-relaxed">${renderInline(trail)}</p>`);
    }

    return { __html: out.join('') };
  };

  return (
    <div className="flex flex-col h-full page-fade">
      {/* Memo modal */}
      {showMemo && memo && contextProperty && (
        <MemoPanel
          memo={memo}
          propertyAddress={`${contextProperty.address}, ${contextProperty.city}`}
          onClose={() => setShowMemo(false)}
          onSendToClient={() => { setShowMemo(false); setShowSendModal(true); }}
        />
      )}

      {showSendModal && propertyId && (
        <SendToClientModal
          propertyId={propertyId}
          propertyAddress={contextProperty ? `${contextProperty.address}, ${contextProperty.city}` : propertyId}
          onClose={() => setShowSendModal(false)}
        />
      )}

      {/* Header */}
      <div className="px-4 md:px-6 py-3 md:py-4 border-b border-white/5 flex items-center gap-3 flex-shrink-0">
        <div className="w-8 h-8 rounded-lg bg-amber-500/15 flex items-center justify-center flex-shrink-0">
          <Bot size={16} className="text-amber-400" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-sm font-semibold text-white">STRATA Copilot</h1>
          <p className="text-xs text-slate-500 hidden sm:block">AI-powered real estate intelligence · All outputs include confidence labels</p>
          <p className="text-xs text-slate-500 sm:hidden">AI real estate intelligence</p>
        </div>
        <div className="ml-auto flex items-center gap-2 flex-shrink-0">
          <button
            onClick={newConversation}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 text-xs text-slate-400 hover:text-white hover:border-white/20 transition-colors"
            title="Start new conversation"
          >
            <PlusCircle size={12} /> <span className="hidden sm:inline">New</span>
          </button>
          <button
            onClick={() => setShowHistory(s => !s)}
            className={clsx(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs transition-colors',
              showHistory
                ? 'bg-amber-500/15 border-amber-500/40 text-amber-400'
                : 'border-white/10 text-slate-400 hover:text-white hover:border-white/20',
            )}
          >
            <History size={12} /> <span className="hidden sm:inline">History</span>
            {history.length > 0 && <span className="text-amber-400 font-mono">({history.length})</span>}
          </button>
          <span className="text-xs text-slate-500 hidden md:inline">Powered by Claude</span>
        </div>
      </div>

      {/* Property context banner */}
      {contextProperty && (
        <div className="px-4 md:px-6 py-2.5 border-b border-amber-500/20 bg-amber-500/5 flex flex-wrap items-center gap-2 md:gap-3 flex-shrink-0">
          <div className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
          <span className="text-xs text-amber-400 font-semibold">Analyzing:</span>
          <span className="text-xs text-slate-300 truncate max-w-[60vw] md:max-w-none">{contextProperty.address}, {contextProperty.city}</span>
          <div className="ml-auto flex items-center gap-2 flex-shrink-0">
            <button
              onClick={memo ? () => setShowMemo(true) : generateMemo}
              disabled={memoLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/15 border border-amber-500/30 text-xs text-amber-400 hover:bg-amber-500/25 disabled:opacity-50 transition-colors"
            >
              {memoLoading ? (
                <>
                  <div className="w-3 h-3 border border-amber-400 border-t-transparent rounded-full animate-spin" />
                  <span className="hidden sm:inline">Generating…</span>
                </>
              ) : (
                <>
                  <FileText size={12} />
                  <span className="hidden sm:inline">{memo ? 'View Memo' : 'Generate Investment Memo'}</span>
                  <span className="sm:hidden">{memo ? 'View' : 'Memo'}</span>
                </>
              )}
            </button>
            <Link
              to={`/intelligence/${contextProperty.id}`}
              className="hidden md:flex items-center gap-1 text-xs text-slate-500 hover:text-amber-400 transition-colors"
            >
              View Intelligence <ExternalLink size={11} />
            </Link>
          </div>
        </div>
      )}

      {/* Memo error */}
      {memoError && (
        <div className="px-4 md:px-6 py-2 border-b border-red-500/20 bg-red-500/5 flex items-center gap-2 flex-shrink-0">
          <AlertCircle size={13} className="text-red-400 flex-shrink-0" />
          <span className="text-xs text-red-400">{memoError}</span>
          <button onClick={() => setMemoError(null)} className="ml-auto text-xs text-red-400 hover:text-red-300"><X size={12} /></button>
        </div>
      )}

      {/* Stream error */}
      {streamError && (
        <div className="px-4 md:px-6 py-2 border-b border-red-500/20 bg-red-500/5 flex items-center gap-2 flex-shrink-0">
          <AlertCircle size={13} className="text-red-400" />
          <span className="text-xs text-red-400">{streamError}</span>
        </div>
      )}

      {/* History panel (collapsible sidebar) */}
      {showHistory && (
        <div className="border-b border-white/5 bg-white/3 max-h-72 overflow-y-auto flex-shrink-0">
          <div className="px-4 md:px-6 py-3">
            {history.length === 0 ? (
              <p className="text-xs text-slate-500 py-3 text-center">No past conversations yet.</p>
            ) : (
              <div className="space-y-1">
                {history.map(h => (
                  <div
                    key={h.id}
                    className={clsx(
                      'flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors',
                      conversationId === h.id
                        ? 'border-amber-500/40 bg-amber-500/5'
                        : 'border-white/5 hover:border-white/15 hover:bg-white/3',
                    )}
                    onClick={() => restoreConversation(h.id)}
                  >
                    <History size={12} className="text-slate-500 flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-white truncate">{h.title}</p>
                      <p className="text-[10px] text-slate-500">
                        {h.messageCount} {h.messageCount === 1 ? 'message' : 'messages'} · {new Date(h.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                        {h.propertyId && <span> · {h.propertyId}</span>}
                      </p>
                    </div>
                    <button
                      onClick={e => { e.stopPropagation(); removeConversation(h.id); }}
                      className="text-slate-500 hover:text-red-400 transition-colors"
                      aria-label="Delete conversation"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 md:px-6 py-4 md:py-6">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full">
            <div className="w-14 h-14 rounded-2xl bg-amber-500/10 flex items-center justify-center mb-4">
              <Sparkles size={24} className="text-amber-400" />
            </div>
            <h2 className="text-lg md:text-xl font-semibold text-white mb-2 text-center">What would you like to know?</h2>
            <p className="text-slate-500 text-sm mb-2 text-center max-w-md">Ask about any property, market, or deal. Every answer includes confidence labels and data sources.</p>
            <p className="text-[11px] text-slate-600 mb-6 md:mb-8 text-center max-w-md">
              Copilot automatically uses your <Link to="/settings" className="text-amber-400 hover:text-amber-300 underline">strategy</Link>, target markets, and <Link to="/portfolio" className="text-amber-400 hover:text-amber-300 underline">portfolio</Link> to tailor answers. Open a property from search to load it as context, or paste details directly into the chat for one-off questions.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl w-full">
              {suggestions.map(s => (
                <button key={s} onClick={() => send(s)} className="text-left p-3.5 rounded-xl border border-white/8 glass hover:border-amber-500/30 hover:bg-amber-500/5 transition-all">
                  <p className="text-sm text-slate-300 leading-snug">{s}</p>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto space-y-5">
            {messages.map((m, i) => (
              <div key={i} className={clsx('flex gap-3', m.role === 'user' && 'flex-row-reverse')}>
                <div className={clsx('w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold mt-1', m.role === 'user' ? 'bg-navy-700 text-amber-400' : 'bg-amber-500/15 text-amber-400')}>
                  {m.role === 'user' ? 'W' : <Bot size={14} />}
                </div>
                <div className={clsx('rounded-2xl px-5 py-4 max-w-[85%]', m.role === 'user' ? 'glass-dark' : 'glass')}>
                  {m.content ? (
                    <div className="text-sm leading-relaxed copilot-msg" dangerouslySetInnerHTML={renderContent(m.content)} />
                  ) : (
                    <div className="flex gap-1 items-center h-5">
                      {[0,1,2].map(j => <div key={j} className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-bounce" style={{ animationDelay: `${j * 0.15}s` }} />)}
                    </div>
                  )}
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Input */}
      <div className="px-4 md:px-6 py-3 md:py-4 border-t border-white/5 flex-shrink-0">
        <div className="max-w-3xl mx-auto">
          <div className="relative flex items-center">
            <input
              className="strata-input pr-12 py-3.5"
              placeholder="Ask about any property, deal, or market…"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send(input)}
            />
            <button onClick={() => send(input)} disabled={!input.trim() || isStreaming} className="absolute right-3 w-7 h-7 rounded-lg bg-amber-500 flex items-center justify-center disabled:opacity-30 hover:bg-amber-400 transition-all">
              <Send size={13} className="text-slate-900" />
            </button>
          </div>
          <p className="text-[10px] text-slate-600 mt-2 text-center">STRATA Copilot provides estimates, not investment advice. Verify before committing capital.</p>
        </div>
      </div>
    </div>
  );
}
