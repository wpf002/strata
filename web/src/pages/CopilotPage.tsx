import { useState, useRef, useEffect } from 'react';
import { Bot, Send, Sparkles } from 'lucide-react';
import { clsx } from 'clsx';

type Message = { role: 'user' | 'assistant'; content: string };

const SUGGESTIONS = [
  'What are the 5 best cash flow deals in Dallas right now?',
  'Should I buy 4521 Oak Creek Drive?',
  'What offer should I make on a property listed at $342K?',
  'How does BRRRR work and is it right for my strategy?',
  'Compare long-term vs short-term rental for my next purchase',
  'Which of my portfolio properties should I refinance?',
];

const CANNED: Record<string, string> = {
  default: `Based on your strategy settings (LTR, Dallas market, $200K–$500K), I'm seeing strong fundamentals in your target area right now.

**Current market conditions:** Dallas is in a Balanced regime with 2.3 months of inventory. The cap rate median is 5.4% — properties scoring 70+ on STRATA's Deal Score are outperforming that benchmark.

**Top opportunities right now:**
- 4521 Oak Creek Drive ($342K) — Deal Score 81, projected cap rate 6.4%, positive cash flow at standard financing. Priced near fair value.
- 517 Elmwood Avenue ($378K) — Deal Score 77, risk score only 22, 6.1% cap rate. Only 6 days on market — move quickly.

**Recommendation:** Focus on Oak Creek and Elmwood. Both meet your return thresholds. Oak Creek has the stronger deal score; Elmwood has meaningfully lower risk. If you can only move on one, Oak Creek at or below $335K is the stronger long-term hold.

*Confidence: Medium-High. Based on current MLS data, 6 comparable sales, and your configured LTR strategy settings. Verify rent estimates with current active listings before committing capital.*`,
};

export default function CopilotPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, isTyping]);

  const send = async (text: string) => {
    if (!text.trim() || isTyping) return;
    setMessages(prev => [...prev, { role: 'user', content: text }]);
    setInput('');
    setIsTyping(true);
    await new Promise(r => setTimeout(r, 1100));
    const response = CANNED[text] || CANNED.default;
    setMessages(prev => [...prev, { role: 'assistant', content: response }]);
    setIsTyping(false);
  };

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
          <span className="text-xs text-slate-500">50 queries remaining</span>
          <div className="w-24 h-1.5 bg-white/10 rounded-full overflow-hidden">
            <div className="h-full w-3/4 bg-amber-500 rounded-full" />
          </div>
        </div>
      </div>

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
                  <div className="text-sm text-slate-200 leading-relaxed"
                    dangerouslySetInnerHTML={{
                      __html: m.content
                        .replace(/\*\*(.*?)\*\*/g, '<strong class="text-white">$1</strong>')
                        .replace(/\*(.*?)\*/g, '<em class="text-slate-400 text-xs">$1</em>')
                        .replace(/- (.*?)(\n|$)/g, '<div class="flex gap-2 my-1"><span class="text-amber-400 flex-shrink-0">·</span><span class="text-slate-300">$1</span></div>')
                        .replace(/\n\n/g, '<div class="h-2"></div>')
                        .replace(/\n/g, '<br/>')
                    }}
                  />
                </div>
              </div>
            ))}
            {isTyping && (
              <div className="flex gap-3">
                <div className="w-7 h-7 rounded-full bg-amber-500/15 flex items-center justify-center mt-1"><Bot size={14} className="text-amber-400" /></div>
                <div className="glass rounded-xl px-4 py-3">
                  <div className="flex gap-1 items-center h-5">
                    {[0,1,2].map(i => <div key={i} className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />)}
                  </div>
                </div>
              </div>
            )}
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
              onKeyDown={e => e.key === 'Enter' && send(input)}
            />
            <button onClick={() => send(input)} disabled={!input.trim() || isTyping} className="absolute right-3 w-7 h-7 rounded-lg bg-amber-500 flex items-center justify-center disabled:opacity-30 hover:bg-amber-400 transition-all">
              <Send size={13} className="text-slate-900" />
            </button>
          </div>
          <p className="text-[10px] text-slate-600 mt-2 text-center">STRATA Copilot provides estimates, not investment advice. Verify before committing capital.</p>
        </div>
      </div>
    </div>
  );
}
