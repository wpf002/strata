import { useState, useEffect } from 'react';
import { User, Target, Bell, Shield, Save, ChevronRight, Briefcase, Check, CircleDashed } from 'lucide-react';
import { clsx } from 'clsx';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

// ── API helpers ───────────────────────────────────────────────────────────────

const BASE_URL = import.meta.env.VITE_API_URL ?? '';

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
}

async function apiGet<T>(path: string): Promise<T> {
  const headers = await authHeaders();
  const res = await fetch(`${BASE_URL}${path}`, { headers });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

async function apiPut<T>(path: string, body: unknown): Promise<T> {
  const headers = await authHeaders();
  const res = await fetch(`${BASE_URL}${path}`, { method: 'PUT', headers, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

// ── Types ────────────────────────────────────────────────────────────────────

type NotificationChannel = 'email' | 'push' | 'both' | 'off';
type NotificationKey = 'savedSearch' | 'priceDrops' | 'portfolio' | 'portalActivity';

interface UserProfile {
  id: string;
  email: string;
  name: string | null;
  strategySettings: {
    primaryStrategy?: string;
    targetMarkets?: string;
    minPrice?: number;
    maxPrice?: number;
    minDealScore?: number;
    minCashOnCash?: number;
    // Legacy global alert toggles — still honored by the scheduler; new per-type
    // prefs below override when set.
    emailAlerts?: boolean;
    priceDropAlerts?: boolean;
    alertFrequency?: 'Immediately' | 'Daily' | 'Weekly';
    notifications?: Partial<Record<NotificationKey, NotificationChannel>>;
    // Agent profile
    agentName?: string;
    brokerageName?: string;
    licenseNumber?: string;
    agentPhone?: string;
    agentWebsite?: string;
    agentPhotoUrl?: string;
  };
}

const AGENT_FIELDS: { key: keyof NonNullable<UserProfile['strategySettings']>; label: string; required: boolean }[] = [
  { key: 'agentName', label: 'Name', required: true },
  { key: 'brokerageName', label: 'Brokerage', required: true },
  { key: 'agentPhone', label: 'Phone', required: true },
  { key: 'agentPhotoUrl', label: 'Photo', required: false },
  { key: 'licenseNumber', label: 'License #', required: false },
  { key: 'agentWebsite', label: 'Website', required: false },
];

function computeProfileCompleteness(s: UserProfile['strategySettings']): { pct: number; done: number; total: number } {
  const total = AGENT_FIELDS.length;
  const done = AGENT_FIELDS.filter(f => {
    const v = (s as Record<string, unknown>)[f.key];
    return typeof v === 'string' && v.trim().length > 0;
  }).length;
  return { pct: Math.round((done / total) * 100), done, total };
}

const STRATEGIES = ['', 'LTR', 'STR', 'BRRRR', 'Flip', 'House Hack'];

type Section = 'profile' | 'agent' | 'strategy' | 'alerts' | 'account';

const SECTIONS: { id: Section; label: string; icon: typeof User }[] = [
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'agent', label: 'Agent Profile', icon: Briefcase },
  { id: 'strategy', label: 'Investment Strategy', icon: Target },
  { id: 'alerts', label: 'Alert Preferences', icon: Bell },
  { id: 'account', label: 'Account', icon: Shield },
];

// ── Section components ────────────────────────────────────────────────────────

function ProfileSection({ profile, onSave }: { profile: UserProfile; onSave: (name: string) => Promise<void> }) {
  const [name, setName] = useState(profile.name ?? '');
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await onSave(name);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2500);
    } catch {
      setError('Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="text-xs text-slate-400 mb-1.5 block">Display Name</label>
        <input className="strata-input w-full max-w-sm" value={name} onChange={e => setName(e.target.value)} placeholder="Your name" />
      </div>
      <div>
        <label className="text-xs text-slate-400 mb-1.5 block">Email Address</label>
        <input className="strata-input w-full max-w-sm opacity-50" value={profile.email} readOnly />
        <p className="text-xs text-slate-600 mt-1">Email cannot be changed here. Use account settings.</p>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
      <button onClick={save} disabled={saving} className="btn-primary text-sm">
        <Save size={14} /> {success ? 'Saved!' : saving ? 'Saving…' : 'Save Profile'}
      </button>
    </div>
  );
}

function StrategySection({ settings, onSave }: {
  settings: UserProfile['strategySettings'];
  onSave: (s: UserProfile['strategySettings']) => Promise<void>;
}) {
  const [form, setForm] = useState({ ...settings });
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (k: keyof typeof form) => (v: string | number) => setForm(f => ({ ...f, [k]: v }));

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await onSave(form);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2500);
    } catch {
      setError('Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 max-w-sm">
      <div>
        <label className="text-xs text-slate-400 mb-1.5 block">Primary Strategy</label>
        <select className="strata-input w-full" value={form.primaryStrategy ?? ''} onChange={e => set('primaryStrategy')(e.target.value)}>
          {STRATEGIES.map(s => <option key={s} value={s}>{s || 'Select strategy…'}</option>)}
        </select>
      </div>
      <div>
        <label className="text-xs text-slate-400 mb-1.5 block">Target Markets</label>
        <input className="strata-input w-full" value={form.targetMarkets ?? ''} onChange={e => set('targetMarkets')(e.target.value)} placeholder="Dallas TX, Phoenix AZ" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-slate-400 mb-1.5 block">Min Price ($)</label>
          <input type="number" className="strata-input w-full" value={form.minPrice ?? ''} onChange={e => set('minPrice')(Number(e.target.value))} placeholder="200000" />
        </div>
        <div>
          <label className="text-xs text-slate-400 mb-1.5 block">Max Price ($)</label>
          <input type="number" className="strata-input w-full" value={form.maxPrice ?? ''} onChange={e => set('maxPrice')(Number(e.target.value))} placeholder="600000" />
        </div>
      </div>
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs text-slate-400">Min Deal Score</label>
          <span className="text-xs font-mono text-amber-400">{form.minDealScore ?? 60}</span>
        </div>
        <input type="range" min={0} max={100} step={5} value={form.minDealScore ?? 60} onChange={e => set('minDealScore')(Number(e.target.value))} className="w-full h-1 accent-amber-500 cursor-pointer" />
      </div>
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs text-slate-400">Min Cash-on-Cash Target</label>
          <span className="text-xs font-mono text-amber-400">{form.minCashOnCash ?? 6}%</span>
        </div>
        <input type="range" min={0} max={20} step={0.5} value={form.minCashOnCash ?? 6} onChange={e => set('minCashOnCash')(Number(e.target.value))} className="w-full h-1 accent-amber-500 cursor-pointer" />
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
      <button onClick={save} disabled={saving} className="btn-primary text-sm">
        <Save size={14} /> {success ? 'Saved!' : saving ? 'Saving…' : 'Save Strategy'}
      </button>
    </div>
  );
}

const NOTIFICATION_ROWS: { key: NotificationKey; label: string; desc: string }[] = [
  { key: 'savedSearch', label: 'Saved search matches', desc: 'New properties that match your saved searches.' },
  { key: 'priceDrops', label: 'Price drops on watchlist', desc: 'Watchlisted properties drop in price.' },
  { key: 'portfolio', label: 'Portfolio alerts', desc: 'Refi / sell triggers on your holdings.' },
  { key: 'portalActivity', label: 'Client portal activity', desc: 'A client views or favorites something in a portal you shared.' },
];

const CHANNEL_OPTIONS: { value: NotificationChannel; label: string }[] = [
  { value: 'email', label: 'Email' },
  { value: 'push', label: 'Push' },
  { value: 'both', label: 'Both' },
  { value: 'off', label: 'Off' },
];

function AlertsSection({ settings, onSave }: {
  settings: UserProfile['strategySettings'];
  onSave: (s: UserProfile['strategySettings']) => Promise<void>;
}) {
  const [form, setForm] = useState({ ...settings, notifications: { ...(settings.notifications ?? {}) } });
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await onSave(form);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2500);
    } catch {
      setError('Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const setChannel = (key: NotificationKey, channel: NotificationChannel) => {
    setForm(f => ({ ...f, notifications: { ...f.notifications, [key]: channel } }));
  };

  return (
    <div className="space-y-5 max-w-lg">
      <div>
        <p className="text-sm text-white font-medium mb-1">Per-type delivery</p>
        <p className="text-xs text-slate-500 mb-3">Choose how each alert reaches you. Push notifications require the STRATA mobile app.</p>
        <div className="glass rounded-xl border border-white/5 divide-y divide-white/5">
          {NOTIFICATION_ROWS.map(row => {
            const current = form.notifications?.[row.key] ?? 'off';
            return (
              <div key={row.key} className="p-4">
                <div className="mb-2.5">
                  <p className="text-sm text-white">{row.label}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{row.desc}</p>
                </div>
                <div className="flex gap-1.5 flex-wrap">
                  {CHANNEL_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setChannel(row.key, opt.value)}
                      className={clsx(
                        'text-xs px-3 py-1.5 rounded-lg border transition-colors',
                        current === opt.value
                          ? 'bg-amber-500/15 border-amber-500/40 text-amber-400'
                          : 'border-white/10 text-slate-500 hover:border-white/20',
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <label className="text-xs text-slate-400 mb-1.5 block">Alert Frequency (saved searches)</label>
        <div className="flex gap-2">
          {(['Immediately', 'Daily', 'Weekly'] as const).map(f => (
            <button key={f} onClick={() => setForm(prev => ({ ...prev, alertFrequency: f }))}
              className={clsx('flex-1 py-2 rounded-xl text-xs font-medium border transition-colors', (form.alertFrequency ?? 'Daily') === f ? 'bg-amber-500/15 border-amber-500/40 text-amber-400' : 'border-white/10 text-slate-500 hover:border-white/20')}>
              {f}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}
      <button onClick={save} disabled={saving} className="btn-primary text-sm">
        <Save size={14} /> {success ? 'Saved!' : saving ? 'Saving…' : 'Save Preferences'}
      </button>
    </div>
  );
}

function ProfileCompletenessCard({ settings }: { settings: UserProfile['strategySettings'] }) {
  const { pct, done, total } = computeProfileCompleteness(settings);
  const barColor = pct >= 80 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-500' : 'bg-orange-500';

  return (
    <div className="glass rounded-xl p-4 border border-white/8 mb-5">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-semibold text-white">Your agent profile is {pct}% complete</p>
        <span className="text-xs font-mono text-slate-400">{done}/{total}</span>
      </div>
      <div className="w-full h-1.5 rounded-full bg-white/5 overflow-hidden mb-3">
        <div className={clsx('h-full transition-all', barColor)} style={{ width: `${pct}%` }} />
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
        {AGENT_FIELDS.map(f => {
          const v = (settings as Record<string, unknown>)[f.key];
          const present = typeof v === 'string' && v.trim().length > 0;
          return (
            <div key={f.key as string} className="flex items-center gap-2 text-xs">
              {present
                ? <Check size={12} className="text-emerald-400 flex-shrink-0" />
                : <CircleDashed size={12} className="text-slate-600 flex-shrink-0" />
              }
              <span className={present ? 'text-slate-300' : 'text-slate-500'}>
                {f.label}{f.required && !present ? ' *' : ''}
              </span>
            </div>
          );
        })}
      </div>
      {pct < 100 && (
        <p className="text-xs text-slate-500 mt-3">Complete your profile to get the best results from branded reports.</p>
      )}
    </div>
  );
}

function AgentProfileSection({ settings, onSave }: {
  settings: UserProfile['strategySettings'];
  onSave: (s: UserProfile['strategySettings']) => Promise<void>;
}) {
  const [form, setForm] = useState({
    agentName: settings.agentName ?? '',
    brokerageName: settings.brokerageName ?? '',
    licenseNumber: settings.licenseNumber ?? '',
    agentPhone: settings.agentPhone ?? '',
    agentWebsite: settings.agentWebsite ?? '',
    agentPhotoUrl: settings.agentPhotoUrl ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await onSave({ ...settings, ...form });
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2500);
    } catch {
      setError('Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // Preview uses form state so the bar reacts as the agent fills fields.
  const previewSettings = { ...settings, ...form };

  return (
    <div className="max-w-lg">
      <ProfileCompletenessCard settings={previewSettings} />
      <div className="space-y-4">
        <p className="text-xs text-slate-500">These fields pre-fill every CMA and client report you generate.</p>
        <div>
          <label className="text-xs text-slate-400 mb-1.5 block">Agent Name</label>
          <input className="strata-input w-full" value={form.agentName} onChange={set('agentName')} placeholder="Jane Smith" />
        </div>
        <div>
          <label className="text-xs text-slate-400 mb-1.5 block">Brokerage Name</label>
          <input className="strata-input w-full" value={form.brokerageName} onChange={set('brokerageName')} placeholder="Acme Realty Group" />
        </div>
        <div>
          <label className="text-xs text-slate-400 mb-1.5 block">Phone</label>
          <input className="strata-input w-full" value={form.agentPhone} onChange={set('agentPhone')} placeholder="(555) 000-0000" />
        </div>
        <div>
          <label className="text-xs text-slate-400 mb-1.5 block">Photo URL</label>
          <input className="strata-input w-full" value={form.agentPhotoUrl} onChange={set('agentPhotoUrl')} placeholder="https://…/your-headshot.jpg" />
          <p className="text-[10px] text-slate-600 mt-1">Shown on client portals and branded reports.</p>
        </div>
        <div>
          <label className="text-xs text-slate-400 mb-1.5 block">License Number (optional)</label>
          <input className="strata-input w-full" value={form.licenseNumber} onChange={set('licenseNumber')} placeholder="TX-1234567" />
        </div>
        <div>
          <label className="text-xs text-slate-400 mb-1.5 block">Website (optional)</label>
          <input className="strata-input w-full" value={form.agentWebsite} onChange={set('agentWebsite')} placeholder="https://yoursite.com" />
        </div>
        {error && <p className="text-xs text-red-400">{error}</p>}
        <button onClick={save} disabled={saving} className="btn-primary text-sm">
          <Save size={14} /> {success ? 'Saved!' : saving ? 'Saving…' : 'Save Agent Profile'}
        </button>
      </div>
    </div>
  );
}

function AccountSection({ email, signOut }: { email: string; signOut: () => void }) {
  const [resetSent, setResetSent] = useState(false);
  const [resetting, setResetting] = useState(false);

  const sendReset = async () => {
    setResetting(true);
    try {
      await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` });
      setResetSent(true);
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="space-y-4 max-w-sm">
      <div className="glass rounded-xl p-4 border border-white/5 space-y-3">
        <div>
          <p className="text-xs text-slate-500 mb-0.5">Signed in as</p>
          <p className="text-sm text-white font-medium">{email}</p>
        </div>
      </div>
      <div className="glass rounded-xl border border-white/5 divide-y divide-white/5">
        <button onClick={sendReset} disabled={resetting || resetSent} className="w-full flex items-center justify-between px-4 py-3 text-sm text-white hover:bg-white/3 transition-colors">
          <span>{resetSent ? 'Password reset email sent!' : resetting ? 'Sending…' : 'Change Password'}</span>
          {!resetSent && <ChevronRight size={14} className="text-slate-500" />}
        </button>
        <button onClick={signOut} className="w-full flex items-center justify-between px-4 py-3 text-sm text-red-400 hover:bg-red-500/5 transition-colors">
          <span>Sign Out</span>
          <ChevronRight size={14} className="text-slate-600" />
        </button>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { signOut, user } = useAuth();
  const [section, setSection] = useState<Section>('profile');
  const [profile, setProfile] = useState<UserProfile | null>(null);
  // Without this, a failed /users/me on a signed-out session left `profile`
  // null forever and the page sat on a pulsing skeleton with no error, no
  // retry and no explanation.
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiGet<UserProfile>('/users/me')
      .then(p => { if (!cancelled) { setProfile(p); setLoadFailed(false); } })
      .catch(() => {
        if (cancelled) return;
        if (user) {
          // Signed in but the profile call failed — fall back to what the
          // session already tells us so the page stays usable.
          setProfile({ id: user.id, email: user.email ?? '', name: null, strategySettings: {} });
          setLoadFailed(false);
        } else {
          setLoadFailed(true);
        }
      });
    return () => { cancelled = true; };
  }, [user]);

  const saveProfile = async (name: string) => {
    const updated = await apiPut<UserProfile>('/users/me', { name });
    setProfile(updated);
  };

  const saveStrategy = async (settings: UserProfile['strategySettings']) => {
    const updated = await apiPut<UserProfile>('/users/me', { strategySettings: settings });
    setProfile(updated);
  };

  const saveAlerts = async (settings: UserProfile['strategySettings']) => {
    const current = profile?.strategySettings ?? {};
    const updated = await apiPut<UserProfile>('/users/me', { strategySettings: { ...current, ...settings } });
    setProfile(updated);
  };

  if (!profile) {
    if (loadFailed) {
      return (
        <div className="flex items-center justify-center h-full px-4">
          <div className="glass rounded-2xl p-8 max-w-sm text-center border border-white/5">
            <p className="text-sm text-white font-semibold mb-1">Couldn't load your settings</p>
            <p className="text-xs text-slate-500">
              You may be signed out, or the API may be unreachable. Sign in again and retry.
            </p>
          </div>
        </div>
      );
    }
    return <div className="flex items-center justify-center h-full"><div className="glass rounded-xl w-64 h-32 animate-pulse" /></div>;
  }

  return (
    <div className="flex flex-col h-full page-fade overflow-hidden">
      <div className="px-4 md:px-6 py-3 md:py-4 border-b border-white/5 flex-shrink-0">
        <h1 className="text-lg font-semibold text-white">Settings</h1>
        <p className="text-sm text-slate-500 hidden sm:block">Manage your profile, strategy, and preferences.</p>
      </div>

      {/* Mobile section picker (scrollable pills) */}
      <div className="md:hidden border-b border-white/5 overflow-x-auto flex-shrink-0">
        <div className="flex gap-1.5 px-4 py-2.5 min-w-min">
          {SECTIONS.map(s => {
            const active = section === s.id;
            return (
              <button
                key={s.id}
                onClick={() => setSection(s.id)}
                className={clsx(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-all whitespace-nowrap flex-shrink-0',
                  active
                    ? 'bg-amber-500/15 text-amber-400 border-amber-500/40'
                    : 'border-white/10 text-slate-400 hover:border-white/20'
                )}
              >
                <s.icon size={12} /> {s.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Desktop section nav */}
        <div className="hidden md:block w-[200px] flex-shrink-0 border-r border-white/5 px-3 py-4 space-y-0.5">
          {SECTIONS.map(s => {
            const active = section === s.id;
            return (
              <button key={s.id} onClick={() => setSection(s.id)}
                className={clsx('nav-item w-full', active && 'active')}>
                <s.icon size={15} />
                <span>{s.label}</span>
                {active && <ChevronRight size={12} className="ml-auto opacity-50" />}
              </button>
            );
          })}
        </div>

        {/* Section content */}
        <div className="flex-1 overflow-y-auto px-4 md:px-8 py-4 md:py-6">
          <h2 className="text-base font-semibold text-white mb-4 md:mb-5">{SECTIONS.find(s => s.id === section)?.label}</h2>
          {section === 'profile' && <ProfileSection profile={profile} onSave={saveProfile} />}
          {section === 'agent' && <AgentProfileSection settings={profile.strategySettings} onSave={saveStrategy} />}
          {section === 'strategy' && <StrategySection settings={profile.strategySettings} onSave={saveStrategy} />}
          {section === 'alerts' && <AlertsSection settings={profile.strategySettings} onSave={saveAlerts} />}
          {section === 'account' && <AccountSection email={profile.email} signOut={signOut} />}
        </div>
      </div>
    </div>
  );
}
