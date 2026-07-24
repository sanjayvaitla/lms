import { useState, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Calendar, CheckCircle2, XCircle, AlertTriangle, Users, BarChart2,
  Plus, Search, Loader2, ChevronRight, X, Edit, Trash2, Download,
  TrendingUp, BookOpen, ClipboardList, UserCheck, UserX, RefreshCw,
  GraduationCap, FileText, Menu,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  LineChart, Line, CartesianGrid, PieChart, Pie, Legend, ReferenceLine,
} from 'recharts';
import { Skeleton } from '../components/ui/skeleton';
import api from '../../lib/axios';
import { useAuth } from '../../store/AuthContext';
import { INPUT_CLS, LABEL_CLS } from '../../lib/constants';

// ── Types ─────────────────────────────────────────────────────────────────────
type SessionStatus = 'SCHEDULED' | 'ONGOING' | 'COMPLETED' | 'CANCELLED';
type AttendStatus = 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED';

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
  batchId: z.string().min(1, 'Batch is required'),
  trainerId: z.string().uuid().optional().or(z.literal('')),
  title: z.string().min(2, 'Title must be at least 2 chars').max(200),
  sessionDate: z.string().min(1, 'Date is required'),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  durationMin: z.coerce.number().int().min(1).max(480).optional().or(z.literal('')),
  topic: z.string().max(500).optional(),
  notes: z.string().max(1000).optional(),
  status: z.enum(['SCHEDULED', 'ONGOING', 'COMPLETED', 'CANCELLED']).default('SCHEDULED'),
});
type SessionForm = z.infer<typeof sessionSchema>;

// ── Nav config (no bulk upload) ───────────────────────────────────────────────
const NAV_ITEMS = [
  { key: 'dashboard', label: 'Dashboard', icon: BarChart2 },
  { key: 'sessions', label: 'Attendance List', icon: ClipboardList },
  { key: 'mark', label: 'Mark Attendance', icon: UserCheck },
  { key: 'batch', label: 'Batch Attendance', icon: Users },
  { key: 'learner', label: 'Learner Attendance', icon: GraduationCap },
  { key: 'trainer', label: 'Trainer Attendance', icon: UserCheck },
  { key: 'analytics', label: 'Analytics', icon: TrendingUp },
  { key: 'reports', label: 'Reports', icon: FileText },
] as const;
type NavKey = typeof NAV_ITEMS[number]['key'];

// ── Status colour maps ────────────────────────────────────────────────────────
const capPct = (v: number | null | undefined) => Math.min(100, Math.max(0, Number(v ?? 0)));

const STATUS_CLR: Record<AttendStatus, string> = {
  PRESENT: 'bg-emerald-100 text-emerald-700',
  LATE: 'bg-amber-100 text-amber-700',
  EXCUSED: 'bg-blue-100 text-blue-700',
  ABSENT: 'bg-red-100 text-red-700',
};

const STATUS_ABBR: Record<AttendStatus, string> = {
  PRESENT: 'PRE',
  LATE: 'LATE',
  EXCUSED: 'EXC',
  ABSENT: 'ABS',
};

const SESSION_CLR: Record<SessionStatus, string> = {
  SCHEDULED: 'bg-blue-100 text-blue-700',
  ONGOING: 'bg-emerald-100 text-emerald-700',
  COMPLETED: 'bg-gray-100 text-gray-600',
  CANCELLED: 'bg-red-100 text-red-700',
};

// ── API helpers ───────────────────────────────────────────────────────────────
const fetchDashboard = async (): Promise<DashStats> =>
  (await api.get('/attendance/dashboard')).data.data;

const fetchSessions = async (params: Record<string, string>) => {
  const { data } = await api.get('/attendance/sessions?' + new URLSearchParams(params));
  return data.data as { sessions: AttendSession[]; total: number; page: number; limit: number };
};

const fetchSession = async (id: string) => {
  const { data } = await api.get('/attendance/sessions/' + id);
  return data.data as AttendSession & { records: AttendRecord[] };
};

const fetchBatches = async () => {
  const res = await api.get('/batches?limit=100');
  const raw = res.data.data;
  const arr = Array.isArray(raw) ? raw : (raw?.batches ?? []);
  return arr as Array<{
    id: string; name: string; status?: string;
    startDate?: string; endDate?: string;
    course?: { id: string; title: string };
    classStartTime?: string | null; classEndTime?: string | null;
    classDays?: string | null; scheduleNotes?: string | null;
    trainerId?: string | null; trainerName?: string | null;
  }>;
};

const fetchBatchAttendance = async (id: string) => (await api.get('/attendance/batch/' + id)).data.data;
const fetchLearnerAttendance = async (id: string) => (await api.get('/attendance/learner/' + id)).data.data;
const fetchTrainers = async () => {
  const res = await api.get('/trainers?limit=100');
  const raw = res.data.data;
  return (Array.isArray(raw) ? raw : (raw?.trainers ?? [])) as Array<{ id: string; name: string }>;
};
const fetchTrainerSessions = async (id: string) => (await api.get('/attendance/trainer/' + id)).data.data;

// ── Shared UI helpers ─────────────────────────────────────────────────────────
function StatCard({ label, value, icon: Icon, color }: {
  label: string; value: string | number; icon: React.FC<any>; color: string;
}) {
  return (
    <div className="lms-card bg-white rounded-xl p-5 shadow-sm border border-gray-100 flex items-center gap-4 hover:-translate-y-0.5">
      <div className={`p-3 rounded-lg ${color} transition-transform duration-200 group-hover:scale-105`}>
        <Icon className="w-5 h-5 text-white" />
      </div>
      <div>
        <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">{label}</p>
        <p className="text-2xl font-bold text-gray-800 mt-0.5 tabular-nums">{value}</p>
      </div>
    </div>
  );
}

function Badge({ status, map }: { status: string; map: Record<string, string> }) {
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold transition-colors ${map[status] ?? 'bg-gray-100 text-gray-600'}`}>
      {status}
    </span>
  );
}

function SectionHead({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="mb-6 lms-fade-in">
      <h2 className="text-xl font-bold text-gray-900">{title}</h2>
      {sub && <p className="text-sm text-gray-500 mt-0.5">{sub}</p>}
    </div>
  );
}

// ── Generated session types ───────────────────────────────────────────────────
interface GenSession {
  id: string; week: number; sessionNum: number; weekSession: number;
  date: Date; name: string; topic: string;
}

function buildSchedule(startDate: string, endDate: string, classDays: string, courseTitle: string): GenSession[] {
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const dayNums = classDays
    ? classDays.split(/[,\s]+/).map(d => DAYS.findIndex(x => x.toLowerCase() === d.trim().slice(0, 3).toLowerCase())).filter(n => n >= 0)
    : [1, 3, 5];
  const sessionDays = dayNums.length >= 1 ? dayNums.slice(0, 3) : [1, 3, 5];
  const end = new Date(endDate);
  const sessions: GenSession[] = [];
  let cur = new Date(startDate);
  let num = 0;
  while (cur <= end && sessions.length < 60) {
    if (sessionDays.includes(cur.getDay())) {
      num++;
      const week = Math.ceil(num / 3);
      sessions.push({
        id: `gs-${num}`, week, sessionNum: num, weekSession: ((num - 1) % 3) + 1,
        date: new Date(cur),
        name: `Week ${week} – Session ${((num - 1) % 3) + 1}`,
        topic: `${courseTitle || 'Session'} – Part ${num}`,
      });
    }
    cur = new Date(cur.getTime() + 86400000);
  }
  return sessions;
}

function fmtDateAtt(d: Date) {
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
}

// ── Session create/edit modal ─────────────────────────────────────────────────
function SessionModal({ open, onClose, editing, batches, trainers, onSaved }: {
  open: boolean; onClose: () => void; editing: AttendSession | null;
  batches: Array<{ id: string; name: string; classStartTime?: string | null; classEndTime?: string | null; classDays?: string | null; scheduleNotes?: string | null; trainerId?: string | null }>;
  trainers: Array<{ id: string; name: string }>; onSaved: () => void;
}) {
  const qc = useQueryClient();
  const { register, handleSubmit, reset, watch, setValue, formState: { errors } } = useForm<SessionForm>({
    resolver: zodResolver(sessionSchema),
    defaultValues: editing ? {
      batchId: editing.batchId,
      trainerId: editing.trainerId ?? undefined,
      title: editing.title,
      sessionDate: editing.sessionDate,
      startTime: editing.startTime ?? undefined,
      endTime: editing.endTime ?? undefined,
      durationMin: editing.durationMin ?? undefined,
      topic: editing.topic ?? undefined,
      notes: editing.notes ?? undefined,
      status: editing.status,
    } : { status: 'SCHEDULED' as const },
  });

  const selectedBatchId = watch('batchId');
  const selectedBatch = batches.find(b => b.id === selectedBatchId);
  const prevBatchRef = useRef('');

  if (!editing && selectedBatchId && selectedBatchId !== prevBatchRef.current) {
    prevBatchRef.current = selectedBatchId;
    if (selectedBatch?.classStartTime) setValue('startTime', selectedBatch.classStartTime);
    if (selectedBatch?.classEndTime) setValue('endTime', selectedBatch.classEndTime);
    if (selectedBatch?.trainerId) setValue('trainerId', selectedBatch.trainerId);
    if (selectedBatch?.classStartTime && selectedBatch?.classEndTime) {
      const [sh, sm] = selectedBatch.classStartTime.split(':').map(Number);
      const [eh, em] = selectedBatch.classEndTime.split(':').map(Number);
      const dur = (eh * 60 + em) - (sh * 60 + sm);
      if (dur > 0) setValue('durationMin', dur as any);
    }
  }

  const batchFromInfo = !editing && selectedBatch && (selectedBatch.classStartTime || selectedBatch.classDays);

  const saveMut = useMutation({
    mutationFn: (d: SessionForm) => {
      const payload = {
        batchId: d.batchId,
        trainerId: d.trainerId || null,
        title: d.title,
        sessionDate: d.sessionDate,
        startTime: d.startTime || null,
        endTime: d.endTime || null,
        durationMin: d.durationMin === '' || d.durationMin === undefined ? null : Number(d.durationMin),
        topic: d.topic || null,
        notes: d.notes || null,
        status: d.status,
      };
      return editing
        ? api.patch('/attendance/sessions/' + editing.id, payload)
        : api.post('/attendance/sessions', payload);
    },
    onSuccess: () => {
      toast.success(editing ? 'Session updated' : 'Session created');
      qc.invalidateQueries({ queryKey: ['att-sessions'] });
      qc.invalidateQueries({ queryKey: ['att-dashboard'] });
      reset(); prevBatchRef.current = ''; onSaved(); onClose();
    },
    onError: (err: any) => toast.error(err?.response?.data?.message ?? 'Failed to save session'),
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
          {batchFromInfo && (
            <div className="rounded-xl bg-cyan-50 border border-cyan-200 px-4 py-3 text-xs text-cyan-800 space-y-1">
              <p className="font-semibold flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5" /> Schedule auto-filled from Batch Master
              </p>
              {selectedBatch?.classDays && <p>📅 Days: <span className="font-medium">{selectedBatch.classDays}</span></p>}
              {selectedBatch?.classStartTime && <p>🕐 Time: <span className="font-medium">{selectedBatch.classStartTime}{selectedBatch.classEndTime ? ` – ${selectedBatch.classEndTime}` : ''}</span></p>}
              {selectedBatch?.scheduleNotes && <p>📝 {selectedBatch.scheduleNotes}</p>}
              <p className="text-cyan-600 italic">You can still override any field below.</p>
            </div>
          )}
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
              <input type="number" {...register('durationMin')} className={INPUT_CLS} placeholder="Auto from batch" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL_CLS}>Start Time{selectedBatch?.classStartTime && <span className="ml-1 text-cyan-500 text-[10px]">(from batch)</span>}</label>
              <input type="time" {...register('startTime')} className={INPUT_CLS} />
            </div>
            <div>
              <label className={LABEL_CLS}>End Time{selectedBatch?.classEndTime && <span className="ml-1 text-cyan-500 text-[10px]">(from batch)</span>}</label>
              <input type="time" {...register('endTime')} className={INPUT_CLS} />
            </div>
          </div>
          <div>
            <label className={LABEL_CLS}>Topic</label>
            <input {...register('topic')} className={INPUT_CLS} placeholder="Topic covered in this session" />
          </div>
          <div>
            <label className={LABEL_CLS}>Notes</label>
            <textarea {...register('notes')} className={INPUT_CLS} rows={2}
              placeholder={selectedBatch?.scheduleNotes ?? 'Any additional notes...'} />
          </div>
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

// ── Dashboard ─────────────────────────────────────────────────────────────────
function DashboardView() {
  const { data, isLoading } = useQuery({ queryKey: ['att-dashboard'], queryFn: fetchDashboard });
  if (isLoading) return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
    </div>
  );
  const kpi = data ? [
    { label: 'Total Sessions', value: data.totalSessions, icon: Calendar, color: 'bg-cyan-500' },
    { label: 'Present', value: data.totalPresent, icon: CheckCircle2, color: 'bg-emerald-500' },
    { label: 'Absent', value: data.totalAbsent, icon: XCircle, color: 'bg-red-500' },
    { label: 'Avg Attendance', value: capPct(data.avgAttendancePct).toFixed(1) + '%', icon: TrendingUp, color: 'bg-purple-500' },
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
              <Line type="monotone" dataKey="absent" stroke="#f43f5e" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="late" stroke="#f59e0b" strokeWidth={2} dot={false} />
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
                  <td className="py-2"><span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">{capPct(s.pct).toFixed(1)}%</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Session list ──────────────────────────────────────────────────────────────
function SessionListView({ onMark }: { onMark: (s: AttendSession) => void }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [batchId, setBatchId] = useState('');
  const [status, setStatus] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<AttendSession | null>(null);

  const params: Record<string, string> = {};
  if (batchId) params.batchId = batchId;
  if (status) params.status = status;
  if (search) params.search = search;

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['att-sessions', params],
    queryFn: () => fetchSessions(params),
  });
  const sessions = data?.sessions ?? [];

  const { data: batchesData } = useQuery({ queryKey: ['batches-list'], queryFn: fetchBatches });
  const batches = batchesData ?? [];
  const { data: trainersData } = useQuery({ queryKey: ['trainers-list'], queryFn: fetchTrainers });
  const trainers = trainersData ?? [];

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete('/attendance/sessions/' + id),
    onSuccess: () => { toast.success('Session deleted'); refetch(); },
    onError: () => toast.error('Failed to delete'),
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <SectionHead title="Attendance List" sub="All attendance sessions" />
        <button onClick={() => { setEditing(null); setModalOpen(true); }}
          className="flex items-center gap-2 px-4 py-2 bg-cyan-600 text-white rounded-xl hover:bg-cyan-700 text-sm font-semibold shadow-sm">
          <Plus className="w-4 h-4" /> New Session
        </button>
      </div>
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input className="pl-9 pr-4 py-2 w-full text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-cyan-300"
            placeholder="Search sessions..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="text-sm border border-gray-200 rounded-xl px-3 py-2" value={batchId} onChange={e => setBatchId(e.target.value)}>
          <option value="">All batches</option>
          {batches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <select className="text-sm border border-gray-200 rounded-xl px-3 py-2" value={status} onChange={e => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {(['SCHEDULED', 'ONGOING', 'COMPLETED', 'CANCELLED'] as SessionStatus[]).map(s =>
            <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      {isLoading
        ? <div className="space-y-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
        : sessions.length === 0
          ? <p className="text-center py-12 text-sm text-gray-400">No sessions found</p>
          : (
            <div className="space-y-3">
              {sessions.map(s => (
                <div key={s.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-cyan-100 flex items-center justify-center shrink-0">
                    <Calendar className="w-5 h-5 text-cyan-700" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 text-sm truncate">{s.title}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {s.batch?.name ?? s.batchId} · {s.sessionDate}
                      {s.trainer?.name && <span className="ml-1 text-teal-600">· {s.trainer.name}</span>}
                    </p>
                    <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                      {s.total != null && <span>👥 {s.total} students</span>}
                      {s.pct != null && <span>✅ {capPct(s.pct).toFixed(1)}%</span>}
                    </div>
                  </div>
                  <Badge status={s.status} map={SESSION_CLR} />
                  <div className="flex gap-1.5 shrink-0">
                    {user?.role !== 'OPERATIONAL_MANAGER' && (
                      <button onClick={() => onMark(s)} className="p-1.5 hover:bg-emerald-50 text-emerald-600 rounded-lg" title="Mark attendance"><UserCheck className="w-4 h-4" /></button>
                    )}
                    <button onClick={() => { setEditing(s); setModalOpen(true); }} className="p-1.5 hover:bg-gray-100 rounded-lg"><Edit className="w-4 h-4 text-gray-500" /></button>
                    <button onClick={() => deleteMut.mutate(s.id)} disabled={deleteMut.isPending} className="p-1.5 hover:bg-red-50 rounded-lg"><Trash2 className="w-4 h-4 text-red-400" /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
      <SessionModal open={modalOpen} onClose={() => setModalOpen(false)} editing={editing}
        batches={batches} trainers={trainers} onSaved={refetch} />
    </div>
  );
}

// ── Mark Attendance (3-step wizard) ───────────────────────────────────────────
function MarkAttendanceView({ initialSession, onBack }: { initialSession?: AttendSession | null; onBack?: () => void }) {
  const qc = useQueryClient();
  const [step, setStep] = useState<1 | 2 | 3>(initialSession ? 3 : 1);
  const [selBatchId, setSelBatchId] = useState('');
  const [selGenSess, setSelGenSess] = useState<GenSession | null>(null);
  const [sessionId, setSessionId] = useState(initialSession?.id ?? '');
  const [records, setRecords] = useState<Record<string, AttendStatus>>({});
  const [remarks, setRemarks] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');
  const prevId = useRef('');

  const { data: batchesRaw = [] } = useQuery({ queryKey: ['batches-att-mark'], queryFn: fetchBatches });
  const selectedBatch = batchesRaw.find(b => b.id === selBatchId) as any;

  const genSessions = useMemo<GenSession[]>(() => {
    if (!selectedBatch) return [];
    return buildSchedule(
      selectedBatch.startDate ?? '',
      selectedBatch.endDate ?? '',
      selectedBatch.classDays ?? '',
      selectedBatch.course?.title ?? '',
    );
  }, [selectedBatch]);

  const sessionsByWeek = useMemo(() => {
    const map = new Map<number, GenSession[]>();
    genSessions.forEach(s => { if (!map.has(s.week)) map.set(s.week, []); map.get(s.week)!.push(s); });
    return Array.from(map.entries()).sort((a, b) => a[0] - b[0]);
  }, [genSessions]);

  const { data: detail, isLoading: detailLoading } = useQuery({
    queryKey: ['att-session-detail', sessionId],
    queryFn: () => fetchSession(sessionId),
    enabled: !!sessionId,
  });

  if (detail && sessionId !== prevId.current) {
    prevId.current = sessionId;
    const r: Record<string, AttendStatus> = {};
    const rem: Record<string, string> = {};
    detail.records.forEach(rec => { r[rec.studentId] = rec.status; rem[rec.studentId] = rec.remarks ?? ''; });
    setRecords(r); setRemarks(rem);
  }

  const createSessMut = useMutation({
    mutationFn: (gs: GenSession) => api.post('/attendance/sessions', {
      batchId: selBatchId,
      trainerId: selectedBatch?.trainerId || null,
      title: gs.name,
      sessionDate: gs.date.toISOString().split('T')[0],
      startTime: selectedBatch?.classStartTime || null,
      endTime: selectedBatch?.classEndTime || null,
      durationMin: (() => {
        const s = selectedBatch?.classStartTime;
        const e = selectedBatch?.classEndTime;
        if (!s || !e) return null;
        const [sh, sm] = s.split(':').map(Number);
        const [eh, em] = e.split(':').map(Number);
        const d = (eh * 60 + em) - (sh * 60 + sm);
        return d > 0 ? d : null;
      })(),
      topic: gs.topic,
      notes: null,
      status: 'SCHEDULED',
    }),
    onSuccess: (res) => {
      const newId = res.data?.data?.id;
      if (newId) { setSessionId(newId); setStep(3); }
      qc.invalidateQueries({ queryKey: ['att-sessions'] });
      toast.success('Session created — mark attendance below');
    },
    onError: (err: any) => toast.error(err?.response?.data?.message ?? 'Failed to create session'),
  });

  const saveMut = useMutation({
    mutationFn: () => api.post('/attendance/sessions/' + sessionId + '/mark', {
      records: (detail?.records ?? []).map(rec => ({
        studentId: rec.studentId,
        status: records[rec.studentId] ?? 'ABSENT',
        remarks: remarks[rec.studentId] ?? null,
      })),
    }),
    onSuccess: () => {
      toast.success('Attendance saved!');
      qc.invalidateQueries({ queryKey: ['att-session-detail', sessionId] });
      qc.invalidateQueries({ queryKey: ['att-sessions'] });
      qc.invalidateQueries({ queryKey: ['att-dashboard'] });
    },
    onError: (err: any) => {
      console.error(err);
      toast.error(err?.response?.data?.message ?? 'Failed to save');
    },
  });

  const markAllMut = useMutation({
    mutationFn: (status: AttendStatus) => api.post('/attendance/sessions/' + sessionId + '/mark-all', { status }),
    onSuccess: (_, status) => {
      const r: Record<string, AttendStatus> = {};
      (detail?.records ?? []).forEach(rec => { r[rec.studentId] = status; });
      setRecords(r); toast.success('All marked ' + status);
      qc.invalidateQueries({ queryKey: ['att-session-detail', sessionId] });
    },
    onError: () => toast.error('Failed'),
  });

  const studentsAll = detail?.records ?? [];
  const students = studentsAll.filter(r =>
    !search ||
    (r.student?.name ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (r.student?.email ?? '').toLowerCase().includes(search.toLowerCase())
  );
  const counts = studentsAll.reduce((a, r) => {
    const s = records[r.studentId] ?? 'ABSENT';
    a[s] = (a[s] ?? 0) + 1;
    return a;
  }, {} as Record<AttendStatus, number>);

  const crumbs = [
    { label: 'Subject', val: selectedBatch?.name, step: 1 as const },
    { label: 'Session', val: selGenSess?.name, step: 2 as const },
    { label: 'Mark', val: step === 3 ? 'Marking' : null, step: 3 as const },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        {onBack && (
          <button onClick={onBack} className="p-1.5 hover:bg-gray-100 rounded-lg">
            <ChevronRight className="w-4 h-4 rotate-180 text-gray-500" />
          </button>
        )}
        <div>
          <h2 className="text-xl font-bold text-gray-900">Mark Attendance</h2>
          <p className="text-sm text-gray-500 mt-0.5">Select subject → session → mark students</p>
        </div>
      </div>

      {/* Breadcrumb */}
      <div className="flex items-center gap-1 text-xs flex-wrap">
        {crumbs.map((c, i) => (
          <div key={c.step} className="flex items-center gap-1">
            {i > 0 && <ChevronRight className="w-3 h-3 text-gray-300" />}
            <button
              onClick={() => { if (c.step < step) setStep(c.step); }}
              disabled={c.step >= step}
              className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${step === c.step
                  ? 'bg-cyan-600 text-white'
                  : c.step < step
                    ? 'bg-cyan-50 text-cyan-700 cursor-pointer hover:bg-cyan-100'
                    : 'bg-gray-100 text-gray-400 cursor-default'
                }`}
            >
              {c.step}. {c.val ? (c.val.length > 22 ? c.val.slice(0, 22) + '…' : c.val) : c.label}
            </button>
          </div>
        ))}
      </div>

      {/* STEP 1 — Pick batch */}
      {step === 1 && (
        <div className="space-y-3">
          <p className="text-sm font-medium text-gray-700">Select a subject / batch:</p>
          <div className="grid gap-3">
            {batchesRaw.filter(b => (b as any).status !== 'COMPLETED').map(b => {
              const bx = b as any;
              return (
                <button key={b.id} onClick={() => { setSelBatchId(b.id); setStep(2); }}
                  className="flex items-center gap-4 p-4 bg-white border border-gray-100 rounded-2xl hover:border-cyan-300 hover:shadow-md transition-all text-left group">
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center text-white font-bold text-lg shrink-0">
                    {b.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 truncate">{b.name}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{bx.course?.title ?? '—'}</p>
                    <p className={`text-xs mt-0.5 flex items-center gap-1 ${bx.trainerName ? 'text-teal-600' : 'text-amber-600'}`}>
                      <GraduationCap className="w-3 h-3" /> {bx.trainerName ?? 'No trainer assigned'}
                    </p>
                    {bx.classDays && (
                      <p className="text-xs text-cyan-600 mt-0.5">
                        📅 {bx.classDays}{bx.classStartTime ? ` · ${bx.classStartTime}` : ''}
                      </p>
                    )}
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-cyan-500 shrink-0" />
                </button>
              );
            })}
            {batchesRaw.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-8">No active batches found</p>
            )}
          </div>
        </div>
      )}

      {/* STEP 2 — Pick generated session */}
      {step === 2 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-gray-700">Select a session:</p>
            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
              {genSessions.length} sessions generated
            </span>
          </div>
          {sessionsByWeek.length === 0
            ? <p className="text-sm text-gray-400 text-center py-8">No sessions generated — check batch dates &amp; class days</p>
            : (
              <div className="space-y-3 max-h-[520px] overflow-y-auto pr-1">
                {sessionsByWeek.map(([weekNum, weekSessions]) => (
                  <div key={weekNum} className="rounded-xl border border-gray-100 overflow-hidden">
                    <div className="bg-gradient-to-r from-blue-50 to-cyan-50 px-4 py-2 border-b border-blue-100 flex items-center justify-between">
                      <span className="text-xs font-bold text-blue-700">Week {weekNum}</span>
                      <span className="text-[10px] text-blue-500">
                        {fmtDateAtt(weekSessions[0].date)} – {fmtDateAtt(weekSessions[weekSessions.length - 1].date)}
                      </span>
                    </div>
                    {weekSessions.map((gs, idx) => (
                      <button key={gs.id}
                        onClick={() => { setSelGenSess(gs); createSessMut.mutate(gs); }}
                        disabled={createSessMut.isPending}
                        className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-cyan-50 transition-all text-left group ${idx < weekSessions.length - 1 ? 'border-b border-gray-50' : ''}`}>
                        <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center shrink-0">
                          {gs.sessionNum}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-800 truncate">{gs.name}</p>
                          <p className="text-xs text-gray-400 truncate">{gs.topic}</p>
                          <p className="text-[10px] text-gray-400 mt-0.5">{fmtDateAtt(gs.date)}</p>
                        </div>
                        {createSessMut.isPending && selGenSess?.id === gs.id
                          ? <Loader2 className="w-4 h-4 animate-spin text-cyan-500 shrink-0" />
                          : <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-cyan-500 shrink-0" />}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            )}
        </div>
      )}

      {/* STEP 3 — Mark per student */}
      {step === 3 && sessionId && (
        <div className="space-y-4">
          {selGenSess && (
            <div className="bg-cyan-50 border border-cyan-200 rounded-xl px-4 py-3 text-sm text-cyan-800 flex items-center gap-3">
              <BookOpen className="w-4 h-4 shrink-0" />
              <div>
                <p className="font-semibold">{selGenSess.name}</p>
                <p className="text-xs mt-0.5">{selGenSess.topic} · {fmtDateAtt(selGenSess.date)}</p>
              </div>
            </div>
          )}

          {/* Count badges */}
          <div className="flex gap-2 flex-wrap">
            {(['PRESENT', 'LATE', 'EXCUSED', 'ABSENT'] as AttendStatus[]).map(s => (
              <div key={s} className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${STATUS_CLR[s]}`}>
                {s}: {counts[s] ?? 0}
              </div>
            ))}
          </div>

          {/* Mark all */}
          <div className="flex gap-2 flex-wrap items-center">
            <span className="text-xs text-gray-500 font-medium">Mark all as:</span>
            {(['PRESENT', 'LATE', 'EXCUSED', 'ABSENT'] as AttendStatus[]).map(s => (
              <button key={s} onClick={() => markAllMut.mutate(s)} disabled={markAllMut.isPending}
                className={`px-3 py-1 text-xs rounded-lg font-medium border ${STATUS_CLR[s]} hover:opacity-80 disabled:opacity-50`}>
                {s}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              className="pl-9 pr-4 py-2 w-full border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-300"
              placeholder="Search students..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          {detailLoading
            ? <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
            : (
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                {students.length === 0
                  ? <p className="text-center py-8 text-sm text-gray-400">No students in this session</p>
                  : students.map((rec, idx) => (
                    <div key={rec.studentId}
                      className={`flex items-center gap-3 px-4 py-3 ${idx < students.length - 1 ? 'border-b border-gray-100' : ''}`}>
                      <div className="w-8 h-8 rounded-full bg-cyan-100 flex items-center justify-center text-cyan-700 text-xs font-bold shrink-0">
                        {(rec.student?.name?.[0] ?? '?').toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-800 text-sm truncate">{rec.student?.name ?? rec.studentId}</p>
                        <p className="text-xs text-gray-400 truncate">{rec.student?.email ?? ''}</p>
                      </div>
                      <div className="flex gap-1.5 shrink-0">
                        {(['PRESENT', 'LATE', 'EXCUSED', 'ABSENT'] as AttendStatus[]).map(s => (
                          <button key={s}
                            onClick={() => setRecords(r => ({ ...r, [rec.studentId]: s }))}
                            title={s}
                            className={`w-10 h-8 text-[10px] rounded-lg font-bold transition-all ${records[rec.studentId] === s
                                ? STATUS_CLR[s] + ' ring-2 ring-offset-1 ring-current scale-110'
                                : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                              }`}>
                            {STATUS_ABBR[s]}
                          </button>
                        ))}
                      </div>
                      <input
                        className="text-xs border border-gray-200 rounded px-2 py-1 w-24 focus:outline-none focus:ring-1 focus:ring-cyan-300"
                        placeholder="Remarks"
                        value={remarks[rec.studentId] ?? ''}
                        onChange={e => setRemarks(r => ({ ...r, [rec.studentId]: e.target.value }))}
                      />
                    </div>
                  ))}
              </div>
            )}

          <div className="flex justify-between items-center">
            <button onClick={() => setStep(2)}
              className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1">
              <ChevronRight className="w-3.5 h-3.5 rotate-180" /> Back to sessions
            </button>
            <button onClick={() => saveMut.mutate()} disabled={saveMut.isPending || !sessionId}
              className="flex items-center gap-2 px-6 py-2.5 bg-cyan-600 text-white rounded-xl hover:bg-cyan-700 disabled:opacity-50 text-sm font-semibold shadow-sm">
              {saveMut.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Save Attendance
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Batch Attendance ──────────────────────────────────────────────────────────
function BatchAttendanceView() {
  const [batchId, setBatchId] = useState('');
  const { data: batchesData } = useQuery({ queryKey: ['batches-list'], queryFn: fetchBatches });
  const batches = (batchesData ?? []) as Array<{ id: string; name: string }>;
  const { data, isLoading } = useQuery({
    queryKey: ['att-batch', batchId],
    queryFn: () => fetchBatchAttendance(batchId),
    enabled: !!batchId,
  });
  const students: any[] = data?.students ?? [];
  const sessions: any[] = data?.sessions ?? [];
  const avgPct = students.length > 0
    ? (students.reduce((a: number, s: any) => a + capPct(s.pct), 0) / students.length).toFixed(1) + '%'
    : '—';

  return (
    <div className="space-y-4">
      <SectionHead title="Batch Attendance" sub="Per-student summary for a batch" />
      <div>
        <label className={LABEL_CLS}>Select Batch</label>
        <select className={INPUT_CLS} value={batchId} onChange={e => setBatchId(e.target.value)}>
          <option value="">Choose a batch...</option>
          {batches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
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
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                <tr>
                  <th className="px-4 py-3 text-left">Student</th>
                  <th className="px-4 py-3 text-left">Present</th>
                  <th className="px-4 py-3 text-left">Absent</th>
                  <th className="px-4 py-3 text-left">Late</th>
                  <th className="px-4 py-3 text-left">Attendance %</th>
                  <th className="px-4 py-3 text-left">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {students.map((s: any) => (
                  <tr key={s.studentId} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-800">{s.name}</p>
                      <p className="text-xs text-gray-400">{s.email}</p>
                    </td>
                    <td className="px-4 py-3 text-emerald-600 font-medium">{s.present ?? 0}</td>
                    <td className="px-4 py-3 text-red-500 font-medium">{s.absent ?? 0}</td>
                    <td className="px-4 py-3 text-amber-500 font-medium">{s.late ?? 0}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-20 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                          <div className="h-full bg-emerald-500 rounded-full" style={{ width: capPct(s.pct) + '%' }} />
                        </div>
                        <span className="text-xs">{capPct(s.pct).toFixed(1)}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${capPct(s.pct) < 75 ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                        {capPct(s.pct) < 75 ? 'At Risk' : 'Good'}
                      </span>
                    </td>
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

// ── Learner Attendance (name-search dropdown) ─────────────────────────────────
function LearnerAttendanceView() {
  const [searchName, setSearchName] = useState('');
  const [studentId, setStudentId] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);

  const { data: learnersRaw = [] } = useQuery({
    queryKey: ['learners-att-search'],
    queryFn: async () => {
      const res = await api.get('/learners?limit=200');
      return (res.data.data?.learners ?? res.data.data ?? []) as Array<{ id: string; name: string; email: string }>;
    },
    staleTime: 60000,
  });

  const filtered = searchName.trim().length > 0
    ? learnersRaw.filter(s =>
      s.name.toLowerCase().includes(searchName.toLowerCase()) ||
      s.email.toLowerCase().includes(searchName.toLowerCase()))
    : learnersRaw.slice(0, 8);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['att-learner', studentId],
    queryFn: () => fetchLearnerAttendance(studentId),
    enabled: !!studentId,
    staleTime: 0,
  });

  const summary: any = data?.summary ?? {};
  const history: any[] = data?.history ?? [];
  const batchSummary: any[] = data?.batchSummary ?? [];
  const student: any = data?.student ?? null;

  const lineData = useMemo(() => {
    const sorted = [...(data?.history ?? [])].reverse();
    let attended = 0;
    return sorted.map((h: any, i: number) => {
      if (h.status !== 'ABSENT') attended++;
      const pct = Math.min(100, Math.round((attended / (i + 1)) * 100));
      return { session: `S${i + 1}`, date: h.session_date ?? '', pct };
    });
  }, [data]);

  const overallPct = Math.min(100, Number(summary.pct ?? 0));
  const pctColor = overallPct >= 85 ? '#10b981' : overallPct >= 75 ? '#f59e0b' : '#ef4444';
  const pctLabel = overallPct >= 85 ? 'text-emerald-600' : overallPct >= 75 ? 'text-amber-600' : 'text-red-600';
  const pctBg = overallPct >= 85 ? 'bg-emerald-500' : overallPct >= 75 ? 'bg-amber-400' : 'bg-red-500';

  return (
    <div className="space-y-5 max-w-4xl">
      <SectionHead title="Learner Attendance" sub="Search a student by name and load their full attendance history" />

      {/* Search + Load */}
      <div className="flex gap-2 items-start">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            className="pl-9 pr-4 py-2.5 w-full text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-400 shadow-sm"
            placeholder="Search student by name or email..."
            value={searchName}
            autoComplete="off"
            onChange={e => { setSearchName(e.target.value); setShowDropdown(true); }}
            onFocus={() => setShowDropdown(true)}
            onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
          />
          {showDropdown && filtered.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl z-20 max-h-56 overflow-y-auto">
              {filtered.map(s => (
                <button key={s.id}
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => { setSearchName(s.name); setStudentId(s.id); setShowDropdown(false); }}
                  className={`w-full text-left px-4 py-2.5 hover:bg-cyan-50 transition-colors flex items-center gap-3 ${studentId === s.id ? 'bg-cyan-50' : ''}`}>
                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
                    {s.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{s.name}</p>
                    <p className="text-xs text-gray-400 truncate">{s.email}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          onClick={() => { setShowDropdown(false); if (studentId) refetch(); }}
          disabled={!studentId || isLoading}
          className="flex items-center gap-2 px-5 py-2.5 bg-cyan-600 text-white rounded-xl text-sm font-semibold hover:bg-cyan-700 disabled:opacity-50 transition-colors shadow-sm">
          {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-4 h-4" />}
          Load
        </button>
      </div>

      {isLoading && (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
        </div>
      )}

      {data && student && (
        <>
          {/* Student header */}
          <div className="bg-gradient-to-r from-cyan-50 to-blue-50 rounded-2xl border border-cyan-100 p-5 flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-white font-bold text-xl shrink-0 shadow-md">
              {student.name?.charAt(0)?.toUpperCase() ?? '?'}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-bold text-gray-900">{student.name}</h3>
              <p className="text-sm text-gray-500">{student.email}</p>
            </div>
            <div className={`text-center px-4 py-2 rounded-xl ${overallPct >= 85 ? 'bg-emerald-100' : overallPct >= 75 ? 'bg-amber-100' : 'bg-red-100'}`}>
              <p className={`text-2xl font-bold ${pctLabel}`}>{overallPct.toFixed(1)}%</p>
              <p className="text-xs text-gray-500">Overall Att.</p>
            </div>
          </div>

          {/* KPI cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard label="Total Sessions" value={String(summary.total ?? 0)} icon={Calendar} color="bg-gray-500" />
            <StatCard label="Present" value={String((summary.present ?? 0) + (summary.late ?? 0))} icon={CheckCircle2} color="bg-emerald-500" />
            <StatCard label="Absent" value={String(summary.absent ?? 0)} icon={UserX} color="bg-red-500" />
            <StatCard label="Attendance %" value={overallPct.toFixed(1) + '%'} icon={TrendingUp} color={overallPct >= 85 ? 'bg-emerald-500' : overallPct >= 75 ? 'bg-amber-400' : 'bg-red-500'} />
          </div>

          {/* Trend chart */}
          {lineData.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-gray-800">Attendance Trend</h3>
                <div className="flex items-center gap-3 text-xs">
                  <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-emerald-500 inline-block" /> ≥85%</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-amber-400 inline-block" /> 75–85%</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-red-500 inline-block" /> &lt;75%</span>
                </div>
              </div>
              <div className="mb-3">
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>Running Attendance %</span>
                  <span className={`font-semibold ${pctLabel}`}>{overallPct.toFixed(1)}%</span>
                </div>
                <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${pctBg}`} style={{ width: `${overallPct}%` }} />
                </div>
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={lineData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="session" tick={{ fontSize: 10 }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} tickFormatter={v => `${v}%`} />
                  <Tooltip formatter={(v: number) => [`${v}%`, 'Attendance']} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                  <ReferenceLine y={85} stroke="#10b981" strokeDasharray="4 2" label={{ value: '85%', position: 'right', fontSize: 10, fill: '#10b981' }} />
                  <ReferenceLine y={75} stroke="#f59e0b" strokeDasharray="4 2" label={{ value: '75%', position: 'right', fontSize: 10, fill: '#f59e0b' }} />
                  <Line type="monotone" dataKey="pct" strokeWidth={2.5} dot={{ r: 3 }} stroke={pctColor} activeDot={{ r: 5 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Course breakdown */}
          {batchSummary.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h3 className="font-semibold text-gray-800 mb-4">Course Details</h3>
              <div className="space-y-3">
                {batchSummary.map((b: any, i: number) => {
                  const bPct = Math.min(100, Number(b.attendance_pct ?? b.attendancePct ?? 0));
                  const bColor = bPct >= 85 ? 'bg-emerald-500' : bPct >= 75 ? 'bg-amber-400' : 'bg-red-500';
                  const bLbl = bPct >= 85 ? 'text-emerald-600' : bPct >= 75 ? 'text-amber-600' : 'text-red-600';
                  return (
                    <div key={i} className="p-4 bg-gray-50 rounded-xl border border-gray-100">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <p className="font-semibold text-gray-900 text-sm">{b.course_title ?? b.courseTitle}</p>
                          <p className="text-xs text-gray-500 mt-0.5">{b.batch_name ?? b.batchName}</p>
                        </div>
                        <span className={`text-lg font-bold ${bLbl}`}>{bPct.toFixed(1)}%</span>
                      </div>
                      <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden mb-2">
                        <div className={`h-full rounded-full ${bColor}`} style={{ width: `${bPct}%` }} />
                      </div>
                      <div className="flex gap-4 text-xs text-gray-500">
                        <span>✅ Present: {(b.present ?? 0) + (b.late ?? 0)}</span>
                        <span>❌ Absent: {b.absent ?? 0}</span>
                        <span>📋 Total: {b.total ?? 0}</span>
                        {(b.excused ?? 0) > 0 && <span>🟡 Excused: {b.excused}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Session history */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <p className="text-sm font-semibold text-gray-700">Session History</p>
              <span className="text-xs text-gray-400">{history.length} records</span>
            </div>
            <div className="divide-y divide-gray-50 max-h-80 overflow-y-auto">
              {history.length === 0 && <p className="text-center py-6 text-sm text-gray-400">No records found</p>}
              {history.map((h: any, i: number) => (
                <div key={i} className="flex items-center px-4 py-3 gap-3 hover:bg-gray-50 transition-colors">
                  <Badge status={h.status} map={STATUS_CLR} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{h.session_title}</p>
                    <p className="text-xs text-gray-400">{h.batch_name} · {h.session_date}</p>
                  </div>
                  {h.remarks && <span className="text-xs text-gray-400 italic truncate max-w-[120px]">{h.remarks}</span>}
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
  const { data: trainersData } = useQuery({ queryKey: ['trainers-list'], queryFn: fetchTrainers });
  const trainers = trainersData ?? [];
  const { data, isLoading } = useQuery({
    queryKey: ['att-trainer', trainerId],
    queryFn: () => fetchTrainerSessions(trainerId),
    enabled: !!trainerId,
    staleTime: 0,
  });
  const sessions: any[] = data?.sessions ?? [];
  const stats: any = data?.stats ?? {};
  const presentSessions = sessions.filter((s: any) => s.trainerPresent).length;
  const absentSessions = sessions.filter((s: any) => !s.trainerPresent && s.status === 'COMPLETED').length;
  const trainerPct = sessions.length > 0 ? Math.round((presentSessions / sessions.length) * 100) : 0;

  return (
    <div className="space-y-4">
      <SectionHead title="Trainer Attendance" sub="Sessions conducted by a specific trainer" />
      <div>
        <label className={LABEL_CLS}>Select Trainer</label>
        <select className={INPUT_CLS} value={trainerId} onChange={e => setTrainerId(e.target.value)}>
          <option value="">Choose a trainer...</option>
          {trainers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </div>
      {isLoading && <Skeleton className="h-40 rounded-xl" />}
      {data && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard label="Total Sessions" value={stats.totalSessions ?? sessions.length} icon={Calendar} color="bg-cyan-500" />
            <StatCard label="Trainer Present" value={presentSessions} icon={UserCheck} color="bg-emerald-500" />
            <StatCard label="Trainer Absent" value={absentSessions} icon={UserX} color="bg-red-500" />
            <StatCard label="Trainer Att. %" value={trainerPct + '%'} icon={TrendingUp} color="bg-purple-500" />
          </div>
          {sessions.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700">Trainer Attendance Rate</span>
                <span className={`text-sm font-bold ${trainerPct >= 90 ? 'text-emerald-600' : trainerPct >= 75 ? 'text-amber-600' : 'text-red-600'}`}>
                  {presentSessions}/{sessions.length} ({trainerPct}%)
                </span>
              </div>
              <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all ${trainerPct >= 90 ? 'bg-emerald-500' : trainerPct >= 75 ? 'bg-amber-400' : 'bg-red-500'}`}
                  style={{ width: `${trainerPct}%` }} />
              </div>
            </div>
          )}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                <tr>
                  <th className="px-4 py-3 text-left">Session</th>
                  <th className="px-4 py-3 text-left">Batch</th>
                  <th className="px-4 py-3 text-left">Date</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Trainer Present</th>
                  <th className="px-4 py-3 text-left">Student Att.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sessions.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-400">No sessions found</td></tr>
                )}
                {sessions.map((s: any) => (
                  <tr key={s.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-800">{s.title}</td>
                    <td className="px-4 py-3 text-gray-500">{s.batch_name ?? s.batchId}</td>
                    <td className="px-4 py-3 text-gray-500">{s.sessionDate ?? s.session_date}</td>
                    <td className="px-4 py-3"><Badge status={s.status} map={SESSION_CLR} /></td>
                    <td className="px-4 py-3">
                      {s.status === 'COMPLETED'
                        ? s.trainerPresent
                          ? <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700"><CheckCircle2 className="w-3.5 h-3.5" /> Present</span>
                          : <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-700"><XCircle className="w-3.5 h-3.5" /> Absent</span>
                        : <span className="text-xs text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-3 text-sm">{s.pct != null ? capPct(s.pct).toFixed(1) + '%' : '—'}</td>
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
  const { data: batchesData } = useQuery({ queryKey: ['batches-list'], queryFn: fetchBatches });
  const batches = (batchesData ?? []) as Array<{ id: string; name: string }>;
  const { data: dashData } = useQuery({ queryKey: ['att-dashboard'], queryFn: fetchDashboard });
  const { data: batchData, isLoading } = useQuery({
    queryKey: ['att-batch-analytics', batchId],
    queryFn: () => fetchBatchAttendance(batchId),
    enabled: !!batchId,
  });
  const trend = (dashData?.trend ?? []).map(t => ({ ...t, date: (t.date ?? '').slice(5) }));
  const students: any[] = batchData?.students ?? [];
  const barData = students.slice(0, 15).map((s: any) => ({
    name: (s.name ?? '').split(' ')[0],
    present: s.present ?? 0, absent: s.absent ?? 0, late: s.late ?? 0,
  }));
  const pieData = dashData ? [
    { name: 'Present', value: dashData.totalPresent },
    { name: 'Late', value: dashData.totalLate },
    { name: 'Absent', value: dashData.totalAbsent },
    { name: 'Excused', value: dashData.totalExcused },
  ] : [];
  const PIE = ['#10b981', '#f59e0b', '#f43f5e', '#3b82f6'];

  return (
    <div className="space-y-6">
      <SectionHead title="Attendance Analytics" sub="Visual breakdown of attendance patterns" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Overall Status Distribution</h3>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label>
                {pieData.map((_, i) => <Cell key={i} fill={PIE[i]} />)}
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
              <Line type="monotone" dataKey="absent" stroke="#f43f5e" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="late" stroke="#f59e0b" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-700">Student Breakdown by Batch</h3>
          <select className="text-xs border border-gray-200 rounded px-2 py-1" value={batchId} onChange={e => setBatchId(e.target.value)}>
            <option value="">Select batch...</option>
            {batches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
        {isLoading ? <Skeleton className="h-40" /> : barData.length > 0 ? (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={barData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip /><Legend />
              <Bar dataKey="present" fill="#10b981" radius={[3, 3, 0, 0]} />
              <Bar dataKey="absent" fill="#f43f5e" radius={[3, 3, 0, 0]} />
              <Bar dataKey="late" fill="#f59e0b" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : <p className="text-center py-8 text-sm text-gray-400">Select a batch to see student breakdown</p>}
      </div>
    </div>
  );
}

// ── Reports ───────────────────────────────────────────────────────────────────
function ReportsView() {
  const [batchId, setBatchId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const { data: batchesData } = useQuery({ queryKey: ['batches-list'], queryFn: fetchBatches });
  const batches = (batchesData ?? []) as Array<{ id: string; name: string }>;

  const handleExport = async (fmt: 'csv' | 'json') => {
    const p: Record<string, string> = {};
    if (batchId) p.batchId = batchId;
    if (dateFrom) p.dateFrom = dateFrom;
    if (dateTo) p.dateTo = dateTo;
    if (fmt === 'csv') p.format = 'csv';
    const { data } = await api.get('/attendance/reports?' + new URLSearchParams(p), {
      responseType: fmt === 'csv' ? 'blob' : 'json',
    });
    const blob = new Blob([fmt === 'csv' ? data : JSON.stringify(data.data, null, 2)]);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'attendance_report.' + fmt; a.click();
    URL.revokeObjectURL(url);
    toast.success('Report downloaded');
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <SectionHead title="Reports" sub="Export attendance data for analysis" />
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 space-y-4">
        <div>
          <label className={LABEL_CLS}>Batch (optional)</label>
          <select className={INPUT_CLS} value={batchId} onChange={e => setBatchId(e.target.value)}>
            <option value="">All batches</option>
            {batches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className={LABEL_CLS}>Date From</label><input type="date" className={INPUT_CLS} value={dateFrom} onChange={e => setDateFrom(e.target.value)} /></div>
          <div><label className={LABEL_CLS}>Date To</label><input type="date" className={INPUT_CLS} value={dateTo} onChange={e => setDateTo(e.target.value)} /></div>
        </div>
        <div className="flex gap-3 pt-2">
          <button onClick={() => handleExport('csv')} className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm font-medium"><Download className="w-4 h-4" /> Export CSV</button>
          <button onClick={() => handleExport('json')} className="flex items-center gap-2 px-5 py-2.5 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 text-sm font-medium"><Download className="w-4 h-4" /> Export JSON</button>
        </div>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function AttendanceMaster() {
  const { user } = useAuth();
  const [activeNav, setActiveNav] = useState<NavKey>('dashboard');
  const [markSession, setMarkSession] = useState<AttendSession | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleMark = (s: AttendSession) => { setMarkSession(s); setActiveNav('mark'); };
  const navItems = NAV_ITEMS.filter(item => !(item.key === 'mark' && user?.role === 'OPERATIONAL_MANAGER'));

  const renderContent = () => {
    switch (activeNav) {
      case 'dashboard': return <DashboardView />;
      case 'sessions': return <SessionListView onMark={handleMark} />;
      case 'mark': return <MarkAttendanceView initialSession={markSession} onBack={() => setActiveNav('sessions')} />;
      case 'batch': return <BatchAttendanceView />;
      case 'learner': return <LearnerAttendanceView />;
      case 'trainer': return <TrainerAttendanceView />;
      case 'analytics': return <AnalyticsView />;
      case 'reports': return <ReportsView />;
      default: return null;
    }
  };

  return (
    <div className="relative flex h-full min-h-[calc(100vh-8rem)] overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
      {/* Overlay — closes drawer when tapping outside */}
      {sidebarOpen && (
        <div
          className="absolute inset-0 z-20 bg-slate-900/25 backdrop-blur-[1px]"
          onClick={() => setSidebarOpen(false)}
          aria-hidden
        />
      )}

      {/* Classic Attendance sidebar — slides in via hamburger */}
      <aside
        className={`lms-drawer absolute z-30 top-0 bottom-0 left-0 w-56 bg-white border-r border-gray-200 flex flex-col shadow-lg ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="p-4 border-b border-gray-100 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-cyan-600 flex items-center justify-center shrink-0">
              <ClipboardList className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-gray-800 text-sm">Attendance</span>
          </div>
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            aria-label="Close attendance menu"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto py-2">
          {navItems.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                setActiveNav(key);
                setSidebarOpen(false);
              }}
              className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors ${
                activeNav === key
                  ? 'bg-cyan-50 text-cyan-700 font-semibold border-r-2 border-cyan-600'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              {label}
            </button>
          ))}
        </nav>
      </aside>

      <main className="flex-1 overflow-y-auto min-w-0">
        <div className="sticky top-0 z-10 bg-white/95 backdrop-blur border-b border-gray-100 px-4 lg:px-6 py-3 flex items-center gap-3">
          <button
            type="button"
            onClick={() => setSidebarOpen((o) => !o)}
            className="p-2 -ml-1 hover:bg-cyan-50 text-gray-600 hover:text-cyan-700 rounded-lg transition-colors"
            aria-label="Open attendance menu"
            aria-expanded={sidebarOpen}
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-1.5 text-xs text-gray-500 min-w-0">
            <BookOpen className="w-3.5 h-3.5 shrink-0" />
            <span>Attendance Master</span>
            <ChevronRight className="w-3 h-3 shrink-0" />
            <span className="font-medium text-gray-700 truncate">
              {NAV_ITEMS.find((n) => n.key === activeNav)?.label}
            </span>
          </div>
        </div>
        <div className="p-4 lg:p-6">{renderContent()}</div>
      </main>
    </div>
  );
}
