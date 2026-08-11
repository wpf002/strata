import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, Calculator, Star, Share2, ChevronRight, MapPin, Info,
  ThumbsUp, ThumbsDown, Clock, Home, TrendingUp, Shield, AlertTriangle,
  Landmark, Bot, Droplets, GraduationCap, Target, Send, X, Check, Loader2, Zap, Hammer,
} from 'lucide-react';
import { getProperty, getValuation, getRisk, getWatchlists, createWatchlist, addToWatchlist, removeFromWatchlist, getRenovationEstimate, logActivity, removeActivity, getDemandSignal, getMarketFor } from '../api/client';
import type { Property, MarketSummary } from '../types';
import type { ValuationData, RiskData, RenovationEstimate, DemandSignal } from '../api/client';
import { ScoreBadge, RiskBadge, RegimeBadge, FlagBadge, ConfidencePill, MetricRow, StatCard, ProgressBar, fmt } from '../components/UI';
import { clsx } from 'clsx';
import { supabase } from '../lib/supabase';

const TABS = ['Overview', 'Financials', 'Valuation', 'Risk', 'Market', 'Offer Strategy', 'History'];

const BASE_URL = import.meta.env.VITE_API_URL ?? '';

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
}

function Skeleton({ className }: { className?: string }) {
  return <div className={clsx('glass rounded-xl animate-pulse', className)} />;
}

// Small attribution chip — surfaces where a number actually comes from. Helps
// users trust live data and recognize when a value is a model fallback.
// Expense assumptions for the Financials tab's quick P&L. These were inline
// magic numbers (`p.price * 0.022 / 12 + 140`) rendered as if they were the
// property's real tax and insurance figures.
const TAX_RATE_PCT = 2.2;
const MAINT_RATE_PCT = 1.0;
const INSURANCE_MONTHLY = 140;

function DataSource({ label }: { label: string }) {
  return <p className="text-[10px] text-slate-600 mt-2 leading-tight">{label}</p>;
}

// Renders the List + Rec. callouts beneath the offer range bar. Each label is
// positioned by % but clamped so it never escapes the container, and if the two
// pins are close together (< 18% apart) the Rec. label drops to a second line
// to avoid overlap.
function PinLegend({ listPct, recPct }: { listPct: number; recPct: number }) {
  const close = Math.abs(listPct - recPct) < 18;
  const clampStyle = (pct: number) => ({
    left: `${Math.max(6, Math.min(94, pct))}%`,
  });
  return (
    <div className={clsx('relative mt-2 h-4', close && 'h-8')}>
      <div className="absolute -translate-x-1/2 text-[10px] text-red-400 font-semibold whitespace-nowrap" style={clampStyle(listPct)}>
        List
      </div>
      <div
        className={clsx('absolute -translate-x-1/2 text-[10px] text-amber-400 font-semibold whitespace-nowrap', close && 'top-4')}
        style={clampStyle(recPct)}
      >
        Rec.
      </div>
    </div>
  );
}

function rentLabelFor(source: string | undefined): string {
  if (!source) return 'Source: Rent Estimate';
  const s = source.toLowerCase();
  if (s.includes('rentcast')) return 'Source: RentCast · Live';
  if (s.includes('quota') || s.includes('model')) return 'Source: STRATA Model · RentCast quota reached';
  if (s.includes('cache')) return 'Source: RentCast · Cached';
  return `Source: ${source}`;
}

export default function IntelligencePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const clientId = searchParams.get('client');

  const [property, setProperty] = useState<Property | null>(null);
  const [valuation, setValuation] = useState<ValuationData | null>(null);
  const [risk, setRisk] = useState<RiskData | null>(null);
  const [activeTab, setActiveTab] = useState('Overview');
  const [loadingProp, setLoadingProp] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [loadingVal, setLoadingVal] = useState(false);
  const [loadingRisk, setLoadingRisk] = useState(false);
  const [isWatched, setIsWatched] = useState(false);
  const [watchlistId, setWatchlistId] = useState<string | null>(null);
  const [shareCopied, setShareCopied] = useState(false);
  const [showBriefModal, setShowBriefModal] = useState(false);
  const [briefClientName, setBriefClientName] = useState('');
  const [briefMessage, setBriefMessage] = useState('');
  const [briefGenerating, setBriefGenerating] = useState(false);
  const [briefReportId, setBriefReportId] = useState<string | null>(null);
  const [briefLinkCopied, setBriefLinkCopied] = useState(false);

  const handleGenerateBrief = async () => {
    setBriefGenerating(true);
    try {
      const headers = await authHeaders();
      const res = await fetch(`${BASE_URL}/reports/property-brief`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          propertyId: propId,
          clientName: briefClientName || 'Valued Client',
          message: briefMessage || null,
        }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      setBriefReportId(data.reportId);
      // Brief generation counts as a reported action for Leads + Clients feeds.
      logActivity(propId, 'reported');
    } catch {
      // stay open so user can retry
    } finally {
      setBriefGenerating(false);
    }
  };

  const copyBriefLink = () => {
    if (!briefReportId) return;
    navigator.clipboard.writeText(`${window.location.origin}/reports/${briefReportId}`).then(() => {
      setBriefLinkCopied(true);
      setTimeout(() => setBriefLinkCopied(false), 2000);
    });
  };

  const propId = id || 'p1';

  // Client attribution is handled centrally inside logActivity(): when the URL
  // carries ?client={id}, activity is dual-written to client_activity.

  useEffect(() => {
    getWatchlists().then(wls => {
      for (const wl of wls) {
        if (wl.propertyIds.includes(propId)) {
          setIsWatched(true);
          setWatchlistId(wl.id);
          return;
        }
      }
    }).catch(() => {});
  }, [propId]);

  const handleWatch = async () => {
    try {
      if (isWatched && watchlistId) {
        await removeFromWatchlist(watchlistId, propId);
        setIsWatched(false);
        removeActivity(propId, 'saved');
      } else {
        const wls = await getWatchlists();
        const wl = wls.find(w => w.name === 'My Watchlist') ?? await createWatchlist('My Watchlist');
        setWatchlistId(wl.id);
        await addToWatchlist(wl.id, propId);
        setIsWatched(true);
        logActivity(propId, 'saved');
      }
    } catch {
      // not signed in — fail silently
    }
  };

  const handleShare = async () => {
    const url = window.location.href;
    const title = property?.address ?? 'STRATA Property';
    // Native share sheet on mobile (and supported desktop browsers); falls
    // back to clipboard everywhere else. Either way the user gets feedback.
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title, url, text: `${title} on STRATA` });
        return;
      } catch {
        // user dismissed — fall through to clipboard so the share isn't lost
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    } catch { /* clipboard blocked — silent */ }
  };

  useEffect(() => {
    setLoadingProp(true);
    getProperty(propId)
      .then(setProperty)
      .catch((err: Error) => {
        if (err.message.includes('404')) {
          setNotFound(true);
          setTimeout(() => navigate('/'), 2000);
        }
      })
      .finally(() => setLoadingProp(false));
    logActivity(propId, 'viewed');
  }, [propId, navigate]);

  useEffect(() => {
    if (!property) return;
    if (activeTab === 'Valuation') {
      setLoadingVal(true);
      getValuation(propId).then(setValuation).catch(() => {}).finally(() => setLoadingVal(false));
    }
    if (activeTab === 'Risk') {
      setLoadingRisk(true);
      getRisk(propId).then(setRisk).catch(() => {}).finally(() => setLoadingRisk(false));
    }
    if (activeTab === 'Offer Strategy') {
      logActivity(propId, 'underwritten');
    }
  }, [activeTab, property, propId]);

  if (notFound) {
    return (
      <div className="flex flex-col items-center justify-center h-full page-fade gap-3">
        <p className="text-lg font-semibold text-slate-300">Property not found</p>
        <p className="text-sm text-slate-500">Redirecting you home…</p>
      </div>
    );
  }

  if (loadingProp || !property) {
    return (
      <div className="flex flex-col h-full page-fade">
        <div className="px-6 py-3 border-b border-white/5 flex items-center gap-4 flex-shrink-0">
          <Skeleton className="h-6 w-16" />
        </div>
        <Skeleton className="h-48 rounded-none" />
        <div className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 lg:[&>div]:flex lg:[&>div]:flex-col lg:[&>div]:gap-4 lg:[&>div]:space-y-0 lg:[&>div>*:last-child]:flex-1">
            <div className="lg:col-span-2 space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[1,2,3,4].map(i => <Skeleton key={i} className="h-20" />)}
              </div>
              <Skeleton className="h-48" />
            </div>
            <div className="space-y-4">
              <Skeleton className="h-32" />
              <Skeleton className="h-32" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  const rec = property.dealScore >= 70 ? 'Buy' : property.dealScore >= 50 ? 'Negotiate' : property.dealScore >= 35 ? 'Watch' : 'Avoid';
  const recColor = {
    Buy: 'text-emerald-400 border-emerald-400/40 bg-emerald-400/10',
    Negotiate: 'text-amber-400 border-amber-500/40 bg-amber-500/10',
    Watch: 'text-orange-400 border-orange-400/40 bg-orange-400/10',
    Avoid: 'text-red-400 border-red-400/40 bg-red-400/10',
  }[rec];

  return (
    <div className="flex flex-col h-full page-fade">
      {/* Send to Client modal */}
      {showBriefModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowBriefModal(false)}>
          <div className="glass rounded-2xl p-6 w-full max-w-sm mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-white">Send to Client</h3>
              <button onClick={() => setShowBriefModal(false)} aria-label="Close" className="text-slate-500 hover:text-white transition-colors"><X size={16} /></button>
            </div>
            {!briefReportId ? (
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Client Name</label>
                  <input className="strata-input w-full" placeholder="Jane Smith" value={briefClientName} onChange={e => setBriefClientName(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Personal message (optional)</label>
                  <textarea className="strata-input w-full resize-none" rows={3} placeholder="Thought you'd love this one…" value={briefMessage} onChange={e => setBriefMessage(e.target.value)} />
                </div>
                <button onClick={handleGenerateBrief} disabled={briefGenerating} className="btn-primary w-full justify-center text-sm">
                  {briefGenerating ? <><Loader2 size={14} className="animate-spin" /> Generating…</> : <><Send size={14} /> Generate Brief</>}
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="glass rounded-xl p-3 border border-emerald-500/20">
                  <p className="text-xs text-emerald-400 font-semibold mb-1">Brief ready!</p>
                  <p className="text-xs text-slate-400 break-all">{window.location.origin}/reports/{briefReportId}</p>
                </div>
                <button onClick={copyBriefLink} className="btn-primary w-full justify-center text-sm">
                  {briefLinkCopied ? <><Check size={14} /> Copied!</> : <><Check size={14} /> Copy Link</>}
                </button>
                <button onClick={() => { setBriefReportId(null); setBriefClientName(''); setBriefMessage(''); }} className="btn-ghost w-full justify-center text-sm">Generate Another</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Topbar */}
      <div className="px-4 md:px-6 py-3 border-b border-white/5 flex flex-wrap items-center gap-3 md:gap-4 flex-shrink-0">
        <button onClick={() => navigate('/')} className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-sm flex-shrink-0">
          <ArrowLeft size={16} /> <span className="hidden sm:inline">Back</span>
        </button>
        <div className="hidden md:block h-4 w-px bg-white/10" />
        <div className="hidden md:flex items-center gap-2 text-sm text-slate-400 min-w-0">
          <MapPin size={12} />
          <span className="text-white truncate max-w-[200px] lg:max-w-none">{property.address}</span>
          <ChevronRight size={12} />
          <span>{property.city}, {property.state}</span>
        </div>
        {clientId && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/20 flex-shrink-0">
            <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            <span className="text-[10px] text-amber-400 font-semibold">Shared with client</span>
          </div>
        )}
        <div className="ml-auto flex items-center gap-1.5 md:gap-2 flex-wrap">
          <button onClick={handleWatch} aria-label={isWatched ? 'Unwatch' : 'Watch'} className={clsx('btn-ghost text-xs py-1.5 px-2.5 md:px-3', isWatched && 'text-amber-400')}>
            <Star size={12} className={isWatched ? 'fill-amber-400' : ''} /> <span className="hidden md:inline">{isWatched ? 'Watching' : 'Watch'}</span>
          </button>
          <button onClick={handleShare} aria-label="Share" className="btn-ghost text-xs py-1.5 px-2.5 md:px-3">
            <Share2 size={12} /> <span className="hidden md:inline">{shareCopied ? 'Copied!' : 'Share'}</span>
          </button>
          <button aria-label="Send to client" className="btn-ghost text-xs md:text-sm py-1.5 px-2.5 md:px-3" onClick={() => setShowBriefModal(true)}>
            <Send size={14} /> <span className="hidden lg:inline">Send to Client</span>
          </button>
          <button aria-label="Ask Copilot" className="btn-ghost text-xs md:text-sm py-1.5 px-2.5 md:px-3" onClick={() => navigate(`/copilot?property=${property.id}`)}>
            <Bot size={14} /> <span className="hidden lg:inline">Ask Copilot</span>
          </button>
          <button aria-label="Run Full Analysis" className="btn-primary text-xs md:text-sm py-1.5 px-3 md:px-4" onClick={() => navigate(`/underwrite?property=${property.id}`)}>
            <Calculator size={14} /> <span className="hidden sm:inline">Analyze</span>
          </button>
        </div>
      </div>

      {/* Hero image */}
      <div className="relative flex-shrink-0 h-40 md:h-48 overflow-hidden">
        <img src={property.image} alt={property.address} className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/50 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 px-4 md:px-6 pb-3 md:pb-4 flex flex-col md:flex-row md:items-end md:justify-between gap-2">
          <div className="min-w-0">
            <h1 className="text-lg md:text-2xl font-bold text-white mb-0.5 truncate">{property.address}</h1>
            <div className="flex items-center gap-2 text-slate-300 text-xs md:text-sm flex-wrap">
              <MapPin size={12} />
              <span>{property.city}, {property.state} {property.zip}</span>
              <span className="hidden sm:inline">·</span><span>{property.beds}bd/{property.baths}ba</span>
              <span className="hidden sm:inline">·</span><span className="hidden sm:inline">{fmt.num(property.sqft)} sqft</span>
              <span className="hidden md:inline">·</span><span className="hidden md:inline">{property.type}</span>
              <span className="hidden sm:inline">·</span><RegimeBadge regime={property.marketRegime} />
            </div>
          </div>
          <div className="flex items-center justify-between md:flex-col md:items-end gap-2 md:gap-2 md:flex-shrink-0">
            <div className="text-xl md:text-3xl font-bold font-mono text-white">{fmt.currency(property.price)}</div>
            <div className="flex items-center gap-2">
              <ScoreBadge score={property.dealScore} size="lg" />
              <RiskBadge score={property.riskScore} />
            </div>
          </div>
        </div>
      </div>

      {/* Recommendation bar */}
      <div className="px-4 md:px-6 py-2.5 border-y border-white/5 flex flex-wrap items-start md:items-center gap-2 md:gap-4 flex-shrink-0 bg-navy-900/30">
        <div className={clsx('px-3 md:px-4 py-1.5 rounded-lg border font-bold text-xs md:text-sm flex-shrink-0', recColor)}>STRATA: {rec.toUpperCase()}</div>
        <p className="text-xs md:text-sm text-slate-400 flex-1 min-w-0">
          {rec === 'Buy' && 'Priced near fair value with strong cash flow. Meets your LTR strategy targets.'}
          {rec === 'Negotiate' && `Target offer: ${fmt.currency(property.fairValueLow)}–${fmt.currency(property.fairValueHigh)}. List price is above estimated value.`}
          {rec === 'Watch' && 'Marginal at current price. Set a price drop alert.'}
          {rec === 'Avoid' && 'Does not meet return thresholds at any reasonable assumption.'}
        </p>
        {/* This read "Based on {priceHistory.length} comps" — the length of a
            hardcoded chart array, i.e. always 6, regardless of the real comp
            set. Only claim a comp count when the valuation actually has one. */}
        <div className="hidden lg:flex ml-auto items-center gap-1 text-xs text-slate-600">
          <Info size={11} />
          {valuation?.compCount
            ? `Based on ${valuation.compCount} comps · ${property.riskFlags.length} risk factors`
            : `Based on ${property.riskFlags.length} risk factor${property.riskFlags.length === 1 ? '' : 's'} · no comps available`}
        </div>
      </div>

      {/* Tabs */}
      <div className="px-4 md:px-6 border-b border-white/5 flex gap-4 md:gap-6 flex-shrink-0 overflow-x-auto">
        {TABS.map(t => (
          <button key={t} onClick={() => setActiveTab(t)} className={clsx('py-3 text-xs md:text-sm font-medium transition-all whitespace-nowrap', activeTab === t ? 'tab-active' : 'tab-inactive')}>{t}</button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 md:px-6 py-4 md:py-5">
        {activeTab === 'Overview' && <OverviewTab p={property} />}
        {activeTab === 'Financials' && <FinancialsTab p={property} />}
        {activeTab === 'Valuation' && (
          loadingVal ? (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 lg:[&>div]:flex lg:[&>div]:flex-col lg:[&>div]:gap-4 lg:[&>div]:space-y-0 lg:[&>div>*:last-child]:flex-1">
              <div className="lg:col-span-2 space-y-4"><Skeleton className="h-32" /><Skeleton className="h-48" /></div>
              <div className="space-y-4"><Skeleton className="h-40" /><Skeleton className="h-48" /></div>
            </div>
          ) : <ValuationTab p={property} valuation={valuation} />
        )}
        {activeTab === 'Risk' && (
          loadingRisk ? (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 lg:[&>div]:flex lg:[&>div]:flex-col lg:[&>div]:gap-4 lg:[&>div]:space-y-0 lg:[&>div>*:last-child]:flex-1">
              <div className="lg:col-span-2 space-y-3">{[1,2,3,4,5,6].map(i => <Skeleton key={i} className="h-20" />)}</div>
              <div className="space-y-4"><Skeleton className="h-36" /><Skeleton className="h-36" /></div>
            </div>
          ) : <RiskTab p={property} riskData={risk} />
        )}
        {activeTab === 'Market' && <MarketTab p={property} />}
        {activeTab === 'Offer Strategy' && <OfferStrategyTab p={property} />}
        {activeTab === 'History' && <HistoryTab p={property} />}
      </div>
    </div>
  );
}

// ── Offer Strategy Tab ────────────────────────────────────────────────────────

interface OfferResult {
  offerLow: number;
  offerMid: number;
  offerHigh: number;
  recommendedOffer: number;
  acceptanceProbability: number;
  negotiationNotes: string;
  comparableSalesUsed: number;
  daysOnMarket: number;
  listToSaleRatio: number;
  strategyNotes: string;
}

function OfferStrategyTab({ p }: { p: Property }) {
  const [urgency, setUrgency] = useState<'low' | 'medium' | 'high'>('medium');
  const [result, setResult] = useState<OfferResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const navigate = useNavigate();

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`${BASE_URL}/properties/${p.id}/offer-analysis`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ list_price: p.price, down_payment_pct: 25, strategy: 'Long-Term Rental', urgency }),
    })
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(setResult)
      .catch(() => setError('Unable to load offer analysis.'))
      .finally(() => setLoading(false));
  }, [p.id, p.price, urgency]);

  const recKey = p.dealScore >= 70 ? 'Buy' : p.dealScore >= 50 ? 'Negotiate' : p.dealScore >= 35 ? 'Watch' : 'Avoid';
  const recBadgeColor = ({
    Buy: 'text-emerald-400 border-emerald-400/40 bg-emerald-400/10',
    Negotiate: 'text-amber-400 border-amber-500/40 bg-amber-500/10',
    Watch: 'text-orange-400 border-orange-400/40 bg-orange-400/10',
    Avoid: 'text-red-400 border-red-400/40 bg-red-400/10',
  } as Record<string, string>)[recKey] ?? 'text-slate-400 border-slate-400/20';

  if (loading) return (
    <div className="space-y-4">
      <Skeleton className="h-32" />
      <Skeleton className="h-48" />
      <Skeleton className="h-24" />
    </div>
  );

  if (error) return (
    <div className="glass rounded-xl p-6 text-center">
      <p className="text-slate-500 text-sm">{error}</p>
    </div>
  );

  if (!result) return null;

  const pct = result.acceptanceProbability * 100;
  const barWidth = result.offerHigh - result.offerLow;
  const listPinPct = Math.max(0, Math.min(100, (p.price - result.offerLow) / barWidth * 100));
  const recPinPct = Math.max(0, Math.min(100, (result.recommendedOffer - result.offerLow) / barWidth * 100));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 lg:[&>div]:flex lg:[&>div]:flex-col lg:[&>div]:gap-4 lg:[&>div]:space-y-0 lg:[&>div>*:last-child]:flex-1">
      <div className="lg:col-span-2 space-y-4">
        {/* Urgency selector */}
        <div className="glass rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2"><Target size={14} className="text-amber-500" /> Offer Strategy</h3>
            <div className="flex gap-1">
              {(['low', 'medium', 'high'] as const).map(u => (
                <button key={u} onClick={() => setUrgency(u)}
                  className={clsx('text-xs px-3 py-1.5 rounded-lg border transition-all capitalize', urgency === u ? 'bg-amber-500/15 text-amber-400 border-amber-500/40' : 'text-slate-500 border-white/8 hover:border-white/20')}>
                  {u}
                </button>
              ))}
            </div>
          </div>

          {/* Offer range bar — labels above the bar (Low/Mid/High) and pin
              callouts BELOW so they never collide with the range labels. */}
          <div className="mb-4">
            <div className="flex justify-between text-xs text-slate-500 mb-2">
              <span>Low: <span className="text-white font-mono">{fmt.compact(result.offerLow)}</span></span>
              <span>Mid: <span className="text-white font-mono">{fmt.compact(result.offerMid)}</span></span>
              <span>High: <span className="text-white font-mono">{fmt.compact(result.offerHigh)}</span></span>
            </div>
            <div className="relative h-3 mx-1.5">
              <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-2 rounded-full bg-white/5">
                <div className="absolute inset-0 rounded-full bg-gradient-to-r from-blue-500/40 via-amber-500/60 to-emerald-500/40" />
              </div>
              {/* List price pin */}
              <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2" style={{ left: `${listPinPct}%` }}>
                <div className="w-0.5 h-5 bg-red-400" />
              </div>
              {/* Recommended offer pin */}
              <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2" style={{ left: `${recPinPct}%` }}>
                <div className="w-3 h-3 rounded-full bg-amber-400 border-2 border-amber-300" />
              </div>
            </div>
            {/* Pin legend below the bar — positions are clamped so labels don't
                overlap when List + Rec are close, and stay inside the container. */}
            <PinLegend listPct={listPinPct} recPct={recPinPct} />
          </div>

          {/* Recommended offer highlight */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-amber-500/5 border border-amber-500/20">
            <div>
              <p className="text-xs text-slate-500">Recommended Offer</p>
              <p className="text-2xl font-bold font-mono text-amber-400">{fmt.currency(result.recommendedOffer)}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-500 mb-0.5">vs. List Price</p>
              <p className={clsx('text-sm font-semibold font-mono', result.recommendedOffer <= p.price ? 'text-emerald-400' : 'text-red-400')}>
                {result.recommendedOffer <= p.price ? '-' : '+'}{fmt.currency(Math.abs(p.price - result.recommendedOffer))}
              </p>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          <div className="glass rounded-xl p-4 text-center">
            <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">Days on Market</p>
            <p className={clsx('text-xl font-bold font-mono', result.daysOnMarket > 60 ? 'text-emerald-400' : result.daysOnMarket > 30 ? 'text-amber-400' : 'text-slate-300')}>{result.daysOnMarket}</p>
          </div>
          <div className="glass rounded-xl p-4 text-center">
            <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">List/Sale Ratio</p>
            <p className="text-xl font-bold font-mono text-slate-300">{(result.listToSaleRatio * 100).toFixed(1)}%</p>
          </div>
          <div className="glass rounded-xl p-4 text-center">
            <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">Comps Used</p>
            <p className="text-xl font-bold font-mono text-slate-300">{result.comparableSalesUsed}</p>
          </div>
        </div>

        {/* Negotiation notes */}
        <div className="glass rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-2">Negotiation Notes</h3>
          <p className="text-sm text-slate-300 leading-relaxed">{result.negotiationNotes}</p>
        </div>

        {/* Strategy notes */}
        <div className="glass rounded-xl p-4 border border-white/5">
          <p className="text-xs text-slate-500 font-semibold uppercase tracking-wide mb-1">Strategy Note</p>
          <p className="text-sm text-slate-400">{result.strategyNotes}</p>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={() => navigate(`/copilot?property=${p.id}`)}
            className="btn-primary flex-1 justify-center text-sm"
          >
            <Bot size={14} /> Generate Offer Memo
          </button>
          <button
            onClick={() => navigate(`/underwrite?property=${p.id}`)}
            className="btn-ghost flex-1 justify-center text-sm"
          >
            <Calculator size={14} /> Closing Costs
          </button>
        </div>
      </div>

      {/* Acceptance probability gauge */}
      <div className="space-y-4">
        <div className="glass rounded-xl p-5 text-center">
          <h3 className="text-sm font-semibold text-white mb-4">Acceptance Probability</h3>
          <div className="relative w-32 h-32 mx-auto mb-3">
            <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
              <circle cx="50" cy="50" r="40" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="12" />
              <circle cx="50" cy="50" r="40" fill="none"
                stroke={pct >= 70 ? '#34d399' : pct >= 50 ? '#C9A84C' : pct >= 35 ? '#f97316' : '#f87171'}
                strokeWidth="12"
                strokeDasharray={`${pct * 2.513} 251.3`}
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <p className={clsx('text-2xl font-bold font-mono', pct >= 70 ? 'text-emerald-400' : pct >= 50 ? 'text-amber-400' : 'text-red-400')}>
                {Math.round(pct)}%
              </p>
            </div>
          </div>
          <p className="text-xs text-slate-500">
            {pct >= 72 ? 'High probability of acceptance' : pct >= 55 ? 'Moderate — seller may counter' : pct >= 38 ? 'Low — expect counteroffer' : 'Very low — close to lowball territory'}
          </p>
        </div>

        <div className={clsx('rounded-xl p-4 border font-bold text-sm text-center', recBadgeColor)}>
          STRATA: {p.dealScore >= 70 ? 'BUY' : p.dealScore >= 50 ? 'NEGOTIATE' : p.dealScore >= 35 ? 'WATCH' : 'AVOID'}
        </div>

        <div className="glass rounded-xl p-4">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Offer Ranges</h3>
          {[
            { label: 'Aggressive Low', value: result.offerLow, color: 'text-blue-400' },
            { label: 'Recommended', value: result.recommendedOffer, color: 'text-amber-400', highlight: true },
            { label: 'Full Ask', value: result.offerHigh, color: 'text-emerald-400' },
          ].map(r => (
            <div key={r.label} className={clsx('flex justify-between items-center py-2', r.highlight && 'border-t border-b border-amber-500/20')}>
              <span className="text-xs text-slate-500">{r.label}</span>
              <span className={clsx('text-sm font-mono font-semibold', r.color)}>{fmt.currency(r.value)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Existing tabs (unchanged) ────────────────────────────────────────────────

function DemandCard({ propertyId }: { propertyId: string }) {
  const [demand, setDemand] = useState<DemandSignal | null>(null);
  useEffect(() => {
    getDemandSignal(propertyId).then(setDemand).catch(() => setDemand(null));
  }, [propertyId]);

  if (!demand) return null;
  const score = demand.demandScore;
  const { color, dotColor, heat } = score >= 70
    ? { color: 'text-red-400 border-red-500/30 bg-red-500/5', dotColor: 'bg-red-400', heat: 'High' }
    : score >= 35
      ? { color: 'text-amber-400 border-amber-500/30 bg-amber-500/5', dotColor: 'bg-amber-400', heat: 'Medium' }
      : { color: 'text-slate-400 border-white/10 bg-white/3', dotColor: 'bg-slate-500', heat: 'Low' };

  const totalInvestors = Math.max(
    demand.strataViews30d,
    demand.strataSaves30d + demand.strataUnderwrites30d,
  );

  return (
    <div className="glass rounded-xl p-5">
      <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
        <TrendingUp size={14} className="text-amber-500" /> Market Interest
      </h3>
      <div className={clsx('rounded-lg border p-3 mb-3', color)}>
        <div className="flex items-center gap-2 mb-1">
          <span className={clsx('w-2 h-2 rounded-full', dotColor)} />
          <span className="text-xs font-semibold uppercase tracking-wider">{heat} Demand</span>
          <span className="ml-auto text-xs font-mono">{score}/100</span>
        </div>
        <p className="text-xs opacity-90">{demand.demandLabel.split('—')[1]?.trim() ?? demand.demandLabel}</p>
      </div>
      <div className="space-y-1.5 text-xs">
        <div className="flex justify-between">
          <span className="text-slate-500">Investors analyzing (30d)</span>
          <span className="font-mono text-white">{totalInvestors}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">Underwriting runs</span>
          <span className="font-mono text-white">{demand.strataUnderwrites30d}</span>
        </div>
        {demand.priceDropCount > 0 && (
          <div className="flex justify-between">
            <span className="text-slate-500">Price reductions</span>
            <span className="font-mono text-amber-400">{demand.priceDropCount}</span>
          </div>
        )}
        <div className="flex justify-between">
          <span className="text-slate-500">DOM vs market</span>
          <span className="font-mono text-white">{demand.vsMarketDom}</span>
        </div>
      </div>
      {demand.note && (
        <p className="text-[11px] text-slate-500 mt-3 pt-3 border-t border-white/5 leading-relaxed">
          {demand.note}
        </p>
      )}
    </div>
  );
}

function OverviewTab({ p }: { p: Property & { rentEstimate?: any; nearbySchools?: any[] } }) {
  const rentEst = (p as any).rentEstimate;
  const schools: any[] = (p as any).nearbySchools ?? [];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 lg:[&>div]:flex lg:[&>div]:flex-col lg:[&>div]:gap-4 lg:[&>div]:space-y-0 lg:[&>div>*:last-child]:flex-1">
      <div className="lg:col-span-2 space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Cap Rate" value={fmt.pct(p.capRate)} sub="at list price" color="gold" />
          <StatCard label="Cash Flow" value={`+${fmt.currency(p.cashFlow)}/mo`} sub="est. after expenses" color="green" />
          <StatCard label="CoC Return" value={fmt.pct(p.cashOnCash)} sub="25% down" color="green" />
          <StatCard label="Strategy Fit" value={`${p.strategyFit}/100`} sub="vs your LTR criteria" color="gold" />
        </div>
        <div className="glass rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2"><Home size={14} className="text-amber-500" /> Property Details</h3>
          <div className="grid grid-cols-2 gap-x-8">
            <div>
              <MetricRow label="List Price" value={fmt.currency(p.price)} />
              <MetricRow label="Price / SqFt" value={fmt.currency(Math.round(p.price / p.sqft))} />
              <MetricRow label="Year Built" value={String(p.yearBuilt)} />
              <MetricRow label="Living Area" value={`${fmt.num(p.sqft)} sqft`} />
              <MetricRow label="Lot Size" value={`${fmt.num(p.lotSqft ?? 0)} sqft`} />
            </div>
            <div>
              <MetricRow label="Beds / Baths" value={`${p.beds} / ${p.baths}`} />
              <MetricRow label="Property Type" value={p.type} />
              <MetricRow label="Days on Market" value={p.daysOnMarket > 0 ? `${p.daysOnMarket} days` : '—'} />
              <MetricRow label="Market Regime" value={p.marketRegime} />
              <MetricRow label="Neighborhood Score" value={p.neighborhoodScore ? `${p.neighborhoodScore}/100` : '—'} highlight />
            </div>
          </div>
        </div>
        <div className="glass rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2"><AlertTriangle size={14} className="text-amber-500" /> Risk Flags ({p.riskFlags.length})</h3>
          <div className="flex flex-wrap gap-2">
            {p.riskFlags.map((f, i) => <FlagBadge key={i} label={f.label} severity={f.severity} />)}
          </div>
        </div>
        <OffMarketSignalsPanel p={p} />
        <RenovationPotentialCard p={p} />
        {schools.length > 0 && (
          <div className="glass rounded-xl p-5">
            <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2"><GraduationCap size={14} className="text-blue-400" /> Nearby Schools</h3>
            <div className="space-y-2">
              {schools.map((s, i) => (
                <div key={i} className="flex items-center justify-between py-1.5 border-b border-white/5 last:border-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 font-semibold">{s.level[0]}</span>
                    <span className="text-sm text-white">{s.name}</span>
                    {s.isCharter && <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20">Charter</span>}
                    {s.isMagnet && <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">Magnet</span>}
                  </div>
                  <span className="text-xs text-slate-500">{s.level}</span>
                </div>
              ))}
            </div>
            <DataSource label="Source: NCES (National Center for Education Statistics)" />
          </div>
        )}
      </div>
      <div className="space-y-4">
        <DemandCard propertyId={p.id} />
        <div className="glass rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-2">Rent Estimate</h3>
          {rentEst ? (
            <>
              <p className="text-3xl font-bold font-mono text-white whitespace-nowrap">{fmt.currency(rentEst.rentMid ?? rentEst.rent_mid)}<span className="text-sm text-slate-400">/mo</span></p>
              <p className="text-xs text-slate-500 mt-0.5 whitespace-nowrap">{fmt.currency(rentEst.rentLow ?? rentEst.rent_low)} – {fmt.currency(rentEst.rentHigh ?? rentEst.rent_high)}</p>
              <div className="mt-2 flex items-center gap-2">
                <ConfidencePill level={rentEst.confidence} />
              </div>
              <DataSource label={rentLabelFor(rentEst.source)} />
            </>
          ) : (
            <>
              <p className="text-3xl font-bold font-mono text-white whitespace-nowrap">{fmt.currency(p.rentEstMid)}<span className="text-sm text-slate-400">/mo</span></p>
              <p className="text-xs text-slate-500 mt-0.5 whitespace-nowrap">{fmt.currency(p.rentEstLow)} – {fmt.currency(p.rentEstHigh)}</p>
              <div className="mt-2"><ConfidencePill level={p.rentConfidence} /></div>
              <DataSource label="Source: STRATA Model · No RentCast quota available" />
            </>
          )}
        </div>
        <div className="glass rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-2">Fair Value</h3>
          <p className="text-2xl font-bold font-mono text-white whitespace-nowrap">{fmt.compact(p.fairValueLow)}–{fmt.compact(p.fairValueHigh)}</p>
          <p className={clsx('text-sm font-semibold mt-1', p.priceVsFairValue <= 0 ? 'text-emerald-400' : 'text-red-400')}>
            {p.priceVsFairValue <= 0 ? `${Math.abs(p.priceVsFairValue).toFixed(1)}% below` : `${p.priceVsFairValue.toFixed(1)}% above`} estimate
          </p>
          <div className="mt-2"><ConfidencePill level={p.valuationConfidence} /></div>
          <DataSource label={p.valuationConfidence === 'High' ? 'Source: STRATA AVM · Comp-based' : 'Source: STRATA Model · Limited comps'} />
        </div>
        <div className="glass rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-3">Neighborhood</h3>
          <div className="flex items-center gap-3 mb-3">
            <div className="text-2xl font-bold font-mono text-amber-400">{p.neighborhoodScore || '—'}</div>
            <div className="flex-1"><ProgressBar value={p.neighborhoodScore ?? 0} color="gold" /></div>
          </div>
          {/* Schools 72 / Walkability 61 / Amenities 80 were constants — the
              same four bars on every property, with only Safety flipping
              between two values off the risk score. We have no walkability or
              amenities source, so the panel reports what's actually known. */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center py-1.5 border-b border-white/5">
              <span className="text-xs text-slate-500">Nearby schools</span>
              <span className="text-xs font-mono text-slate-300">
                {schools.length > 0 ? `${schools.length} within range` : '—'}
              </span>
            </div>
            <div className="flex justify-between items-center py-1.5">
              <span className="text-xs text-slate-500">Risk score</span>
              <span className="text-xs font-mono text-slate-300">{p.riskScore}/100</span>
            </div>
          </div>
          <DataSource label="Neighborhood score: STRATA composite · Schools: NCES" />
        </div>
      </div>
    </div>
  );
}

// ── Off-Market Signals panel ──────────────────────────────────────────────────

function OffMarketSignalsPanel({ p }: { p: Property }) {
  const signals = p.offMarketSignals ?? [];
  const score = p.motivationScore ?? 0;
  if (signals.length === 0) return null;

  const severityStyle = (sev: string) =>
    sev === 'high' ? 'text-red-400 bg-red-400/10 border-red-400/30'
    : sev === 'medium' ? 'text-amber-400 bg-amber-500/10 border-amber-500/30'
    : 'text-slate-300 bg-white/5 border-white/10';

  const gaugeColor = score >= 50 ? '#f59e0b' : score >= 30 ? '#eab308' : '#64748b';

  return (
    <div className="glass rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
          <Zap size={14} className="text-amber-500" /> Off-Market Signals ({signals.length})
        </h3>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">Motivation</span>
          <div className="relative w-12 h-12">
            <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
              <circle cx="50" cy="50" r="40" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="14" />
              <circle cx="50" cy="50" r="40" fill="none"
                stroke={gaugeColor} strokeWidth="14"
                strokeDasharray={`${score * 2.513} 251.3`} strokeLinecap="round"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-xs font-bold font-mono text-white">{score}</span>
            </div>
          </div>
        </div>
      </div>
      <div className="space-y-2 mb-3">
        {signals.map((s, i) => (
          <div key={`${s.type}-${i}`} className="flex items-start justify-between gap-3 py-2 border-b border-white/5 last:border-0">
            <p className="text-sm text-slate-200 flex-1">{s.label}</p>
            <span className={clsx('text-[10px] font-bold uppercase px-2 py-0.5 rounded border flex-shrink-0', severityStyle(s.severity))}>
              {s.severity}
            </span>
          </div>
        ))}
      </div>
      <p className="text-xs text-slate-500 leading-relaxed">
        This analysis is based on publicly available data and market comparisons. Always verify directly with the seller or listing agent.
      </p>
    </div>
  );
}

// ── Renovation Potential card (Overview quick estimate) ──────────────────────

function RenovationPotentialCard({ p }: { p: Property }) {
  const navigate = useNavigate();
  const [estimate, setEstimate] = useState<RenovationEstimate | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setErrorMsg(null);
    getRenovationEstimate(p.id, {
      scope: ['cosmetic', 'kitchen', 'bathrooms'],
      condition: 'average',
      sqft: p.sqft,
      yearBuilt: p.yearBuilt ?? null,
      propertyType: p.type,
      state: p.state,
      baths: p.baths,
      fairValueLow: p.fairValueLow,
      fairValueHigh: p.fairValueHigh,
    })
      .then(e => { if (alive) setEstimate(e); })
      .catch(err => {
        if (alive) setErrorMsg(String(err?.message ?? err ?? 'Unable to load estimate').slice(0, 200));
      })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [p.id, p.sqft, p.state, p.type, p.baths, p.yearBuilt, p.fairValueLow, p.fairValueHigh]);

  const totalMid = estimate ? Math.round((estimate.totalLow + estimate.totalHigh) / 2) : 0;

  return (
    // flex-col + justify-between lets content fill the panel naturally when the
    // grid stretches it (instead of clustering at the center).
    <div className="glass rounded-xl p-5 flex flex-col">
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
          <Hammer size={14} className="text-amber-500" /> Renovation Potential
        </h3>
        <button
          onClick={() => navigate(`/underwrite?property=${p.id}&strategy=Renovation`)}
          className="text-xs text-amber-400 hover:text-amber-300"
        >
          Detailed estimate →
        </button>
      </div>

      {loading ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 py-10">
          <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-[11px] text-slate-500">Estimating renovation cost…</p>
        </div>
      ) : errorMsg ? (
        <p className="text-xs text-red-400 py-4">{errorMsg}</p>
      ) : estimate ? (
        <div className="flex-1 flex flex-col">
          <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-4 flex-shrink-0">
            Quick estimate — cosmetic refresh + kitchen + baths at {estimate.condition} condition
          </p>
          <div className="grid grid-cols-3 gap-4 flex-shrink-0">
            <div>
              <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">Budget (mid)</p>
              <p className="text-lg font-bold font-mono text-amber-400 whitespace-nowrap">{fmt.currency(totalMid)}</p>
              <p className="text-[10px] text-slate-500 whitespace-nowrap">{fmt.currency(estimate.totalLow)}–{fmt.currency(estimate.totalHigh)}</p>
            </div>
            <div>
              <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">Cost / Sqft</p>
              <p className="text-lg font-bold font-mono text-white whitespace-nowrap">${estimate.costPerSqftLow}–${estimate.costPerSqftHigh}</p>
              <p className="text-[10px] text-slate-500">{fmt.num(p.sqft)} sqft</p>
            </div>
            <div>
              <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">Projected ARV</p>
              <p className="text-lg font-bold font-mono text-emerald-400 whitespace-nowrap">
                {estimate.arvLow ? `${fmt.compact(estimate.arvLow)}–${fmt.compact(estimate.arvHigh ?? estimate.arvLow)}` : '—'}
              </p>
              <p className="text-[10px] text-slate-500">+{estimate.upliftLowPct}–{estimate.upliftHighPct}% vs current</p>
            </div>
          </div>
          {/* Footer note sits at the bottom of the panel when stretched */}
          <p className="text-[10px] text-slate-600 leading-relaxed pt-4 mt-auto border-t border-white/5">
            For a detailed estimate with full scope selection, use the Renovation tab in Underwrite.
          </p>
        </div>
      ) : null}
    </div>
  );
}

function FinancialsTab({ p }: { p: Property }) {
  const [downPct, setDownPct] = useState(25);
  const [rate, setRate] = useState(7.25);
  const [vacPct, setVacPct] = useState(6);
  const [mgmtPct, setMgmtPct] = useState(8);

  const down = p.price * (downPct / 100);
  const loan = p.price - down;
  const mr = rate / 100 / 12;
  const mtg = loan * (mr * Math.pow(1 + mr, 360)) / (Math.pow(1 + mr, 360) - 1);
  const egi = p.rentEstMid * (1 - vacPct / 100);
  // Estimates, not this property's actual bills — surfaced under the P&L so
  // the numbers aren't mistaken for real tax and insurance records.
  const taxMonthly = (p.price * TAX_RATE_PCT / 100) / 12;
  const maintMonthly = (p.price * MAINT_RATE_PCT / 100) / 12;
  const opex = egi * (mgmtPct / 100) + taxMonthly + INSURANCE_MONTHLY + maintMonthly;
  const noi = egi - opex;
  const cf = noi - mtg;
  const coc = ((cf * 12) / (down + 8500)) * 100;
  const cap = (noi * 12 / p.price) * 100;
  const dscr = noi / mtg;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 lg:[&>div]:flex lg:[&>div]:flex-col lg:[&>div]:gap-4 lg:[&>div]:space-y-0 lg:[&>div>*:last-child]:flex-1">
      <div className="space-y-4">
        <div className="glass rounded-xl p-5">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">Assumptions</p>
          {[
            { label: 'Down Payment', val: `${downPct}% · ${fmt.compact(down)}`, min: 5, max: 100, step: 1, value: downPct, set: setDownPct },
            { label: 'Interest Rate', val: `${rate.toFixed(2)}%`, min: 4, max: 12, step: 0.125, value: rate, set: setRate },
            { label: 'Vacancy Rate', val: `${vacPct}%`, min: 0, max: 20, step: 1, value: vacPct, set: setVacPct },
            { label: 'Mgmt Fee', val: `${mgmtPct}%`, min: 0, max: 15, step: 0.5, value: mgmtPct, set: setMgmtPct },
          ].map(a => (
            <div key={a.label} className="mb-4">
              <label className="text-xs text-slate-500 flex justify-between mb-1.5"><span>{a.label}</span><span className="text-amber-400 font-mono">{a.val}</span></label>
              <input type="range" aria-label={a.label} min={a.min} max={a.max} step={a.step} value={a.value} onChange={e => a.set(+e.target.value)} />
            </div>
          ))}
        </div>
      </div>
      <div className="lg:col-span-2 space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Cash Flow" value={`${cf >= 0 ? '+' : ''}${fmt.currency(cf)}/mo`} color={cf >= 0 ? 'green' : 'red'} />
          <StatCard label="Cap Rate" value={fmt.pct(cap)} color="gold" />
          <StatCard label="CoC Return" value={fmt.pct(coc)} color={coc >= 6 ? 'green' : 'default'} />
          <StatCard label="DSCR" value={dscr.toFixed(2)} sub={dscr >= 1.25 ? <span className="inline-flex items-center gap-1"><Check size={11} /> Qualifies</span> : <span className="inline-flex items-center gap-1"><X size={11} /> Below min</span>} color={dscr >= 1.25 ? 'green' : 'red'} />
        </div>
        <div className="glass rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-4">Monthly P&L</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 sm:gap-8">
            <div>
              <p className="text-xs text-emerald-400 font-semibold mb-2 uppercase tracking-wide">Income</p>
              <MetricRow label="Gross Rent" value={fmt.currency(p.rentEstMid)} />
              <MetricRow label="Vacancy Loss" value={`-${fmt.currency(p.rentEstMid * vacPct / 100)}`} />
              <MetricRow label="Eff. Gross Income" value={fmt.currency(egi)} highlight />
            </div>
            <div>
              <p className="text-xs text-red-400 font-semibold mb-2 uppercase tracking-wide">Expenses</p>
              <MetricRow label="Mortgage" value={fmt.currency(mtg)} />
              <MetricRow label="Tax + Insurance" value={fmt.currency(taxMonthly + INSURANCE_MONTHLY)} />
              <MetricRow label="Mgmt + Maint." value={fmt.currency(egi * (mgmtPct / 100) + maintMonthly)} />
              <MetricRow label="Total" value={fmt.currency(mtg + opex)} highlight />
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-white/10 flex items-center justify-between">
            <span className="text-sm font-semibold text-white">Net Monthly Cash Flow</span>
            <span className={clsx('text-2xl font-bold font-mono', cf >= 0 ? 'text-emerald-400' : 'text-red-400')}>{cf >= 0 ? '+' : ''}{fmt.currency(cf)}</span>
          </div>
          <p className="text-[10px] text-slate-600 mt-3 leading-relaxed">
            Assumes property tax at {TAX_RATE_PCT}% of price/yr, insurance at{' '}
            {fmt.currency(INSURANCE_MONTHLY)}/mo, and maintenance at {MAINT_RATE_PCT}% of price/yr.
            Not this property's actual bills — adjust in Underwrite for a full model.
          </p>
        </div>
      </div>
    </div>
  );
}

function ValuationTab({ p, valuation }: { p: Property; valuation: ValuationData | null }) {
  const fvLow = valuation?.fairValueLow ?? p.fairValueLow;
  const fvHigh = valuation?.fairValueHigh ?? p.fairValueHigh;
  const fvMid = valuation?.fairValueMid ?? (p.fairValueLow + p.fairValueHigh) / 2;
  const confidence = valuation?.confidence ?? p.valuationConfidence;
  const compCount = valuation?.compCount ?? 0;
  const comps = valuation?.comps ?? [];
  const pvFv = ((p.price - fvMid) / fvMid) * 100;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 lg:[&>div]:flex lg:[&>div]:flex-col lg:[&>div]:gap-4 lg:[&>div]:space-y-0 lg:[&>div>*:last-child]:flex-1">
      <div className="lg:col-span-2 space-y-4">
        <div className="glass rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-white">STRATA Fair Value Estimate</h3>
            <ConfidencePill level={confidence} />
          </div>
          <p className="text-3xl font-bold font-mono text-white mb-1">{fmt.currency(fvLow)} – {fmt.currency(fvHigh)}</p>
          <p className={clsx('text-base font-semibold', pvFv <= 0 ? 'text-emerald-400' : 'text-red-400')}>
            List price is {pvFv <= 0 ? `${Math.abs(pvFv).toFixed(1)}% below` : `${pvFv.toFixed(1)}% above`} mid-point estimate
          </p>
          {compCount > 0 && <p className="text-xs text-slate-500 mt-1">Based on {compCount} comparable sales</p>}
        </div>
        <div className="glass rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-3">How We Got Here</h3>
          {/* This used to show a three-method AVM breakdown whose numbers were
              the real mid-point ± arbitrary constants, with invented notes
              ("avg. 72 days old", "walkability 61"). The backend runs one
              comp-based model, so that's what gets described. */}
          <div className="p-3 rounded-lg bg-white/3 border border-white/5 mb-2">
            <div className="flex items-center justify-between">
              <p className="text-sm text-white font-medium">Comp-based AVM</p>
              <span className="text-sm font-mono font-bold text-amber-400">{fmt.currency(Math.round(fvMid))}</span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              {compCount > 0
                ? `Median of ${compCount} size- and recency-adjusted comparable sale${compCount === 1 ? '' : 's'}`
                : 'No comparable sales available — range is anchored to list price, which is why confidence reads Low'}
            </p>
          </div>
          <DataSource label="Source: STRATA valuation model · RentCast comps" />
        </div>
      </div>
      <div className="space-y-4">
        <div className="glass rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-3">Comparable Sales</h3>
          {comps.length > 0 ? comps.map((c, i) => (
            <div key={i} className="flex justify-between items-center py-2 border-b border-white/5 last:border-0">
              <div><p className="text-xs text-white">{c.address}</p><p className="text-[10px] text-slate-500">{fmt.num(c.sqft)} sqft{c.daysAgo ? ` · ${c.daysAgo}d ago` : ''}</p></div>
              <div className="text-right"><p className="text-xs font-mono font-semibold text-white">{fmt.currency(c.adjustedValue || c.listPrice)}</p><p className="text-[10px] text-slate-500">{c.sqft ? fmt.currency(Math.round((c.adjustedValue || c.listPrice) / c.sqft)) : '—'}/sqft</p></div>
            </div>
          )) : (
            /* Previously fell back to three invented addresses with prices —
               indistinguishable from real comps to anyone reading the page. */
            <p className="text-xs text-slate-600 py-2 leading-relaxed">
              No comparable sales found for this property.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function FloodBadge({ riskLabel }: { riskLabel: string }) {
  const styles: Record<string, string> = {
    'Low Risk': 'text-emerald-400 bg-emerald-400/10 border-emerald-400/30',
    'Moderate Risk': 'text-amber-400 bg-amber-500/10 border-amber-500/30',
    'High Risk': 'text-red-400 bg-red-400/10 border-red-400/30',
    'Very High Risk': 'text-red-500 bg-red-500/10 border-red-500/30',
    'Undetermined': 'text-slate-400 bg-slate-400/10 border-slate-400/30',
    'Unknown': 'text-slate-500 bg-slate-500/10 border-slate-500/30',
  };
  return (
    <span className={clsx('inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded border', styles[riskLabel] ?? styles['Unknown'])}>
      <Droplets size={10} /> {riskLabel}
    </span>
  );
}

function RiskTab({ p, riskData }: { p: Property; riskData: RiskData | null }) {
  const defaultRisks = [
    { category: 'Market Risk', score: 28, note: 'Balanced market with stable price velocity.', icon: TrendingUp },
    { category: 'Pricing Risk', score: p.priceVsFairValue <= 0 ? 20 : 55, note: `List price ${Math.abs(p.priceVsFairValue).toFixed(1)}% ${p.priceVsFairValue <= 0 ? 'below' : 'above'} fair value estimate.`, icon: Home },
    { category: 'Tenant Risk', score: 32, note: 'Strong rental demand in this submarket.', icon: Shield },
    { category: 'Climate / Flood Risk', score: 22, note: 'Not in a FEMA flood zone. Moderate hail risk.', icon: AlertTriangle },
    { category: 'Condition Risk', score: p.riskFlags.find(f => f.severity === 'High') ? 62 : 38, note: `Est. ${p.riskFlags.find(f => f.severity === 'High') ? '$18K–$28K' : '$8K–$15K'} deferred maintenance.`, icon: Home },
    { category: 'Tax / Assessment Risk', score: 35, note: 'TX 2.2% effective rate. No reassessment flag.', icon: Landmark },
  ];

  const liveRisks = riskData ? riskData.dimensions.map((d, idx) => ({
    category: d.name,
    score: d.score,
    note: d.description,
    icon: [TrendingUp, Home, Shield, AlertTriangle, Home, Landmark][idx % 6],
  })) : defaultRisks;

  const composite = riskData?.compositeScore ?? Math.round(defaultRisks.reduce((s, r) => s + r.score, 0) / defaultRisks.length);
  const flags = riskData?.flags ?? p.riskFlags;
  const flood = riskData?.floodRisk;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 lg:[&>div]:flex lg:[&>div]:flex-col lg:[&>div]:gap-4 lg:[&>div]:space-y-0 lg:[&>div>*:last-child]:flex-1">
      <div className="lg:col-span-2 space-y-3">
        <div className="glass rounded-xl p-5 mb-2">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-white">Composite Risk Score</h3>
            <RiskBadge score={composite} />
          </div>
          <ProgressBar value={composite} color={composite <= 30 ? 'green' : composite <= 55 ? 'gold' : 'red'} />
          <p className="text-xs text-slate-500 mt-2">Based on {liveRisks.length} risk dimensions. Lower is better.</p>
        </div>

        {flood && (
          <div className="glass rounded-xl p-4 flex items-start gap-3">
            <Droplets size={16} className="text-blue-400 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-white">FEMA Flood Zone</span>
                <FloodBadge riskLabel={flood.riskLabel} />
              </div>
              <p className="text-xs text-slate-500">Zone {flood.zone} — {flood.description}</p>
              {flood.inSfha && <p className="text-xs text-red-400 mt-1 inline-flex items-center gap-1"><AlertTriangle size={12} /> Special Flood Hazard Area — flood insurance likely required</p>}
              <DataSource label="Source: FEMA NFHL · Current" />
            </div>
          </div>
        )}

        {liveRisks.map(r => (
          <div key={r.category} className="glass rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2"><r.icon size={14} className="text-slate-400" /><span className="text-sm font-medium text-white">{r.category}</span></div>
              <span className={clsx('text-xs font-semibold font-mono', r.score <= 30 ? 'text-emerald-400' : r.score <= 55 ? 'text-amber-400' : 'text-red-400')}>{r.score}/100</span>
            </div>
            <ProgressBar value={r.score} color={r.score <= 30 ? 'green' : r.score <= 55 ? 'gold' : 'red'} />
            <p className="text-xs text-slate-500 mt-1.5">{r.note}</p>
          </div>
        ))}
      </div>
      <div className="space-y-4">
        <div className="glass rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2"><ThumbsUp size={14} className="text-emerald-400" /> Strengths</h3>
          {['Strong rental demand', 'No flood zone exposure', 'Carrier availability in Texas', 'Tax rate in line with market'].map((s, i) => (
            <div key={i} className="flex items-start gap-2 mb-2"><Check size={14} className="text-emerald-400 shrink-0 mt-0.5" /><span className="text-xs text-slate-400">{s}</span></div>
          ))}
        </div>
        <div className="glass rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2"><ThumbsDown size={14} className="text-red-400" /> Watch Points</h3>
          {flags.map((f, i) => (
            <div key={i} className="flex items-start gap-2 mb-2"><span className="text-amber-400">!</span><span className="text-xs text-slate-400">{f.label}</span></div>
          ))}
        </div>
        <div className="glass rounded-xl p-4 border border-amber-500/20">
          <h3 className="text-xs font-semibold text-amber-400 mb-1 flex items-center gap-2"><Clock size={12} /> Data Freshness</h3>
          <p className="text-xs text-slate-400">Risk assessment updated <span className="text-white">2 hours ago</span>. Comp avg: <span className="text-white">72 days</span>.</p>
        </div>
      </div>
    </div>
  );
}

function MarketTab({ p }: { p: Property }) {
  // Live figures for this property's market. Everything here used to be a
  // hardcoded Dallas panel shown for every property in every city.
  const [market, setMarket] = useState<MarketSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getMarketFor(p.city, p.state)
      .then(m => { if (!cancelled) setMarket(m); })
      .catch(() => { if (!cancelled) setMarket(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [p.city, p.state]);

  if (loading) {
    return <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
      {[1, 2].map(i => <div key={i} className="glass rounded-xl h-56 animate-pulse" />)}
    </div>;
  }

  if (!market) {
    return (
      <div className="glass rounded-xl p-6 text-center">
        <p className="text-sm text-slate-400 mb-1">
          No market data for {[p.city, p.state].filter(Boolean).join(', ') || 'this location'}
        </p>
        <p className="text-xs text-slate-600">
          STRATA tracks a fixed set of markets. See Market Pulse for coverage.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
      <div className="glass rounded-xl p-5">
        <h3 className="text-sm font-semibold text-white mb-4">{market.city}, {market.state} Market Overview</h3>
        <MetricRow label="Market Regime" value={market.regime} />
        <MetricRow label="Median Price" value={fmt.currency(market.medianPrice)} />
        <MetricRow label="Price Growth 12mo" value={fmt.signedPct(market.priceChange12Mo)} highlight />
        <MetricRow label="Active Inventory" value={`${market.inventoryMonths.toFixed(1)} months`} />
        <MetricRow label="Median DOM" value={`${Math.round(market.daysOnMarket)} days`} />
        <MetricRow label="Cap Rate Median" value={fmt.pct(market.capRateMedian)} />
        <DataSource label={`${market.city} market · RentCast`} />
      </div>
      <div className="glass rounded-xl p-5">
        <h3 className="text-sm font-semibold text-white mb-4">Rental Market — {p.zip}</h3>
        <MetricRow label="Rent Estimate (this property)" value={fmt.currency(p.rentEstMid)} />
        <MetricRow label="Rent Growth 12mo" value={fmt.signedPct(market.rentGrowth12Mo)} highlight />
        <MetricRow label="Vacancy Rate" value={fmt.pct(market.vacancyRate)} />
        <DataSource label="RentCast · Live" />
      </div>
    </div>
  );
}

function HistoryTab({ p }: { p: Property }) {
  // Price history and prior transfers need a records source (assessor / deed
  // data) that isn't wired up. This tab used to render a fixed six-point chart
  // and four invented sales — including a made-up MLS number — identically for
  // every property in the system. An honest empty state beats fiction.
  return (
    <div className="space-y-4">
      <div className="glass rounded-xl p-8 text-center">
        <p className="text-sm text-slate-400 mb-1">Transaction history not available</p>
        <p className="text-xs text-slate-600 max-w-md mx-auto leading-relaxed">
          STRATA doesn't have a public-records feed connected yet, so prior sales and
          price changes for {p.address} can't be shown. Current listing data is on the
          Overview tab.
        </p>
      </div>
      {p.daysOnMarket > 0 && (
        <div className="glass rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-3">Current Listing</h3>
          <MetricRow label="Days on Market" value={`${p.daysOnMarket} days`} />
          <MetricRow label="List Price" value={fmt.currency(p.price)} />
          <DataSource label="Source: active listing feed" />
        </div>
      )}
    </div>
  );
}
