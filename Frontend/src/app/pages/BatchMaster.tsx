import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
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
  Lock, Unlock, Maximize2, Minimize2, Circle, Video, ExternalLink, Link2, X as XIcon, Youtube, PlusCircle, RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';
import { format, differenceInDays } from 'date-fns';
import { Skeleton } from '../components/ui/skeleton';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import api from '../../lib/axios';
import { refreshAfterSessionChange } from '../../lib/lmsCache';
import { useAuth } from '../../store/AuthContext';
import { usePermissions } from '../../store/PermissionsContext';
import { INPUT_CLS, LABEL_CLS, ERROR_CLS } from '../../lib/constants';
import type { Batch, BatchStatus, Course, Program, AvailableStudent, BatchAnalytics } from '../../types/api';

// ── Zod schema ────────────────────────────────────────────────────────────────
const batchSchema = z.object({
  name: z.string().min(2, 'Batch name must be at least 2 characters'),
  programId: z.string().min(1, 'Program is required'),
  trainerId: z.string().optional().or(z.literal('')),
  startDate: z.string().min(1, 'Start date is required'),
  endDate: z.string().min(1, 'End date is required'),
  capacity: z.coerce.number().int().min(1, 'Min 1').max(500, 'Max 500'),
  status: z.enum(['UPCOMING', 'ONGOING', 'COMPLETED']),
  // ── Manual time entry ──────────────────────────────────────────────────────
  classStartTime: z.string().optional(),
  classEndTime: z.string().optional(),
  classDays: z.string().optional(),
  scheduleNotes: z.string().max(300, 'Max 300 characters').optional(),
}).refine((d) => {
  if (d.classStartTime && d.classEndTime && d.classStartTime >= d.classEndTime) return false;
  return true;
}, { message: 'End time must be after start time', path: ['classEndTime'] });
type BatchForm = z.infer<typeof batchSchema>;

// ── Status config ─────────────────────────────────────────────────────────────
const STATUS_CONFIG: Record<BatchStatus, { label: string; color: string; icon: React.ReactNode; bg: string }> = {
  UPCOMING: { label: 'Upcoming', color: 'text-blue-600', icon: <Timer className="w-3.5 h-3.5" />, bg: 'bg-blue-50 border-blue-100' },
  ONGOING: { label: 'Ongoing', color: 'text-emerald-600', icon: <PlayCircle className="w-3.5 h-3.5" />, bg: 'bg-emerald-50 border-emerald-100' },
  COMPLETED: { label: 'Completed', color: 'text-gray-500', icon: <CheckCircle2 className="w-3.5 h-3.5" />, bg: 'bg-gray-50 border-gray-100' },
};

// ── API helpers ───────────────────────────────────────────────────────────────
async function fetchBatches(programId?: string): Promise<Batch[]> {
  const params: Record<string, string> = {};
  if (programId) params.programId = programId;
  const { data } = await api.get('/batches', { params });
  return data.data ?? [];
}
async function fetchPaginatedBatches(programId?: string, page?: number, limit?: number) {
  const params: Record<string, string | number> = {};
  if (programId) params.programId = programId;
  if (page) params.page = page;
  if (limit) params.limit = limit;
  const { data } = await api.get('/batches', { params });
  return data.data as { batches: Batch[], total: number, page: number, totalPages: number };
}
async function fetchBatch(id: string): Promise<Batch> {
  const { data } = await api.get(`/batches/${id}`);
  return data.data;
}
async function fetchPrograms(): Promise<Program[]> {
  const { data } = await api.get('/programs');
  return data.data ?? [];
}
async function fetchTrainersForBatch(): Promise<{ id: string; name: string }[]> {
  const { data } = await api.get('/trainers');
  const raw = data.data;
  return Array.isArray(raw) ? raw : (raw?.trainers ?? raw ?? []);
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
  const { can } = usePermissions();
  const isTrainer = user?.role === 'TRAINER';
  const canEdit = can('canEditBatches');
  const canDelete = can('canDeleteBatches') && !can('canSoftDeleteOnly');
  const [searchParams] = useSearchParams();
  const urlProgramId = searchParams.get('programId') ?? '';
  const urlCourseId = searchParams.get('courseId') ?? '';
  const urlView = searchParams.get('view') ?? '';

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<BatchStatus | 'ALL'>('ALL');
  const [programFilter, setProgramFilter] = useState(urlProgramId);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editBatch, setEditBatch] = useState<Batch | null>(null);
  const [detailBatchId, setDetailBatchId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [page, setPage] = useState(1);
  const limit = 20;

  useEffect(() => { setProgramFilter(urlProgramId); setPage(1); }, [urlProgramId]);

  const { data: paginatedData, isLoading } = useQuery({
    queryKey: ['batches', programFilter, page],
    queryFn: () => fetchPaginatedBatches(programFilter || undefined, page, limit),
  });
  
  const batches = paginatedData?.batches ?? [];
  const totalItems = paginatedData?.total ?? 0;
  const totalPages = paginatedData?.totalPages ?? 1;

  const { data: programs = [] } = useQuery({
    queryKey: ['programs-list'],
    queryFn: fetchPrograms,
  });
  const { data: trainers = [] } = useQuery({
    queryKey: ['trainers-batch'],
    queryFn: fetchTrainersForBatch,
  });

  const [hasAutoOpened, setHasAutoOpened] = useState(false);
  const [hasAutoOpenedCourseLink, setHasAutoOpenedCourseLink] = useState(false);

  const { data: urlCourse } = useQuery<{ id: string; programId?: string; title?: string } | null>({
    queryKey: ['course-for-batch-link', urlCourseId],
    enabled: !!urlCourseId,
    queryFn: async () => {
      const { data } = await api.get(`/courses/${urlCourseId}`);
      return data.data ?? null;
    },
  });

  useEffect(() => {
    if (urlCourseId && urlCourse?.programId && !showAddModal && !hasAutoOpenedCourseLink) {
      setProgramFilter(urlCourse.programId);
      setShowAddModal(true);
      setHasAutoOpenedCourseLink(true);
    }
  }, [urlCourseId, urlCourse, showAddModal, hasAutoOpenedCourseLink]);

  // Auto-open first batch when coming from "Manage Enrollments"
  useEffect(() => {
    if (urlView === 'enrollments' && batches.length > 0 && !detailBatchId && !hasAutoOpened) {
      setDetailBatchId(batches[0].id);
      setHasAutoOpened(true);
    }
  }, [urlView, batches, detailBatchId, hasAutoOpened]);

  // ── Stats ──────────────────────────────────────────────────────────────────
  const stats = useMemo(() => ({
    total: batches.length,
    ongoing: batches.filter((b) => b.status === 'ONGOING').length,
    upcoming: batches.filter((b) => b.status === 'UPCOMING').length,
    completed: batches.filter((b) => b.status === 'COMPLETED').length,
    students: batches.reduce((acc, b) => acc + (b._count?.enrollments ?? 0), 0),
  }), [batches]);

  // ── Split active vs archived ───────────────────────────────────────────────
  const { activeBatches, archivedBatches } = useMemo(() => {
    const filtered = batches.filter((b) => {
      const matchSearch = !search || b.name.toLowerCase().includes(search.toLowerCase()) ||
        (b.program?.name ?? '').toLowerCase().includes(search.toLowerCase());
      const matchStatus = statusFilter === 'ALL' || b.status === statusFilter;
      return matchSearch && matchStatus;
    });
    return {
      activeBatches: filtered.filter((b) => b.status !== 'COMPLETED'),
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
        {canEdit && (
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-gradient-to-r from-blue-500 to-cyan-500 rounded-xl hover:opacity-90 transition-opacity shadow-md"
          >
            <Plus className="w-4 h-4" /> Create Batch
          </button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {[
          { label: 'Total Batches', value: stats.total, icon: BookOpen, color: 'text-gray-700', bg: 'bg-gray-50' },
          { label: 'Ongoing', value: stats.ongoing, icon: PlayCircle, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'Upcoming', value: stats.upcoming, icon: Timer, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'Archived', value: stats.completed, icon: Archive, color: 'text-gray-500', bg: 'bg-gray-50' },
          { label: 'Total Students', value: stats.students, icon: Users, color: 'text-purple-600', bg: 'bg-purple-50' },
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
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${statusFilter === s
                ? 'bg-blue-500 text-white border-blue-500 shadow-sm'
                : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                }`}
            >
              {s === 'ALL' ? 'All' : s === 'COMPLETED' ? 'Archived' : s.charAt(0) + s.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
        <select
          value={programFilter}
          onChange={(e) => setProgramFilter(e.target.value)}
          className="text-sm bg-white border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/30 shadow-sm"
        >
          <option value="">All Programs</option>
          {programs.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
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
          {canEdit && (
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-gradient-to-r from-blue-500 to-cyan-500 rounded-xl hover:opacity-90"
            >
              <Plus className="w-4 h-4" /> Create first batch
            </button>
          )}
        </div>
      ) : (
        <>
          {activeBatches.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {activeBatches.map((batch) => (
                <BatchCard
                  key={batch.id}
                  batch={batch}
                  canEdit={canEdit}
                  canDelete={canDelete}
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
                      canEdit={canEdit}
                      canDelete={canDelete}
                      onEdit={() => setEditBatch(batch)}
                      onDelete={() => handleDelete(batch.id, batch.name)}
                      onArchive={() => { }}
                      onRestore={() => restoreMutation.mutate(batch.id)}
                      onProfile={() => setDetailBatchId(batch.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {totalPages > 1 && (
            <div className="flex justify-center items-center gap-4 mt-6">
              <button
                disabled={page === 1}
                onClick={() => setPage(p => Math.max(1, p - 1))}
                className="px-4 py-2 text-sm font-medium bg-white border border-gray-200 rounded-lg disabled:opacity-50 hover:bg-gray-50 transition-colors"
              >
                Previous
              </button>
              <span className="text-sm text-gray-600 font-medium">Page {page} of {totalPages}</span>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                className="px-4 py-2 text-sm font-medium bg-white border border-gray-200 rounded-lg disabled:opacity-50 hover:bg-gray-50 transition-colors"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}

      {/* Modals */}
      {showAddModal && (
        <AddBatchModal
          programs={programs}
          trainers={trainers}
          initialProgramId={(urlCourse?.programId ?? programFilter) || undefined}
          initialCourseIds={urlCourseId ? [urlCourseId] : undefined}
          onClose={() => setShowAddModal(false)}
          onSuccess={() => {
            setShowAddModal(false);
            qc.invalidateQueries({ queryKey: ['batches'] });
            qc.invalidateQueries({ queryKey: ['batch-courses'] });
            qc.invalidateQueries({ queryKey: ['batch'] });
          }}
        />
      )}
      {editBatch && (
        <EditBatchModal
          batch={editBatch}
          programs={programs}
          trainers={trainers}
          canEdit={canEdit}
          onClose={() => setEditBatch(null)}
          onSuccess={() => {
            setEditBatch(null);
            qc.invalidateQueries({ queryKey: ['batches'] });
            qc.invalidateQueries({ queryKey: ['batch-courses'] });
            qc.invalidateQueries({ queryKey: ['batch'] });
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
function BatchCard({ batch, canEdit, canDelete, onEdit, onDelete, onArchive, onRestore, onProfile }: {
  batch: Batch;
  canEdit: boolean;
  canDelete: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onArchive: () => void;
  onRestore?: () => void;
  onProfile: () => void;
}) {
  const cfg = STATUS_CONFIG[batch.status];
  const enrolled = batch._count?.enrollments ?? 0;
  const fillPct = batch.capacity > 0 ? Math.min(100, Math.round((enrolled / batch.capacity) * 100)) : 0;
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
            <BookOpen className="w-3 h-3" /> {batch.program?.name ?? '—'}
          </p>
          <p className={`text-xs truncate flex items-center gap-1 mt-0.5 ${(batch as any).trainerName ? 'text-teal-600' : 'text-amber-600'}`}>
            <GraduationCap className="w-3 h-3" />
            {(batch as any).trainerName ?? 'No trainer assigned'}
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
            className={`h-full rounded-full transition-all ${fillPct >= 90 ? 'bg-red-400' : fillPct >= 70 ? 'bg-amber-400' : 'bg-blue-400'
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
        {!isArchived && canEdit && (
          <button
            onClick={onEdit}
            className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-colors border border-transparent hover:border-blue-100"
            title="Edit"
          >
            <Edit className="w-4 h-4" />
          </button>
        )}
        {!isArchived && canEdit && (
          <button
            onClick={onArchive}
            className="p-2 text-gray-500 hover:text-amber-600 hover:bg-amber-50 rounded-xl transition-colors border border-transparent hover:border-amber-100"
            title="Archive"
          >
            <Archive className="w-4 h-4" />
          </button>
        )}
        {isArchived && canEdit && onRestore && (
          <button
            onClick={onRestore}
            className="p-2 text-gray-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-colors border border-transparent hover:border-emerald-100"
            title="Restore to Upcoming"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        )}
        {canDelete && (
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
function AddBatchModal({ programs, trainers, initialProgramId, initialCourseIds, onClose, onSuccess }: {
  programs: Program[];
  trainers: { id: string; name: string }[];
  initialProgramId?: string;
  initialCourseIds?: string[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [selectedCourseIds, setSelectedCourseIds] = useState<string[]>(initialCourseIds ?? []);
  const [selectedProgramId, setSelectedProgramId] = useState(initialProgramId ?? '');
  const autoSelectedProgram = useRef('');

  const {
    register, handleSubmit, watch, setValue,
    formState: { errors, isSubmitting },
  } = useForm<BatchForm>({
    resolver: zodResolver(batchSchema),
    defaultValues: {
      capacity: 30,
      status: 'UPCOMING',
      programId: initialProgramId ?? '',
    },
  });

  useEffect(() => {
    if (initialProgramId) setValue('programId', initialProgramId);
  }, [initialProgramId, setValue]);

  useEffect(() => {
    if (initialCourseIds?.length) setSelectedCourseIds(initialCourseIds);
  }, [initialCourseIds]);

  const watchedProgramId = watch('programId');

  const { data: programCourses = [] } = useQuery<{ id: string; title: string; category: string }[]>({
    queryKey: ['program-courses-batch-create', selectedProgramId],
    enabled: !!selectedProgramId,
    queryFn: async () => {
      const { data } = await api.get('/courses', { params: { programId: selectedProgramId, limit: 100 } });
      return data.data?.courses ?? (Array.isArray(data.data) ? data.data : []);
    },
  });

  useEffect(() => {
    setSelectedProgramId(watchedProgramId || '');
    if (!watchedProgramId) {
      setSelectedCourseIds([]);
      autoSelectedProgram.current = '';
    }
  }, [watchedProgramId]);

  // Auto-select all program courses when program is picked (skip when deep-linked with courseId)
  useEffect(() => {
    if (initialCourseIds?.length) return;
    if (!selectedProgramId || programCourses.length === 0) return;
    if (autoSelectedProgram.current === selectedProgramId) return;
    autoSelectedProgram.current = selectedProgramId;
    setSelectedCourseIds(programCourses.map((c) => c.id));
  }, [selectedProgramId, programCourses, initialCourseIds]);

  async function onSubmit(values: BatchForm) {
    if (selectedCourseIds.length === 0) {
      toast.error('Select at least one course for this batch');
      return;
    }
    try {
      await api.post('/batches', { ...values, trainerId: values.trainerId || null, courseIds: selectedCourseIds });
      toast.success(`Batch created with ${selectedCourseIds.length || programCourses.length} course(s) — course content is packaged for this batch and releases when each session is marked Done.`);
      onSuccess();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(e?.response?.data?.message ?? 'Something went wrong');
    }
  }

  return (
    <BatchFormModal
      title="Create Batch"
      subtitle="Pick program & courses — session content releases to students when marked Done"
      onClose={onClose}
      onSubmit={onSubmit}
      register={register}
      errors={errors}
      isSubmitting={isSubmitting}
      handleSubmit={handleSubmit}
      programs={programs}
      trainers={trainers}
      submitLabel="Create Batch"
      selectedProgramId={selectedProgramId}
      selectedCourseIds={selectedCourseIds}
      onCourseToggle={(id) => setSelectedCourseIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])}
      onSelectAllCourses={() => setSelectedCourseIds(programCourses.map((c) => c.id))}
      onClearCourses={() => setSelectedCourseIds([])}
    />
  );
}

// ── Edit Batch Modal ──────────────────────────────────────────────────────────
function EditBatchModal({ batch, programs, trainers, canEdit, onClose, onSuccess }: {
  batch: Batch;
  programs: Program[];
  trainers: { id: string; name: string }[];
  canEdit: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [selectedProgramId, setSelectedProgramId] = useState(batch.programId ?? '');
  const [selectedCourseIds, setSelectedCourseIds] = useState<string[]>([]);

  // Load existing batch courses
  const { data: existingCourses } = useQuery({
    queryKey: ['batch-courses', batch.id],
    queryFn: async () => { const { data } = await api.get(`/batches/${batch.id}/courses`); return (data.data ?? []) as { id: string }[]; },
  });
  useEffect(() => { if (existingCourses?.length) setSelectedCourseIds(existingCourses.map(c => c.id)); }, [existingCourses]);

  const {
    register, handleSubmit, watch,
    formState: { errors, isSubmitting },
  } = useForm<BatchForm>({
    resolver: zodResolver(batchSchema),
    defaultValues: {
      name: batch.name,
      programId: batch.programId,
      trainerId: (batch as any).trainerId ?? '',
      startDate: batch.startDate.split('T')[0],
      endDate: batch.endDate.split('T')[0],
      capacity: batch.capacity,
      status: batch.status,
      classStartTime: (batch as any).classStartTime ?? '',
      classEndTime: (batch as any).classEndTime ?? '',
      classDays: (batch as any).classDays ?? '',
      scheduleNotes: (batch as any).scheduleNotes ?? '',
    },
  });

  const watchedProgramId = watch('programId');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (watchedProgramId !== selectedProgramId) { setSelectedProgramId(watchedProgramId || ''); setSelectedCourseIds([]); } }, [watchedProgramId]);

  async function onSubmit(values: BatchForm) {
    if (selectedCourseIds.length === 0) {
      toast.error('Select at least one course for this batch');
      return;
    }
    try {
      await api.put(`/batches/${batch.id}`, { ...values, trainerId: values.trainerId || null, courseIds: selectedCourseIds });
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
      programs={programs}
      trainers={trainers}
      submitLabel="Save Changes"
      canEdit={canEdit}
      selectedProgramId={selectedProgramId}
      selectedCourseIds={selectedCourseIds}
      onCourseToggle={(id) => setSelectedCourseIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])}
      onClearCourses={() => setSelectedCourseIds([])}
    />
  );
}

// ── Shared Form Modal ─────────────────────────────────────────────────────────
interface BatchFormModalProps {
  title: string;
  subtitle: string;
  onClose: () => void;
  onSubmit: (values: any) => void;
  register: any;
  errors: any;
  isSubmitting: boolean;
  handleSubmit: any;
  programs: Program[];
  trainers: { id: string; name: string }[];
  submitLabel: string;
  canEdit?: boolean;
  selectedProgramId?: string;
  selectedCourseIds?: string[];
  onCourseToggle?: (id: string) => void;
  onSelectAllCourses?: () => void;
  onClearCourses?: () => void;
}

function BatchFormModal({ title, subtitle, onClose, onSubmit, register, errors, isSubmitting, handleSubmit, programs, trainers, submitLabel, canEdit = true, selectedProgramId, selectedCourseIds = [], onCourseToggle, onSelectAllCourses, onClearCourses }: BatchFormModalProps) {
  const { data: programCourses = [] } = useQuery<{ id: string; title: string; category: string }[]>({
    queryKey: ['program-courses-list', selectedProgramId],
    enabled: !!selectedProgramId,
    queryFn: async () => {
      const { data } = await api.get('/courses', { params: { programId: selectedProgramId, limit: 100 } });
      return data.data?.courses ?? (Array.isArray(data.data) ? data.data : []);
    },
  });

  const handleSelectAllCourses = () => {
    if (onSelectAllCourses) {
      onSelectAllCourses();
      return;
    }
    programCourses.forEach((c) => {
      if (!selectedCourseIds.includes(c.id)) onCourseToggle?.(c.id);
    });
  };

  const handleClearCourses = () => {
    if (onClearCourses) {
      onClearCourses();
      return;
    }
    selectedCourseIds.forEach((id) => onCourseToggle?.(id));
  };

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
            <label className={LABEL_CLS}>Program *</label>
            <select {...register('programId')} className={INPUT_CLS}>
              <option value="">Select a program</option>
              {programs.filter(p => p.isActive !== false).map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            {errors.programId && <p className={ERROR_CLS}>{errors.programId.message}</p>}
          </div>

          {/* Course multi-select — maps all pre-uploaded content to this batch */}
          {selectedProgramId && (
            <div>
              <div className="flex items-center justify-between gap-2 mb-1">
                <label className={LABEL_CLS}>
                  Courses *{' '}
                  <span className="text-gray-400 font-normal">(content packages with course; releases on session Done)</span>
                </label>
                {programCourses.length > 0 && (
                  <div className="flex gap-2 text-[11px] font-medium shrink-0">
                    <button type="button" onClick={handleSelectAllCourses} className="text-blue-600 hover:underline">All</button>
                    <button type="button" onClick={handleClearCourses} className="text-gray-500 hover:underline">Clear</button>
                  </div>
                )}
              </div>
              {programCourses.length === 0 ? (
                <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
                  No courses in this program. In <strong>Curriculum Master</strong>, set Power BI (and other courses) under this program, upload content, then return here.
                </p>
              ) : (
                <>
                  <div className="mt-1.5 max-h-44 overflow-y-auto border border-gray-200 rounded-xl divide-y divide-gray-100">
                    {programCourses.map((c) => (
                      <label key={c.id} className="flex items-center gap-3 px-3 py-2.5 hover:bg-blue-50/40 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedCourseIds.includes(c.id)}
                          onChange={() => onCourseToggle?.(c.id)}
                          className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-sm text-gray-800">{c.title}</span>
                        <span className="ml-auto text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">{c.category}</span>
                      </label>
                    ))}
                  </div>
                  <p className="text-xs text-blue-600 mt-1.5 font-medium">
                    {selectedCourseIds.length > 0
                      ? `${selectedCourseIds.length} course${selectedCourseIds.length > 1 ? 's' : ''} selected — enrolled students see each course in their portal`
                      : 'Select at least one course (or leave all checked)'}
                  </p>
                </>
              )}
            </div>
          )}

          {!selectedProgramId && (
            <p className="text-xs text-gray-500 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
              Select a program above to choose courses (e.g. Power BI under Data Science).
            </p>
          )}

          <div>
            <label className={LABEL_CLS}>Trainer</label>
            <select {...register('trainerId')} className={INPUT_CLS}>
              <option value="">No trainer assigned</option>
              {trainers.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
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

          {/* ── Manual Time Entry ─────────────────────────────────────────── */}
          <div className="rounded-xl border border-blue-100 bg-blue-50/40 p-4 space-y-3">
            <p className="text-xs font-semibold text-blue-700 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" /> Class Schedule (optional)
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={LABEL_CLS}>Class Start Time</label>
                <input {...register('classStartTime')} type="time" className={INPUT_CLS} />
              </div>
              <div>
                <label className={LABEL_CLS}>Class End Time</label>
                <input {...register('classEndTime')} type="time" className={INPUT_CLS} />
                {errors.classEndTime && <p className={ERROR_CLS}>{errors.classEndTime.message}</p>}
              </div>
            </div>
            <div>
              <label className={LABEL_CLS}>Class Days</label>
              <input
                {...register('classDays')}
                placeholder="e.g. Mon, Wed, Fri  or  Tue, Thu, Sat"
                className={INPUT_CLS}
              />
            </div>
            <div>
              <label className={LABEL_CLS}>Schedule Notes</label>
              <textarea
                {...register('scheduleNotes')}
                rows={2}
                placeholder="e.g. Online via Zoom · Link shared on WhatsApp group"
                className={INPUT_CLS + ' resize-none'}
              />
              {errors.scheduleNotes && <p className={ERROR_CLS}>{errors.scheduleNotes.message}</p>}
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
                {canEdit && <option value="COMPLETED">Completed</option>}
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
  const [tab, setTab] = useState<'overview' | 'enrollments' | 'analytics' | 'syllabus' | 'sessions'>(initialTab);
  const [maximized, setMaximized] = useState(false);

  const { data: batch, isLoading } = useQuery({
    queryKey: ['batch', batchId],
    queryFn: () => fetchBatch(batchId),
  });

  if (isLoading || !batch) {
    return (
      <div className="fixed inset-0 z-50 flex justify-end">
        <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
        <div className="relative w-full max-w-4xl bg-white h-full p-6 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        </div>
      </div>
    );
  }

  const cfg = STATUS_CONFIG[batch.status];
  const enrolled = batch.enrollments?.length ?? 0;
  const avgCompl = enrolled > 0
    ? Math.round(batch.enrollments!.reduce((s, e) => s + e.completionPct, 0) / enrolled) : 0;
  const daysLeft = differenceInDays(new Date(batch.endDate), new Date());
  const totalDays = differenceInDays(new Date(batch.endDate), new Date(batch.startDate));
  const elapsed = totalDays - Math.max(0, daysLeft);
  const timelinePct = totalDays > 0 ? Math.min(100, Math.round((elapsed / totalDays) * 100)) : 0;
  const isArchived = batch.status === 'COMPLETED';

  const TABS = [
    { key: 'overview', label: 'Overview' },
    { key: 'sessions', label: 'Sessions' },
    { key: 'enrollments', label: 'Enrollments' },
    { key: 'analytics', label: 'Analytics' },
  ] as const;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative w-full bg-white h-full shadow-2xl flex flex-col transition-all duration-200 ${maximized ? 'max-w-full' : 'max-w-4xl'}`}>

        {/* Header */}
        <div className="p-4 border-b bg-gradient-to-r from-blue-50 to-cyan-50 shrink-0">
          <div className="flex justify-end gap-1 mb-1">
            <button onClick={() => setMaximized(m => !m)} title={maximized ? 'Restore' : 'Maximize'}
              className="p-1 text-gray-400 hover:text-gray-600 hover:bg-white/60 rounded-lg">
              {maximized ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
            <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 hover:bg-white/60 rounded-lg">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-lg shrink-0 ${isArchived ? 'bg-gray-300' : 'bg-gradient-to-br from-blue-400 to-cyan-500'}`}>
              {batch.name.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-gray-900 leading-tight">{batch.name}</h2>
                <div className="flex items-center gap-2 mt-0.5">
                  <p className="text-xs text-gray-500 flex items-center gap-1">
                    <BookOpen className="w-3 h-3" /> {batch.program?.name}
                  </p>
                  <span className={`inline-flex items-center gap-1 text-[9px] font-semibold px-1.5 py-0.5 rounded-md border ${cfg.bg} ${cfg.color}`}>
                    {cfg.icon} {cfg.label}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Quick stats */}
        <div className="flex items-center justify-around p-2.5 border-b shrink-0 bg-white">
          {[
            { label: 'Enrolled', value: enrolled, icon: Users, color: 'text-blue-600', bg: 'bg-blue-50' },
            { label: 'Capacity', value: batch.capacity, icon: AlertCircle, color: 'text-purple-600', bg: 'bg-purple-50' },
            { label: 'Avg Progress', value: `${avgCompl}%`, icon: TrendingUp, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          ].map(({ label, value, icon: Icon, color, bg }) => (
            <div key={label} className="flex items-center gap-2 px-4 border-r last:border-0 border-gray-100 flex-1 justify-center">
              <div className={`p-1.5 rounded-lg ${bg} ${color}`}>
                <Icon className="w-3.5 h-3.5" />
              </div>
              <div className="text-left">
                <p className="text-sm font-bold text-gray-900 leading-none">{value}</p>
                <p className="text-[10px] text-gray-500 mt-0.5">{label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Timeline */}
        <div className="px-4 py-2 border-b shrink-0">
          <div className="flex items-center justify-between text-[10px] text-gray-500 mb-1">
            <span>{format(new Date(batch.startDate), 'dd MMM yyyy')}</span>
            <span className={`font-semibold ${daysLeft < 0 ? 'text-gray-400' : daysLeft < 7 ? 'text-red-500' : 'text-gray-500'}`}>
              {daysLeft < 0 ? 'Ended' : `${daysLeft}d remaining`}
            </span>
            <span>{format(new Date(batch.endDate), 'dd MMM yyyy')}</span>
          </div>
          <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-blue-400 to-cyan-400 rounded-full" style={{ width: `${timelinePct}%` }} />
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b shrink-0">
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex-1 py-2 text-[11px] font-semibold transition-colors ${tab === key ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-500 hover:text-gray-700'
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
          {tab === 'sessions' && (
            <SessionsTab batchId={batchId} isTrainer={isTrainer} />
          )}
          {tab === 'enrollments' && (
            <EnrollmentsTab batchId={batchId} />
          )}
          {tab === 'analytics' && (
            <AnalyticsTab batchId={batchId} />
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

// ── Session color palettes (mirrors CourseMaster syllabus exactly) ────────────
const SESS_GRADIENTS = [
  'from-blue-500 to-cyan-500',
  'from-purple-500 to-pink-500',
  'from-emerald-500 to-teal-500',
  'from-orange-500 to-amber-500',
  'from-rose-500 to-red-500',
  'from-indigo-500 to-violet-500',
  'from-cyan-500 to-sky-500',
];
const SESS_BG = [
  'bg-blue-50 border-blue-200 text-blue-700',
  'bg-purple-50 border-purple-200 text-purple-700',
  'bg-emerald-50 border-emerald-200 text-emerald-700',
  'bg-orange-50 border-orange-200 text-orange-700',
  'bg-rose-50 border-rose-200 text-rose-700',
  'bg-indigo-50 border-indigo-200 text-indigo-700',
  'bg-cyan-50 border-cyan-200 text-cyan-700',
];

// ── Sessions tab — Curriculum Master syllabus-style; sections + GMeet links ───────
interface SessionModule {
  id: string; title: string; section: string | null;
  sessionNumber: string | null; sortOrder: number;
  status: 'LOCKED' | 'RELEASED' | 'COMPLETED';
  topics?: string[]; durationMinutes?: number | null;
}

// ── Inline GMeet link editor per session ─────────────────────────────────────
function MeetLinkCell({ moduleId, batchId, initial }: { moduleId: string; batchId: string; initial?: string }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(initial ?? '');

  useEffect(() => { setVal(initial ?? ''); }, [initial]);

  const save = useMutation({
    mutationFn: async (link: string | null) => {
      await api.put(`/student/batches/${batchId}/sessions/${moduleId}/meet-link`, { meetLink: link || null });
      return link;
    },
    onSuccess: (link) => {
      qc.setQueryData(['meet-links', batchId], (old: Record<string, string> | undefined) => {
        const next = { ...(old ?? {}) };
        if (link) next[moduleId] = link;
        else delete next[moduleId];
        return next;
      });
      qc.invalidateQueries({ queryKey: ['meet-links', batchId] });
      setEditing(false);
      toast.success('GMeet link saved');
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Failed to save'),
  });

  const link = initial ?? '';

  if (!editing) {
    return (
      <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
        {link ? (
          <>
            <a href={link} target="_blank" rel="noopener noreferrer"
              className="lms-press lms-tap inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold rounded-xl border border-emerald-200 text-emerald-700 bg-emerald-50/50 hover:bg-emerald-50">
              <Video className="w-3.5 h-3.5" /> Join
            </a>
            <button onClick={() => { setVal(link); setEditing(true); }}
              className="lms-press lms-tap p-1.5 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-xl" title="Edit GMeet">
              <Link2 className="w-3.5 h-3.5" />
            </button>
          </>
        ) : (
          <button onClick={() => { setVal(''); setEditing(true); }}
            className="lms-press lms-tap inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold rounded-xl border border-dashed border-gray-200 text-gray-400 hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50">
            <Video className="w-3.5 h-3.5" /> GMeet
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1 shrink-0 w-full sm:w-auto lms-fade-in" onClick={e => e.stopPropagation()}>
      <input autoFocus value={val} onChange={e => setVal(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') save.mutate(val); if (e.key === 'Escape') setEditing(false); }}
        placeholder="https://meet.google.com/..."
        className="flex-1 sm:w-48 min-w-0 text-[12px] px-2.5 py-1.5 border border-blue-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400/30 bg-white" />
      <button onClick={() => save.mutate(val)} disabled={save.isPending}
        className="lms-press lms-tap p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-xl" title="Save">
        <CheckCircle2 className="w-4 h-4" />
      </button>
      {val && (
        <button onClick={() => save.mutate(null)}
          className="lms-press lms-tap p-1.5 text-rose-500 hover:bg-rose-50 rounded-xl" title="Remove link">
          <XIcon className="w-3.5 h-3.5" />
        </button>
      )}
      <button onClick={() => setEditing(false)} className="lms-press lms-tap p-1.5 text-gray-400 hover:bg-gray-50 rounded-xl" title="Cancel">
        <XIcon className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

// ── Inline YouTube recording link per session ─────────────────────────────────
function RecordingLinkCell({
  moduleId, batchId, sessionTitle, initial,
}: { moduleId: string; batchId: string; sessionTitle: string; initial?: string }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(initial ?? '');

  useEffect(() => { setVal(initial ?? ''); }, [initial]);

  const save = useMutation({
    mutationFn: async (url: string | null) => {
      if (!url) return null;
      const today = new Date().toISOString().slice(0, 10);
      await api.post('/recordings/recordings', {
        moduleId, batchId, title: sessionTitle, youtubeUrl: url,
        recordedDate: today, endTime: '18:00',
      });
      return url;
    },
    onSuccess: (url) => {
      if (url) {
        qc.setQueryData(['batch-recordings', batchId], (old: { moduleId: string; youtubeUrl: string }[] | undefined) => {
          const list = [...(old ?? [])];
          const idx = list.findIndex((r) => r.moduleId === moduleId);
          if (idx >= 0) list[idx] = { ...list[idx], youtubeUrl: url };
          else list.push({ moduleId, youtubeUrl: url });
          return list;
        });
      }
      qc.invalidateQueries({ queryKey: ['batch-recordings', batchId] });
      qc.invalidateQueries({ queryKey: ['content-master-batch', batchId] });
      qc.invalidateQueries({ queryKey: ['content-sessions', batchId] }); // legacy key
      setEditing(false);
      toast.success('Recording link saved');
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Failed to save recording'),
  });

  const link = initial ?? '';

  if (!editing) {
    return (
      <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
        {link ? (
          <>
            <a href={link} target="_blank" rel="noopener noreferrer"
              className="lms-press lms-tap inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold rounded-xl border border-red-200 text-red-600 bg-red-50/40 hover:bg-red-50">
              <Youtube className="w-3.5 h-3.5" /> Rec
            </a>
            <button onClick={() => { setVal(link); setEditing(true); }}
              className="lms-press lms-tap p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-xl" title="Edit recording">
              <Link2 className="w-3.5 h-3.5" />
            </button>
          </>
        ) : (
          <button onClick={() => { setVal(''); setEditing(true); }}
            className="lms-press lms-tap inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold rounded-xl border border-dashed border-gray-200 text-gray-400 hover:border-red-300 hover:text-red-500 hover:bg-red-50">
            <Youtube className="w-3.5 h-3.5" /> Rec
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1 shrink-0 w-full sm:w-auto lms-fade-in" onClick={e => e.stopPropagation()}>
      <input autoFocus value={val} onChange={e => setVal(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && val) save.mutate(val); if (e.key === 'Escape') setEditing(false); }}
        placeholder="YouTube URL..."
        className="flex-1 sm:w-44 min-w-0 text-[12px] px-2.5 py-1.5 border border-red-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-400/30 bg-white" />
      <button onClick={() => val && save.mutate(val)} disabled={save.isPending || !val}
        className="lms-press lms-tap p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-xl" title="Save">
        <CheckCircle2 className="w-4 h-4" />
      </button>
      <button onClick={() => setEditing(false)} className="lms-press lms-tap p-1.5 text-gray-400 hover:bg-gray-50 rounded-xl" title="Cancel">
        <XIcon className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

function SubSessionModal({
  courseId, afterModule, existingModules, onClose, onSuccess,
}: {
  courseId: string;
  afterModule: SessionModule;
  existingModules: SessionModule[];
  onClose: () => void; onSuccess: (sessionKey: string, modules?: SessionModule[]) => void;
}) {
  const parentNum = afterModule.sessionNumber ?? '1';
  const section = afterModule.section ?? '';
  const suggestedNum = useMemo(() => {
    const prefix = `${parentNum}.`;
    const nums = existingModules
      .filter(m => (m.section ?? '') === section && m.sessionNumber?.startsWith(prefix))
      .map(m => parseInt(String(m.sessionNumber).slice(prefix.length).split('.')[0], 10))
      .filter(n => !Number.isNaN(n));
    const next = (nums.length ? Math.max(...nums) : 0) + 1;
    return `${parentNum}.${next}`;
  }, [parentNum, section, existingModules]);

  const [sessionNumber, setSessionNumber] = useState(suggestedNum);
  const [title, setTitle] = useState('');
  const [topics, setTopics] = useState('');
  const [duration, setDuration] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { setSessionNumber(suggestedNum); }, [suggestedNum]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) { toast.error('Title is required'); return; }
    setSaving(true);
    try {
      const { data } = await api.post(`/courses/${courseId}/modules/sub-session`, {
        afterModuleId: afterModule.id,
        sessionNumber: sessionNumber.trim(),
        title: title.trim(),
        section: afterModule.section ?? undefined,
        durationMinutes: duration ? Number(duration) : undefined,
        topics: topics.split('\n').map(t => t.trim()).filter(Boolean),
      });
      toast.success(`Sub-session ${sessionNumber} created`);
      onSuccess(String(parentNum), Array.isArray(data?.data) ? data.data : undefined);
      onClose();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Failed to create sub-session');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/40 backdrop-blur-sm lms-fade-in" onClick={e => e.target === e.currentTarget && onClose()}>
      <form onSubmit={submit} className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full max-w-md p-5 sm:p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-bold text-gray-900 text-base">Add Sub-Session</h3>
            <p className="text-xs text-gray-500 mt-0.5">Under session {afterModule.sessionNumber}: {afterModule.title}</p>
          </div>
          <button type="button" onClick={onClose} className="lms-press p-2 hover:bg-gray-100 rounded-xl"><X className="w-5 h-5" /></button>
        </div>
        <div>
          <label className={LABEL_CLS}>Session # *</label>
          <input className={INPUT_CLS} value={sessionNumber} onChange={e => setSessionNumber(e.target.value)} placeholder="e.g. 1.1" required />
        </div>
        <div>
          <label className={LABEL_CLS}>Title *</label>
          <input className={INPUT_CLS} value={title} onChange={e => setTitle(e.target.value)} placeholder="Sub-topic title" required />
        </div>
        <div>
          <label className={LABEL_CLS}>Topics (one per line)</label>
          <textarea className={INPUT_CLS} rows={3} value={topics} onChange={e => setTopics(e.target.value)} />
        </div>
        <div>
          <label className={LABEL_CLS}>Duration (minutes)</label>
          <input type="number" className={INPUT_CLS} value={duration} onChange={e => setDuration(e.target.value)} min={1} max={480} />
        </div>
        <div className="flex gap-2 pt-1 sticky bottom-0 bg-white pb-1">
          <button type="button" onClick={onClose} className="lms-press flex-1 px-4 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl">Cancel</button>
          <button type="submit" disabled={saving} className="lms-press flex-1 px-4 py-2.5 text-sm font-semibold text-white bg-blue-600 rounded-xl hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />} Create
          </button>
        </div>
      </form>
    </div>
  );
}

function sessionModuleKey(section: string | null | undefined, sessionNumber: string | null | undefined) {
  return `${String(section ?? '').trim()}::${String(sessionNumber ?? '').trim()}`;
}

function resolveSessionModule(
  modules: SessionModule[],
  sheetName: string,
  sessionKey: string,
): SessionModule | undefined {
  const map = new Map<string, SessionModule>();
  for (const m of modules) {
    map.set(sessionModuleKey(m.section, m.sessionNumber), m);
  }
  const exact = map.get(sessionModuleKey(sheetName, sessionKey));
  if (exact) return exact;
  const sheetNorm = sheetName.trim().toLowerCase();
  const keyNorm = sessionKey.trim();
  return modules.find(
    (m) =>
      String(m.sessionNumber ?? '').trim() === keyNorm &&
      String(m.section ?? '').trim().toLowerCase() === sheetNorm,
  );
}

function SessionsTab({ batchId, isTrainer }: { batchId: string; isTrainer: boolean }) {
  const qc = useQueryClient();
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [activeSheetIdx,   setActiveSheetIdx]   = useState(0);
  const [expandedSessions, setExpandedSessions] = useState<Set<string>>(new Set());
  const [subSessionFor, setSubSessionFor] = useState<SessionModule | null>(null);
  const [autoSyncAttempted, setAutoSyncAttempted] = useState(false);

  // Batch courses
  const { data: batchCourses = [] } = useQuery<{ id: string; title: string; colorToken: string }[]>({
    queryKey: ['batch-courses', batchId],
    queryFn: async () => { const { data } = await api.get(`/batches/${batchId}/courses`); return data.data ?? []; },
  });

  const activeCourseId  = selectedCourseId || batchCourses[0]?.id || '';
  const activeCourseIdx = batchCourses.findIndex(c => c.id === activeCourseId);
  const colorIdx        = Math.max(0, activeCourseIdx) % SESS_GRADIENTS.length;

  // Syllabus structured data — same fetch as CourseMaster SyllabusTab
  const { data: syllabi = [], isLoading: syllabusLoading } = useQuery<import('../../types/api').SyllabusContent[]>({
    queryKey: ['syllabi', activeCourseId],
    enabled: !!activeCourseId,
    queryFn: async () => { const { data } = await api.get(`/courses/${activeCourseId}/syllabus`); return data.data ?? []; },
  });
  const structured   = syllabi[0]?.structuredData ?? null;
  const currentSheet = structured?.sheets[activeSheetIdx] ?? null;

  // course_modules — status + module IDs for GMeet/lock/unlock/done
  const {
    data: modules = [],
    isLoading: modulesLoading,
    isError: modulesError,
    refetch: refetchModules,
  } = useQuery<SessionModule[]>({
    queryKey: ['batch-sessions', activeCourseId, batchId],
    enabled: !!activeCourseId && !!batchId,
    queryFn: async () => {
      const { data } = await api.get(`/courses/${activeCourseId}/modules`, { params: { batchId } });
      return data.data ?? data ?? [];
    },
  });

  const syncSyllabusMut = useMutation({
    mutationFn: async () => {
      await api.post(`/courses/${activeCourseId}/syllabus/sync`);
    },
    onSuccess: async () => {
      toast.success('Sessions synced from syllabus');
      setAutoSyncAttempted(true);
      await refetchModules();
      await qc.invalidateQueries({ queryKey: ['batch-sessions', activeCourseId, batchId] });
    },
    onError: (e: any) =>
      toast.error(e?.response?.data?.message ?? 'Failed to sync sessions from syllabus'),
  });

  const expectedSessionCount = useMemo(
    () => structured?.sheets?.reduce((acc, sheet) => acc + (sheet.sessions?.length ?? 0), 0) ?? 0,
    [structured],
  );

  const linkedSessionCount = useMemo(() => {
    if (!structured?.sheets?.length || !modules.length) return 0;
    let linked = 0;
    for (const sheet of structured.sheets) {
      for (const sess of sheet.sessions ?? []) {
        if (resolveSessionModule(modules, sheet.name, String(sess.session))) linked += 1;
      }
    }
    return linked;
  }, [structured, modules]);

  // Production: syllabus often exists in DB but course_modules were never synced
  useEffect(() => {
    if (
      !activeCourseId ||
      syllabusLoading ||
      modulesLoading ||
      syncSyllabusMut.isPending ||
      autoSyncAttempted
    ) return;
    if (expectedSessionCount > 0 && linkedSessionCount === 0) {
      setAutoSyncAttempted(true);
      syncSyllabusMut.mutate();
    }
  }, [
    activeCourseId,
    syllabusLoading,
    modulesLoading,
    expectedSessionCount,
    linkedSessionCount,
    autoSyncAttempted,
    syncSyllabusMut.isPending,
  ]);

  // GMeet links for this batch
  const { data: meetLinks = {} } = useQuery<Record<string, string>>({
    queryKey: ['meet-links', batchId],
    enabled: !!batchId,
    queryFn: async () => { const { data } = await api.get(`/student/batches/${batchId}/meet-links`); return data.data ?? {}; },
  });

  // Recording links for this batch
  const { data: recordings = [] } = useQuery<{ moduleId: string; youtubeUrl: string }[]>({
    queryKey: ['batch-recordings', batchId],
    enabled: !!batchId,
    queryFn: async () => { const { data } = await api.get(`/recordings/batches/${batchId}/recordings`); return data.data ?? []; },
  });
  const recordingMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const r of recordings) map[r.moduleId] = r.youtubeUrl;
    return map;
  }, [recordings]);

  const act = useMutation({
    mutationFn: async ({ id, path, method }: { id: string; path: string; method: 'patch' | 'post' }) => {
      if (!batchId) throw new Error('Batch context required');
      const url = `/courses/${activeCourseId}/modules/${id}/${path}`;
      const payload = { batchId };
      if (method === 'post') {
        const { data } = await api.post(url, payload);
        return data;
      }
      const { data } = await api.patch(url, payload);
      return data;
    },
    onSuccess: async (data: any) => {
      // Apply server payload instantly when it includes the modules list or a single module
      if (Array.isArray(data?.data)) {
        qc.setQueryData(['batch-sessions', activeCourseId, batchId], data.data);
      } else if (data?.data?.id) {
        qc.setQueryData(['batch-sessions', activeCourseId, batchId], (old: SessionModule[] | undefined) => {
          if (!old) return old;
          return old.map((m) => (m.id === data.data.id ? { ...m, ...data.data } : m));
        });
      }
      await refreshAfterSessionChange(qc, { courseId: activeCourseId, batchId });
      const a = data?.releasedAssignmentIds?.length ?? 0;
      const q = data?.releasedQuizIds?.length ?? 0;
      if (a || q) {
        toast.success(
          `${[q && `${q} quiz(zes)`, a && `${a} assignment(s)`].filter(Boolean).join(' & ')} released — students notified via email & WhatsApp`,
        );
      } else if (data?.message) {
        toast.success(data.message);
      }
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Action failed'),
  });

  const deleteSubMut = useMutation({
    mutationFn: (id: string) => api.delete(`/courses/${activeCourseId}/modules/${id}`),
    onSuccess: async (_res, id) => {
      qc.setQueryData(['batch-sessions', activeCourseId, batchId], (old: SessionModule[] | undefined) =>
        old?.filter((m) => m.id !== id) ?? old,
      );
      await refreshAfterSessionChange(qc, { courseId: activeCourseId, batchId });
      toast.success('Sub-session deleted');
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Failed to delete'),
  });

  /** Direct children of a parent session number within the same section (1 → 1.1, 1.2) */
  function getChildSubs(parentNum: string, section: string): SessionModule[] {
    const prefix = `${parentNum}.`;
    return modules
      .filter((m) => {
        const sn = m.sessionNumber ?? '';
        if ((m.section ?? '') !== section || !sn.startsWith(prefix)) return false;
        // direct child only: "1.1" under "1", not "1.1.2" under "1" unless we want deep tree — keep one level
        const rest = sn.slice(prefix.length);
        return rest.length > 0 && !rest.includes('.');
      })
      .sort((a, b) => String(a.sessionNumber).localeCompare(String(b.sessionNumber), undefined, { numeric: true }));
  }

  useEffect(() => {
    if (!selectedCourseId && batchCourses[0]) setSelectedCourseId(batchCourses[0].id);
  }, [batchCourses, selectedCourseId]);

  useEffect(() => { setActiveSheetIdx(0); setExpandedSessions(new Set()); }, [activeCourseId]);

  function toggleSession(key: string) {
    setExpandedSessions(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  }

  if (!batchCourses.length) return (
    <div className="text-center py-12">
      <BookOpen className="w-10 h-10 text-gray-200 mx-auto mb-3" />
      <p className="text-sm font-semibold text-gray-500">No courses linked</p>
      <p className="text-xs text-gray-400 mt-1">Edit batch → select courses first.</p>
    </div>
  );

  const totalDuration = currentSheet?.sessions.reduce((a, s) => a + (s.duration ?? 0), 0) ?? 0;
  const completed     = modules.filter(m => m.status === 'COMPLETED').length;
  const released      = modules.filter(m => m.status !== 'LOCKED').length;

  return (
    <div className="space-y-3">

      {(modulesError || (expectedSessionCount > 0 && linkedSessionCount === 0 && !modulesLoading && !syncSyllabusMut.isPending)) && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex flex-wrap items-center gap-3 text-sm text-amber-900">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <p className="flex-1 min-w-[200px]">
            {modulesError
              ? 'Could not load session modules for this batch. Lock/Done buttons need synced course modules.'
              : 'Syllabus sessions are not linked to course modules yet — sync to enable Lock, Unlock, and Done.'}
          </p>
          <button
            type="button"
            onClick={() => syncSyllabusMut.mutate()}
            disabled={syncSyllabusMut.isPending || !activeCourseId}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 text-white text-xs font-semibold hover:bg-amber-700 disabled:opacity-50"
          >
            {syncSyllabusMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Sync sessions
          </button>
          {modulesError && (
            <button
              type="button"
              onClick={() => refetchModules()}
              className="text-xs font-semibold text-amber-800 underline"
            >
              Retry load
            </button>
          )}
        </div>
      )}

      {syncSyllabusMut.isPending && (
        <div className="flex items-center gap-2 text-xs text-blue-600 px-1">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Syncing syllabus sessions to course modules…
        </div>
      )}

      {/* ── Course pills (compact, space-efficient for multi-course batches) ───── */}
      {batchCourses.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {batchCourses.map((c, idx) => {
            const isActive = c.id === activeCourseId;
            const gi = idx % SESS_GRADIENTS.length;
            return (
              <button key={c.id}
                onClick={() => { setSelectedCourseId(c.id); setExpandedSessions(new Set()); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                  isActive
                    ? `bg-gradient-to-r ${SESS_GRADIENTS[gi]} text-white border-transparent shadow-sm`
                    : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                }`}>
                {c.title}
              </button>
            );
          })}
        </div>
      )}

      {syllabusLoading && (
        <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-blue-500" /></div>
      )}

      {!syllabusLoading && !structured && (
        <div className="rounded-xl border border-dashed border-amber-200 bg-amber-50/50 p-6 text-center">
          <p className="text-sm font-medium text-amber-700">No syllabus uploaded yet</p>
          <p className="text-xs text-amber-500 mt-1">
            Curriculum Master → open this course → Syllabus tab → upload Excel → sessions appear here automatically.
          </p>
        </div>
      )}

      {!syllabusLoading && structured && (
        <>
          {/* ── Sheet tabs — identical pattern to CourseMaster ──────────────────── */}
          {structured.sheets.length > 1 && (
            <div className="flex flex-wrap gap-1.5">
              {structured.sheets.map((sheet, idx) => (
                <button key={idx}
                  onClick={() => { setActiveSheetIdx(idx); setExpandedSessions(new Set()); }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                    activeSheetIdx === idx
                      ? `bg-gradient-to-r ${SESS_GRADIENTS[idx % SESS_GRADIENTS.length]} text-white border-transparent shadow-sm`
                      : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  }`}>
                  {sheet.name}
                </button>
              ))}
            </div>
          )}

          {currentSheet && (
            <>
              {/* Stats — same 3-box grid as CourseMaster */}
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: 'Sessions',  value: currentSheet.sessions.length },
                  { label: 'Hours',     value: totalDuration ? (totalDuration / 60).toFixed(1) + 'h' : '—' },
                  { label: 'Topics',    value: currentSheet.sessions.reduce((a, s) => a + s.topics.length, 0) },
                ].map(s => (
                  <div key={s.label} className={`rounded-xl p-3 border ${SESS_BG[activeSheetIdx % SESS_BG.length]}`}>
                    <p className="text-[10px] font-medium opacity-70">{s.label}</p>
                    <p className="text-lg font-bold leading-tight">{s.value}</p>
                  </div>
                ))}
              </div>

              {/* Unlock/Done summary + expand controls */}
              <div className="flex items-center justify-between">
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${SESS_BG[colorIdx]}`}>
                  {released} unlocked · {completed} done
                </span>
                <div className="flex gap-2 text-xs">
                  <button
                    onClick={() => setExpandedSessions(new Set(currentSheet.sessions.map(s => String(s.session))))}
                    className="text-blue-600 font-medium flex items-center gap-1 hover:text-blue-700">
                    <ChevronDown className="w-3 h-3" /> All
                  </button>
                  <span className="text-gray-300">|</span>
                  <button onClick={() => setExpandedSessions(new Set())}
                    className="text-gray-500 font-medium flex items-center gap-1 hover:text-gray-700">
                    <ChevronUp className="w-3 h-3" /> Collapse
                  </button>
                </div>
              </div>

              {/* Session cards — sourced from syllabus, status from course_modules */}
              <div className="space-y-2">
                {currentSheet.sessions.map((sess, sidx) => {
                  const key        = String(sess.session);
                  const isOpen     = expandedSessions.has(key);
                  const sheetName  = currentSheet.name;
                  const mod        = resolveSessionModule(modules, sheetName, key);
                  const meetLink   = mod ? meetLinks[mod.id] : undefined;
                  const isCompleted = mod?.status === 'COMPLETED';
                  const isReleased  = mod?.status === 'RELEASED';
                  const isLocked    = !mod || mod.status === 'LOCKED';
                  const ci          = activeSheetIdx % SESS_GRADIENTS.length;
                  const childSubs   = getChildSubs(key, sheetName);

                  return (
                    <div key={sidx}
                      className={`lms-card rounded-2xl border overflow-hidden bg-white ${
                        isCompleted ? 'border-emerald-200/80' : isReleased ? 'border-blue-200/80' : 'border-gray-100'
                      }`}>

                      {/* Row 1: identity — tap to expand */}
                      <div className="flex items-stretch gap-0">
                        <button
                          type="button"
                          onClick={() => toggleSession(key)}
                          className="flex-1 flex items-center gap-3 p-3 sm:p-3.5 text-left hover:bg-slate-50/90 transition-colors min-w-0"
                        >
                          <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${SESS_GRADIENTS[ci]} flex items-center justify-center shrink-0 shadow-sm`}>
                            {isCompleted
                              ? <CheckCircle2 className="w-5 h-5 text-white" />
                              : isLocked
                                ? <Lock className="w-4 h-4 text-white/80" />
                                : <span className="text-white text-sm font-bold">{String(key).length <= 3 ? key : sidx + 1}</span>}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className={`text-sm font-semibold truncate ${isLocked ? 'text-gray-400' : 'text-gray-900'}`}>
                                {sess.module}
                              </p>
                              {childSubs.length > 0 && (
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-purple-50 text-purple-600 border border-purple-100">
                                  {childSubs.length} sub
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-gray-400 mt-0.5 truncate">
                              {sess.topics.length} topic{sess.topics.length !== 1 ? 's' : ''}
                              {sess.duration ? ` · ${sess.duration} min` : ''}
                              {isCompleted ? ' · Completed' : isReleased ? ' · Unlocked' : ' · Locked'}
                            </p>
                          </div>
                          <ChevronDown className={`w-5 h-5 text-gray-300 shrink-0 transition-transform duration-280 ${isOpen ? 'rotate-180 text-gray-500' : ''}`} />
                        </button>
                      </div>

                      {/* Row 2: actions — always easy to tap, never fights expand */}
                      {mod && (
                        <div
                          className="flex flex-wrap items-center gap-1.5 px-3 pb-3 pt-0 sm:px-3.5"
                          onClick={e => e.stopPropagation()}
                        >
                          <div className="flex flex-wrap items-center gap-1.5 flex-1">
                            <MeetLinkCell moduleId={mod.id} batchId={batchId} initial={meetLink} />
                            <RecordingLinkCell moduleId={mod.id} batchId={batchId} sessionTitle={sess.module} initial={recordingMap[mod.id]} />
                          </div>
                          <div className="flex items-center gap-1 ml-auto">
                            {isLocked
                              ? <SessBtn onClick={() => act.mutate({ id: mod.id, path: 'release', method: 'patch' })}
                                  icon={<Unlock className="w-3.5 h-3.5" />} text="Unlock" cls="text-blue-600 border-blue-200 hover:bg-blue-50 bg-blue-50/40" />
                              : <SessBtn onClick={() => act.mutate({ id: mod.id, path: 'lock', method: 'patch' })}
                                  icon={<Lock className="w-3.5 h-3.5" />} text="Lock" cls="text-gray-500 border-gray-200 hover:bg-gray-50" />}
                            {isCompleted
                              ? <SessBtn onClick={() => act.mutate({ id: mod.id, path: 'uncomplete', method: 'post' })}
                                  icon={<RotateCcw className="w-3.5 h-3.5" />} text="Undo" cls="text-gray-500 border-gray-200 hover:bg-gray-50" />
                              : <SessBtn onClick={() => act.mutate({ id: mod.id, path: 'complete', method: 'post' })}
                                  icon={<CheckCircle2 className="w-3.5 h-3.5" />} text="Done" cls="text-emerald-700 border-emerald-200 hover:bg-emerald-50 bg-emerald-50/50" />}
                            <button
                              type="button"
                              onClick={() => { setSubSessionFor(mod); setExpandedSessions(prev => new Set(prev).add(key)); }}
                              className="lms-press lms-tap inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold rounded-xl border border-purple-200 text-purple-700 bg-purple-50/60 hover:bg-purple-50"
                              title="Add sub-session (1.1, 1.2…)"
                            >
                              <PlusCircle className="w-3.5 h-3.5" />
                              <span className="hidden sm:inline">Add 1.x</span>
                            </button>
                          </div>
                        </div>
                      )}

                      {!mod && (
                        <div className="px-3 pb-3 flex flex-wrap items-center gap-2">
                          <p className="text-[11px] text-amber-600 flex-1">
                            {isTrainer
                              ? 'Sync syllabus from Curriculum Master to enable session actions.'
                              : 'Session not linked — sync syllabus to show Lock / Done buttons.'}
                          </p>
                          {!isTrainer && (
                            <button
                              type="button"
                              onClick={() => syncSyllabusMut.mutate()}
                              disabled={syncSyllabusMut.isPending}
                              className="text-[11px] font-semibold text-amber-700 underline disabled:opacity-50"
                            >
                              Sync now
                            </button>
                          )}
                        </div>
                      )}

                      {/* Expanded panel */}
                      <div className={`lms-expand ${isOpen ? 'is-open' : ''}`}>
                        <div className="lms-expand-inner">
                          {isOpen && (
                            <div className="border-t border-gray-100 bg-gradient-to-b from-slate-50/80 to-white lms-fade-in">
                              {sess.topics.length > 0 && (
                                <div className="px-4 pt-3 pb-2">
                                  <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-2">Topics</p>
                                  <ul className="space-y-1.5">
                                    {sess.topics.map((topic, ti) => (
                                      <li key={ti} className="flex items-start gap-2 text-xs text-gray-700">
                                        <span className={`mt-1.5 w-1.5 h-1.5 rounded-full bg-gradient-to-br ${SESS_GRADIENTS[ci]} shrink-0`} />
                                        <span className="leading-relaxed">{topic}</span>
                                      </li>
                                    ))}
                                  </ul>
                                  {meetLink && (
                                    <a href={meetLink} target="_blank" rel="noopener noreferrer"
                                      className="mt-3 inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold hover:bg-emerald-100 lms-press">
                                      <Video className="w-3.5 h-3.5" /> Join Live Class
                                      <ExternalLink className="w-3 h-3 opacity-60" />
                                    </a>
                                  )}
                                </div>
                              )}

                              <div className="px-3 pb-3.5 pt-1 space-y-2">
                                <div className="flex items-center justify-between px-1">
                                  <p className="text-[10px] font-bold uppercase tracking-wide text-purple-600">
                                    Sub-sessions {childSubs.length > 0 ? `(${childSubs.length})` : ''}
                                  </p>
                                  {mod && (
                                    <button
                                      type="button"
                                      onClick={() => setSubSessionFor(mod)}
                                      className="text-[11px] font-semibold text-purple-600 hover:text-purple-800 lms-press"
                                    >
                                      + Add
                                    </button>
                                  )}
                                </div>

                                {childSubs.length === 0 ? (
                                  <div className="rounded-xl border border-dashed border-purple-200 bg-purple-50/30 px-3 py-4 text-center">
                                    <p className="text-xs text-purple-700/80 font-medium">No sub-sessions yet</p>
                                    <p className="text-[11px] text-purple-500/80 mt-0.5">Add 1.1 or 1.2 for extra class time & recordings</p>
                                  </div>
                                ) : (
                                  childSubs.map((sub) => {
                                    const subMeet = meetLinks[sub.id];
                                    const subDone = sub.status === 'COMPLETED';
                                    const subLocked = sub.status === 'LOCKED';
                                    const subTopics = Array.isArray(sub.topics) ? sub.topics : [];
                                    return (
                                      <div key={sub.id}
                                        className="rounded-xl border border-purple-200 bg-white shadow-sm overflow-hidden lms-fade-in">
                                        <div className="flex items-start gap-2.5 p-3">
                                          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-purple-500 to-violet-600 flex items-center justify-center shrink-0 shadow-sm">
                                            <span className="text-white text-[11px] font-bold">{sub.sessionNumber}</span>
                                          </div>
                                          <div className="flex-1 min-w-0">
                                            <p className="text-sm font-semibold text-gray-900 truncate">{sub.title}</p>
                                            <p className="text-[11px] text-purple-500 mt-0.5">
                                              {subTopics.length ? `${subTopics.length} topic(s)` : 'Sub-session'}
                                              {sub.durationMinutes ? ` · ${sub.durationMinutes} min` : ''}
                                              {subDone ? ' · Done' : subLocked ? ' · Locked' : ' · Unlocked'}
                                            </p>
                                          </div>
                                        </div>
                                        <div className="flex flex-wrap items-center gap-1.5 px-3 pb-3 border-t border-purple-50 pt-2 bg-purple-50/20">
                                          <MeetLinkCell moduleId={sub.id} batchId={batchId} initial={subMeet} />
                                          <RecordingLinkCell moduleId={sub.id} batchId={batchId} sessionTitle={sub.title} initial={recordingMap[sub.id]} />
                                          <div className="flex items-center gap-1 ml-auto">
                                            {subLocked
                                              ? <SessBtn onClick={() => act.mutate({ id: sub.id, path: 'release', method: 'patch' })}
                                                  icon={<Unlock className="w-3.5 h-3.5" />} text="Unlock" cls="text-blue-600 border-blue-200 hover:bg-blue-50" />
                                              : <SessBtn onClick={() => act.mutate({ id: sub.id, path: 'lock', method: 'patch' })}
                                                  icon={<Lock className="w-3.5 h-3.5" />} text="Lock" cls="text-gray-500 border-gray-200 hover:bg-gray-50" />}
                                            {subDone
                                              ? <SessBtn onClick={() => act.mutate({ id: sub.id, path: 'uncomplete', method: 'post' })}
                                                  icon={<RotateCcw className="w-3.5 h-3.5" />} text="Undo" cls="text-gray-500 border-gray-200 hover:bg-gray-50" />
                                              : <SessBtn onClick={() => act.mutate({ id: sub.id, path: 'complete', method: 'post' })}
                                                  icon={<CheckCircle2 className="w-3.5 h-3.5" />} text="Done" cls="text-emerald-700 border-emerald-200 hover:bg-emerald-50 bg-emerald-50/40" />}
                                            <button
                                              type="button"
                                              title="Delete sub-session"
                                              disabled={deleteSubMut.isPending}
                                              onClick={() => {
                                                if (confirm(`Delete sub-session ${sub.sessionNumber}: "${sub.title}"?`)) {
                                                  deleteSubMut.mutate(sub.id);
                                                }
                                              }}
                                              className="lms-press lms-tap inline-flex items-center justify-center px-2 py-1.5 rounded-xl border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50"
                                            >
                                              <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                          </div>
                                        </div>
                                        {subTopics.length > 0 && (
                                          <ul className="border-t border-purple-50 px-3 py-2 space-y-1 bg-white">
                                            {subTopics.map((t, ti) => (
                                              <li key={ti} className="text-xs text-gray-600 flex gap-2">
                                                <span className="w-1.5 h-1.5 rounded-full bg-purple-400 mt-1.5 shrink-0" />{t}
                                              </li>
                                            ))}
                                          </ul>
                                        )}
                                      </div>
                                    );
                                  })
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </>
      )}

      {subSessionFor && activeCourseId && (
        <SubSessionModal
          courseId={activeCourseId}
          afterModule={subSessionFor}
          existingModules={modules}
          onClose={() => setSubSessionFor(null)}
          onSuccess={async (parentKey, nextModules) => {
            if (nextModules) {
              qc.setQueryData(['batch-sessions', activeCourseId], nextModules);
            }
            setExpandedSessions(prev => new Set(prev).add(parentKey));
            await refreshAfterSessionChange(qc, { courseId: activeCourseId, batchId });
          }}
        />
      )}
    </div>
  );
}

function SessBtn({ onClick, icon, text, cls = '' }: { onClick: () => void; icon: React.ReactNode; text: string; cls?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={text}
      aria-label={text}
      className={`lms-press lms-tap inline-flex items-center justify-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold rounded-xl border ${cls}`}
    >
      {icon}
      <span className="hidden md:inline">{text}</span>
    </button>
  );
}

// ── Session Schedule Generator ────────────────────────────────────────────────
interface ScheduledSession {
  id: string;
  week: number;
  sessionNum: number;          // global session number (1, 2, 3…)
  weekSession: number;         // session within week (1, 2, 3)
  date: Date;
  name: string;                // editable title
  topic: string;               // editable topic
}

const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Generate 3-sessions-per-week schedule between startDate and endDate */
function generateSchedule(
  startDate: Date,
  endDate: Date,
  classDays: string,            // e.g. "Mon, Wed, Fri"
  courseTitle: string,
): ScheduledSession[] {
  // Parse class days from batch (default Mon/Wed/Fri if not set)
  const parsedDays = classDays
    ? classDays.split(/[,\s]+/).map(d => d.trim().slice(0, 3))
      .map(d => DAYS_OF_WEEK.findIndex(x => x.toLowerCase() === d.toLowerCase()))
      .filter(n => n >= 0)
    : [1, 3, 5]; // Mon, Wed, Fri

  const sessionDays = parsedDays.length >= 3 ? parsedDays.slice(0, 3) : [1, 3, 5];

  const sessions: ScheduledSession[] = [];
  let current = new Date(startDate);
  let globalNum = 0;

  while (current <= endDate) {
    if (sessionDays.includes(current.getDay())) {
      globalNum++;
      const weekNum = Math.ceil(globalNum / 3);
      const weekSess = ((globalNum - 1) % 3) + 1;
      const subject = courseTitle || 'Session';
      sessions.push({
        id: `sess-${globalNum}`,
        week: weekNum,
        sessionNum: globalNum,
        weekSession: weekSess,
        date: new Date(current),
        name: `Week ${weekNum} – Session ${weekSess}`,
        topic: `${subject} – Part ${globalNum}`,
      });
    }
    current = new Date(current.getTime() + 86400000); // +1 day
    if (sessions.length >= 60) break; // safety cap
  }
  return sessions;
}

// ── Overview Tab ──────────────────────────────────────────────────────────────
function OverviewTab({ batch, totalDays, cfg, enrolled, avgCompl }: {
  batch: Batch;
  totalDays: number;
  cfg: { label: string; color: string };
  enrolled: number;
  avgCompl: number;
}) {
  const classDays = (batch as any).classDays as string | undefined;
  const programName = batch.program?.name ?? '';

  // Generate schedule from batch dates
  const [sessions, setSessions] = useState<ScheduledSession[]>(() =>
    generateSchedule(new Date(batch.startDate), new Date(batch.endDate), classDays ?? '', programName)
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editTopic, setEditTopic] = useState('');

  // Group by week
  const weeks = useMemo(() => {
    const map = new Map<number, ScheduledSession[]>();
    sessions.forEach(s => {
      if (!map.has(s.week)) map.set(s.week, []);
      map.get(s.week)!.push(s);
    });
    return Array.from(map.entries()).sort((a, b) => a[0] - b[0]);
  }, [sessions]);

  function startEdit(s: ScheduledSession) {
    setEditingId(s.id);
    setEditName(s.name);
    setEditTopic(s.topic);
  }

  function saveEdit(id: string) {
    setSessions(prev => prev.map(s => s.id === id ? { ...s, name: editName, topic: editTopic } : s));
    setEditingId(null);
  }

  return (
    <div className="space-y-3">
      {/* Schedule info */}
      {[
        { label: 'Batch Start', date: batch.startDate, icon: PlayCircle, color: 'text-emerald-500' },
        { label: 'Duration', date: null, icon: Clock, color: 'text-blue-500', extra: `${totalDays} days total` },
        { label: 'Batch End', date: batch.endDate, icon: CheckCircle2, color: 'text-gray-400' },
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
          { label: 'Status', value: cfg.label },
          { label: 'Program', value: batch.program?.name ?? 'Not assigned' },
          { label: 'Trainer', value: (batch as any).trainerName ?? (batch as any).trainer?.name ?? 'Not assigned' },
          { label: 'Capacity', value: `${batch.capacity} seats` },
          { label: 'Enrolled', value: `${enrolled} students` },
          { label: 'Avg Completion', value: `${avgCompl}%` },
          ...(classDays ? [{ label: 'Class Days', value: classDays }] : []),
          ...((batch as any).classStartTime ? [{ label: 'Class Time', value: `${(batch as any).classStartTime}${(batch as any).classEndTime ? ` – ${(batch as any).classEndTime}` : ''}` }] : []),
        ].map(({ label, value }) => (
          <div key={label} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
            <span className="text-sm text-gray-500">{label}</span>
            <span className="text-sm font-medium text-gray-800">{value}</span>
          </div>
        ))}
      </div>

      {/* ── Session Schedule ─────────────────────────────────────────────── */}
      <div className="mt-2">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-blue-500" />
            Session Schedule
            <span className="text-xs font-normal text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
              {sessions.length} sessions · 3/week
            </span>
          </h3>
          <span className="text-[10px] text-gray-400">Click ✏️ to edit any session</span>
        </div>

        {weeks.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-4">No sessions — check batch start/end dates</p>
        ) : (
          <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
            {weeks.map(([weekNum, weekSessions]) => (
              <div key={weekNum} className="rounded-xl border border-gray-100 overflow-hidden">
                {/* Week header */}
                <div className="bg-gradient-to-r from-blue-50 to-cyan-50 px-4 py-2 flex items-center justify-between border-b border-blue-100">
                  <span className="text-xs font-bold text-blue-700">Week {weekNum}</span>
                  <span className="text-[10px] text-blue-500">
                    {format(weekSessions[0].date, 'dd MMM')} – {format(weekSessions[weekSessions.length - 1].date, 'dd MMM yyyy')}
                  </span>
                </div>

                {/* Sessions in week */}
                {weekSessions.map((s, idx) => (
                  <div key={s.id}
                    className={`px-4 py-2.5 ${idx < weekSessions.length - 1 ? 'border-b border-gray-50' : ''} hover:bg-gray-50 transition-colors`}>
                    {editingId === s.id ? (
                      /* Edit mode */
                      <div className="space-y-2">
                        <input
                          value={editName}
                          onChange={e => setEditName(e.target.value)}
                          className="w-full text-xs px-2 py-1.5 border border-blue-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400/30 font-medium"
                          placeholder="Session name"
                          autoFocus
                        />
                        <input
                          value={editTopic}
                          onChange={e => setEditTopic(e.target.value)}
                          className="w-full text-xs px-2 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-gray-300"
                          placeholder="Topic / description"
                        />
                        <div className="flex gap-2">
                          <button onClick={() => saveEdit(s.id)}
                            className="px-3 py-1 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium">
                            Save
                          </button>
                          <button onClick={() => setEditingId(null)}
                            className="px-3 py-1 text-xs bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200">
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* View mode */
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2.5 min-w-0">
                          <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                            {s.sessionNum}
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-gray-800 truncate">{s.name}</p>
                            <p className="text-[10px] text-gray-400 mt-0.5 truncate">{s.topic}</p>
                            <p className="text-[10px] text-gray-400 mt-0.5">
                              {format(s.date, 'EEE, dd MMM yyyy')}
                            </p>
                          </div>
                        </div>
                        <button onClick={() => startEdit(s)}
                          className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors shrink-0"
                          title="Edit session">
                          <Edit className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
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
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const { data: batch, isLoading: loadingBatch } = useQuery({
    queryKey: ['batch', batchId],
    queryFn: () => fetchBatch(batchId),
  });

  const { data: available = [], isLoading: loadingAvail } = useQuery({
    queryKey: ['batch-available', batchId],
    queryFn: () => fetchAvailableStudents(batchId),
    enabled: showAddPanel,
  });

  const filteredAvailable = useMemo(() => {
    if (!searchTerm.trim()) return available;
    const lower = searchTerm.toLowerCase().trim();
    return available.filter((s) => {
      const matchName = s.name?.toLowerCase().includes(lower);
      const matchEmail = s.email?.toLowerCase().includes(lower);
      const matchPhone = s.phoneNumber?.toLowerCase().includes(lower);
      return matchName || matchEmail || matchPhone;
    });
  }, [available, searchTerm]);

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

  const enrollMultipleMutation = useMutation({
    mutationFn: async (studentIds: string[]) => {
      await Promise.all(studentIds.map(id => api.post(`/batches/${batchId}/enroll`, { studentId: id })));
    },
    onSuccess: () => {
      toast.success('Selected students enrolled!');
      setSelectedIds([]);
      qc.invalidateQueries({ queryKey: ['batch', batchId] });
      qc.invalidateQueries({ queryKey: ['batch-available', batchId] });
      qc.invalidateQueries({ queryKey: ['batches'] });
    },
    onError: (err: unknown) => {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(e?.response?.data?.message ?? 'Failed to enroll some students');
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
          onClick={() => {
            setShowAddPanel((v) => !v);
            setSearchTerm('');
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-gradient-to-r from-blue-500 to-cyan-500 rounded-lg hover:opacity-90"
        >
          <UserPlus className="w-3.5 h-3.5" />
          {showAddPanel ? 'Hide' : 'Add Student'}
        </button>
      </div>

      {/* Add student panel */}
      {showAddPanel && (() => {
        const allFilteredIds = filteredAvailable.map(s => s.id);
        const isAllSelected = allFilteredIds.length > 0 && allFilteredIds.every(id => selectedIds.includes(id));
        return (
          <div className="bg-blue-50/50 rounded-xl border border-blue-100 p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-blue-100/50 pb-3">
              <div>
                <p className="text-xs font-semibold text-blue-700">Available Students</p>
                <p className="text-[10px] text-gray-500 mt-0.5">Select and enroll multiple students easily</p>
              </div>
              <div className="relative max-w-xs w-full">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  placeholder="Search by name or phone..."
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 shadow-sm"
                />
              </div>
            </div>

            {loadingAvail ? (
              <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-blue-400" /></div>
            ) : filteredAvailable.length === 0 ? (
              <p className="text-xs text-gray-500 text-center py-2">
                {searchTerm ? 'No matching available students found' : 'All students already enrolled or none available'}
              </p>
            ) : (
              <div className="space-y-3">
                {/* Select All + Action Button Bar */}
                <div className="flex items-center justify-between bg-white border border-blue-100 p-2.5 rounded-lg shadow-sm">
                  <label className="flex items-center gap-2 text-xs font-semibold text-gray-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isAllSelected}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedIds(prev => Array.from(new Set([...prev, ...allFilteredIds])));
                        } else {
                          setSelectedIds(prev => prev.filter(id => !allFilteredIds.includes(id)));
                        }
                      }}
                      className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 cursor-pointer"
                    />
                    Select All ({filteredAvailable.length})
                  </label>

                  {selectedIds.length > 0 && (
                    <button
                      onClick={() => enrollMultipleMutation.mutate(selectedIds)}
                      disabled={enrollMultipleMutation.isPending}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 shadow-sm transition-all"
                    >
                      {enrollMultipleMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />}
                      Enroll Selected ({selectedIds.length})
                    </button>
                  )}
                </div>

                {/* Checklist of Students */}
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {filteredAvailable.map((s) => (
                    <label key={s.id} className="flex items-center justify-between p-2.5 bg-white rounded-lg border border-blue-100 hover:border-blue-200 transition-colors shadow-sm cursor-pointer">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(s.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedIds(prev => [...prev, s.id]);
                            } else {
                              setSelectedIds(prev => prev.filter(id => id !== s.id));
                            }
                          }}
                          className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 cursor-pointer"
                        />
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-gray-800 truncate">{s.name}</p>
                          <p className="text-[10px] text-gray-500 flex flex-wrap gap-x-2 truncate mt-0.5">
                            <span>{s.email}</span>
                            {s.phoneNumber && <span className="text-gray-400 font-mono">· {s.phoneNumber}</span>}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          enrollMutation.mutate(s.id);
                        }}
                        disabled={enrollMutation.isPending}
                        className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold text-blue-600 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 disabled:opacity-50"
                      >
                        {enrollMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <UserPlus className="w-3 h-3" />}
                        Quick Enroll
                      </button>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })()}

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
    queryFn: () => fetchAnalytics(batchId),
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
          { label: 'Total Enrolled', value: analytics.totalEnrolled, icon: Users, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'Avg Completion', value: `${analytics.avgCompletion}%`, icon: TrendingUp, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'Fully Completed', value: analytics.completed100, icon: Award, color: 'text-amber-600', bg: 'bg-amber-50' },
          { label: 'Capacity Fill', value: `${fillPct}%`, icon: BarChart2, color: 'text-purple-600', bg: 'bg-purple-50' },
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
      <p className="text-xs mt-1">Upload one in Curriculum Master → Syllabus tab.</p>
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
                className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${isActive ? 'border-emerald-300 bg-emerald-50' : 'border-gray-100 bg-white hover:border-gray-200'
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
