/**
 * Public report page — /reports/:id
 * Renders both CMA and property-brief report types without requiring login.
 * Designed to be printable via window.print() / browser PDF.
 */
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Printer, ExternalLink, AlertTriangle } from 'lucide-react';
import { clsx } from 'clsx';
import { fmt } from '../components/UI';

const BASE_URL = import.meta.env.VITE_API_URL ?? '';

interface ReportContent {
  reportId: string;
  reportType: 'cma' | 'property_brief';
  generatedAt: string;
  clientName?: string;
  agentMessage?: string;
  agent?: { name: string; email: string; phone?: string; brokerage?: string };
  property?: {
    id: string; address: string; city: string; state: string; zip: string;
    price: number; beds: number; baths: number; sqft: number; yearBuilt?: number;
    type: string; dealScore: number; image?: string;
  };
  // CMA sections
  sections?: {
    valuation?: { narrative: string; fairValueLow: number; fairValueHigh: number; confidence: string; priceVsFairValue: number; compsUsed: number };
    comps?: { narrative: string };
    market?: { narrative: string; regime: string; neighborhoodScore?: number };
    risk?: { narrative: string; compositeScore: number; topFlags: string[] };
    financials?: { narrative: string; capRate: number; cashFlow: number; cashOnCash?: number; rentEstMid?: number; rentConfidence?: string };
    neighborhood?: { narrative: string; score?: number; name?: string };
  };
  recommendation?: string;
  // Brief fields
  valuation?: { fairValueLow: number; fairValueHigh: number; confidence: string; priceVsFairValue: number };
  rentEstimate?: { low: number; mid: number; high: number; confidence: string };
  topRiskFlags?: string[];
  neighborhoodScore?: number;
  marketRegime?: string;
  disclaimer?: string;
}

const REC_STYLES: Record<string, string> = {
  Buy: 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400',
  Negotiate: 'bg-amber-500/15 border-amber-500/40 text-amber-400',
  Watch: 'bg-orange-500/15 border-orange-500/40 text-orange-400',
  Avoid: 'bg-red-500/15 border-red-500/40 text-red-400',
};

const CONFIDENCE_COLORS: Record<string, string> = {
  High: 'text-emerald-400',
  Medium: 'text-amber-400',
  Low: 'text-orange-400',
};

function ConfidenceBadge({ confidence }: { confidence: string }) {
  return (
    <span className={clsx('text-xs font-semibold', CONFIDENCE_COLORS[confidence] ?? 'text-slate-400')}>
      {confidence} Confidence
    </span>
  );
}

function SectionBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-8 print:mb-6">
      <h3 className="text-sm font-bold text-amber-400 uppercase tracking-widest mb-3 pb-2 border-b border-white/10">{title}</h3>
      {children}
    </div>
  );
}

function CMAReport({ report }: { report: ReportContent }) {
  const { sections = {}, recommendation, clientName, generatedAt, disclaimer } = report;
  const agent = report.agent!;
  const property = report.property!;

  return (
    <div className="max-w-4xl mx-auto px-4 md:px-6 py-6 md:py-8 print:px-0 print:py-0">
      {/* Print CSS */}
      <style>{`
        @media print {
          body { background: white !important; color: #1a1a2e !important; }
          .no-print { display: none !important; }
          .glass, .glass-dark { background: white !important; border: 1px solid #e2e8f0 !important; }
          h1, h2, h3, p { color: #1a1a2e !important; }
          .text-amber-400 { color: #92400e !important; }
          .text-emerald-400 { color: #065f46 !important; }
          .text-slate-400, .text-slate-500 { color: #64748b !important; }
          .text-white { color: #1a1a2e !important; }
        }
      `}</style>

      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start justify-between gap-4 mb-6 md:mb-8 pb-6 border-b border-white/10">
        <div>
          <p className="text-xs text-slate-500 mb-0.5">Prepared for</p>
          <h2 className="text-xl font-bold text-white">{clientName}</h2>
          <p className="text-xs text-slate-500 mt-1">{new Date(generatedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
        </div>
        <div className="text-right">
          <p className="text-sm font-bold text-white">{agent.name}</p>
          <p className="text-xs text-slate-400">{agent.brokerage}</p>
          <p className="text-xs text-slate-400">{agent.email}</p>
          <p className="text-xs text-slate-400">{agent.phone}</p>
        </div>
      </div>

      {/* Property Hero */}
      <div className="glass rounded-2xl overflow-hidden mb-8">
        {property.image && (
          <img src={property.image} alt={property.address} className="w-full h-48 object-cover" />
        )}
        <div className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-white mb-1">{property.address}</h1>
              <p className="text-slate-400">{property.city}, {property.state} {property.zip}</p>
              <div className="flex items-center gap-4 mt-3 text-sm text-slate-300">
                <span>{property.beds} bd</span>
                <span>{property.baths} ba</span>
                <span>{property.sqft.toLocaleString()} sqft</span>
                {property.yearBuilt && <span>Built {property.yearBuilt}</span>}
              </div>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold font-mono text-white">{fmt.currency(property.price)}</p>
              <div className="mt-2 flex items-center justify-end gap-2">
                <span className="text-xs text-slate-400">Deal Score</span>
                <span className={clsx('text-lg font-bold font-mono', property.dealScore >= 70 ? 'text-emerald-400' : property.dealScore >= 50 ? 'text-amber-400' : 'text-red-400')}>
                  {property.dealScore}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Sections */}
      {sections.valuation && (
        <SectionBlock title="Valuation Analysis">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mb-4">
            <div className="glass rounded-xl p-4 text-center">
              <p className="text-xs text-slate-500 mb-1">Fair Value Range</p>
              <p className="text-sm font-bold font-mono text-white">
                {fmt.compact(sections.valuation.fairValueLow)} – {fmt.compact(sections.valuation.fairValueHigh)}
              </p>
            </div>
            <div className="glass rounded-xl p-4 text-center">
              <p className="text-xs text-slate-500 mb-1">Price vs Fair Value</p>
              <p className={clsx('text-sm font-bold font-mono', sections.valuation.priceVsFairValue <= 0 ? 'text-emerald-400' : 'text-amber-400')}>
                {sections.valuation.priceVsFairValue > 0 ? '+' : ''}{sections.valuation.priceVsFairValue}%
              </p>
            </div>
            <div className="glass rounded-xl p-4 text-center">
              <p className="text-xs text-slate-500 mb-1">Confidence</p>
              <ConfidenceBadge confidence={sections.valuation.confidence} />
            </div>
          </div>
          <p className="text-sm text-slate-300 leading-relaxed">{sections.valuation.narrative}</p>
        </SectionBlock>
      )}

      {sections.comps && sections.comps.narrative && (
        <SectionBlock title="Comparable Sales">
          <p className="text-sm text-slate-300 leading-relaxed">{sections.comps.narrative}</p>
        </SectionBlock>
      )}

      {sections.market && (
        <SectionBlock title="Market Conditions">
          <div className="flex items-center gap-3 mb-4">
            <span className="text-xs font-semibold px-3 py-1 rounded-full bg-blue-500/15 border border-blue-500/30 text-blue-400">
              {sections.market.regime}
            </span>
            {sections.market.neighborhoodScore && (
              <span className="text-xs text-slate-400">Neighborhood Score: <span className="text-white font-mono">{sections.market.neighborhoodScore}/100</span></span>
            )}
          </div>
          <p className="text-sm text-slate-300 leading-relaxed">{sections.market.narrative}</p>
        </SectionBlock>
      )}

      {sections.risk && (
        <SectionBlock title="Risk Assessment">
          <div className="flex items-center gap-3 mb-4">
            <span className={clsx('text-sm font-bold font-mono', sections.risk.compositeScore < 30 ? 'text-emerald-400' : sections.risk.compositeScore < 60 ? 'text-amber-400' : 'text-red-400')}>
              Risk Score: {sections.risk.compositeScore}/100
            </span>
          </div>
          {sections.risk.topFlags.length > 0 && (
            <div className="mb-4 space-y-2">
              {sections.risk.topFlags.map((flag, i) => (
                <div key={i} className="flex items-center gap-2 text-xs text-slate-300">
                  <AlertTriangle size={12} className="text-amber-400 flex-shrink-0" />
                  {flag}
                </div>
              ))}
            </div>
          )}
          <p className="text-sm text-slate-300 leading-relaxed">{sections.risk.narrative}</p>
        </SectionBlock>
      )}

      {sections.financials && (
        <SectionBlock title="Financial Analysis">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mb-4">
            <div className="glass rounded-xl p-4 text-center">
              <p className="text-xs text-slate-500 mb-1">Cap Rate</p>
              <p className="text-sm font-bold font-mono text-amber-400">{sections.financials.capRate}%</p>
            </div>
            <div className="glass rounded-xl p-4 text-center">
              <p className="text-xs text-slate-500 mb-1">Monthly Cash Flow</p>
              <p className={clsx('text-sm font-bold font-mono', sections.financials.cashFlow >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                {sections.financials.cashFlow >= 0 ? '+' : ''}{fmt.currency(sections.financials.cashFlow)}/mo
              </p>
            </div>
            <div className="glass rounded-xl p-4 text-center">
              <p className="text-xs text-slate-500 mb-1">Rent Estimate</p>
              <p className="text-sm font-bold font-mono text-white">
                {sections.financials.rentEstMid ? fmt.currency(sections.financials.rentEstMid) : '—'}/mo
              </p>
            </div>
          </div>
          <p className="text-sm text-slate-300 leading-relaxed">{sections.financials.narrative}</p>
        </SectionBlock>
      )}

      {sections.neighborhood && (
        <SectionBlock title="Neighborhood Profile">
          {sections.neighborhood.score && (
            <p className="text-xs text-slate-400 mb-3">Score: <span className="text-white font-mono font-bold">{sections.neighborhood.score}/100</span></p>
          )}
          <p className="text-sm text-slate-300 leading-relaxed">{sections.neighborhood.narrative}</p>
        </SectionBlock>
      )}

      {/* Recommendation Box */}
      {recommendation && (
        <div className={clsx('rounded-2xl border p-6 mb-8', REC_STYLES[recommendation] ?? 'border-white/20 text-white')}>
          <p className="text-xs font-bold uppercase tracking-widest mb-1 opacity-70">STRATA Recommendation</p>
          <p className="text-3xl font-bold">{recommendation}</p>
        </div>
      )}

      {/* Disclaimer */}
      <p className="text-[10px] text-slate-600 leading-relaxed mb-6">{disclaimer}</p>

      {/* Footer */}
      <div className="border-t border-white/10 pt-4 flex items-center justify-between text-xs text-slate-500">
        <span>{agent.name} · {agent.brokerage} · {agent.email}{agent.phone ? ` · ${agent.phone}` : ''}</span>
        <span>Analysis powered by STRATA</span>
      </div>
    </div>
  );
}

function PropertyBriefReport({ report }: { report: ReportContent }) {
  const { valuation, rentEstimate, topRiskFlags = [], neighborhoodScore, marketRegime, clientName, agentMessage, generatedAt, disclaimer } = report;
  const agent = report.agent!;
  const property = report.property!;
  const navigate = useNavigate();

  return (
    <div className="max-w-2xl mx-auto px-4 md:px-6 py-6 md:py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start justify-between gap-3 mb-6 pb-5 border-b border-white/10">
        <div>
          <p className="text-xs text-slate-500 mb-0.5">Property Brief for</p>
          <h2 className="text-lg font-bold text-white">{clientName}</h2>
          <p className="text-xs text-slate-500 mt-1">{new Date(generatedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
        </div>
        <div className="text-right">
          <p className="text-sm font-semibold text-white">{agent.name}</p>
          <p className="text-xs text-slate-400">{agent.email}</p>
        </div>
      </div>

      {agentMessage && (
        <div className="glass rounded-xl p-4 mb-6 border border-white/10">
          <p className="text-xs text-slate-500 mb-1">Message from your agent</p>
          <p className="text-sm text-slate-200 leading-relaxed italic">"{agentMessage}"</p>
        </div>
      )}

      {/* Property card */}
      <div className="glass rounded-2xl overflow-hidden mb-6">
        {property.image && (
          <img src={property.image} alt={property.address} className="w-full h-52 object-cover" />
        )}
        <div className="p-5">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-xl font-bold text-white">{property.address}</h1>
              <p className="text-sm text-slate-400">{property.city}, {property.state} {property.zip}</p>
              <div className="flex gap-3 mt-2 text-sm text-slate-400">
                <span>{property.beds} bd</span><span>{property.baths} ba</span><span>{property.sqft.toLocaleString()} sqft</span>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xl font-bold font-mono text-white">{fmt.currency(property.price)}</p>
              <p className={clsx('text-sm font-bold font-mono mt-1', property.dealScore >= 70 ? 'text-emerald-400' : property.dealScore >= 50 ? 'text-amber-400' : 'text-red-400')}>
                Score {property.dealScore}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Valuation */}
      {valuation && (
        <div className="glass rounded-xl p-5 mb-4">
          <h3 className="text-xs font-bold text-amber-400 uppercase tracking-widest mb-3">Estimated Value</h3>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-lg font-bold font-mono text-white">
                {fmt.compact(valuation.fairValueLow)} – {fmt.compact(valuation.fairValueHigh)}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">Fair value range</p>
            </div>
            <ConfidenceBadge confidence={valuation.confidence} />
          </div>
          <p className={clsx('text-xs mt-2', valuation.priceVsFairValue <= 0 ? 'text-emerald-400' : 'text-amber-400')}>
            List price is {valuation.priceVsFairValue > 0 ? '+' : ''}{valuation.priceVsFairValue}% vs estimated fair value
          </p>
        </div>
      )}

      {/* Rent estimate */}
      {rentEstimate && (
        <div className="glass rounded-xl p-5 mb-4">
          <h3 className="text-xs font-bold text-amber-400 uppercase tracking-widest mb-3">Rent Estimate</h3>
          <div className="flex items-center justify-between">
            <p className="text-lg font-bold font-mono text-white">{fmt.currency(rentEstimate.mid)}/mo</p>
            <ConfidenceBadge confidence={rentEstimate.confidence} />
          </div>
          <p className="text-xs text-slate-500 mt-1">Range: {fmt.currency(rentEstimate.low)} – {fmt.currency(rentEstimate.high)}/mo</p>
        </div>
      )}

      {/* Risk flags */}
      {topRiskFlags.length > 0 && (
        <div className="glass rounded-xl p-5 mb-4">
          <h3 className="text-xs font-bold text-amber-400 uppercase tracking-widest mb-3">Things to Know</h3>
          <div className="space-y-2">
            {topRiskFlags.map((flag, i) => (
              <p key={i} className="text-sm text-slate-300">{flag}</p>
            ))}
          </div>
        </div>
      )}

      {/* Neighborhood */}
      {(neighborhoodScore || marketRegime) && (
        <div className="glass rounded-xl p-5 mb-6">
          <h3 className="text-xs font-bold text-amber-400 uppercase tracking-widest mb-3">Area Snapshot</h3>
          <div className="flex items-center gap-4">
            {neighborhoodScore && (
              <div>
                <p className="text-xs text-slate-500">Neighborhood Score</p>
                <p className={clsx('text-lg font-bold font-mono', neighborhoodScore >= 70 ? 'text-emerald-400' : neighborhoodScore >= 50 ? 'text-amber-400' : 'text-red-400')}>
                  {neighborhoodScore}/100
                </p>
              </div>
            )}
            {marketRegime && (
              <span className="text-xs font-semibold px-3 py-1 rounded-full bg-blue-500/15 border border-blue-500/30 text-blue-400">
                {marketRegime}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Agent card */}
      <div className="glass rounded-xl p-5 mb-6 border border-white/10">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Your Agent</h3>
        <p className="text-sm font-semibold text-white">{agent.name}</p>
        <p className="text-xs text-slate-400">{agent.email}</p>
      </div>

      {/* CTA */}
      <button
        onClick={() => navigate(`/intelligence/${property.id}`)}
        className="w-full btn-primary justify-center text-sm mb-4"
      >
        <ExternalLink size={14} /> Get Full Analysis — requires login
      </button>

      <p className="text-[10px] text-slate-600 leading-relaxed">{disclaimer}</p>
    </div>
  );
}

export default function ReportPage() {
  const { id } = useParams<{ id: string }>();
  const [report, setReport] = useState<ReportContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) { setError('No report ID'); setLoading(false); return; }
    fetch(`${BASE_URL}/reports/${id}`)
      .then(r => { if (!r.ok) throw new Error(`${r.status}`); return r.json(); })
      .then(setReport)
      .catch(() => setError('Report not found or expired.'))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen grid-bg flex items-center justify-center">
        <div className="glass rounded-xl w-80 h-40 animate-pulse" />
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="min-h-screen grid-bg flex items-center justify-center">
        <div className="glass rounded-2xl p-8 text-center max-w-sm">
          <AlertTriangle size={32} className="text-amber-400 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-white mb-2">Report not found</h2>
          <p className="text-sm text-slate-400">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen grid-bg">
      {/* Toolbar */}
      <div className="no-print sticky top-0 z-10 glass-dark border-b border-white/5 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-amber-500 flex items-center justify-center text-navy-950 font-bold text-xs">S</div>
          <span className="text-white font-semibold text-sm">STRATA Report</span>
        </div>
        <div className="flex items-center gap-2">
          {report.reportType === 'cma' && (
            <button onClick={() => window.print()} className="btn-ghost text-xs gap-1.5">
              <Printer size={13} /> Download PDF
            </button>
          )}
        </div>
      </div>

      {report.reportType === 'cma'
        ? <CMAReport report={report} />
        : <PropertyBriefReport report={report} />
      }
    </div>
  );
}
