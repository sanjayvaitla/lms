import { useState, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Calendar, CheckCircle2, XCircle, AlertTriangle, Users, BarChart2,
  Plus, Search, Loader2, ChevronRight, X, Edit, Trash2, Download, Upload,
  TrendingUp, BookOpen, ClipboardList, UserCheck, UserX, RefreshCw,
  GraduationCap, FileText, ChevronDown,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  LineChart, Line, CartesianGrid, PieChart, Pie, Legend,
} from 'recharts';
import { Skeleton } from '../components/ui/skeleton';
import api from '../../lib/axios';
import { INPUT_CLS, LABEL_CLS } from '../../lib/constants';

// ── Types ─────────────────────────────────────────────────────────────────────
type SessionStatus = 'SCHEDULED' | 'ONGOING' | 'COMPLETED' | 'CANCELLED';
type AttendStatus  = 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED';

interface AttendSession {
  id: string; batchId: string; trainerId: string | null;
  title: string; sessionDate: string; startTime: string | null;
  endTime: string | null; durationMin: number | null;
  topic: string | null; notes: string | null;
  status: SessionStatus; createdBy: string | null;
  batch?: { id: string; name: string };
  trainer?: { id: string; name: string } | null;
  present?: number; absent?: number; late?: number; excused?: number;
  total?: number; pct?: number;
}

interface AttendRecord {
  id: string; sessionId: string; studentId: string;
  status: AttendStatus; markedBy: string | null; markedAt: string;
  remarks: string | null;
  student?: { id: string; name: string; email: string };
}

interface DashStats {
  totalSessions: number; totalPresent: number; totalAbsent: number;
  totalLate: number; totalExcused: number; avgAttendancePct: number;
  atRisk: Array<{ studentId: string; name: string; email: string; pct: number; sessions: number }>;
  trend: Array<{ date: string; present: number; absent: number; late: number; excused: number }>;
}

// ── Zod schema ────────────────────────────────────────────────────────────────
const sessionSchema = z.object({
  batchId:     z.string().min(1, 'Batch is required'),
  trainerId:   z.string().uuid().optional().or(z.literal('')),
  title:       z.string().min(2, 'Title must be at least 2 chars').max(200),
  sessionDate: z.string().min(1, 'Date is required'),
  startTime:   z.string().optional(),
  endTime:     z.string().optional(),
  durationMin: z.coerce.number().int().min(1).max(480).optional().or(z.literal('')),
  topic:       z.string().max(500).optional(),
  notes:       z.string().max(1000).optional(),
  status:      z.enum(['SCHEDULED','ONGOING','COMPLETED','CANCELLED']).default('SCHEDULED'),
});
type SessionForm = z.infer<typeof sessionSchema>;

// ── Nav config ────────────────────────────────────────────────────────────────
const NAV_ITEMS = [
  { key: 'dashboard', label: 'Dashboard',          icon: BarChart2 },
  { key: 'sessions',  label: 'Attendance List',    icon: ClipboardList },
  { key: 'mark',      label: 'Mark Attendance',    icon: UserCheck },
  { key: 'bulk',      label: 'Bulk Upload',        icon: Upload },
  { key: 'batch',     label: 'Batch Attendance',   icon: Users },
  { key: 'learner',   label: 'Learner Attendance', icon: GraduationCap },
  { key: 'trainer',   label: 'Trainer Attendance', icon: UserCheck },
  { key: 'analytics', label: 'Analytics',          icon: TrendingUp },
  { key: 'reports',   label: 'Reports',            icon: FileText },
] as const;
type NavKey = typeof NAV_ITEMS[number]['key'];

// ── Status colour maps ────────────────────────────────────────────────────────
const STATUS_CLR: Record<AttendStatus, string> = {
  PRESENT: 'bg-emerald-100 text-emerald-700',
  ABSENT:  'bg-red-100 text-red-700',
  LATE:    'bg-amber-100 text-amber-700',
  EXCUSED: 'bg-blue-100 text-blue-700',
};
const SESSION_CLR: Record<SessionStatus, string> = {
  SCHEDULED: 'bg-blue-100 text-blue-700',
  ONGOING:   'bg-emerald-100 text-emerald-700',
  COMPLETED: 'bg-gray-100 text-gray-600',
  CANCELLED: 'bg-red-100 text-red-700',
};

// ── API helpers ───────────────────────────────────────────────────────────────
const fetchDashboard = async (): Promise<DashStats> =>
  (await api.get('/attendance/dashboard')).data.data;

const fetchSessions = async (params: Record<string,string>) => {
  const { data } = await api.get('/attendance/sessions?' + new URLSearchParams(params));
  return data.data as { sessions: AttendSession[]; total: number; page: number; limit: number };
};

const fetchSession = async (id: string) => {
  const { data } = await api.get('/attendance/sessions/' + id);
  // Server returns session fields merged at root level + records array
  return data.data as AttendSession & { records: AttendRecord[] };
};

const fetchBatches = async () => {
  const res = await api.get('/batches?limit=100');
  // The batches endpoint returns either a flat array or { batches: [...] }
  const raw = res.data.data;
  const arr = Array.isArray(raw) ? raw : (raw?.batches ?? []);
  return arr as Array<{id:string;name:string}>;
};

const fetchBatchAttendance  = async (id: string) => (await api.get('/attendance/batch/'   + id)).data.data;
const fetchLearnerAttendance = async (id: string) => (await api.get('/attendance/learner/' + id)).data.data;
const fetchTrainers = async () => {
  const res = await api.get('/trainers?limit=100');
  // The trainers endpoint returns either a flat array or { trainers: [...] }
  const raw = res.data.data;
  const arr = Array.isArray(raw) ? raw : (raw?.trainers ?? []);
  return arr as Array<{id:string;name:string}>;
};
const fetchTrainerSessions = async (id: string) => (await api.get('/attendance/trainer/' + id)).data.data;

// ── Shared UI helpers ─────────────────────────────────────────────────────────
function StatCard({ label, value, icon: Icon, color }: {
  label: string; value: string | number; icon: React.FC<any>; color: string;
}) {
  return (
    <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 flex items-center gap-4">
      <div className={`p-3 rounded-lg ${color}`}>
        <Icon className="w-5 h-5 text-white" />
      </div>
      <div>
        <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">{label}</p>
        <p className="text-2xl font-bold text-gray-800 mt-0.5">{value}</p>
      </div>
    </div>
  );
}

function Badge({ status, map }: { status: string; map: Record<string,string> }) {
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${map[status] ?? 'bg-gray-100 text-gray-600'}`}>
      {status}
    </span>
  );
}

function SectionHead({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="mb-6">
      <h2 className="text-xl font-bold text-gray-900">{title}</h2>
      {sub && <p className="text-sm text-gray-500 mt-0.5">{sub}</p>}
    </div>
  );
}

// ── Session modal ─────────────────────────────────────────────────────────────
function SessionModal({ open, onClose, editing, batches, trainers, onSaved }: {
  open: boolean; onClose: () => void; editing: AttendSession | null;
  batches: Array<{id:string;name:string}>; trainers: Array<{id:string;name:string}>; onSaved: () => void;
}) {
  const qc = useQueryClient();
  const { register, handleSubmit, reset, formState: { errors } } = useForm<SessionForm>({
    resolver: zodResolver(sessionSchema),
    defaultValues: editing ? {
      batchId:     editing.batchId,
      trainerId:   editing.trainerId ?? undefined,
      title:       editing.title,
      sessionDate: editing.sessionDate,
      startTime:   editing.startTime ?? undefined,
      endTime:     editing.endTime   ?? undefined,
      durationMin: editing.durationMin ?? undefined,
      topic:       editing.topic  ?? undefined,
      notes:       editing.notes  ?? undefined,
      status:      editing.status,
    } : { status: 'SCHEDULED' as const },
  });

  const saveMut = useMutation({
    mutationFn: (d: SessionForm) => {
      // Convert empty string trainerId to null so the server accepts it
      const payload = { ...d, trainerId: d.trainerId || null };
      return editing
        ? api.patch('/attendance/sessions/' + editing.id, payload)
        : api.post('/attendance/sessions', payload);
    },
    onSuccess: () => {
      toast.success(editing ? 'Session updated' : 'Session created');
      qc.invalidateQueries({ queryKey: ['att-sessions'] });
      qc.invalidateQueries({ queryKey: ['att-dashboard'] });
      reset(); onSaved(); onClose();
    },
    onError: () => toast.error('Failed to save session'),
  });

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b">
          <h3 className="text-lg font-bold text-gray-900">{editing ? 'Edit Session' : 'Create Session'}</h3>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={handleSubmit(d => saveMut.mutate(d as SessionForm))} className="p-6 space-y-4">
          <div>
            <label className={LABEL_CLS}>Batch *</label>
            <select {...register('batchId')} className={INPUT_CLS}>
              <option value="">Select batch...</option>
              {batches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            {errors.batchId && <p className="text-red-500 text-xs mt-1">{errors.batchId.message}</p>}
          </div>
          <div>
            <label className={LABEL_CLS}>Trainer (optional)</label>
            <select {...register('trainerId')} className={INPUT_CLS}>
              <option value="">No trainer assigned</option>
              {trainers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div>
            <label className={LABEL_CLS}>Session Title *</label>
            <input {...register('title')} className={INPUT_CLS} placeholder="e.g. Week 3 – React Hooks" />
            {errors.title && <p className="text-red-500 text-xs mt-1">{errors.title.message}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL_CLS}>Date *</label>
              <input type="date" {...register('sessionDate')} className={INPUT_CLS} />
              {errors.sessionDate && <p className="text-red-500 text-xs mt-1">{errors.sessionDate.message}</p>}
            </div>
            <div>
              <label className={LABEL_CLS}>Duration (min)</label>
              <input type="number" {...register('durationMin')} className={INPUT_CLS} placeholder="60" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={LABEL_CLS}>Start Time</label><input type="time" {...register('startTime')} className={INPUT_CLS} /></div>
            <div><label className={LABEL_CLS}>End Time</label><input type="time" {...register('endTime')} className={INPUT_CLS} /></div>
          </div>
          <div><label className={LABEL_CLS}>Topic</label><input {...register('topic')} className={INPUT_CLS} placeholder="Topic covered" /></div>
          <div><label className={LABEL_CLS}>Notes</label><textarea {...register('notes')} className={INPUT_CLS} rows={2} /></div>
          <div>
            <label className={LABEL_CLS}>Status</label>
            <select {...register('status')} className={INPUT_CLS}>
              <option value="SCHEDULED">Scheduled</option>
              <option value="ONGOING">Ongoing</option>
              <option value="COMPLETED">Completed</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-gray-300 hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={saveMut.isPending}
              className="px-4 py-2 text-sm rounded-lg bg-cyan-600 text-white hover:bg-cyan-700 disabled:opacity-50 flex items-center gap-2">
              {saveMut.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {editing ? 'Save Changes' : 'Create Session'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Dashboard view ────────────────────────────────────────────────────────────
function DashboardView() {
  const { data, isLoading } = useQuery({ queryKey: ['att-dashboard'], queryFn: fetchDashboard });
  if (isLoading) return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {[...Array(4)].map((_,i)=><Skeleton key={i} className="h-24 rounded-xl" />)}
    </div>
  );
  const kpi = data ? [
    { label:'Total Sessions', value: data.totalSessions,                         icon: Calendar,     color:'bg-cyan-500' },
    { label:'Present',        value: data.totalPresent,                           icon: CheckCircle2, color:'bg-emerald-500' },
    { label:'Absent',         value: data.totalAbsent,                            icon: XCircle,      color:'bg-red-500' },
    { label:'Avg Attendance', value: (data.avgAttendancePct ?? 0).toFixed(1)+'%', icon: TrendingUp,   color:'bg-purple-500' },
  ] : [];
  const trend = (data?.trend ?? []).map(t => ({ ...t, date: (t.date ?? '').slice(5) }));
  return (
    <div className="space-y-6">
      <SectionHead title="Attendance Dashboard" sub="Overview of all attendance activity" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpi.map(k => <StatCard key={k.label} {...k} />)}
      </div>
      {trend.length > 0 && (
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">30-Day Attendance Trend</h3>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={trend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="present" stroke="#10b981" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="absent"  stroke="#f43f5e" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="late"    stroke="#f59e0b" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
      {(data?.atRisk ?? []).length > 0 && (
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
          <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" /> At-Risk Students (below 75%)
          </h3>
          <table className="w-full text-sm">
            <thead><tr className="text-left text-gray-500 text-xs border-b">
              <th className="pb-2 pr-4">Student</th><th className="pb-2 pr-4">Email</th>
              <th className="pb-2 pr-4">Sessions</th><th className="pb-2">Attendance</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-50">
              {data!.atRisk.map(s => (
                <tr key={s.studentId} className="hover:bg-gray-50">
                  <td className="py-2 pr-4 font-medium text-gray-800">{s.name}</td>
                  <td className="py-2 pr-4 text-gray-500">{s.email}</td>
                  <td className="py-2 pr-4 text-gray-600">{s.sessions}</td>
                  <td className="py-2"><span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">{Number(s.pct).toFixed(1)}%</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Session list view ─────────────────────────────────────────────────────────
function SessionListView({ onMark }: { onMark: (s: AttendSession) => void }) {
  const qc = useQueryClient();
  const [search, setSearch]           = useState('');
  const [page, setPage]               = useState(1);
  const [filterStatus, setFilter]     = useState('');
  const [showModal, setShowModal]     = useState(false);
  const [editing, setEditing]         = useState<AttendSession | null>(null);
  const { data: batchesData }         = useQuery({ queryKey: ['batches-list'], queryFn: fetchBatches });
  const { data: trainersData }        = useQuery({ queryKey: ['trainers-list'], queryFn: fetchTrainers });
  const batches = (batchesData ?? []) as Array<{id:string;name:string}>;
  const trainers = (trainersData ?? []) as Array<{id:string;name:string}>;
  const params  = useMemo(() => {
    const p: Record<string,string> = { page: String(page), limit: '20' };
    if (filterStatus) p.status = filterStatus;
    return p;
  }, [page, filterStatus]);
  const { data, isLoading, refetch } = useQuery({ queryKey: ['att-sessions', params], queryFn: () => fetchSessions(params) });
  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete('/attendance/sessions/' + id),
    onSuccess: () => { toast.success('Session deleted'); refetch(); },
    onError: () => toast.error('Delete failed'),
  });
  const sessions = (data?.sessions ?? []).filter(s =>
    !search || s.title.toLowerCase().includes(search.toLowerCase()) || (s.batch?.name ?? '').toLowerCase().includes(search.toLowerCase())
  );
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <SectionHead title="Attendance Sessions" sub={`${data?.total ?? 0} total sessions`} />
        <button onClick={() => { setEditing(null); setShowModal(true); }}
          className="flex items-center gap-2 px-4 py-2 bg-cyan-600 text-white text-sm rounded-lg hover:bg-cyan-700">
          <Plus className="w-4 h-4" /> New Session
        </button>
      </div>
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input className="pl-9 pr-4 py-2 w-full border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-300"
            placeholder="Search sessions..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="px-3 py-2 border border-gray-200 rounded-lg text-sm" value={filterStatus} onChange={e => { setFilter(e.target.value); setPage(1); }}>
          <option value="">All statuses</option>
          <option value="SCHEDULED">Scheduled</option>
          <option value="ONGOING">Ongoing</option>
          <option value="COMPLETED">Completed</option>
          <option value="CANCELLED">Cancelled</option>
        </select>
        <button onClick={() => refetch()} className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50"><RefreshCw className="w-4 h-4 text-gray-500" /></button>
      </div>
      {isLoading
        ? <div className="space-y-3">{[...Array(5)].map((_,i)=><Skeleton key={i} className="h-16 rounded-xl" />)}</div>
        : (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-x-auto">
            <table className="w-full text-sm min-w-[760px]">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-3 text-left">Session</th>
                  <th className="px-4 py-3 text-left">Batch</th>
                  <th className="px-4 py-3 text-left">Trainer</th>
                  <th className="px-4 py-3 text-left">Date</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Attendance</th>
                  <th className="px-4 py-3 text-left">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sessions.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">No sessions found</td></tr>}
                {sessions.map(s => (
                  <tr key={s.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-800">{s.title}</p>
                      {s.topic && <p className="text-xs text-gray-400">{s.topic}</p>}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{s.batch?.name ?? s.batchId}</td>
                    <td className="px-4 py-3 text-gray-600">{s.trainer?.name ?? <span className="text-gray-300">—</span>}</td>
                    <td className="px-4 py-3 text-gray-600">{s.sessionDate}</td>
                    <td className="px-4 py-3"><Badge status={s.status} map={SESSION_CLR} /></td>
                    <td className="px-4 py-3">
                      {s.total != null ? (
                        <div className="flex items-center gap-1.5">
                          <div className="w-20 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                            <div className="h-full bg-emerald-500 rounded-full" style={{ width: (s.pct ?? 0) + '%' }} />
                          </div>
                          <span className="text-xs text-gray-500">{(s.pct ?? 0).toFixed(0)}%</span>
                        </div>
                      ) : <span className="text-gray-400 text-xs">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button onClick={() => onMark(s)} className="text-xs px-2 py-1 rounded bg-cyan-50 text-cyan-700 hover:bg-cyan-100 font-medium">Mark</button>
                        <button onClick={() => { setEditing(s); setShowModal(true); }} className="p-1.5 hover:bg-gray-100 rounded"><Edit className="w-3.5 h-3.5 text-gray-500" /></button>
                        <button onClick={() => { if (confirm('Delete this session?')) deleteMut.mutate(s.id); }} className="p-1.5 hover:bg-red-50 rounded"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      {(data?.total ?? 0) > 20 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-gray-500">Page {page} of {Math.ceil((data?.total ?? 0) / 20)}</p>
          <div className="flex gap-2">
            <button disabled={page<=1} onClick={() => setPage(p=>p-1)} className="px-3 py-1.5 text-xs border rounded-lg disabled:opacity-40 hover:bg-gray-50">Prev</button>
            <button disabled={page>=Math.ceil((data?.total??0)/20)} onClick={()=>setPage(p=>p+1)} className="px-3 py-1.5 text-xs border rounded-lg disabled:opacity-40 hover:bg-gray-50">Next</button>
          </div>
        </div>
      )}
      <SessionModal open={showModal} onClose={() => setShowModal(false)} editing={editing} batches={batches} trainers={trainers} onSaved={() => {}} />
    </div>
  );
}

// ── Mark Attendance ───────────────────────────────────────────────────────────
function MarkAttendanceView({ initialSession, onBack }: { initialSession?: AttendSession | null; onBack?: () => void }) {
  const qc = useQueryClient();
  const [sessionId, setSessionId] = useState(initialSession?.id ?? '');
  const [records,   setRecords]   = useState<Record<string, AttendStatus>>({});
  const [remarks,   setRemarks]   = useState<Record<string, string>>({});
  const [search,    setSearch]    = useState('');
  const prevId = useRef('');

  const { data: sessListData } = useQuery({
    queryKey: ['att-sessions', { page:'1', limit:'100' }],
    queryFn:  () => fetchSessions({ page:'1', limit:'100' }),
  });
  const { data: detail, isLoading: detailLoading } = useQuery({
    queryKey: ['att-session-detail', sessionId],
    queryFn:  () => fetchSession(sessionId),
    enabled: !!sessionId,
  });

  if (detail && sessionId !== prevId.current) {
    prevId.current = sessionId;
    const r: Record<string,AttendStatus> = {};
    const rem: Record<string,string> = {};
    detail.records.forEach(rec => { r[rec.studentId] = rec.status; rem[rec.studentId] = rec.remarks ?? ''; });
    setRecords(r); setRemarks(rem);
  }

  const saveMut = useMutation({
    mutationFn: () => api.post('/attendance/sessions/' + sessionId + '/mark', {
      records: (detail?.records ?? []).map(rec => ({
        studentId: rec.studentId,
        status:    records[rec.studentId] ?? 'ABSENT',
        remarks:   remarks[rec.studentId] ?? null,
      })),
    }),
    onSuccess: () => {
      toast.success('Attendance saved');
      qc.invalidateQueries({ queryKey: ['att-session-detail', sessionId] });
      qc.invalidateQueries({ queryKey: ['att-sessions'] });
      qc.invalidateQueries({ queryKey: ['att-dashboard'] });
    },
    onError: () => toast.error('Failed to save'),
  });

  const markAllMut = useMutation({
    mutationFn: (status: AttendStatus) => api.post('/attendance/sessions/' + sessionId + '/mark-all', { status }),
    onSuccess: (_, status) => {
      const r: Record<string,AttendStatus> = {};
      (detail?.records ?? []).forEach(rec => { r[rec.studentId] = status; });
      setRecords(r);
      toast.success('All marked ' + status);
      qc.invalidateQueries({ queryKey: ['att-session-detail', sessionId] });
    },
    onError: () => toast.error('Failed'),
  });

  const allSessions = sessListData?.sessions ?? [];
  const studentsAll = detail?.records ?? [];
  const students    = studentsAll.filter(r =>
    !search || (r.student?.name ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (r.student?.email ?? '').toLowerCase().includes(search.toLowerCase())
  );
  const counts = studentsAll.reduce((a, r) => { const s = records[r.studentId] ?? 'ABSENT'; a[s] = (a[s] ?? 0) + 1; return a; }, {} as Record<AttendStatus,number>);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        {onBack && (
          <button onClick={onBack} className="p-1.5 hover:bg-gray-100 rounded-lg">
            <ChevronRight className="w-4 h-4 rotate-180 text-gray-500" />
          </button>
        )}
        <SectionHead title="Mark Attendance" sub="Select a session then mark each student" />
      </div>

      <div>
        <label className={LABEL_CLS}>Select Session</label>
        <select className={INPUT_CLS} value={sessionId} onChange={e => setSessionId(e.target.value)}>
          <option value="">Choose a session...</option>
          {allSessions.map(s => (
            <option key={s.id} value={s.id}>{s.title} — {s.sessionDate} ({s.batch?.name})</option>
          ))}
        </select>
      </div>

      {sessionId && (
        <>
          <div className="flex gap-3 flex-wrap">
            {(['PRESENT','ABSENT','LATE','EXCUSED'] as AttendStatus[]).map(s => (
              <div key={s} className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${STATUS_CLR[s]}`}>{s}: {counts[s] ?? 0}</div>
            ))}
          </div>
          <div className="flex gap-2 flex-wrap items-center">
            <span className="text-xs text-gray-500 font-medium">Mark all as:</span>
            {(['PRESENT','ABSENT','LATE','EXCUSED'] as AttendStatus[]).map(s => (
              <button key={s} onClick={() => markAllMut.mutate(s)} disabled={markAllMut.isPending}
                className={`px-3 py-1 text-xs rounded-lg font-medium border ${STATUS_CLR[s]} hover:opacity-80 disabled:opacity-50`}>{s}</button>
            ))}
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input className="pl-9 pr-4 py-2 w-full border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-300"
              placeholder="Search students..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          {detailLoading
            ? <div className="space-y-2">{[...Array(5)].map((_,i)=><Skeleton key={i} className="h-14 rounded-xl" />)}</div>
            : (
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                {students.length === 0
                  ? <p className="text-center py-8 text-sm text-gray-400">No students in this session</p>
                  : students.map((rec, idx) => (
                    <div key={rec.studentId}
                      className={`flex items-center gap-3 px-4 py-3 ${idx < students.length-1 ? 'border-b border-gray-100' : ''}`}>
                      <div className="w-8 h-8 rounded-full bg-cyan-100 flex items-center justify-center text-cyan-700 text-xs font-bold flex-shrink-0">
                        {(rec.student?.name?.[0] ?? '?').toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-800 text-sm truncate">{rec.student?.name ?? rec.studentId}</p>
                        <p className="text-xs text-gray-400 truncate">{rec.student?.email ?? ''}</p>
                      </div>
                      <div className="flex gap-1.5 flex-shrink-0">
                        {(['PRESENT','LATE','EXCUSED','ABSENT'] as AttendStatus[]).map(s => (
                          <button key={s} onClick={() => setRecords(r => ({ ...r, [rec.studentId]: s }))}
                            className={`w-8 h-8 text-xs rounded-lg font-bold transition-all ${
                              records[rec.studentId] === s
                                ? STATUS_CLR[s] + ' ring-2 ring-offset-1 ring-current scale-110'
                                : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                            }`}>{s[0]}</button>
                        ))}
                      </div>
                      <input className="text-xs border border-gray-200 rounded px-2 py-1 w-28 focus:outline-none focus:ring-1 focus:ring-cyan-300"
                        placeholder="Remarks" value={remarks[rec.studentId] ?? ''}
                        onChange={e => setRemarks(r => ({ ...r, [rec.studentId]: e.target.value }))} />
                    </div>
                  ))
                }
              </div>
            )}
          <div className="flex justify-end">
            <button onClick={() => saveMut.mutate()} disabled={saveMut.isPending || !sessionId}
              className="flex items-center gap-2 px-6 py-2.5 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 disabled:opacity-50 text-sm font-medium">
              {saveMut.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Save Attendance
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ── Bulk Upload ───────────────────────────────────────────────────────────────
function BulkUploadView() {
  const [file, setFile]     = useState<File | null>(null);
  const [preview, setPreview] = useState<string[][]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const handleFile = (f: File) => {
    setFile(f);
    const r = new FileReader();
    r.onload = e => setPreview((e.target?.result as string).split('\n').slice(0,6).map(row => row.split(',')));
    r.readAsText(f);
  };
  return (
    <div className="space-y-6 max-w-2xl">
      <SectionHead title="Bulk Upload" sub="Upload a CSV to mark attendance for multiple students" />
      <div className="bg-cyan-50 border border-cyan-200 rounded-xl p-4 flex items-start gap-3">
        <Download className="w-5 h-5 text-cyan-600 mt-0.5 flex-shrink-0" />
        <div>
          <p className="text-sm font-semibold text-cyan-800">Download CSV Template</p>
          <p className="text-xs text-cyan-600 mt-0.5 mb-2">Columns: sessionId, studentId, status, remarks</p>
          <button onClick={() => {
            const csv = 'sessionId,studentId,status,remarks\n<uuid>,<uuid>,PRESENT,\n';
            const a = document.createElement('a');
            a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
            a.download = 'attendance_template.csv'; a.click();
          }} className="text-xs px-3 py-1.5 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700">Download Template</button>
        </div>
      </div>
      <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:border-cyan-400 transition-colors cursor-pointer"
        onClick={() => fileRef.current?.click()}
        onDragOver={e => e.preventDefault()}
        onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}>
        <Upload className="w-10 h-10 text-gray-300 mx-auto mb-3" />
        <p className="text-sm font-medium text-gray-600">{file ? file.name : 'Drop your CSV here, or click to browse'}</p>
        <p className="text-xs text-gray-400 mt-1">CSV files only</p>
        <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={e => { const f=e.target.files?.[0]; if(f) handleFile(f); }} />
      </div>
      {preview.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <p className="px-4 py-3 text-xs font-semibold text-gray-500 border-b">Preview (first 5 rows)</p>
          <table className="w-full text-xs"><tbody>
            {preview.map((row,i)=>(
              <tr key={i} className={i===0?'bg-gray-50 font-semibold':'hover:bg-gray-50'}>
                {row.map((c,j)=><td key={j} className="px-3 py-2 border-b border-gray-50 text-gray-700">{c}</td>)}
              </tr>
            ))}
          </tbody></table>
        </div>
      )}
    </div>
  );
}

// ── Batch Attendance ──────────────────────────────────────────────────────────
function BatchAttendanceView() {
  const [batchId, setBatchId] = useState('');
  const { data: batchesData } = useQuery({ queryKey: ['batches-list'], queryFn: fetchBatches });
  const batches = (batchesData ?? []) as Array<{id:string;name:string}>;
  const { data, isLoading } = useQuery({ queryKey:['att-batch',batchId], queryFn:()=>fetchBatchAttendance(batchId), enabled:!!batchId });
  const students: any[] = data?.students ?? [];
  const sessions: any[] = data?.sessions ?? [];
  const avgPct = students.length > 0 ? (students.reduce((a:number,s:any)=>a+Number(s.pct??0),0)/students.length).toFixed(1)+'%' : '—';
  return (
    <div className="space-y-4">
      <SectionHead title="Batch Attendance" sub="Per-student summary for a batch" />
      <div><label className={LABEL_CLS}>Select Batch</label>
        <select className={INPUT_CLS} value={batchId} onChange={e=>setBatchId(e.target.value)}>
          <option value="">Choose a batch...</option>
          {batches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </div>
      {isLoading && <Skeleton className="h-40 rounded-xl" />}
      {data && (
        <>
          <div className="grid grid-cols-3 gap-4">
            <StatCard label="Sessions" value={sessions.length} icon={Calendar} color="bg-cyan-500" />
            <StatCard label="Students" value={students.length} icon={Users} color="bg-purple-500" />
            <StatCard label="Avg Attendance" value={avgPct} icon={TrendingUp} color="bg-emerald-500" />
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-x-auto">
            <table className="w-full text-sm min-w-[600px]">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase"><tr>
                <th className="px-4 py-3 text-left">Student</th>
                <th className="px-4 py-3 text-left">Present</th>
                <th className="px-4 py-3 text-left">Absent</th>
                <th className="px-4 py-3 text-left">Late</th>
                <th className="px-4 py-3 text-left">Attendance %</th>
                <th className="px-4 py-3 text-left">Status</th>
              </tr></thead>
              <tbody className="divide-y divide-gray-100">
                {students.map((s:any)=>(
                  <tr key={s.studentId} className="hover:bg-gray-50">
                    <td className="px-4 py-3"><p className="font-medium text-gray-800">{s.name}</p><p className="text-xs text-gray-400">{s.email}</p></td>
                    <td className="px-4 py-3 text-emerald-600 font-medium">{s.present??0}</td>
                    <td className="px-4 py-3 text-red-500 font-medium">{s.absent??0}</td>
                    <td className="px-4 py-3 text-amber-500 font-medium">{s.late??0}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-20 h-1.5 bg-gray-200 rounded-full overflow-hidden"><div className="h-full bg-emerald-500 rounded-full" style={{width:(s.pct??0)+'%'}} /></div>
                        <span className="text-xs">{Number(s.pct??0).toFixed(1)}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${Number(s.pct??0)<75?'bg-red-100 text-red-700':'bg-emerald-100 text-emerald-700'}`}>{Number(s.pct??0)<75?'At Risk':'Good'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

// ── Learner Attendance ────────────────────────────────────────────────────────
function LearnerAttendanceView() {
  const [studentId, setStudentId] = useState('');
  const [inputId, setInputId]     = useState('');
  const { data, isLoading } = useQuery({ queryKey:['att-learner',studentId], queryFn:()=>fetchLearnerAttendance(studentId), enabled:!!studentId });
  const summary: any   = data?.summary ?? {};
  const history: any[] = data?.history  ?? [];
  return (
    <div className="space-y-4 max-w-3xl">
      <SectionHead title="Learner Attendance" sub="Full attendance history for a specific student" />
      <div className="flex gap-2">
        <input className={INPUT_CLS + ' flex-1'} placeholder="Paste student UUID..." value={inputId} onChange={e=>setInputId(e.target.value)} />
        <button onClick={()=>setStudentId(inputId)} className="px-4 py-2 bg-cyan-600 text-white rounded-lg text-sm hover:bg-cyan-700">Load</button>
      </div>
      {isLoading && <Skeleton className="h-40 rounded-xl" />}
      {data && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard label="Total" value={summary.total??0} icon={Calendar} color="bg-gray-500" />
            <StatCard label="Present" value={summary.present??0} icon={CheckCircle2} color="bg-emerald-500" />
            <StatCard label="Absent" value={summary.absent??0} icon={UserX} color="bg-red-500" />
            <StatCard label="Attendance" value={Number(summary.pct??0).toFixed(1)+'%'} icon={TrendingUp} color="bg-purple-500" />
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <p className="px-4 py-3 text-xs font-semibold text-gray-500 border-b">Session History</p>
            <div className="divide-y divide-gray-100">
              {history.length===0 && <p className="text-center py-6 text-sm text-gray-400">No records found</p>}
              {history.map((h:any,i:number)=>(
                <div key={i} className="flex items-center px-4 py-3 gap-3 hover:bg-gray-50">
                  <Badge status={h.status} map={STATUS_CLR} />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-800">{h.session_title}</p>
                    <p className="text-xs text-gray-400">{h.batch_name} · {h.session_date}</p>
                  </div>
                  {h.remarks && <span className="text-xs text-gray-400 italic">{h.remarks}</span>}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Trainer Attendance ────────────────────────────────────────────────────────
function TrainerAttendanceView() {
  const [trainerId, setTrainerId] = useState('');
  const { data: trainersData } = useQuery({ queryKey:['trainers-list'], queryFn: fetchTrainers });
  const trainers = (trainersData ?? []) as Array<{id:string;name:string}>;
  const { data, isLoading } = useQuery({ queryKey:['att-trainer',trainerId], queryFn:()=>fetchTrainerSessions(trainerId), enabled:!!trainerId });
  const sessions: any[] = data?.sessions ?? [];
  const stats: any      = data?.stats    ?? {};
  return (
    <div className="space-y-4">
      <SectionHead title="Trainer Attendance" sub="Sessions conducted by a specific trainer" />
      <div><label className={LABEL_CLS}>Select Trainer</label>
        <select className={INPUT_CLS} value={trainerId} onChange={e=>setTrainerId(e.target.value)}>
          <option value="">Choose a trainer...</option>
          {trainers.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </div>
      {isLoading && <Skeleton className="h-40 rounded-xl" />}
      {data && (
        <>
          <div className="grid grid-cols-3 gap-4">
            <StatCard label="Sessions" value={stats.totalSessions??sessions.length} icon={Calendar} color="bg-cyan-500" />
            <StatCard label="Students" value={stats.totalStudents??0} icon={Users} color="bg-purple-500" />
            <StatCard label="Avg Attendance" value={Number(stats.avgPct??0).toFixed(1)+'%'} icon={TrendingUp} color="bg-emerald-500" />
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-x-auto">
            <table className="w-full text-sm min-w-[560px]">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase"><tr>
                <th className="px-4 py-3 text-left">Session</th><th className="px-4 py-3 text-left">Batch</th>
                <th className="px-4 py-3 text-left">Date</th><th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Attendance</th>
              </tr></thead>
              <tbody className="divide-y divide-gray-100">
                {sessions.length===0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-400">No sessions found</td></tr>}
                {sessions.map((s:any)=>(
                  <tr key={s.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-800">{s.title}</td>
                    <td className="px-4 py-3 text-gray-500">{s.batch_name??s.batchId}</td>
                    <td className="px-4 py-3 text-gray-500">{s.sessionDate??s.session_date}</td>
                    <td className="px-4 py-3"><Badge status={s.status} map={SESSION_CLR} /></td>
                    <td className="px-4 py-3 text-sm">{s.pct!=null?Number(s.pct).toFixed(1)+'%':'—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

// ── Analytics ─────────────────────────────────────────────────────────────────
function AnalyticsView() {
  const [batchId, setBatchId] = useState('');
  const { data: batchesData } = useQuery({ queryKey:['batches-list'], queryFn: fetchBatches });
  const batches = (batchesData ?? []) as Array<{id:string;name:string}>;
  const { data: dashData } = useQuery({ queryKey:['att-dashboard'], queryFn: fetchDashboard });
  const { data: batchData, isLoading } = useQuery({ queryKey:['att-batch-analytics',batchId], queryFn:()=>fetchBatchAttendance(batchId), enabled:!!batchId });
  const trend = (dashData?.trend ?? []).map(t => ({ ...t, date: (t.date ?? '').slice(5) }));
  const students: any[] = batchData?.students ?? [];
  const barData = students.slice(0,15).map((s:any) => ({ name:(s.name??'').split(' ')[0], present:s.present??0, absent:s.absent??0, late:s.late??0 }));
  const pieData = dashData ? [
    { name:'Present', value: dashData.totalPresent  },
    { name:'Absent',  value: dashData.totalAbsent   },
    { name:'Late',    value: dashData.totalLate     },
    { name:'Excused', value: dashData.totalExcused  },
  ] : [];
  const PIE = ['#10b981','#f43f5e','#f59e0b','#3b82f6'];
  return (
    <div className="space-y-6">
      <SectionHead title="Attendance Analytics" sub="Visual breakdown of attendance patterns" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Overall Status Distribution</h3>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label>
                {pieData.map((_,i)=><Cell key={i} fill={PIE[i]} />)}
              </Pie>
              <Tooltip /><Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">30-Day Trend</h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={trend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip />
              <Line type="monotone" dataKey="present" stroke="#10b981" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="absent"  stroke="#f43f5e" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-700">Student Breakdown by Batch</h3>
          <select className="text-xs border border-gray-200 rounded px-2 py-1" value={batchId} onChange={e=>setBatchId(e.target.value)}>
            <option value="">Select batch...</option>
            {batches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
        {isLoading ? <Skeleton className="h-40" /> : barData.length > 0 ? (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={barData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip /><Legend />
              <Bar dataKey="present" fill="#10b981" radius={[3,3,0,0]} />
              <Bar dataKey="absent"  fill="#f43f5e" radius={[3,3,0,0]} />
              <Bar dataKey="late"    fill="#f59e0b" radius={[3,3,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : <p className="text-center py-8 text-sm text-gray-400">Select a batch to see student breakdown</p>}
      </div>
    </div>
  );
}

// ── Reports ───────────────────────────────────────────────────────────────────
function ReportsView() {
  const [batchId, setBatchId]   = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo]     = useState('');
  const { data: batchesData }   = useQuery({ queryKey:['batches-list'], queryFn: fetchBatches });
  const batches = (batchesData ?? []) as Array<{id:string;name:string}>;

  const handleExport = async (fmt: 'csv' | 'json') => {
    const p: Record<string,string> = {};
    if (batchId)  p.batchId  = batchId;
    if (dateFrom) p.dateFrom = dateFrom;
    if (dateTo)   p.dateTo   = dateTo;
    if (fmt==='csv') p.format = 'csv';
    const { data } = await api.get('/attendance/reports?' + new URLSearchParams(p), {
      responseType: fmt==='csv' ? 'blob' : 'json',
    });
    const blob = new Blob([fmt==='csv' ? data : JSON.stringify(data.data, null, 2)]);
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = 'attendance_report.' + fmt; a.click();
    URL.revokeObjectURL(url);
    toast.success('Report downloaded');
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <SectionHead title="Reports" sub="Export attendance data for analysis" />
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 space-y-4">
        <h3 className="text-sm font-semibold text-gray-700">Filter Options</h3>
        <div><label className={LABEL_CLS}>Batch (optional)</label>
          <select className={INPUT_CLS} value={batchId} onChange={e=>setBatchId(e.target.value)}>
            <option value="">All batches</option>
            {batches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className={LABEL_CLS}>Date From</label><input type="date" className={INPUT_CLS} value={dateFrom} onChange={e=>setDateFrom(e.target.value)} /></div>
          <div><label className={LABEL_CLS}>Date To</label><input type="date" className={INPUT_CLS} value={dateTo} onChange={e=>setDateTo(e.target.value)} /></div>
        </div>
        <div className="flex gap-3 pt-2">
          <button onClick={()=>handleExport('csv')} className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm font-medium"><Download className="w-4 h-4" /> Export CSV</button>
          <button onClick={()=>handleExport('json')} className="flex items-center gap-2 px-5 py-2.5 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 text-sm font-medium"><Download className="w-4 h-4" /> Export JSON</button>
        </div>
      </div>
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-700">
        <p className="font-semibold mb-1">Report columns:</p>
        <p>sessionId · sessionTitle · sessionDate · batchId · studentId · studentName · status · markedAt · remarks</p>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function AttendanceMaster() {
  const [activeNav, setActiveNav]     = useState<NavKey>('dashboard');
  const [markSession, setMarkSession] = useState<AttendSession | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleMark = (s: AttendSession) => { setMarkSession(s); setActiveNav('mark'); };

  const renderContent = () => {
    switch (activeNav) {
      case 'dashboard': return <DashboardView />;
      case 'sessions':  return <SessionListView onMark={handleMark} />;
      case 'mark':      return <MarkAttendanceView initialSession={markSession} onBack={() => setActiveNav('sessions')} />;
      case 'bulk':      return <BulkUploadView />;
      case 'batch':     return <BatchAttendanceView />;
      case 'learner':   return <LearnerAttendanceView />;
      case 'trainer':   return <TrainerAttendanceView />;
      case 'analytics': return <AnalyticsView />;
      case 'reports':   return <ReportsView />;
      default:          return null;
    }
  };

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <aside className={`${ sidebarOpen ? 'translate-x-0' : '-translate-x-full' } lg:translate-x-0 fixed lg:relative z-30 inset-y-0 left-0 w-56 bg-white border-r border-gray-200 flex flex-col transition-transform duration-200`}>
        <div className="p-4 border-b border-gray-100 flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-cyan-600 flex items-center justify-center"><ClipboardList className="w-4 h-4 text-white" /></div>
          <span className="font-bold text-gray-800 text-sm">Attendance</span>
        </div>
        <nav className="flex-1 overflow-y-auto py-2">
          {NAV_ITEMS.map(({ key, label, icon: Icon }) => (
            <button key={key} onClick={() => { setActiveNav(key); setSidebarOpen(false); }}
              className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors ${ activeNav===key ? 'bg-cyan-50 text-cyan-700 font-semibold border-r-2 border-cyan-600' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900' }`}>
              <Icon className="w-4 h-4 flex-shrink-0" />
              {label}
            </button>
          ))}
        </nav>
      </aside>

      {sidebarOpen && <div className="fixed inset-0 z-20 bg-black/40 lg:hidden" onClick={() => setSidebarOpen(false)} />}

      <main className="flex-1 overflow-y-auto min-w-0">
        <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-4 lg:px-6 py-3 flex items-center gap-3">
          <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-1.5 hover:bg-gray-100 rounded-lg"><ChevronDown className="w-5 h-5 text-gray-500" /></button>
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <BookOpen className="w-3.5 h-3.5" />
            <span>Attendance Master</span>
            <ChevronRight className="w-3 h-3" />
            <span className="font-medium text-gray-700">{NAV_ITEMS.find(n=>n.key===activeNav)?.label}</span>
          </div>
        </div>
        <div className="p-4 lg:p-6">{renderContent()}</div>
      </main>
    </div>
  );
}
