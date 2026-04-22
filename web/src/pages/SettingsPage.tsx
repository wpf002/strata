import { useState, useEffect } from 'react';
import { User, Target, Bell, Shield, Save, ChevronRight } from 'lucide-react';
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
    emailAlerts?: boolean;
    priceDropAlerts?: boolean;
    alertFrequency?: 'Immediately' | 'Daily' | 'Weekly';
  };
}

const STRATEGIES = ['', 'LTR', 'STR', 'BRRRR', 'Flip', 'House Hack'];

type Section = 'profile' | 'strategy' | 'alerts' | 'account';

const SECTIONS: { id: Section; label: string; icon: typeof User }[] = [
  { id: 'profile', label: 'Profile', icon: User },
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

function AlertsSection({ settings, onSave }: {
  settings: UserProfile['strategySettings'];
  onSave: (s: UserProfile['strategySettings']) => Promise<void>;
}) {
  const [form, setForm] = useState({ ...settings });
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

  const Toggle = ({ checked, onChange, label, desc }: { checked: boolean; onChange: (v: boolean) => void; label: string; desc: string }) => (
    <div className="flex items-start justify-between gap-4 py-3 border-b border-white/5 last:border-0">
      <div>
        <p className="text-sm text-white">{label}</p>
        <p className="text-xs text-slate-500 mt-0.5">{desc}</p>
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={clsx('w-10 h-6 rounded-full transition-colors flex-shrink-0 relative', checked ? 'bg-amber-500' : 'bg-white/10')}
      >
        <span className={clsx('absolute top-1 w-4 h-4 rounded-full bg-white transition-all', checked ? 'left-5' : 'left-1')} />
      </button>
    </div>
  );

  return (
    <div className="space-y-4 max-w-sm">
      <div className="glass rounded-xl p-4 border border-white/5">
        <Toggle
          checked={form.emailAlerts ?? false}
          onChange={v => setForm(f => ({ ...f, emailAlerts: v }))}
          label="Email alerts for saved searches"
          desc="Get notified when new properties match your saved searches."
        />
        <Toggle
          checked={form.priceDropAlerts ?? false}
          onChange={v => setForm(f => ({ ...f, priceDropAlerts: v }))}
          label="Price drop alerts for watchlist"
          desc="Get notified when a watchlisted property drops in price."
        />
      </div>
      <div>
        <label className="text-xs text-slate-400 mb-1.5 block">Alert Frequency</label>
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

  useEffect(() => {
    apiGet<UserProfile>('/users/me')
      .then(setProfile)
      .catch(() => {
        if (user) {
          setProfile({ id: user.id, email: user.email ?? '', name: null, strategySettings: {} });
        }
      });
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
    return <div className="flex items-center justify-center h-full"><div className="glass rounded-xl w-64 h-32 animate-pulse" /></div>;
  }

  return (
    <div className="flex flex-col h-full page-fade overflow-hidden">
      <div className="px-6 py-4 border-b border-white/5 flex-shrink-0">
        <h1 className="text-lg font-semibold text-white">Settings</h1>
        <p className="text-sm text-slate-500">Manage your profile, strategy, and preferences.</p>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Section nav */}
        <div className="w-[200px] flex-shrink-0 border-r border-white/5 px-3 py-4 space-y-0.5">
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
        <div className="flex-1 overflow-y-auto px-8 py-6">
          <h2 className="text-base font-semibold text-white mb-5">{SECTIONS.find(s => s.id === section)?.label}</h2>
          {section === 'profile' && <ProfileSection profile={profile} onSave={saveProfile} />}
          {section === 'strategy' && <StrategySection settings={profile.strategySettings} onSave={saveStrategy} />}
          {section === 'alerts' && <AlertsSection settings={profile.strategySettings} onSave={saveAlerts} />}
          {section === 'account' && <AccountSection email={profile.email} signOut={signOut} />}
        </div>
      </div>
    </div>
  );
}
