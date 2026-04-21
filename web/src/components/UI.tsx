import { clsx } from 'clsx';

export function ScoreBadge({ score, size = 'md' }: { score: number; size?: 'sm' | 'md' | 'lg' }) {
  const cls = score >= 70 ? 'score-strong' : score >= 50 ? 'score-good' : score >= 30 ? 'score-caution' : 'score-avoid';
  const label = score >= 70 ? 'Strong' : score >= 50 ? 'Good' : score >= 30 ? 'Caution' : 'Avoid';
  const sizes = { sm: 'text-xs px-2 py-0.5', md: 'text-sm px-3 py-1', lg: 'text-base px-4 py-1.5' };
  return <span className={clsx('rounded-full font-semibold font-mono', cls, sizes[size])}>{score} <span className="opacity-60 font-sans font-normal text-xs">{label}</span></span>;
}

export function RiskBadge({ score }: { score: number }) {
  const cls = score <= 30 ? 'score-strong' : score <= 55 ? 'score-good' : score <= 75 ? 'score-caution' : 'score-avoid';
  const label = score <= 30 ? 'Low Risk' : score <= 55 ? 'Med Risk' : score <= 75 ? 'High Risk' : 'Very High';
  return <span className={clsx('rounded-full font-semibold font-mono text-sm px-3 py-1', cls)}>{score} <span className="opacity-60 font-sans font-normal text-xs">{label}</span></span>;
}

export function ConfidencePill({ level }: { level: 'High' | 'Medium' | 'Low' }) {
  const colors = { High: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/30', Medium: 'text-amber-400 bg-amber-400/10 border-amber-400/30', Low: 'text-orange-400 bg-orange-400/10 border-orange-400/30' };
  return <span className={clsx('text-xs font-medium px-2 py-0.5 rounded border', colors[level])}>{level} Confidence</span>;
}

export function RegimeBadge({ regime }: { regime: string }) {
  const colors: Record<string, string> = {
    'Hot': 'text-red-400 bg-red-400/10 border-red-400/30',
    'Balanced': 'text-amber-400 bg-amber-400/10 border-amber-400/30',
    'Cooling': 'text-blue-400 bg-blue-400/10 border-blue-400/30',
    "Buyer's Market": 'text-emerald-400 bg-emerald-400/10 border-emerald-400/30',
  };
  return <span className={clsx('text-xs font-semibold px-2 py-0.5 rounded border', colors[regime] || 'text-slate-400 bg-slate-400/10 border-slate-400/30')}>{regime}</span>;
}

export function StatCard({ label, value, sub, trend, color = 'default' }: { label: string; value: string; sub?: string; trend?: number; color?: 'green' | 'red' | 'gold' | 'default' }) {
  const colors = { green: 'text-emerald-400', red: 'text-red-400', gold: 'text-amber-400', default: 'text-white' };
  return (
    <div className="glass rounded-xl p-4">
      <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-1">{label}</p>
      <p className={clsx('text-2xl font-bold font-mono', colors[color])}>{value}</p>
      {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
      {trend !== undefined && <p className={clsx('text-xs mt-1 font-medium', trend >= 0 ? 'text-emerald-400' : 'text-red-400')}>{trend >= 0 ? '↑' : '↓'} {Math.abs(trend)}%</p>}
    </div>
  );
}

export function FlagBadge({ label, severity }: { label: string; severity: 'High' | 'Medium' | 'Low' }) {
  const colors = { High: 'text-red-400 bg-red-400/10 border-red-400/25', Medium: 'text-amber-400 bg-amber-400/10 border-amber-400/25', Low: 'text-sky-400 bg-sky-400/10 border-sky-400/25' };
  const icons = { High: '⚠', Medium: '◆', Low: '●' };
  return <span className={clsx('inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-lg border', colors[severity])}><span>{icons[severity]}</span> {label}</span>;
}

export function MetricRow({ label, value, sub, highlight }: { label: string; value: string; sub?: string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-white/5 last:border-0">
      <span className="text-sm text-slate-400">{label}</span>
      <div className="text-right">
        <span className={clsx('text-sm font-semibold font-mono', highlight ? 'text-amber-400' : 'text-white')}>{value}</span>
        {sub && <span className="text-xs text-slate-500 ml-1.5">{sub}</span>}
      </div>
    </div>
  );
}

export function ProgressBar({ value, max = 100, color = 'gold' }: { value: number; max?: number; color?: string }) {
  const pct = Math.min((value / max) * 100, 100);
  const bg = color === 'gold' ? 'bg-amber-500' : color === 'green' ? 'bg-emerald-500' : color === 'red' ? 'bg-red-500' : 'bg-blue-500';
  return <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden"><div className={clsx('h-full rounded-full transition-all duration-700', bg)} style={{ width: `${pct}%` }} /></div>;
}

export const fmt = {
  currency: (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n),
  pct: (n: number, d = 1) => `${n.toFixed(d)}%`,
  num: (n: number) => new Intl.NumberFormat('en-US').format(n),
  compact: (n: number) => '$' + new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n),
};
