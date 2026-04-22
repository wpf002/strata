import { useState, useEffect, useCallback } from 'react';
import { Plus, X, Users, Copy, Check, ChevronRight, Eye, Star, Share2, BarChart2 } from 'lucide-react';
import { clsx } from 'clsx';
import { fmt, ScoreBadge } from '../components/UI';
import { supabase } from '../lib/supabase';

// ── Types ────────────────────────────────────────────────────────────────────

interface Client {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  strategy: string | null;
  minPrice: number | null;
  maxPrice: number | null;
  targetMarkets: string[];
  propertyTypes: string[];
  notes: string | null;
  createdAt: string;
}

interface MatchProperty {
  id: string;
  address: string;
  price: number;
  dealScore: number;
  capRate: number;
  cashFlow: number;
}

interface ActivityBucket {
  count: number;
  lastAt: string | null;
}

interface PropertyActivity {
  propertyId: string;
  address: string;
  price: number | null;
  image: string | null;
  activities: {
    viewed?: ActivityBucket;
    saved?: ActivityBucket;
    shared?: ActivityBucket;
    underwritten?: ActivityBucket;
    copilot_asked?: ActivityBucket;
  };
  lastActive: string | null;
  engagementScore: number;
}

const STRATEGIES = ['LTR', 'STR', 'BRRRR', 'Flip', 'House Hack'];
const PROPERTY_TYPES = ['Single Family', 'Multi-Family', 'Condo', 'Townhouse', 'Commercial'];

const STRATEGY_COLORS: Record<string, string> = {
  LTR: 'text-blue-400 bg-blue-400/10 border-blue-400/30',
  STR: 'text-purple-400 bg-purple-400/10 border-purple-400/30',
  BRRRR: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
  Flip: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/30',
  'House Hack': 'text-pink-400 bg-pink-400/10 border-pink-400/30',
};

// ── API helpers ──────────────────────────────────────────────────────────────

const BASE_URL = import.meta.env.VITE_API_URL ?? '';

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token
    ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    : { 'Content-Type': 'application/json' };
}

async function apiGet<T>(path: string): Promise<T> {
  const headers = await authHeaders();
  const res = await fetch(`${BASE_URL}${path}`, { headers });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const headers = await authHeaders();
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

async function apiPut<T>(path: string, body: unknown): Promise<T> {
  const headers = await authHeaders();
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function daysAgo(iso: string | null): number | null {
  if (!iso) return null;
  const diff = Date.now() - new Date(iso).getTime();
  return Math.max(0, Math.floor(diff / 86_400_000));
}

function activityDotColor(lastActive: string | null): string {
  const d = daysAgo(lastActive);
  if (d === null) return 'bg-slate-600';
  if (d <= 7) return 'bg-emerald-400';
  if (d <= 30) return 'bg-amber-400';
  return 'bg-slate-600';
}

// ── Client Modal ─────────────────────────────────────────────────────────────

interface ClientFormData {
  name: string;
  email: string;
  phone: string;
  strategy: string;
  minPrice: string;
  maxPrice: string;
  targetMarkets: string;
  propertyTypes: string[];
  notes: string;
}

const EMPTY_FORM: ClientFormData = {
  name: '', email: '', phone: '', strategy: '', minPrice: '', maxPrice: '',
  targetMarkets: '', propertyTypes: [], notes: '',
};

function ClientModal({
  initial, onClose, onSave, title,
}: {
  initial?: Partial<ClientFormData>;
  onClose: () => void;
  onSave: (data: ClientFormData) => Promise<void>;
  title: string;
}) {
  const [form, setForm] = useState<ClientFormData>({ ...EMPTY_FORM, ...initial });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (k: keyof ClientFormData) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm(f => ({ ...f, [k]: e.target.value }));

  const toggleType = (t: string) =>
    setForm(f => ({
      ...f,
      propertyTypes: f.propertyTypes.includes(t)
        ? f.propertyTypes.filter(x => x !== t)
        : [...f.propertyTypes, t],
    }));

  const submit = async () => {
    if (!form.name.trim()) { setError('Name is required'); return; }
    setSaving(true);
    setError(null);
    try {
      await onSave(form);
      onClose();
    } catch {
      setError('Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="glass rounded-2xl p-6 w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-semibold text-white">{title}</h3>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors"><X size={16} /></button>
        </div>

        {error && <p className="text-xs text-red-400 mb-3 p-2 rounded bg-red-400/10 border border-red-400/20">{error}</p>}

        <div className="space-y-3">
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Name *</label>
            <input className="strata-input w-full" placeholder="Jane Smith" value={form.name} onChange={set('name')} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Email</label>
              <input className="strata-input w-full" type="email" placeholder="jane@email.com" value={form.email} onChange={set('email')} />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Phone</label>
              <input className="strata-input w-full" placeholder="(555) 000-0000" value={form.phone} onChange={set('phone')} />
            </div>
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Strategy</label>
            <select className="strata-input w-full" value={form.strategy} onChange={set('strategy')}>
              <option value="">Select strategy…</option>
              {STRATEGIES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Min Price ($)</label>
              <input className="strata-input w-full" type="number" placeholder="200000" value={form.minPrice} onChange={set('minPrice')} />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Max Price ($)</label>
              <input className="strata-input w-full" type="number" placeholder="600000" value={form.maxPrice} onChange={set('maxPrice')} />
            </div>
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Target Markets (comma-separated)</label>
            <input className="strata-input w-full" placeholder="Dallas TX, Phoenix AZ" value={form.targetMarkets} onChange={set('targetMarkets')} />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-2 block">Property Types</label>
            <div className="flex flex-wrap gap-2">
              {PROPERTY_TYPES.map(t => (
                <button key={t} type="button"
                  onClick={() => toggleType(t)}
                  className={clsx('text-xs px-2.5 py-1 rounded-lg border transition-colors',
                    form.propertyTypes.includes(t)
                      ? 'bg-amber-500/15 border-amber-500/40 text-amber-400'
                      : 'border-white/10 text-slate-500 hover:border-white/20')}>
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Notes (optional)</label>
            <textarea className="strata-input w-full resize-none" rows={2} placeholder="Any notes…" value={form.notes} onChange={set('notes')} />
          </div>
        </div>

        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="btn-ghost flex-1 justify-center text-sm">Cancel</button>
          <button onClick={submit} disabled={saving} className="btn-primary flex-1 justify-center text-sm">
            {saving ? 'Saving…' : 'Save Client'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Activity Feed ─────────────────────────────────────────────────────────────

function ActivityFeed({ clientId }: { clientId: string }) {
  const [activity, setActivity] = useState<PropertyActivity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    apiGet<PropertyActivity[]>(`/clients/${clientId}/activity`)
      .then(setActivity)
      .catch(() => setActivity([]))
      .finally(() => setLoading(false));
  }, [clientId]);

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map(i => <div key={i} className="glass rounded-xl h-20 animate-pulse" />)}
      </div>
    );
  }

  if (activity.length === 0) {
    return (
      <div className="glass rounded-xl p-8 text-center">
        <p className="text-slate-400 text-sm font-medium">No activity yet.</p>
        <p className="text-slate-600 text-xs mt-1">Share a property link with this client to start tracking.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {activity.map(item => {
        const d = daysAgo(item.lastActive);
        const acts = item.activities;
        return (
          <div key={item.propertyId} className="glass rounded-xl p-4 border border-white/5">
            <div className="flex items-start gap-3">
              {item.image ? (
                <img src={item.image} alt="" className="w-14 h-14 rounded-lg object-cover flex-shrink-0" />
              ) : (
                <div className="w-14 h-14 rounded-lg bg-navy-800 flex-shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white truncate">{item.address}</p>
                {item.price && <p className="text-xs font-mono text-slate-400">{fmt.currency(item.price)}</p>}
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  {acts.viewed && (
                    <span className="flex items-center gap-1 text-xs text-slate-400 bg-white/5 px-2 py-0.5 rounded-lg">
                      <Eye size={11} className="text-blue-400" /> {acts.viewed.count} view{acts.viewed.count !== 1 ? 's' : ''}
                    </span>
                  )}
                  {acts.saved && (
                    <span className="flex items-center gap-1 text-xs text-slate-400 bg-white/5 px-2 py-0.5 rounded-lg">
                      <Star size={11} className="text-amber-400" /> {acts.saved.count} save{acts.saved.count !== 1 ? 's' : ''}
                    </span>
                  )}
                  {acts.shared && (
                    <span className="flex items-center gap-1 text-xs text-slate-400 bg-white/5 px-2 py-0.5 rounded-lg">
                      <Share2 size={11} className="text-emerald-400" /> {acts.shared.count} share{acts.shared.count !== 1 ? 's' : ''}
                    </span>
                  )}
                  {acts.underwritten && (
                    <span className="flex items-center gap-1 text-xs text-slate-400 bg-white/5 px-2 py-0.5 rounded-lg">
                      <BarChart2 size={11} className="text-purple-400" /> {acts.underwritten.count} anal{acts.underwritten.count !== 1 ? 'yses' : 'ysis'}
                    </span>
                  )}
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <p className={clsx('text-[10px] font-semibold', item.engagementScore > 10 ? 'text-amber-400' : 'text-slate-500')}>
                  {item.engagementScore}pts
                </p>
                {d !== null && (
                  <p className="text-[10px] text-slate-600 mt-0.5">
                    {d === 0 ? 'Today' : `${d}d ago`}
                  </p>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [matches, setMatches] = useState<MatchProperty[]>([]);
  const [matchLoading, setMatchLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [rightTab, setRightTab] = useState<'matches' | 'activity'>('matches');
  const [clientActivity, setClientActivity] = useState<Record<string, PropertyActivity[]>>({});

  const load = useCallback(async () => {
    try {
      const data = await apiGet<Client[]>('/clients');
      setClients(data);
      if (data.length > 0 && !activeId) setActiveId(data[0].id);
    } catch {
      setClients([]);
    }
  }, [activeId]);

  useEffect(() => { load(); }, []);

  const loadMatches = useCallback(async (clientId: string) => {
    setMatchLoading(true);
    setMatches([]);
    try {
      const data = await apiGet<MatchProperty[]>(`/clients/${clientId}/matches`);
      setMatches(data);
    } catch {
      setMatches([]);
    } finally {
      setMatchLoading(false);
    }
  }, []);

  // Pre-load activity for all clients to show roster indicators
  const loadRosterActivity = useCallback(async (clients: Client[]) => {
    const results: Record<string, PropertyActivity[]> = {};
    await Promise.allSettled(
      clients.map(async c => {
        try {
          const acts = await apiGet<PropertyActivity[]>(`/clients/${c.id}/activity`);
          results[c.id] = acts;
        } catch {
          results[c.id] = [];
        }
      })
    );
    setClientActivity(results);
  }, []);

  useEffect(() => {
    if (activeId) loadMatches(activeId);
  }, [activeId, loadMatches]);

  useEffect(() => {
    if (clients.length > 0) loadRosterActivity(clients);
  }, [clients, loadRosterActivity]);

  const handleCreate = async (form: ClientFormData) => {
    await apiPost('/clients', {
      name: form.name,
      email: form.email || null,
      phone: form.phone || null,
      strategy: form.strategy || null,
      minPrice: form.minPrice ? Number(form.minPrice) : null,
      maxPrice: form.maxPrice ? Number(form.maxPrice) : null,
      targetMarkets: form.targetMarkets.split(',').map(s => s.trim()).filter(Boolean),
      propertyTypes: form.propertyTypes,
      notes: form.notes || null,
    });
    await load();
  };

  const handleUpdate = async (form: ClientFormData) => {
    if (!editingClient) return;
    await apiPut(`/clients/${editingClient.id}`, {
      name: form.name,
      email: form.email || null,
      phone: form.phone || null,
      strategy: form.strategy || null,
      minPrice: form.minPrice ? Number(form.minPrice) : null,
      maxPrice: form.maxPrice ? Number(form.maxPrice) : null,
      targetMarkets: form.targetMarkets.split(',').map(s => s.trim()).filter(Boolean),
      propertyTypes: form.propertyTypes,
      notes: form.notes || null,
    });
    await load();
  };

  // Share with client — appends ?client={id} so views are attributed
  const handleCopyLink = (propertyId: string, clientId: string) => {
    const url = `${window.location.origin}/intelligence/${propertyId}?client=${clientId}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(propertyId);
      // Record a "shared" activity
      apiPost(`/clients/${clientId}/activity`, {
        property_id: propertyId,
        activity_type: 'shared',
      }).catch(() => {});
      setTimeout(() => setCopied(null), 2000);
    });
  };

  const active = clients.find(c => c.id === activeId) ?? null;

  // Roster helper: last active timestamp across all activity for a client
  function clientLastActive(clientId: string): string | null {
    const acts = clientActivity[clientId] ?? [];
    if (acts.length === 0) return null;
    const dates = acts.map(a => a.lastActive).filter(Boolean) as string[];
    if (dates.length === 0) return null;
    return dates.sort().reverse()[0];
  }

  function clientPropertyCount(clientId: string): number {
    return (clientActivity[clientId] ?? []).length;
  }

  if (clients.length === 0 && !showModal) {
    return (
      <div className="flex flex-col h-full page-fade">
        {showModal && <ClientModal title="Add Client" onClose={() => setShowModal(false)} onSave={handleCreate} />}
        <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between flex-shrink-0">
          <div>
            <h1 className="text-lg font-semibold text-white">Clients</h1>
            <p className="text-sm text-slate-500">Match properties to client criteria</p>
          </div>
          <button className="btn-primary text-sm" onClick={() => setShowModal(true)}><Plus size={14} /> Add Client</button>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-8">
          <div className="w-16 h-16 rounded-2xl bg-blue-500/10 flex items-center justify-center">
            <Users size={28} className="text-blue-400/60" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-white mb-2">No clients yet</h2>
            <p className="text-slate-500 text-sm max-w-xs">Add your first client to start matching properties to their criteria.</p>
          </div>
          <button className="btn-primary" onClick={() => setShowModal(true)}>
            <Plus size={14} /> Add Client
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full page-fade overflow-hidden">
      {showModal && <ClientModal title="Add Client" onClose={() => setShowModal(false)} onSave={handleCreate} />}
      {editingClient && (
        <ClientModal
          title="Edit Client"
          initial={{
            name: editingClient.name,
            email: editingClient.email ?? '',
            phone: editingClient.phone ?? '',
            strategy: editingClient.strategy ?? '',
            minPrice: editingClient.minPrice ? String(editingClient.minPrice) : '',
            maxPrice: editingClient.maxPrice ? String(editingClient.maxPrice) : '',
            targetMarkets: editingClient.targetMarkets.join(', '),
            propertyTypes: editingClient.propertyTypes,
            notes: editingClient.notes ?? '',
          }}
          onClose={() => setEditingClient(null)}
          onSave={handleUpdate}
        />
      )}

      <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-lg font-semibold text-white">Clients</h1>
          <p className="text-sm text-slate-500">{clients.length} client{clients.length !== 1 ? 's' : ''} · property matching</p>
        </div>
        <button className="btn-primary text-sm" onClick={() => setShowModal(true)}><Plus size={14} /> Add Client</button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left panel — client roster */}
        <div className="w-[300px] flex-shrink-0 border-r border-white/5 flex flex-col overflow-y-auto px-3 py-3 space-y-1.5">
          {clients.map(c => {
            const lastActive = clientLastActive(c.id);
            const propCount = clientPropertyCount(c.id);
            const d = daysAgo(lastActive);
            const dotColor = activityDotColor(lastActive);
            return (
              <div
                key={c.id}
                onClick={() => setActiveId(c.id)}
                className={clsx('rounded-xl p-4 cursor-pointer transition-all border', activeId === c.id ? 'border-amber-500/40 bg-amber-500/5' : 'border-white/5 glass hover:border-white/15')}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className={clsx('w-2 h-2 rounded-full flex-shrink-0', dotColor)} />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{c.name}</p>
                      {c.email && <p className="text-xs text-slate-500 truncate">{c.email}</p>}
                    </div>
                  </div>
                  {c.strategy && (
                    <span className={clsx('text-xs font-semibold px-2 py-0.5 rounded border flex-shrink-0', STRATEGY_COLORS[c.strategy] ?? 'text-slate-400 bg-white/5 border-white/10')}>
                      {c.strategy}
                    </span>
                  )}
                </div>
                {(c.minPrice || c.maxPrice) && (
                  <p className="text-xs text-slate-500 mt-1.5 ml-4">
                    {c.minPrice ? fmt.compact(c.minPrice) : '—'} – {c.maxPrice ? fmt.compact(c.maxPrice) : '—'}
                  </p>
                )}
                {c.targetMarkets.length > 0 && (
                  <p className="text-xs text-slate-600 mt-0.5 ml-4 truncate">{c.targetMarkets.join(' · ')}</p>
                )}
                <div className="flex items-center justify-between mt-2 ml-4">
                  <div className="flex items-center gap-2">
                    {d !== null && (
                      <span className="text-[10px] text-slate-600">
                        {d === 0 ? 'Active today' : `Active ${d}d ago`}
                      </span>
                    )}
                    {propCount > 0 && (
                      <span className="text-[10px] text-slate-600">{propCount} {propCount === 1 ? 'property' : 'properties'}</span>
                    )}
                  </div>
                  <ChevronRight size={12} className={clsx('text-slate-600', activeId === c.id && 'text-amber-500')} />
                </div>
              </div>
            );
          })}
        </div>

        {/* Right panel */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {active ? (
            <>
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h2 className="text-base font-semibold text-white">{active.name}</h2>
                  <p className="text-sm text-slate-500">
                    {active.strategy && <>{active.strategy} · </>}
                    {active.minPrice && active.maxPrice ? `${fmt.compact(active.minPrice)}–${fmt.compact(active.maxPrice)}` : ''}
                    {active.targetMarkets.length > 0 && ` · ${active.targetMarkets.join(', ')}`}
                  </p>
                </div>
                <button className="btn-ghost text-sm" onClick={() => setEditingClient(active)}>Edit Client</button>
              </div>

              {/* Tabs */}
              <div className="flex gap-1 mb-5 border-b border-white/5">
                {(['matches', 'activity'] as const).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setRightTab(tab)}
                    className={clsx('pb-2.5 px-1 text-sm font-medium transition-all mr-4', rightTab === tab ? 'tab-active' : 'tab-inactive')}
                  >
                    {tab === 'matches' ? 'Matching Properties' : 'Activity Feed'}
                  </button>
                ))}
              </div>

              {rightTab === 'matches' && (
                <>
                  {matchLoading ? (
                    <div className="space-y-3">
                      {[...Array(3)].map((_, i) => <div key={i} className="glass rounded-xl h-20 animate-pulse" />)}
                    </div>
                  ) : matches.length === 0 ? (
                    <div className="glass rounded-xl p-8 text-center">
                      <p className="text-slate-500 text-sm">No matching properties found for this client's criteria.</p>
                      <p className="text-slate-600 text-xs mt-1">Try broadening the price range or adding more target markets.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {matches.map(p => (
                        <div key={p.id} className="glass rounded-xl p-4 border border-white/5 hover:border-white/15 transition-colors">
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-semibold text-white truncate">{p.address}</p>
                              <div className="flex items-center gap-3 mt-1.5">
                                <span className="text-xs font-mono text-white">{fmt.currency(p.price)}</span>
                                <span className="text-xs text-amber-400 font-mono">{p.capRate?.toFixed(1)}% cap</span>
                                <span className={clsx('text-xs font-mono', (p.cashFlow ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                                  {(p.cashFlow ?? 0) >= 0 ? '+' : ''}{fmt.currency(p.cashFlow ?? 0)}/mo
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <ScoreBadge score={p.dealScore} />
                              <button
                                onClick={() => handleCopyLink(p.id, active.id)}
                                className="btn-ghost text-xs gap-1.5 py-1.5 px-2.5"
                                title="Copy link to share with client (tracks views)"
                              >
                                {copied === p.id ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Share</>}
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}

              {rightTab === 'activity' && <ActivityFeed clientId={active.id} />}
            </>
          ) : (
            <div className="flex items-center justify-center h-full">
              <p className="text-slate-500 text-sm">Select a client to see matching properties.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
