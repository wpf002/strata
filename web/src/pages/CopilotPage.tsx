import { useState, useRef, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Bot, Send, Sparkles, ExternalLink, AlertCircle } from 'lucide-react';
import { clsx } from 'clsx';
import { mockProperties } from '../data/mockData';

const BASE_URL = import.meta.env.VITE_API_URL ?? '';

type Message = { role: 'user' | 'assistant'; content: string };

const SUGGESTIONS = [
  'What are the 5 best cash flow deals in Dallas right now?',
  'Should I buy 4521 Oak Creek Drive?',
  'What offer should I make on a property listed at $342K?',
  'How does BRRRR work and is it right for my strategy?',
  'Compare long-term vs short-term rental for my next purchase',
  'Which of my portfolio properties should I refinance?',
];

export default function CopilotPage() {
  const [searchParams] = useSearchParams();
  const propertyId = searchParams.get('property');
  const contextProperty = propertyId ? mockProperties.find(p => p.id === propertyId) ?? null : null;

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, isStreaming]);

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

  const renderContent = (content: string) => ({
    __html: content
      .replace(/\*\*(.*?)\*\*/g, '<strong class="text-white">$1</strong>')
      .replace(/\*(.*?)\*/g, '<em class="text-slate-400 text-xs">$1</em>')
      .replace(/^- (.*?)$/gm, '<div class="flex gap-2 my-1"><span class="text-amber-400 flex-shrink-0">·</span><span class="text-slate-300">$1</span></div>')
      .replace(/\n\n/g, '<div class="h-2"></div>')
      .replace(/\n/g, '<br/>'),
  });

  return (
    <div className="flex flex-col h-full page-fade">
      {/* Header */}
      <div className="px-6 py-4 border-b border-white/5 flex items-center gap-3 flex-shrink-0">
        <div className="w-8 h-8 rounded-lg bg-amber-500/15 flex items-center justify-center">
          <Bot size={16} className="text-amber-400" />
        </div>
        <div>
          <h1 className="text-sm font-semibold text-white">STRATA Copilot</h1>
          <p className="text-xs text-slate-500">AI-powered real estate intelligence · All outputs include confidence labels</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-slate-500">Powered by Claude</span>
        </div>
      </div>

      {/* Property context banner */}
      {contextProperty && (
        <div className="px-6 py-2.5 border-b border-amber-500/20 bg-amber-500/5 flex items-center gap-3 flex-shrink-0">
          <div className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
          <span className="text-xs text-amber-400 font-semibold">Analyzing:</span>
          <span className="text-xs text-slate-300">{contextProperty.address}, {contextProperty.city}</span>
          <Link
            to={`/intelligence/${contextProperty.id}`}
            className="ml-auto flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300 transition-colors"
          >
            View Intelligence <ExternalLink size={11} />
          </Link>
        </div>
      )}

      {/* Error */}
      {streamError && (
        <div className="px-6 py-2 border-b border-red-500/20 bg-red-500/5 flex items-center gap-2 flex-shrink-0">
          <AlertCircle size={13} className="text-red-400" />
          <span className="text-xs text-red-400">{streamError}</span>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full">
            <div className="w-14 h-14 rounded-2xl bg-amber-500/10 flex items-center justify-center mb-4">
              <Sparkles size={24} className="text-amber-400" />
            </div>
            <h2 className="text-xl font-semibold text-white mb-2" style={{ fontFamily: "'DM Serif Display', serif" }}>What would you like to know?</h2>
            <p className="text-slate-500 text-sm mb-8 text-center max-w-md">Ask about any property, market, or deal. Every answer includes confidence labels and data sources.</p>
            <div className="grid grid-cols-2 gap-3 max-w-2xl w-full">
              {SUGGESTIONS.map(s => (
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
                <div className={clsx('rounded-xl px-4 py-3 max-w-[85%]', m.role === 'user' ? 'glass-dark' : 'glass')}>
                  {m.content ? (
                    <div className="text-sm text-slate-200 leading-relaxed" dangerouslySetInnerHTML={renderContent(m.content)} />
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
      <div className="px-6 py-4 border-t border-white/5 flex-shrink-0">
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
