import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useSearchParams } from 'react-router';
import {
  Plus, Search, Users, Calendar, Clock, ChevronRight, X,
  Loader2, Edit, Trash2, BarChart2, BookOpen, CheckCircle2,
  PlayCircle, Timer, TrendingUp, Award, Archive, UserPlus,
  GraduationCap, AlertCircle, UserMinus, ChevronDown, ChevronUp, RotateCcw, FileSpreadsheet, FileText,
} from 'lucide-react';
import { toast } from 'sonner';
import { format, differenceInDays } from 'date-fns';
import { Skeleton } from '../components/ui/skeleton';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import api from '../../lib/axios';
import { useAuth } from '../../store/AuthContext';
import { INPUT_CLS, LABEL_CLS, ERROR_CLS } from '../../lib/constants';
import type { Batch, BatchStatus, Course, AvailableStudent, BatchAnalytics } from '../../types/api';

// ── Zod schema ────────────────────────────────────────────────────────────────
const batchSchema = z.object({
  name:       z.string().min(2, 'Batch name must be at least 2 characters'),
  courseId:   z.string().min(1, 'Course is required'),
  startDate:  z.string().min(1, 'Start date is required'),
  endDate:    z.string().min(1, 'End date is required'),
  capacity:   z.coerce.number().int().min(1, 'Min 1').max(500, 'Max 500'),
  status:     z.enum(['UPCOMING', 'ONGOING', 'COMPLETED']),
});
type BatchForm = z.infer<typeof batchSchema>;

// ── Status config ─────────────────────────────────────────────────────────────
const STATUS_CONFIG: Record<BatchStatus, { label: string; color: string; icon: React.ReactNode; bg: string }> = {
  UPCOMING:  { label: 'Upcoming',  color: 'text-blue-600',    icon: <Timer className="w-3.5 h-3.5" />,        bg: 'bg-blue-50 border-blue-100' },
  ONGOING:   { label: 'Ongoing',   color: 'text-emerald-600', icon: <PlayCircle className="w-3.5 h-3.5" />,   bg: 'bg-emerald-50 border-emerald-100' },
  COMPLETED: { label: 'Completed', color: 'text-gray-500',    icon: <CheckCircle2 className="w-3.5 h-3.5" />, bg: 'bg-gray-50 border-gray-100' },
};

// ── API helpers ───────────────────────────────────────────────────────────────
async function fetchBatches(courseId?: string): Promise<Batch[]> {
  const params: Record<string, string> = {};
  if (courseId) params.courseId = courseId;
  const { data } = await api.get('/batches', { params });
  return data.data ?? [];
}
async function fetchBatch(id: string): Promise<Batch> {
  const { data } = await api.get(`/batches/${id}`);
  return data.data;
}
async function fetchCourses(): Promise<Course[]> {
  const { data } = await api.get('/courses');
  return data.data?.courses ?? data.data ?? [];
}
async function fetchAvailableStudents(batchId: string): Promise<AvailableStudent[]> {
  const { data } = await api.get(`/batches/${batchId}/students/available`);
  return data.data ?? [];
}
async function fetchAnalytics(batchId: string): Promise<BatchAnalytics> {
  const { data } = await api.get(`/batches/${batchId}/analytics`);
  return data.data;
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function BatchMasterPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const isTrainer = user?.role === 'TRAINER';
  const [searchParams] = useSearchParams();
  const urlCourseId = searchParams.get('courseId') ?? '';
  const urlView     = searchParams.get('view') ?? '';

  const [search, setSearch]               = useState('');
  const [statusFilter, setStatusFilter]   = useState<BatchStatus | 'ALL'>('ALL');
  const [courseFilter, setCourseFilter]   = useState(urlCourseId);
  const [showAddModal, setShowAddModal]   = useState(false);
  const [editBatch, setEditBatch]         = useState<Batch | null>(null);
  const [detailBatchId, setDetailBatchId] = useState<string | null>(null);
  const [showArchived, setShowArchived]   = useState(false);

  useEffect(() => { setCourseFilter(urlCourseId); }, [urlCourseId]);

  const { data: batches = [], isLoading } = useQuery({
    queryKey: ['batches', courseFilter],
    queryFn:  () => fetchBatches(courseFilter || undefined),
  });
  const { data: courses = [] } = useQuery({
    queryKey: ['courses-list'],
    queryFn:  fetchCourses,
  });

  // Auto-open first batch when coming from "Manage Enrollments"
  useEffect(() => {
    if (urlView === 'enrollments' && batches.length > 0 && !detailBatchId) {
      setDetailBatchId(batches[0].id);
    }
  }, [urlView, batches, detailBatchId]);

  // ── Stats ──────────────────────────────────────────────────────────────────
  const stats = useMemo(() => ({
    total:     batches.length,
    ongoing:   batches.filter((b) => b.status === 'ONGOING').length,
    upcoming:  batches.filter((b) => b.status === 'UPCOMING').length,
    completed: batches.filter((b) => b.status === 'COMPLETED').length,
    students:  batches.reduce((acc, b) => acc + (b._count?.enrollments ?? 0), 0),
  }), [batches]);

  // ── Split active vs archived ───────────────────────────────────────────────
  const { activeBatches, archivedBatches } = useMemo(() => {
    const filtered = batches.filter((b) => {
      const matchSearch = !search || b.name.toLowerCase().includes(search.toLowerCase()) ||
        (b.course?.title ?? '').toLowerCase().includes(search.toLowerCase());
      const matchStatus = statusFilter === 'ALL' || b.status === statusFilter;
      return matchSearch && matchStatus;
    });
    return {
      activeBatches:   filtered.filter((b) => b.status !== 'COMPLETED'),
      archivedBatches: filtered.filter((b) => b.status === 'COMPLETED'),
    };
  }, [batches, search, statusFilter]);

  // ── Mutations ──────────────────────────────────────────────────────────────
  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/batches/${id}`),
    onSuccess: () => {
      toast.success('Batch permanently deleted');
      qc.invalidateQueries({ queryKey: ['batches'] });
    },
    onError: () => toast.error('Failed to delete batch'),
  });

  const archiveMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/batches/${id}/archive`),
    onSuccess: () => {
      toast.success('Batch archived');
      qc.invalidateQueries({ queryKey: ['batches'] });
    },
    onError: () => toast.error('Failed to archive batch'),
  });

  const restoreMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/batches/${id}/restore`),
    onSuccess: () => {
      toast.success('Batch restored to upcoming');
      qc.invalidateQueries({ queryKey: ['batches'] });
    },
    onError: () => toast.error('Failed to restore batch'),
  });

  function handleDelete(id: string, name: string) {
    if (confirm(`Permanently delete batch "${name}"? This cannot be undone.`)) {
      deleteMutation.mutate(id);
    }
  }
  function handleArchive(id: string, name: string) {
    if (confirm(`Archive batch "${name}"? It will move to Archived section.`)) {
      archiveMutation.mutate(id);
    }
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Batch Master</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            Schedule, manage and track all learning batches across courses.
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-gradient-to-r from-blue-500 to-cyan-500 rounded-xl hover:opacity-90 transition-opacity shadow-md"
        >
          <Plus className="w-4 h-4" /> Create Batch
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {[
          { label: 'Total Batches',  value: stats.total,     icon: BookOpen,      color: 'text-gray-700',    bg: 'bg-gray-50' },
          { label: 'Ongoing',        value: stats.ongoing,   icon: PlayCircle,    color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'Upcoming',       value: stats.upcoming,  icon: Timer,         color: 'text-blue-600',    bg: 'bg-blue-50' },
          { label: 'Archived',       value: stats.completed, icon: Archive,       color: 'text-gray-500',    bg: 'bg-gray-50' },
          { label: 'Total Students', value: stats.students,  icon: Users,         color: 'text-purple-600',  bg: 'bg-purple-50' },
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

      {/* Search + filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by batch or course name..."
            className="w-full pl-9 pr-4 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 shadow-sm"
          />
        </div>
        <div className="flex gap-1.5 flex-wrap items-center">
          {(['ALL', 'ONGOING', 'UPCOMING', 'COMPLETED'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${
                statusFilter === s
                  ? 'bg-blue-500 text-white border-blue-500 shadow-sm'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
              }`}
            >
              {s === 'ALL' ? 'All' : s === 'COMPLETED' ? 'Archived' : s.charAt(0) + s.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
        <select
          value={courseFilter}
          onChange={(e) => setCourseFilter(e.target.value)}
          className="text-sm bg-white border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/30 shadow-sm"
        >
          <option value="">All Courses</option>
          {courses.map((c) => (
            <option key={c.id} value={c.id}>{c.title}</option>
          ))}
        </select>
      </div>

      {/* Active Batch grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-52 rounded-2xl" />)}
        </div>
      ) : activeBatches.length === 0 && archivedBatches.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center">
            <BookOpen className="w-8 h-8 text-gray-300" />
          </div>
          <p className="text-gray-500 font-medium">No batches found</p>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-gradient-to-r from-blue-500 to-cyan-500 rounded-xl hover:opacity-90"
          >
            <Plus className="w-4 h-4" /> Create first batch
          </button>
        </div>
      ) : (
        <>
          {activeBatches.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {activeBatches.map((batch) => (
                <BatchCard
                  key={batch.id}
                  batch={batch}
                  isTrainer={isTrainer}
                  onEdit={() => setEditBatch(batch)}
                  onDelete={() => handleDelete(batch.id, batch.name)}
                  onArchive={() => handleArchive(batch.id, batch.name)}
                  onProfile={() => setDetailBatchId(batch.id)}
                />
              ))}
            </div>
          )}

          {/* Archived Section */}
          {archivedBatches.length > 0 && (
            <div className="mt-4">
              <button
                onClick={() => setShowArchived((v) => !v)}
                className="flex items-center gap-2 text-sm font-semibold text-gray-600 hover:text-gray-900 transition-colors mb-3"
              >
                <Archive className="w-4 h-4 text-gray-400" />
                Archived Batches
                <span className="bg-gray-200 text-gray-600 text-xs px-2 py-0.5 rounded-full">{archivedBatches.length}</span>
                {showArchived ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
              {showArchived && (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 opacity-80">
                  {archivedBatches.map((batch) => (
                    <BatchCard
                      key={batch.id}
                      batch={batch}
                      isTrainer={isTrainer}
                      onEdit={() => setEditBatch(batch)}
                      onDelete={() => handleDelete(batch.id, batch.name)}
                      onArchive={() => {}}
                      onRestore={() => restoreMutation.mutate(batch.id)}
                      onProfile={() => setDetailBatchId(batch.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Modals */}
      {showAddModal && (
        <AddBatchModal
          courses={courses}
          onClose={() => setShowAddModal(false)}
          onSuccess={() => {
            setShowAddModal(false);
            qc.invalidateQueries({ queryKey: ['batches'] });
          }}
        />
      )}
      {editBatch && (
        <EditBatchModal
          batch={editBatch}
          courses={courses}
          isTrainer={isTrainer}
          onClose={() => setEditBatch(null)}
          onSuccess={() => {
            setEditBatch(null);
            qc.invalidateQueries({ queryKey: ['batches'] });
          }}
        />
      )}
      {detailBatchId && (
        <BatchProfileDrawer
          batchId={detailBatchId}
          isTrainer={isTrainer}
          initialTab={urlView === 'enrollments' ? 'enrollments' : urlView === 'analytics' ? 'analytics' : 'overview'}
          onClose={() => setDetailBatchId(null)}
          onEdit={(b) => { setDetailBatchId(null); setEditBatch(b); }}
        />
      )}
    </div>
  );
}

// ── Batch Card ────────────────────────────────────────────────────────────────
function BatchCard({ batch, isTrainer, onEdit, onDelete, onArchive, onRestore, onProfile }: {
  batch: Batch;
  isTrainer: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onArchive: () => void;
  onRestore?: () => void;
  onProfile: () => void;
}) {
  const cfg      = STATUS_CONFIG[batch.status];
  const enrolled = batch._count?.enrollments ?? 0;
  const fillPct  = batch.capacity > 0 ? Math.min(100, Math.round((enrolled / batch.capacity) * 100)) : 0;
  const isArchived = batch.status === 'COMPLETED';

  return (
    <div className={`bg-white rounded-2xl border shadow-sm hover:shadow-md transition-all duration-200 p-5 flex flex-col gap-3 ${isArchived ? 'border-gray-100 grayscale-[20%]' : 'border-gray-100'}`}>
      {/* Header row */}
      <div className="flex items-start gap-3">
        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-white font-bold text-lg shrink-0 ${isArchived ? 'bg-gray-300' : 'bg-gradient-to-br from-blue-400 to-cyan-500'}`}>
          {batch.name.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-gray-900 text-base leading-snug truncate">{batch.name}</h3>
          <p className="text-xs text-gray-500 truncate flex items-center gap-1 mt-0.5">
            <BookOpen className="w-3 h-3" /> {batch.course?.title ?? '—'}
          </p>
          <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full mt-1 border ${cfg.bg} ${cfg.color}`}>
            {cfg.icon} {cfg.label}
          </span>
        </div>
      </div>

      {/* Date + capacity */}
      <div className="flex flex-col gap-1.5 text-xs text-gray-600">
        <div className="flex items-center gap-2">
          <Calendar className="w-3.5 h-3.5 text-gray-400" />
          <span>{format(new Date(batch.startDate), 'dd MMM yyyy')} → {format(new Date(batch.endDate), 'dd MMM yyyy')}</span>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-2 pt-1">
        <div className="bg-blue-50 rounded-xl p-2.5 text-center">
          <p className="text-lg font-bold text-gray-900">{enrolled}</p>
          <p className="text-[10px] text-gray-500">Students</p>
        </div>
        <div className="bg-purple-50 rounded-xl p-2.5 text-center">
          <p className="text-lg font-bold text-gray-900">{batch.capacity}</p>
          <p className="text-[10px] text-gray-500">Capacity</p>
        </div>
      </div>

      {/* Capacity fill bar */}
      <div>
        <div className="flex justify-between text-[10px] text-gray-400 mb-1">
          <span>Capacity Fill</span>
          <span className="font-medium">{fillPct}%</span>
        </div>
        <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              fillPct >= 90 ? 'bg-red-400' : fillPct >= 70 ? 'bg-amber-400' : 'bg-blue-400'
            }`}
            style={{ width: `${fillPct}%` }}
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={onProfile}
          className="flex-1 py-2 text-sm font-semibold text-white bg-gradient-to-r from-blue-500 to-cyan-500 rounded-xl hover:opacity-90 transition-opacity flex items-center justify-center gap-1.5"
        >
          View <ChevronRight className="w-3.5 h-3.5" />
        </button>
        {!isArchived && (
          <button
            onClick={onEdit}
            className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-colors border border-transparent hover:border-blue-100"
            title="Edit"
          >
            <Edit className="w-4 h-4" />
          </button>
        )}
        {!isArchived && (
          <button
            onClick={onArchive}
            className="p-2 text-gray-500 hover:text-amber-600 hover:bg-amber-50 rounded-xl transition-colors border border-transparent hover:border-amber-100"
            title="Archive"
          >
            <Archive className="w-4 h-4" />
          </button>
        )}
        {isArchived && onRestore && (
          <button
            onClick={onRestore}
            className="p-2 text-gray-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-colors border border-transparent hover:border-emerald-100"
            title="Restore to Upcoming"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        )}
        {!isTrainer && (
          <button
            onClick={onDelete}
            className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors border border-transparent hover:border-red-100"
            title="Delete permanently"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}

// ── Add Batch Modal ───────────────────────────────────────────────────────────
function AddBatchModal({ courses, onClose, onSuccess }: {
  courses: Course[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const {
    register, handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<BatchForm>({
    resolver: zodResolver(batchSchema),
    defaultValues: { capacity: 30, status: 'UPCOMING' },
  });

  async function onSubmit(values: BatchForm) {
    try {
      await api.post('/batches', values);
      toast.success('Batch created!');
      onSuccess();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(e?.response?.data?.message ?? 'Something went wrong');
    }
  }

  return (
    <BatchFormModal
      title="Create Batch"
      subtitle="Schedule a new learning batch"
      onClose={onClose}
      onSubmit={onSubmit}
      register={register}
      errors={errors}
      isSubmitting={isSubmitting}
      handleSubmit={handleSubmit}
      courses={courses}
      submitLabel="Create Batch"
    />
  );
}

// ── Edit Batch Modal ──────────────────────────────────────────────────────────
function EditBatchModal({ batch, courses, isTrainer, onClose, onSuccess }: {
  batch: Batch;
  courses: Course[];
  isTrainer: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const {
    register, handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<BatchForm>({
    resolver: zodResolver(batchSchema),
    defaultValues: {
      name:      batch.name,
      courseId:  batch.courseId,
      startDate: batch.startDate.split('T')[0],
      endDate:   batch.endDate.split('T')[0],
      capacity:  batch.capacity,
      status:    batch.status,
    },
  });

  async function onSubmit(values: BatchForm) {
    try {
      await api.put(`/batches/${batch.id}`, values);
      toast.success('Batch updated!');
      onSuccess();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(e?.response?.data?.message ?? 'Something went wrong');
    }
  }

  return (
    <BatchFormModal
      title="Edit Batch"
      subtitle="Update batch details"
      onClose={onClose}
      onSubmit={onSubmit}
      register={register}
      errors={errors}
      isSubmitting={isSubmitting}
      handleSubmit={handleSubmit}
      courses={courses}
      submitLabel="Save Changes"
      isTrainer={isTrainer}
    />
  );
}

// ── Shared Form Modal ─────────────────────────────────────────────────────────
interface BatchFormModalProps {
  title: string;
  subtitle: string;
  onClose: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onSubmit: (values: any) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  register: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  errors: any;
  isSubmitting: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handleSubmit: any;
  courses: Course[];
  submitLabel: string;
  isTrainer?: boolean;
}

function BatchFormModal({ title, subtitle, onClose, onSubmit, register, errors, isSubmitting, handleSubmit, courses, submitLabel, isTrainer }: BatchFormModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b">
          <div>
            <h2 className="text-lg font-bold text-gray-900">{title}</h2>
            <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">
          <div>
            <label className={LABEL_CLS}>Batch Name *</label>
            <input {...register('name')} placeholder="e.g. MERN Batch — Jun 2025" className={INPUT_CLS} />
            {errors.name && <p className={ERROR_CLS}>{errors.name.message}</p>}
          </div>

          <div>
            <label className={LABEL_CLS}>Course *</label>
            <select {...register('courseId')} className={INPUT_CLS}>
              <option value="">Select a course</option>
              {courses.filter(c => c.status !== 'ARCHIVED').map((c) => (
                <option key={c.id} value={c.id}>{c.title}</option>
              ))}
            </select>
            {errors.courseId && <p className={ERROR_CLS}>{errors.courseId.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL_CLS}>Start Date *</label>
              <input {...register('startDate')} type="date" className={INPUT_CLS} />
              {errors.startDate && <p className={ERROR_CLS}>{errors.startDate.message}</p>}
            </div>
            <div>
              <label className={LABEL_CLS}>End Date *</label>
              <input {...register('endDate')} type="date" className={INPUT_CLS} />
              {errors.endDate && <p className={ERROR_CLS}>{errors.endDate.message}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL_CLS}>Capacity *</label>
              <input {...register('capacity')} type="number" min={1} max={500} className={INPUT_CLS} />
              {errors.capacity && <p className={ERROR_CLS}>{errors.capacity.message}</p>}
            </div>
            <div>
              <label className={LABEL_CLS}>Status</label>
              <select {...register('status')} className={INPUT_CLS}>
                <option value="UPCOMING">Upcoming</option>
                <option value="ONGOING">Ongoing</option>
                {!isTrainer && <option value="COMPLETED">Completed</option>}
              </select>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200">
              Cancel
            </button>
            <button type="submit" disabled={isSubmitting}
              className="flex-1 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-blue-500 to-cyan-500 rounded-xl hover:opacity-90 disabled:opacity-60 flex items-center justify-center gap-2">
              {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Batch Profile Drawer ──────────────────────────────────────────────────────
function BatchProfileDrawer({ batchId, isTrainer, initialTab, onClose, onEdit }: {
  batchId: string;
  isTrainer: boolean;
  initialTab: 'overview' | 'enrollments' | 'analytics' | 'syllabus';
  onClose: () => void;
  onEdit: (b: Batch) => void;
}) {
  const [tab, setTab] = useState<'overview' | 'enrollments' | 'analytics' | 'syllabus'>(initialTab);

  const { data: batch, isLoading } = useQuery({
    queryKey: ['batch', batchId],
    queryFn:  () => fetchBatch(batchId),
  });

  if (isLoading || !batch) {
    return (
      <div className="fixed inset-0 z-50 flex justify-end">
        <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
        <div className="relative w-full max-w-lg bg-white h-full p-6 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        </div>
      </div>
    );
  }

  const cfg        = STATUS_CONFIG[batch.status];
  const enrolled   = batch.enrollments?.length ?? 0;
  const avgCompl   = enrolled > 0
    ? Math.round(batch.enrollments!.reduce((s, e) => s + e.completionPct, 0) / enrolled) : 0;
  const daysLeft   = differenceInDays(new Date(batch.endDate), new Date());
  const totalDays  = differenceInDays(new Date(batch.endDate), new Date(batch.startDate));
  const elapsed    = totalDays - Math.max(0, daysLeft);
  const timelinePct = totalDays > 0 ? Math.min(100, Math.round((elapsed / totalDays) * 100)) : 0;
  const isArchived  = batch.status === 'COMPLETED';

  const TABS = [
    { key: 'overview',    label: 'Overview' },
    { key: 'enrollments', label: 'Enrollments' },
    { key: 'analytics',   label: 'Analytics' },
    { key: 'syllabus',    label: 'Syllabus' },
  ] as const;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white h-full shadow-2xl flex flex-col">

        {/* Header */}
        <div className="p-6 border-b bg-gradient-to-r from-blue-50 to-cyan-50 shrink-0">
          <div className="flex justify-end mb-3">
            <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-white/60 rounded-lg">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex items-center gap-4">
            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-white font-bold text-2xl shrink-0 ${isArchived ? 'bg-gray-300' : 'bg-gradient-to-br from-blue-400 to-cyan-500'}`}>
              {batch.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">{batch.name}</h2>
              <p className="text-sm text-gray-500 flex items-center gap-1 mt-0.5">
                <BookOpen className="w-3.5 h-3.5" /> {batch.course?.title}
              </p>
              <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full mt-1 border ${cfg.bg} ${cfg.color}`}>
                {cfg.icon} {cfg.label}
              </span>
            </div>
          </div>
        </div>

        {/* Quick stats */}
        <div className="grid grid-cols-3 gap-3 p-4 border-b shrink-0">
          {[
            { label: 'Enrolled',      value: enrolled,            icon: Users,       color: 'text-blue-600' },
            { label: 'Capacity',      value: batch.capacity,      icon: AlertCircle, color: 'text-purple-600' },
            { label: 'Avg Progress',  value: `${avgCompl}%`,      icon: TrendingUp,  color: 'text-emerald-600' },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="bg-gray-50 rounded-xl p-3 text-center border border-gray-100">
              <Icon className={`w-4 h-4 ${color} mx-auto mb-1`} />
              <p className="text-xl font-bold text-gray-900">{value}</p>
              <p className="text-[10px] text-gray-500">{label}</p>
            </div>
          ))}
        </div>

        {/* Timeline */}
        <div className="px-5 py-3 border-b shrink-0">
          <div className="flex items-center justify-between text-xs text-gray-500 mb-1.5">
            <span>{format(new Date(batch.startDate), 'dd MMM yyyy')}</span>
            <span className={`font-semibold ${daysLeft < 0 ? 'text-gray-400' : daysLeft < 7 ? 'text-red-500' : 'text-gray-500'}`}>
              {daysLeft < 0 ? 'Ended' : `${daysLeft}d remaining`}
            </span>
            <span>{format(new Date(batch.endDate), 'dd MMM yyyy')}</span>
          </div>
          <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-blue-400 to-cyan-400 rounded-full" style={{ width: `${timelinePct}%` }} />
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b shrink-0">
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex-1 py-3 text-xs font-medium transition-colors ${
                tab === key ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Tab content — scrollable */}
        <div className="flex-1 overflow-y-auto p-5">
          {tab === 'overview' && (
            <OverviewTab batch={batch} totalDays={totalDays} cfg={cfg} enrolled={enrolled} avgCompl={avgCompl} />
          )}
          {tab === 'enrollments' && (
            <EnrollmentsTab batchId={batchId} />
          )}
          {tab === 'analytics' && (
            <AnalyticsTab batchId={batchId} />
          )}
          {tab === 'syllabus' && (
            <BatchSyllabusTab batchId={batchId} courseId={batch.courseId} />
          )}
        </div>

        {/* Footer */}
        {!isArchived && (
          <div className="p-4 border-t flex gap-3 shrink-0">
            <button
              onClick={() => onEdit(batch)}
              className="flex-1 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-blue-500 to-cyan-500 rounded-xl hover:opacity-90 flex items-center justify-center gap-2"
            >
              <Edit className="w-4 h-4" /> Edit Batch
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Overview Tab ──────────────────────────────────────────────────────────────
function OverviewTab({ batch, totalDays, cfg, enrolled, avgCompl }: {
  batch: Batch;
  totalDays: number;
  cfg: { label: string; color: string };
  enrolled: number;
  avgCompl: number;
}) {
  return (
    <div className="space-y-3">
      {/* Schedule info */}
      {[
        { label: 'Batch Start',  date: batch.startDate, icon: PlayCircle,   color: 'text-emerald-500' },
        { label: 'Duration',     date: null,            icon: Clock,         color: 'text-blue-500', extra: `${totalDays} days total` },
        { label: 'Batch End',    date: batch.endDate,   icon: CheckCircle2,  color: 'text-gray-400' },
      ].map(({ label, date, icon: Icon, color, extra }) => (
        <div key={label} className="flex items-center gap-4 p-4 bg-gray-50 rounded-xl border border-gray-100">
          <Icon className={`w-5 h-5 ${color} shrink-0`} />
          <div>
            <p className="text-sm font-medium text-gray-700">{label}</p>
            <p className="text-sm text-gray-500">
              {date ? format(new Date(date), 'EEEE, dd MMMM yyyy') : extra}
            </p>
          </div>
        </div>
      ))}

      <div className="space-y-1 mt-2">
        <h3 className="text-sm font-semibold text-gray-700 mb-2">Batch Details</h3>
        {[
          { label: 'Status',          value: cfg.label },
          { label: 'Course',          value: batch.course?.title ?? 'Not assigned' },
          { label: 'Capacity',        value: `${batch.capacity} seats` },
          { label: 'Enrolled',        value: `${enrolled} students` },
          { label: 'Avg Completion',  value: `${avgCompl}%` },
        ].map(({ label, value }) => (
          <div key={label} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
            <span className="text-sm text-gray-500">{label}</span>
            <span className="text-sm font-medium text-gray-800">{value}</span>
          </div>
        ))}
      </div>

      {/* Student progress list */}
      {batch.enrollments && batch.enrollments.length > 0 && (
        <div className="mt-2">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Student Progress</h3>
          <div className="space-y-2">
            {batch.enrollments.map((e) => (
              <div key={e.id} className="p-3 bg-gray-50 rounded-xl border border-gray-100">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm font-medium text-gray-700 truncate">{e.student.name}</span>
                  <span className="text-sm font-bold text-gray-900 shrink-0 ml-2">{e.completionPct}%</span>
                </div>
                <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${e.completionPct >= 80 ? 'bg-emerald-400' : e.completionPct >= 50 ? 'bg-blue-400' : 'bg-amber-400'}`}
                    style={{ width: `${e.completionPct}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Enrollments Tab ───────────────────────────────────────────────────────────
function EnrollmentsTab({ batchId }: { batchId: string }) {
  const qc = useQueryClient();
  const [editEnrollId, setEditEnrollId] = useState<string | null>(null);
  const [editPct, setEditPct] = useState(0);
  const [showAddPanel, setShowAddPanel] = useState(false);

  const { data: batch, isLoading: loadingBatch } = useQuery({
    queryKey: ['batch', batchId],
    queryFn:  () => fetchBatch(batchId),
  });

  const { data: available = [], isLoading: loadingAvail } = useQuery({
    queryKey: ['batch-available', batchId],
    queryFn:  () => fetchAvailableStudents(batchId),
    enabled:  showAddPanel,
  });

  const enrollMutation = useMutation({
    mutationFn: (studentId: string) => api.post(`/batches/${batchId}/enroll`, { studentId }),
    onSuccess: () => {
      toast.success('Student enrolled!');
      qc.invalidateQueries({ queryKey: ['batch', batchId] });
      qc.invalidateQueries({ queryKey: ['batch-available', batchId] });
      qc.invalidateQueries({ queryKey: ['batches'] });
    },
    onError: (err: unknown) => {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(e?.response?.data?.message ?? 'Failed to enroll student');
    },
  });

  const unenrollMutation = useMutation({
    mutationFn: (studentId: string) => api.delete(`/batches/${batchId}/enroll/${studentId}`),
    onSuccess: () => {
      toast.success('Student removed');
      qc.invalidateQueries({ queryKey: ['batch', batchId] });
      qc.invalidateQueries({ queryKey: ['batch-available', batchId] });
      qc.invalidateQueries({ queryKey: ['batches'] });
    },
    onError: () => toast.error('Failed to remove student'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ enrollmentId, completionPct }: { enrollmentId: string; completionPct: number }) =>
      api.put(`/batches/${batchId}/enroll/${enrollmentId}`, { completionPct }),
    onSuccess: () => {
      toast.success('Progress updated!');
      setEditEnrollId(null);
      qc.invalidateQueries({ queryKey: ['batch', batchId] });
    },
    onError: () => toast.error('Failed to update progress'),
  });

  if (loadingBatch) return <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-blue-500" /></div>;

  const enrollments = batch?.enrollments ?? [];

  return (
    <div className="space-y-4">
      {/* Header + Add button */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">
          Enrolled Students <span className="text-gray-400 font-normal">({enrollments.length}/{batch?.capacity ?? 0})</span>
        </h3>
        <button
          onClick={() => setShowAddPanel((v) => !v)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-gradient-to-r from-blue-500 to-cyan-500 rounded-lg hover:opacity-90"
        >
          <UserPlus className="w-3.5 h-3.5" />
          {showAddPanel ? 'Hide' : 'Add Student'}
        </button>
      </div>

      {/* Add student panel */}
      {showAddPanel && (
        <div className="bg-blue-50 rounded-xl border border-blue-100 p-4">
          <p className="text-xs font-semibold text-blue-700 mb-3">Available Students</p>
          {loadingAvail ? (
            <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-blue-400" /></div>
          ) : available.length === 0 ? (
            <p className="text-xs text-gray-500 text-center py-2">All students already enrolled or none available</p>
          ) : (
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {available.map((s) => (
                <div key={s.id} className="flex items-center justify-between p-2.5 bg-white rounded-lg border border-blue-100">
                  <div>
                    <p className="text-sm font-medium text-gray-800">{s.name}</p>
                    <p className="text-xs text-gray-500">{s.email}</p>
                  </div>
                  <button
                    onClick={() => enrollMutation.mutate(s.id)}
                    disabled={enrollMutation.isPending}
                    className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-blue-600 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 disabled:opacity-50"
                  >
                    {enrollMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <UserPlus className="w-3 h-3" />}
                    Enroll
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Enrolled list */}
      {enrollments.length === 0 ? (
        <div className="text-center py-10 text-gray-400 text-sm">
          <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
          No students enrolled yet.<br />Click "Add Student" to enroll.
        </div>
      ) : (
        <div className="space-y-2">
          {enrollments.map((enrollment) => (
            <div key={enrollment.id} className="p-3 bg-gray-50 rounded-xl border border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-sm shrink-0">
                  {enrollment.student.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{enrollment.student.name}</p>
                  <p className="text-xs text-gray-500 truncate">{enrollment.student.email}</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {editEnrollId === enrollment.id ? (
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number" min={0} max={100}
                        value={editPct}
                        onChange={(e) => setEditPct(Number(e.target.value))}
                        className="w-16 text-xs border border-gray-300 rounded-lg px-2 py-1 text-center"
                      />
                      <button
                        onClick={() => updateMutation.mutate({ enrollmentId: enrollment.id, completionPct: editPct })}
                        disabled={updateMutation.isPending}
                        className="px-2 py-1 text-xs font-semibold text-white bg-emerald-500 rounded-lg hover:bg-emerald-600 disabled:opacity-50"
                      >
                        {updateMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Save'}
                      </button>
                      <button onClick={() => setEditEnrollId(null)} className="text-gray-400 hover:text-gray-600">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <span className="text-sm font-bold text-gray-700">{enrollment.completionPct}%</span>
                      <button
                        onClick={() => { setEditEnrollId(enrollment.id); setEditPct(enrollment.completionPct); }}
                        className="p-1 text-gray-400 hover:text-blue-500 rounded"
                        title="Edit progress"
                      >
                        <Edit className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => {
                      if (confirm(`Remove ${enrollment.student.name} from this batch?`)) {
                        unenrollMutation.mutate(enrollment.student.id);
                      }
                    }}
                    disabled={unenrollMutation.isPending}
                    className="p-1 text-gray-400 hover:text-red-500 rounded disabled:opacity-50"
                    title="Remove student"
                  >
                    <UserMinus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              {/* Progress bar */}
              <div className="mt-2 w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${enrollment.completionPct >= 80 ? 'bg-emerald-400' : enrollment.completionPct >= 50 ? 'bg-blue-400' : 'bg-amber-400'}`}
                  style={{ width: `${enrollment.completionPct}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Analytics Tab ─────────────────────────────────────────────────────────────
function AnalyticsTab({ batchId }: { batchId: string }) {
  const { data: analytics, isLoading } = useQuery({
    queryKey: ['batch-analytics', batchId],
    queryFn:  () => fetchAnalytics(batchId),
  });

  if (isLoading) return <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-blue-500" /></div>;
  if (!analytics) return <div className="text-center py-8 text-gray-400 text-sm">No analytics data</div>;

  const BUCKET_COLORS = ['#f87171', '#fb923c', '#facc15', '#4ade80', '#22c55e'];
  const fillPct = analytics.capacity > 0
    ? Math.round((analytics.totalEnrolled / analytics.capacity) * 100) : 0;

  return (
    <div className="space-y-5">
      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: 'Total Enrolled',   value: analytics.totalEnrolled, icon: Users,       color: 'text-blue-600',    bg: 'bg-blue-50' },
          { label: 'Avg Completion',   value: `${analytics.avgCompletion}%`, icon: TrendingUp, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'Fully Completed',  value: analytics.completed100,  icon: Award,       color: 'text-amber-600',   bg: 'bg-amber-50' },
          { label: 'Capacity Fill',    value: `${fillPct}%`,           icon: BarChart2,   color: 'text-purple-600',  bg: 'bg-purple-50' },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className={`${bg} rounded-xl p-3 border border-white/80 shadow-sm`}>
            <div className={`flex items-center gap-1.5 ${color} mb-1`}>
              <Icon className="w-3.5 h-3.5" />
              <span className="text-[10px] font-medium">{label}</span>
            </div>
            <p className="text-xl font-bold text-gray-900">{value}</p>
          </div>
        ))}
      </div>

      {/* Avg completion bar */}
      <div className="p-4 bg-blue-50 rounded-xl border border-blue-100">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold text-blue-700">Batch Average</span>
          <span className="text-sm font-bold text-blue-800">{analytics.avgCompletion}%</span>
        </div>
        <div className="w-full h-3 bg-blue-100 rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-blue-400 to-blue-600 rounded-full" style={{ width: `${analytics.avgCompletion}%` }} />
        </div>
      </div>

      {/* Completion buckets chart */}
      {analytics.completionBuckets.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-gray-700 mb-3">Completion Distribution</h4>
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analytics.completionBuckets} barSize={32}>
                <XAxis dataKey="range" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ borderRadius: 8, fontSize: 12 }}
                  formatter={(v: number) => [`${v} students`, 'Count']}
                />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {analytics.completionBuckets.map((_, i) => (
                    <Cell key={i} fill={BUCKET_COLORS[i % BUCKET_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Student list */}
      {analytics.students.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-gray-700 mb-2">Student Breakdown</h4>
          <div className="space-y-2">
            {analytics.students
              .slice()
              .sort((a, b) => b.completionPct - a.completionPct)
              .map((s) => (
                <div key={s.studentName} className="flex items-center gap-3 p-2.5 bg-gray-50 rounded-lg border border-gray-100">
                  <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-xs shrink-0">
                    {s.studentName.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-gray-800 truncate">{s.studentName}</span>
                      <span className="text-xs font-bold text-gray-900 ml-2 shrink-0">{s.completionPct}%</span>
                    </div>
                    <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${s.completionPct >= 80 ? 'bg-emerald-400' : s.completionPct >= 50 ? 'bg-blue-400' : 'bg-amber-400'}`}
                        style={{ width: `${s.completionPct}%` }}
                      />
                    </div>
                  </div>
                  {s.grade && (
                    <span className="text-xs bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded font-medium shrink-0">{s.grade}</span>
                  )}
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── BatchSyllabusTab ──────────────────────────────────────────────────────────
function BatchSyllabusTab({ batchId, courseId }: { batchId: string; courseId: string }) {
  const qc = useQueryClient();

  // All syllabi for the course
  const { data: syllabi = [], isLoading: loadingSyllabi } = useQuery<import('../../types/api').SyllabusContent[]>({
    queryKey: ['syllabi', courseId],
    queryFn: async () => {
      const { data } = await api.get(`/courses/${courseId}/syllabus`);
      return data.data ?? [];
    },
  });

  // Currently assigned syllabus for this batch
  const { data: assigned, isLoading: loadingAssigned } = useQuery<import('../../types/api').SyllabusContent | null>({
    queryKey: ['batch-syllabus', batchId],
    queryFn: async () => {
      const { data } = await api.get(`/batches/${batchId}/syllabus`);
      return data.data ?? null;
    },
  });

  const assignMut = useMutation({
    mutationFn: (syllabusId: string) => api.post(`/batches/${batchId}/syllabus`, { syllabusId }),
    onSuccess: () => {
      toast.success('Syllabus assigned to batch');
      qc.invalidateQueries({ queryKey: ['batch-syllabus', batchId] });
    },
    onError: () => toast.error('Failed to assign syllabus'),
  });

  if (loadingSyllabi || loadingAssigned) return (
    <div className="space-y-3">
      <div className="h-10 bg-gray-100 rounded-xl animate-pulse" />
      <div className="h-10 bg-gray-100 rounded-xl animate-pulse" />
    </div>
  );

  if (syllabi.length === 0) return (
    <div className="text-center py-10 text-gray-400">
      <FileSpreadsheet className="w-10 h-10 mx-auto mb-2 opacity-30" />
      <p className="text-sm">No syllabus versions uploaded yet.</p>
      <p className="text-xs mt-1">Upload one in Course Master → Syllabus tab.</p>
    </div>
  );

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Currently Assigned</p>
        {assigned ? (
          <div className="flex items-center gap-3 p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
            {assigned.fileType === 'PDF'
              ? <FileText className="w-4 h-4 text-red-400 shrink-0" />
              : <FileSpreadsheet className="w-4 h-4 text-green-500 shrink-0" />}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-800 truncate">{assigned.label ?? assigned.filename}</p>
              <p className="text-xs text-gray-500">{assigned.filename} · {new Date(assigned.createdAt).toLocaleDateString()}</p>
            </div>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-semibold border border-emerald-200">Active</span>
          </div>
        ) : (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-700 font-medium">
            No syllabus assigned — batch will use the latest course syllabus by default.
          </div>
        )}
      </div>

      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Switch Version</p>
        <div className="space-y-1.5">
          {syllabi.map((s, idx) => {
            const isActive = assigned?.id === s.id;
            const isLatest = idx === 0;
            return (
              <div key={s.id}
                className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
                  isActive ? 'border-emerald-300 bg-emerald-50' : 'border-gray-100 bg-white hover:border-gray-200'
                }`}>
                {s.fileType === 'PDF'
                  ? <FileText className="w-4 h-4 text-red-400 shrink-0" />
                  : <FileSpreadsheet className="w-4 h-4 text-green-500 shrink-0" />}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-gray-800 truncate">{s.label ?? s.filename}</p>
                    {isLatest && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 font-semibold shrink-0">Latest</span>}
                  </div>
                  <p className="text-xs text-gray-400">{new Date(s.createdAt).toLocaleDateString()}{s.uploadedByName ? ` by ${s.uploadedByName}` : ''}</p>
                </div>
                {isActive
                  ? <span className="text-[10px] text-emerald-600 font-semibold shrink-0">Active</span>
                  : (
                    <button onClick={() => assignMut.mutate(s.id)}
                      disabled={assignMut.isPending}
                      className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 shrink-0">
                      Use this
                    </button>
                  )
                }
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
