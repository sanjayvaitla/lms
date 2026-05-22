import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Plus, Search, Users, BookOpen, TrendingUp, Award,
  ChevronRight, X, Loader2, Edit, Trash2, UserCheck,
  GraduationCap, Calendar, Layers, UserPlus, UserMinus,
  CheckCircle2, PlayCircle, Timer, BarChart2, Mail,
  ChevronDown, ChevronUp,
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { Skeleton } from '../components/ui/skeleton';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import api from '../../lib/axios';
import { INPUT_CLS, LABEL_CLS, ERROR_CLS } from '../../lib/constants';

// ── Types ─────────────────────────────────────────────────────────────────────
interface Learner {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  enrollmentCount: number;
  avgCompletion: number;
  activeBatches: number;
}

interface LearnerEnrollment {
  enrollmentId: string;
  batchId: string;
  batchName: string;
  batchStatus: 'UPCOMING' | 'ONGOING' | 'COMPLETED';
  startDate: string;
  endDate: string;
  courseId: string;
  courseTitle: string;
  category: string;
  colorToken: string;
  completionPct: number;
  grade: string | null;
  enrolledAt: string;
}

interface LearnerDetail extends Learner {
  enrollments: LearnerEnrollment[];
}

interface AvailableBatch {
  id: string;
  name: string;
  status: string;
  startDate: string;
  endDate: string;
  capacity: number;
  courseTitle: string;
  category: string;
  colorToken: string;
  enrolledCount: number;
}

interface DashboardStats {
  totalLearners: number;
  newThisMonth: number;
  totalEnrollments: number;
  avgCompletion: number;
  activeEnrollments: number;
}

// ── Zod schemas ───────────────────────────────────────────────────────────────
const learnerSchema = z.object({
  name:     z.string().min(2, 'Name must be at least 2 characters'),
  email:    z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters').optional().or(z.literal('')),
});
type LearnerForm = z.infer<typeof learnerSchema>;

// ── Status config ─────────────────────────────────────────────────────────────
const BATCH_STATUS: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  UPCOMING:  { label: 'Upcoming',  color: 'text-blue-600',    bg: 'bg-blue-50 border-blue-100',    icon: <Timer className="w-3 h-3" /> },
  ONGOING:   { label: 'Ongoing',   color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-100', icon: <PlayCircle className="w-3 h-3" /> },
  COMPLETED: { label: 'Completed', color: 'text-gray-500',    bg: 'bg-gray-50 border-gray-100',    icon: <CheckCircle2 className="w-3 h-3" /> },
};

// ── API helpers ───────────────────────────────────────────────────────────────
async function fetchStats(): Promise<DashboardStats> {
  const { data } = await api.get('/learners/stats');
  return data.data;
}
async function fetchLearners(search = ''): Promise<{ learners: Learner[]; total: number }> {
  const { data } = await api.get('/learners', { params: { search, limit: 50 } });
  return data.data;
}
async function fetchLearner(id: string): Promise<LearnerDetail> {
  const { data } = await api.get(`/learners/${id}`);
  return data.data;
}
async function fetchAvailableBatches(learnerId: string): Promise<AvailableBatch[]> {
  const { data } = await api.get(`/learners/${learnerId}/batches/available`);
  return data.data;
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function LearnerMasterPage() {
  const qc = useQueryClient();
  const [search, setSearch]             = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editLearner, setEditLearner]   = useState<Learner | null>(null);
  const [profileId, setProfileId]       = useState<string | null>(null);

  const { data: stats }                       = useQuery({ queryKey: ['learner-stats'], queryFn: fetchStats });
  const { data: result, isLoading }           = useQuery({
    queryKey: ['learners', search],
    queryFn:  () => fetchLearners(search),
  });
  const learners = result?.learners ?? [];

  // ── Delete ────────────────────────────────────────────────────────────────
  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/learners/${id}`),
    onSuccess: () => {
      toast.success('Learner removed');
      qc.invalidateQueries({ queryKey: ['learners'] });
      qc.invalidateQueries({ queryKey: ['learner-stats'] });
    },
    onError: () => toast.error('Failed to remove learner'),
  });

  function handleDelete(id: string, name: string) {
    if (confirm(`Remove learner "${name}"?\nThis will delete all their enrollment records.`)) {
      deleteMutation.mutate(id);
    }
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Learner Master</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            Register, manage and track all learners across batches and courses.
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-gradient-to-r from-orange-500 to-amber-500 rounded-xl hover:opacity-90 transition-opacity shadow-md shrink-0"
        >
          <Plus className="w-4 h-4" /> Register Learner
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {[
          { label: 'Total Learners',       value: stats?.totalLearners    ?? 0, icon: Users,      color: 'text-orange-600', bg: 'bg-orange-50' },
          { label: 'New This Month',       value: stats?.newThisMonth     ?? 0, icon: UserPlus,   color: 'text-blue-600',   bg: 'bg-blue-50' },
          { label: 'Active Enrollments',   value: stats?.activeEnrollments ?? 0, icon: PlayCircle, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'Total Enrollments',    value: stats?.totalEnrollments  ?? 0, icon: Layers,     color: 'text-purple-600', bg: 'bg-purple-50' },
          { label: 'Avg Completion',       value: `${stats?.avgCompletion ?? 0}%`, icon: TrendingUp, color: 'text-cyan-600', bg: 'bg-cyan-50' },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className={`${bg} rounded-2xl p-4 border border-white/80 shadow-sm`}>
            <div className={`flex items-center gap-2 ${color} mb-1`}>
              <Icon className="w-4 h-4" />
              <span className="text-xs font-medium">{label}</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">{value}</p>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or email..."
          className="w-full pl-9 pr-4 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-400 shadow-sm"
        />
      </div>

      {/* Learner grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-44 rounded-2xl" />)}
        </div>
      ) : learners.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <div className="w-16 h-16 bg-orange-50 rounded-2xl flex items-center justify-center">
            <GraduationCap className="w-8 h-8 text-orange-300" />
          </div>
          <p className="text-gray-500 font-medium">No learners found</p>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-gradient-to-r from-orange-500 to-amber-500 rounded-xl hover:opacity-90"
          >
            <Plus className="w-4 h-4" /> Register first learner
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {learners.map((learner) => (
            <LearnerCard
              key={learner.id}
              learner={learner}
              onEdit={() => setEditLearner(learner)}
              onDelete={() => handleDelete(learner.id, learner.name)}
              onProfile={() => setProfileId(learner.id)}
            />
          ))}
        </div>
      )}

      {/* Modals & Drawer */}
      {showAddModal && (
        <LearnerModal
          mode="add"
          onClose={() => setShowAddModal(false)}
          onSuccess={() => {
            setShowAddModal(false);
            qc.invalidateQueries({ queryKey: ['learners'] });
            qc.invalidateQueries({ queryKey: ['learner-stats'] });
          }}
        />
      )}
      {editLearner && (
        <LearnerModal
          mode="edit"
          learner={editLearner}
          onClose={() => setEditLearner(null)}
          onSuccess={() => {
            setEditLearner(null);
            qc.invalidateQueries({ queryKey: ['learners'] });
          }}
        />
      )}
      {profileId && (
        <LearnerProfileDrawer
          learnerId={profileId}
          onClose={() => setProfileId(null)}
          onEdit={(l) => { setProfileId(null); setEditLearner(l); }}
        />
      )}
    </div>
  );
}

// ── Learner Card ──────────────────────────────────────────────────────────────
function LearnerCard({ learner, onEdit, onDelete, onProfile }: {
  learner: Learner;
  onEdit: () => void;
  onDelete: () => void;
  onProfile: () => void;
}) {
  const initials = learner.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  const AVATAR_COLORS = [
    'from-orange-400 to-amber-500',
    'from-blue-400 to-cyan-500',
    'from-purple-400 to-pink-500',
    'from-emerald-400 to-teal-500',
    'from-rose-400 to-orange-500',
  ];
  const colorIdx = learner.name.charCodeAt(0) % AVATAR_COLORS.length;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all duration-200 p-5 flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${AVATAR_COLORS[colorIdx]} flex items-center justify-center text-white font-bold text-base shrink-0`}>
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-gray-900 text-base truncate">{learner.name}</h3>
          <p className="text-xs text-gray-500 truncate flex items-center gap-1 mt-0.5">
            <Mail className="w-3 h-3" /> {learner.email}
          </p>
          <p className="text-[10px] text-gray-400 mt-0.5">
            Joined {format(new Date(learner.createdAt), 'dd MMM yyyy')}
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-orange-50 rounded-xl p-2 text-center">
          <p className="text-base font-bold text-gray-900">{learner.enrollmentCount}</p>
          <p className="text-[10px] text-gray-500">Courses</p>
        </div>
        <div className="bg-emerald-50 rounded-xl p-2 text-center">
          <p className="text-base font-bold text-gray-900">{learner.activeBatches}</p>
          <p className="text-[10px] text-gray-500">Active</p>
        </div>
        <div className="bg-blue-50 rounded-xl p-2 text-center">
          <p className="text-base font-bold text-gray-900">{learner.avgCompletion}%</p>
          <p className="text-[10px] text-gray-500">Progress</p>
        </div>
      </div>

      {/* Progress bar */}
      <div>
        <div className="flex justify-between text-[10px] text-gray-400 mb-1">
          <span>Avg Completion</span>
          <span className="font-medium">{learner.avgCompletion}%</span>
        </div>
        <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              learner.avgCompletion >= 80 ? 'bg-emerald-400' :
              learner.avgCompletion >= 50 ? 'bg-orange-400' : 'bg-amber-400'
            }`}
            style={{ width: `${learner.avgCompletion}%` }}
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={onProfile}
          className="flex-1 py-2 text-sm font-semibold text-white bg-gradient-to-r from-orange-500 to-amber-500 rounded-xl hover:opacity-90 transition-opacity flex items-center justify-center gap-1.5"
        >
          Profile <ChevronRight className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={onEdit}
          className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-colors border border-transparent hover:border-blue-100"
          title="Edit"
        >
          <Edit className="w-4 h-4" />
        </button>
        <button
          onClick={onDelete}
          className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors border border-transparent hover:border-red-100"
          title="Remove learner"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// ── Learner Modal (Add / Edit) ────────────────────────────────────────────────
function LearnerModal({ mode, learner, onClose, onSuccess }: {
  mode: 'add' | 'edit';
  learner?: Learner;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<LearnerForm>({
    resolver: zodResolver(learnerSchema),
    defaultValues: mode === 'edit' && learner
      ? { name: learner.name, email: learner.email, password: '' }
      : { name: '', email: '', password: '' },
  });

  async function onSubmit(values: LearnerForm) {
    try {
      const payload = { ...values };
      if (!payload.password) delete payload.password;
      if (mode === 'add') {
        await api.post('/learners', payload);
        toast.success('Learner registered!');
      } else {
        await api.put(`/learners/${learner!.id}`, payload);
        toast.success('Learner updated!');
      }
      onSuccess();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(e?.response?.data?.message ?? 'Something went wrong');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-6 border-b">
          <div>
            <h2 className="text-lg font-bold text-gray-900">
              {mode === 'add' ? 'Register Learner' : 'Edit Learner'}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {mode === 'add' ? 'Add a new student to the LMS' : 'Update learner information'}
            </p>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">
          <div>
            <label className={LABEL_CLS}>Full Name *</label>
            <input {...register('name')} placeholder="e.g. Ankit Mehta" className={INPUT_CLS} />
            {errors.name && <p className={ERROR_CLS}>{errors.name.message}</p>}
          </div>
          <div>
            <label className={LABEL_CLS}>Email Address *</label>
            <input {...register('email')} type="email" placeholder="e.g. ankit@vtricks.com" className={INPUT_CLS} />
            {errors.email && <p className={ERROR_CLS}>{errors.email.message}</p>}
          </div>
          <div>
            <label className={LABEL_CLS}>{mode === 'add' ? 'Password *' : 'New Password (leave blank to keep)'}</label>
            <input {...register('password')} type="password" placeholder={mode === 'add' ? 'Min 6 characters' : 'Leave blank to keep current'} className={INPUT_CLS} />
            {errors.password && <p className={ERROR_CLS}>{errors.password.message}</p>}
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200">
              Cancel
            </button>
            <button type="submit" disabled={isSubmitting}
              className="flex-1 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-orange-500 to-amber-500 rounded-xl hover:opacity-90 disabled:opacity-60 flex items-center justify-center gap-2">
              {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {mode === 'add' ? 'Register' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Learner Profile Drawer ────────────────────────────────────────────────────
function LearnerProfileDrawer({ learnerId, onClose, onEdit }: {
  learnerId: string;
  onClose: () => void;
  onEdit: (l: Learner) => void;
}) {
  const [tab, setTab] = useState<'profile' | 'batches' | 'progress'>('profile');

  const { data: learner, isLoading } = useQuery({
    queryKey: ['learner', learnerId],
    queryFn:  () => fetchLearner(learnerId),
  });

  if (isLoading || !learner) {
    return (
      <div className="fixed inset-0 z-50 flex justify-end">
        <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
        <div className="relative w-full max-w-md bg-white h-full flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
        </div>
      </div>
    );
  }

  const initials = learner.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  // Derive skill categories from enrolled courses
  const skills = [...new Set(learner.enrollments.map(e => e.category))];

  const TABS = [
    { key: 'profile',  label: 'Profile' },
    { key: 'batches',  label: 'Batch Mapping' },
    { key: 'progress', label: 'Progress' },
  ] as const;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white h-full shadow-2xl flex flex-col">

        {/* Header */}
        <div className="p-6 border-b bg-gradient-to-r from-orange-50 to-amber-50 shrink-0">
          <div className="flex justify-end mb-3">
            <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-white/60 rounded-lg">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-orange-400 to-amber-500 flex items-center justify-center text-white font-bold text-2xl shrink-0">
              {initials}
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">{learner.name}</h2>
              <p className="text-sm text-gray-500 flex items-center gap-1 mt-0.5">
                <Mail className="w-3.5 h-3.5" /> {learner.email}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                Joined {format(new Date(learner.createdAt), 'dd MMM yyyy')}
              </p>
            </div>
          </div>
        </div>

        {/* Stats strip */}
        <div className="grid grid-cols-3 gap-3 p-4 border-b shrink-0">
          {[
            { label: 'Courses',   value: learner.enrollmentCount, icon: BookOpen,   color: 'text-orange-600' },
            { label: 'Active',    value: learner.activeBatches,   icon: PlayCircle, color: 'text-emerald-600' },
            { label: 'Avg %',     value: `${learner.avgCompletion}%`, icon: TrendingUp, color: 'text-blue-600' },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="bg-gray-50 rounded-xl p-3 text-center border border-gray-100">
              <Icon className={`w-4 h-4 ${color} mx-auto mb-1`} />
              <p className="text-xl font-bold text-gray-900">{value}</p>
              <p className="text-[10px] text-gray-500">{label}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex border-b shrink-0">
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex-1 py-3 text-xs font-medium transition-colors ${
                tab === key ? 'border-b-2 border-orange-500 text-orange-600' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto p-5">
          {tab === 'profile'  && <ProfileTab  learner={learner} skills={skills} />}
          {tab === 'batches'  && <BatchMapTab learnerId={learnerId} learner={learner} />}
          {tab === 'progress' && <ProgressTab learner={learner} />}
        </div>

        {/* Footer */}
        <div className="p-4 border-t shrink-0">
          <button
            onClick={() => onEdit(learner)}
            className="w-full py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-orange-500 to-amber-500 rounded-xl hover:opacity-90 flex items-center justify-center gap-2"
          >
            <Edit className="w-4 h-4" /> Edit Learner
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Profile Tab ───────────────────────────────────────────────────────────────
function ProfileTab({ learner, skills }: { learner: LearnerDetail; skills: string[] }) {
  return (
    <div className="space-y-5">
      {/* Details */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Learner Details</h3>
        <div className="space-y-1">
          {[
            { label: 'Full Name',    value: learner.name },
            { label: 'Email',        value: learner.email },
            { label: 'Joined',       value: format(new Date(learner.createdAt), 'dd MMMM yyyy') },
            { label: 'Enrollments',  value: `${learner.enrollmentCount} course(s)` },
            { label: 'Active Batches', value: `${learner.activeBatches} batch(es)` },
            { label: 'Avg Progress', value: `${learner.avgCompletion}%` },
          ].map(({ label, value }) => (
            <div key={label} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
              <span className="text-sm text-gray-500">{label}</span>
              <span className="text-sm font-medium text-gray-800 text-right max-w-[60%] truncate">{value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Skill Profile — categories from enrolled courses */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-2">Skill Profile</h3>
        {skills.length === 0 ? (
          <p className="text-xs text-gray-400 py-2">No courses enrolled yet.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {skills.map((s) => (
              <span key={s} className="px-3 py-1 text-xs font-medium bg-orange-50 text-orange-700 border border-orange-100 rounded-full">
                {s}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Recent activity */}
      {learner.enrollments.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Recent Enrollments</h3>
          <div className="space-y-2">
            {learner.enrollments.slice(0, 3).map((e) => {
              const cfg = BATCH_STATUS[e.batchStatus] ?? BATCH_STATUS['COMPLETED'];
              return (
                <div key={e.enrollmentId} className="flex items-center gap-3 p-2.5 bg-gray-50 rounded-xl border border-gray-100">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-gray-800 truncate">{e.courseTitle}</p>
                    <p className="text-[10px] text-gray-500">{e.batchName}</p>
                  </div>
                  <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${cfg.bg} ${cfg.color}`}>
                    {cfg.icon} {cfg.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Batch Mapping Tab ─────────────────────────────────────────────────────────
function BatchMapTab({ learnerId, learner }: { learnerId: string; learner: LearnerDetail }) {
  const qc = useQueryClient();
  const [showAssignPanel, setShowAssignPanel] = useState(false);

  const { data: available = [], isLoading: loadingAvail } = useQuery({
    queryKey: ['learner-available-batches', learnerId],
    queryFn:  () => fetchAvailableBatches(learnerId),
    enabled:  showAssignPanel,
  });

  const assignMutation = useMutation({
    mutationFn: (batchId: string) => api.post(`/learners/${learnerId}/batches`, { batchId }),
    onSuccess: () => {
      toast.success('Enrolled in batch!');
      qc.invalidateQueries({ queryKey: ['learner', learnerId] });
      qc.invalidateQueries({ queryKey: ['learner-available-batches', learnerId] });
      qc.invalidateQueries({ queryKey: ['learners'] });
      qc.invalidateQueries({ queryKey: ['learner-stats'] });
    },
    onError: (err: unknown) => {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(e?.response?.data?.message ?? 'Failed to enroll');
    },
  });

  const removeMutation = useMutation({
    mutationFn: (batchId: string) => api.delete(`/learners/${learnerId}/batches/${batchId}`),
    onSuccess: () => {
      toast.success('Removed from batch');
      qc.invalidateQueries({ queryKey: ['learner', learnerId] });
      qc.invalidateQueries({ queryKey: ['learner-available-batches', learnerId] });
      qc.invalidateQueries({ queryKey: ['learners'] });
    },
    onError: () => toast.error('Failed to remove'),
  });

  const enrollments = learner.enrollments;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">
          Current Batches <span className="text-gray-400 font-normal">({enrollments.length})</span>
        </h3>
        <button
          onClick={() => setShowAssignPanel(v => !v)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-gradient-to-r from-orange-500 to-amber-500 rounded-lg hover:opacity-90"
        >
          <UserPlus className="w-3.5 h-3.5" />
          {showAssignPanel ? 'Hide' : 'Assign Batch'}
        </button>
      </div>

      {/* Assign panel */}
      {showAssignPanel && (
        <div className="bg-orange-50 rounded-xl border border-orange-100 p-4">
          <p className="text-xs font-semibold text-orange-700 mb-3">Available Batches</p>
          {loadingAvail ? (
            <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-orange-400" /></div>
          ) : available.length === 0 ? (
            <p className="text-xs text-gray-500 text-center py-2">No available batches (all full or already enrolled)</p>
          ) : (
            <div className="space-y-2 max-h-52 overflow-y-auto">
              {available.map((b) => (
                <div key={b.id} className="flex items-center justify-between p-2.5 bg-white rounded-lg border border-orange-100">
                  <div>
                    <p className="text-sm font-medium text-gray-800">{b.name}</p>
                    <p className="text-xs text-gray-500">{b.courseTitle} · {b.enrolledCount}/{b.capacity} enrolled</p>
                  </div>
                  <button
                    onClick={() => assignMutation.mutate(b.id)}
                    disabled={assignMutation.isPending}
                    className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-orange-600 bg-orange-50 border border-orange-200 rounded-lg hover:bg-orange-100 disabled:opacity-50"
                  >
                    {assignMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <UserPlus className="w-3 h-3" />}
                    Assign
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Current enrollments */}
      {enrollments.length === 0 ? (
        <div className="text-center py-10 text-gray-400 text-sm">
          <Layers className="w-8 h-8 mx-auto mb-2 opacity-30" />
          Not enrolled in any batch yet.<br />Click "Assign Batch" to map one.
        </div>
      ) : (
        <div className="space-y-2">
          {enrollments.map((e) => {
            const cfg = BATCH_STATUS[e.batchStatus] ?? BATCH_STATUS['COMPLETED'];
            return (
              <div key={e.enrollmentId} className="p-3 bg-gray-50 rounded-xl border border-gray-100">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{e.courseTitle}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{e.batchName}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${cfg.bg} ${cfg.color}`}>
                        {cfg.icon} {cfg.label}
                      </span>
                      <span className="text-[10px] text-gray-400">
                        <Calendar className="w-2.5 h-2.5 inline mr-0.5" />
                        {format(new Date(e.startDate), 'dd MMM')} – {format(new Date(e.endDate), 'dd MMM yyyy')}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-sm font-bold text-gray-700">{e.completionPct}%</span>
                    <button
                      onClick={() => {
                        if (confirm(`Remove ${learner.name} from "${e.batchName}"?`)) {
                          removeMutation.mutate(e.batchId);
                        }
                      }}
                      disabled={removeMutation.isPending}
                      className="p-1 text-gray-400 hover:text-red-500 rounded disabled:opacity-50"
                      title="Remove from batch"
                    >
                      <UserMinus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                {/* Progress bar */}
                <div className="mt-2 w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${e.completionPct >= 80 ? 'bg-emerald-400' : e.completionPct >= 50 ? 'bg-orange-400' : 'bg-amber-400'}`}
                    style={{ width: `${e.completionPct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Progress Tab ──────────────────────────────────────────────────────────────
function ProgressTab({ learner }: { learner: LearnerDetail }) {
  const enrollments = learner.enrollments;

  // Build chart data grouped by course
  const chartData = useMemo(() => {
    const map = new Map<string, { total: number; count: number }>();
    enrollments.forEach(e => {
      const existing = map.get(e.courseTitle) ?? { total: 0, count: 0 };
      map.set(e.courseTitle, { total: existing.total + e.completionPct, count: existing.count + 1 });
    });
    return Array.from(map.entries()).map(([name, v]) => ({
      name: name.length > 18 ? name.slice(0, 16) + '…' : name,
      completion: Math.round(v.total / v.count),
    }));
  }, [enrollments]);

  const COLORS = ['#f97316', '#3b82f6', '#10b981', '#8b5cf6', '#ec4899', '#06b6d4'];

  if (enrollments.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400 text-sm">
        <BarChart2 className="w-8 h-8 mx-auto mb-2 opacity-30" />
        No progress data yet.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Bar chart */}
      {chartData.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Completion by Course</h3>
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} barSize={28}>
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} domain={[0, 100]} />
                <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} formatter={(v: number) => [`${v}%`, 'Completion']} />
                <Bar dataKey="completion" radius={[4, 4, 0, 0]}>
                  {chartData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Avg completion */}
      <div className="p-4 bg-orange-50 rounded-xl border border-orange-100">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold text-orange-700 flex items-center gap-1.5">
            <Award className="w-4 h-4" /> Overall Progress
          </span>
          <span className="text-sm font-bold text-orange-800">{learner.avgCompletion}%</span>
        </div>
        <div className="w-full h-3 bg-orange-100 rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-orange-400 to-amber-500 rounded-full" style={{ width: `${learner.avgCompletion}%` }} />
        </div>
      </div>

      {/* Per-enrollment detail */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-2">Detailed Progress</h3>
        <div className="space-y-2">
          {enrollments.map((e) => (
            <div key={e.enrollmentId} className="p-3 bg-gray-50 rounded-xl border border-gray-100">
              <div className="flex items-center justify-between mb-1.5">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-gray-800 truncate">{e.courseTitle}</p>
                  <p className="text-[10px] text-gray-500">{e.batchName}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-2">
                  <span className="text-sm font-bold text-gray-900">{e.completionPct}%</span>
                  {e.grade && (
                    <span className="text-xs bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded font-medium">{e.grade}</span>
                  )}
                </div>
              </div>
              <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${e.completionPct >= 80 ? 'bg-emerald-400' : e.completionPct >= 50 ? 'bg-orange-400' : 'bg-amber-400'}`}
                  style={{ width: `${e.completionPct}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
