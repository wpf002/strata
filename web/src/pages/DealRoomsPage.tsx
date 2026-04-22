import { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, X, CheckSquare, Square, Trash2, Send, MessageSquare, FileText, ChevronRight } from 'lucide-react';
import { clsx } from 'clsx';
import { supabase } from '../lib/supabase';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Participant { role: string; email: string; name: string; user_id?: string }

interface DealRoom {
  id: string;
  propertyAddress: string;
  propertyId?: string;
  status: 'active' | 'closed' | 'cancelled';
  participants: Participant[];
  taskTotal: number;
  taskComplete: number;
  daysActive: number;
  createdAt: string;
  tasks?: Task[];
}

interface Task {
  id: string;
  title: string;
  assignedToEmail: string | null;
  dueDate: string | null;
  status: 'pending' | 'complete';
  completedAt: string | null;
}

interface Message {
  id: string;
  senderName: string;
  content: string;
  createdAt: string;
}

type RoomTab = 'tasks' | 'messages' | 'documents';

const ROLES = ['Buyer', 'Agent', 'Lender', 'Attorney'] as const;

const STATUS_STYLES: Record<string, string> = {
  active: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/30',
  closed: 'text-slate-400 bg-white/5 border-white/10',
  cancelled: 'text-red-400 bg-red-400/10 border-red-400/30',
};

// ── API ───────────────────────────────────────────────────────────────────────

const BASE_URL = import.meta.env.VITE_API_URL ?? '';

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token
    ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    : { 'Content-Type': 'application/json' };
}

async function apiGet<T>(path: string): Promise<T> {
  const h = await authHeaders();
  const r = await fetch(`${BASE_URL}${path}`, { headers: h });
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json();
}

async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const h = await authHeaders();
  const r = await fetch(`${BASE_URL}${path}`, { method: 'POST', headers: h, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json();
}

async function apiPut<T>(path: string, body: unknown): Promise<T> {
  const h = await authHeaders();
  const r = await fetch(`${BASE_URL}${path}`, { method: 'PUT', headers: h, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json();
}

async function apiDelete(path: string): Promise<void> {
  const h = await authHeaders();
  await fetch(`${BASE_URL}${path}`, { method: 'DELETE', headers: h });
}

// ── New Room Modal ────────────────────────────────────────────────────────────

function NewRoomModal({ onClose, onCreate }: { onClose: () => void; onCreate: (room: DealRoom) => void }) {
  const [address, setAddress] = useState('');
  const [participants, setParticipants] = useState<{ name: string; email: string; role: string }[]>([
    { name: '', email: '', role: 'Agent' },
  ]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addParticipant = () => setParticipants(p => [...p, { name: '', email: '', role: 'Buyer' }]);
  const removeParticipant = (i: number) => setParticipants(p => p.filter((_, idx) => idx !== i));
  const setP = (i: number, k: string, v: string) =>
    setParticipants(p => p.map((x, idx) => idx === i ? { ...x, [k]: v } : x));

  const submit = async () => {
    if (!address.trim()) { setError('Property address is required'); return; }
    setSaving(true);
    setError(null);
    try {
      const room = await apiPost<DealRoom>('/deal-rooms', {
        propertyAddress: address.trim(),
        participants: participants.filter(p => p.email),
      });
      onCreate(room);
      onClose();
    } catch {
      setError('Failed to create deal room.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="glass rounded-2xl p-6 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-semibold text-white">New Deal Room</h3>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors"><X size={16} /></button>
        </div>

        {error && <p className="text-xs text-red-400 mb-3 p-2 rounded bg-red-400/10 border border-red-400/20">{error}</p>}

        <div className="space-y-4">
          <div>
            <label className="text-xs text-slate-400 mb-1.5 block">Property Address *</label>
            <input
              className="strata-input w-full"
              placeholder="123 Main St, Dallas, TX 75201"
              value={address}
              onChange={e => setAddress(e.target.value)}
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs text-slate-400">Participants</label>
              <button onClick={addParticipant} className="text-xs text-amber-400 hover:text-amber-300 transition-colors">+ Add</button>
            </div>
            <div className="space-y-2">
              {participants.map((p, i) => (
                <div key={i} className="grid grid-cols-[1fr_1fr_auto_auto] gap-2 items-center">
                  <input className="strata-input text-xs" placeholder="Name" value={p.name} onChange={e => setP(i, 'name', e.target.value)} />
                  <input className="strata-input text-xs" placeholder="Email" value={p.email} onChange={e => setP(i, 'email', e.target.value)} />
                  <select className="strata-input text-xs" value={p.role} onChange={e => setP(i, 'role', e.target.value)}>
                    {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                  {participants.length > 1 && (
                    <button onClick={() => removeParticipant(i)} className="text-slate-600 hover:text-red-400 transition-colors"><X size={13} /></button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="btn-ghost flex-1 justify-center text-sm">Cancel</button>
          <button onClick={submit} disabled={saving} className="btn-primary flex-1 justify-center text-sm">
            {saving ? 'Creating…' : 'Create Deal Room'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Task List ─────────────────────────────────────────────────────────────────

function TaskList({ roomId, initialTasks }: { roomId: string; initialTasks: Task[] }) {
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [newTitle, setNewTitle] = useState('');
  const [adding, setAdding] = useState(false);

  const toggle = async (task: Task) => {
    const newStatus = task.status === 'complete' ? 'pending' : 'complete';
    setTasks(ts => ts.map(t => t.id === task.id ? { ...t, status: newStatus } : t));
    try {
      await apiPut(`/deal-rooms/${roomId}/tasks/${task.id}`, { status: newStatus });
    } catch {
      setTasks(ts => ts.map(t => t.id === task.id ? { ...t, status: task.status } : t));
    }
  };

  const addTask = async () => {
    if (!newTitle.trim()) return;
    setAdding(true);
    try {
      const task = await apiPost<Task>(`/deal-rooms/${roomId}/tasks`, { title: newTitle.trim() });
      setTasks(ts => [...ts, task]);
      setNewTitle('');
    } catch {
      // ignore
    } finally {
      setAdding(false);
    }
  };

  const removeTask = async (task: Task) => {
    setTasks(ts => ts.filter(t => t.id !== task.id));
    try {
      await apiDelete(`/deal-rooms/${roomId}/tasks/${task.id}`);
    } catch {
      setTasks(ts => [...ts, task]);
    }
  };

  return (
    <div>
      <div className="space-y-2 mb-4">
        {tasks.map(t => (
          <div key={t.id} className="flex items-center gap-3 p-3 glass rounded-xl border border-white/5 group">
            <button onClick={() => toggle(t)} className="flex-shrink-0 text-slate-500 hover:text-amber-400 transition-colors">
              {t.status === 'complete'
                ? <CheckSquare size={16} className="text-emerald-400" />
                : <Square size={16} />}
            </button>
            <span className={clsx('flex-1 text-sm', t.status === 'complete' ? 'line-through text-slate-600' : 'text-slate-200')}>
              {t.title}
            </span>
            {t.assignedToEmail && (
              <span className="text-[10px] text-slate-600 hidden group-hover:block">{t.assignedToEmail}</span>
            )}
            <button
              onClick={() => removeTask(t)}
              className="opacity-0 group-hover:opacity-100 text-slate-600 hover:text-red-400 transition-all"
            >
              <Trash2 size={12} />
            </button>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <input
          className="strata-input flex-1 text-sm"
          placeholder="Add custom task…"
          value={newTitle}
          onChange={e => setNewTitle(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addTask()}
        />
        <button onClick={addTask} disabled={adding || !newTitle.trim()} className="btn-primary text-sm">
          <Plus size={14} />
        </button>
      </div>
    </div>
  );
}

// ── Message Feed ──────────────────────────────────────────────────────────────

function MessageFeed({ roomId }: { roomId: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    apiGet<Message[]>(`/deal-rooms/${roomId}/messages`).then(setMessages).catch(() => {});
  }, [roomId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = async () => {
    if (!text.trim() || sending) return;
    setSending(true);
    try {
      const msg = await apiPost<Message>(`/deal-rooms/${roomId}/messages`, { content: text.trim() });
      setMessages(m => [...m, msg]);
      setText('');
    } catch {
      // ignore
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto space-y-3 mb-4 min-h-0">
        {messages.length === 0 ? (
          <div className="text-center py-8">
            <MessageSquare size={28} className="text-slate-700 mx-auto mb-2" />
            <p className="text-sm text-slate-500">No messages yet. Start the conversation.</p>
          </div>
        ) : (
          messages.map(m => (
            <div key={m.id} className="glass rounded-xl p-3 border border-white/5">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-semibold text-amber-400">{m.senderName}</span>
                <span className="text-[10px] text-slate-600">
                  {new Date(m.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                </span>
              </div>
              <p className="text-sm text-slate-200">{m.content}</p>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
      <div className="flex gap-2 flex-shrink-0">
        <input
          className="strata-input flex-1 text-sm"
          placeholder="Type a message…"
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
        />
        <button onClick={send} disabled={sending || !text.trim()} className="btn-primary text-sm px-3">
          <Send size={14} />
        </button>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function DealRoomsPage() {
  const [rooms, setRooms] = useState<DealRoom[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeRoom, setActiveRoom] = useState<DealRoom | null>(null);
  const [tab, setTab] = useState<RoomTab>('tasks');
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadRooms = useCallback(async () => {
    try {
      const data = await apiGet<DealRoom[]>('/deal-rooms');
      setRooms(data);
      if (data.length > 0 && !activeId) setActiveId(data[0].id);
    } catch {
      setRooms([]);
    } finally {
      setLoading(false);
    }
  }, [activeId]);

  useEffect(() => { loadRooms(); }, []);

  useEffect(() => {
    if (!activeId) return;
    apiGet<DealRoom>(`/deal-rooms/${activeId}`)
      .then(setActiveRoom)
      .catch(() => {});
  }, [activeId]);

  const handleCreate = (room: DealRoom) => {
    setRooms(r => [room, ...r]);
    setActiveId(room.id);
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Delete this deal room? This cannot be undone.')) return;
    await apiDelete(`/deal-rooms/${id}`);
    setRooms(r => r.filter(room => room.id !== id));
    if (activeId === id) { setActiveId(null); setActiveRoom(null); }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-full"><div className="glass rounded-xl w-80 h-40 animate-pulse" /></div>;
  }

  return (
    <div className="flex flex-col h-full page-fade overflow-hidden">
      {showModal && <NewRoomModal onClose={() => setShowModal(false)} onCreate={handleCreate} />}

      <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-lg font-semibold text-white">Deal Rooms</h1>
          <p className="text-sm text-slate-500">{rooms.length} active room{rooms.length !== 1 ? 's' : ''}</p>
        </div>
        <button className="btn-primary text-sm" onClick={() => setShowModal(true)}><Plus size={14} /> New Deal Room</button>
      </div>

      {rooms.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-8">
          <div className="w-16 h-16 rounded-2xl bg-blue-500/10 flex items-center justify-center">
            <MessageSquare size={28} className="text-blue-400/60" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-white mb-2">No deal rooms yet</h2>
            <p className="text-slate-500 text-sm max-w-xs">Create a deal room to coordinate buyers, lenders, and agents in one place.</p>
          </div>
          <button className="btn-primary" onClick={() => setShowModal(true)}><Plus size={14} /> New Deal Room</button>
        </div>
      ) : (
        <div className="flex flex-1 overflow-hidden">
          {/* Left panel — room list */}
          <div className="w-[300px] flex-shrink-0 border-r border-white/5 overflow-y-auto px-3 py-3 space-y-2">
            {rooms.map(r => (
              <div
                key={r.id}
                onClick={() => { setActiveId(r.id); setActiveRoom(null); }}
                className={clsx('rounded-xl p-4 cursor-pointer transition-all border group/card', activeId === r.id ? 'border-amber-500/40 bg-amber-500/5' : 'border-white/5 glass hover:border-white/15')}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold text-white leading-tight">{r.propertyAddress}</p>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <span className={clsx('text-[10px] font-semibold px-2 py-0.5 rounded border', STATUS_STYLES[r.status])}>
                      {r.status.charAt(0).toUpperCase() + r.status.slice(1)}
                    </span>
                    <button
                      onClick={e => handleDelete(r.id, e)}
                      className="opacity-0 group-hover/card:opacity-100 text-slate-600 hover:text-red-400 transition-all"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-3 mt-2 text-[11px] text-slate-500">
                  <span>{r.participants.length} participant{r.participants.length !== 1 ? 's' : ''}</span>
                  <span>{r.taskComplete}/{r.taskTotal} tasks</span>
                  <span>{r.daysActive}d active</span>
                </div>
                {r.taskTotal > 0 && (
                  <div className="mt-2 h-1 bg-white/5 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-amber-500 rounded-full transition-all"
                      style={{ width: `${(r.taskComplete / r.taskTotal) * 100}%` }}
                    />
                  </div>
                )}
                <div className="flex items-center justify-end mt-1">
                  <ChevronRight size={11} className={clsx('text-slate-600', activeId === r.id && 'text-amber-500')} />
                </div>
              </div>
            ))}
          </div>

          {/* Right panel */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {activeRoom ? (
              <>
                {/* Room header */}
                <div className="px-6 py-4 border-b border-white/5 flex-shrink-0">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-base font-semibold text-white">{activeRoom.propertyAddress}</h2>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={clsx('text-[10px] font-semibold px-2 py-0.5 rounded border', STATUS_STYLES[activeRoom.status])}>
                          {activeRoom.status.charAt(0).toUpperCase() + activeRoom.status.slice(1)}
                        </span>
                        <div className="flex items-center gap-1">
                          {activeRoom.participants.slice(0, 4).map((p, i) => (
                            <div key={i} title={`${p.name} (${p.role})`}
                              className="w-6 h-6 rounded-full bg-navy-700 border border-white/10 flex items-center justify-center text-[9px] font-bold text-amber-400">
                              {p.name?.[0]?.toUpperCase() ?? p.role[0]}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Tabs */}
                  <div className="flex gap-1 mt-4 border-b border-white/5 -mb-[1px]">
                    {(['tasks', 'messages', 'documents'] as RoomTab[]).map(t => (
                      <button
                        key={t}
                        onClick={() => setTab(t)}
                        className={clsx('pb-2.5 px-1 text-sm font-medium transition-all mr-4 capitalize', tab === t ? 'tab-active' : 'tab-inactive')}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex-1 overflow-hidden px-6 py-5 flex flex-col">
                  {tab === 'tasks' && activeRoom.tasks && (
                    <TaskList roomId={activeRoom.id} initialTasks={activeRoom.tasks} />
                  )}
                  {tab === 'messages' && <MessageFeed roomId={activeRoom.id} />}
                  {tab === 'documents' && (
                    <div className="flex flex-col items-center justify-center flex-1 text-center gap-3">
                      <FileText size={32} className="text-slate-700" />
                      <p className="text-sm font-medium text-slate-400">Document upload coming soon</p>
                      <p className="text-xs text-slate-600">Securely share inspection reports, contracts, and disclosures.</p>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center h-full">
                <div className="glass rounded-xl w-64 h-16 animate-pulse" />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
