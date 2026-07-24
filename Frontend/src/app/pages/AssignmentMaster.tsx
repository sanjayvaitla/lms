import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ClipboardList, LayoutDashboard, Plus, Search, FileText, Upload,
  Loader2, X, Eye, Trash2, Users, CheckCircle2, Calendar, BookOpen,
  Download, AlertCircle, Award, Clock, ExternalLink, Sparkles, Unlock,
  GitBranch, GitPullRequest, Code2, Send, Cpu, Zap, Star, ChevronRight, Pencil,
} from 'lucide-react';
import { toast } from 'sonner';
import api from '../../lib/axios';
import { refreshLists } from '../../lib/lmsCache';
import { Skeleton } from '../components/ui/skeleton';
import { NumericInput } from '../components/ui/numeric-input';
import { INPUT_CLS, LABEL_CLS } from '../../lib/constants';
import { useAuth } from '../../store/AuthContext';
import { usePermissions } from '../../store/PermissionsContext';
import type { Assignment, Course, Batch, CourseModule } from '../../types/api';

interface AIGradeResult {
  score:     number;
  feedback:  string;
  breakdown: Record<string, string>;
  model:     string;
  raw:       Record<string, unknown>;
}

type Tab = 'dashboard' | 'list' | 'create' | 'git-task';

// ── Git Task types ─────────────────────────────────────────────────────────────
interface GitTask {
  id: string; courseId: string; courseTitle: string;
  moduleId?: string | null; moduleTitle?: string | null; moduleSessionNumber?: string | null;
  title: string; description: string | null;
  templateRepoUrl: string; artifactType: string;
  dueDate: string | null; maxScore: number; status: string;
  createdAt: string; batchCount: number; submissionCount: number;
}

interface GitTaskSubmission {
  id: string; studentId: string; studentName: string;
  forkUrl: string | null; lastCommitSha: string | null;
  submittedAt: string; score: number | null; feedback: string | null;
  status: 'IN_PROGRESS' | 'SUBMITTED' | 'GRADED' | 'LATE';
  aiScore: number | null; aiFeedback: string | null;
  aiBreakdown: Record<string, string>;
}

async function fetchCourses(): Promise<Course[]> {
  const { data } = await api.get('/courses');
  return data.data?.courses ?? data.data ?? [];
}

async function fetchBatches(courseId: string): Promise<Batch[]> {
  const { data } = await api.get('/batches', { params: { courseId } });
  return data.data ?? [];
}

async function fetchModules(courseId: string): Promise<CourseModule[]> {
  const { data } = await api.get(`/courses/${courseId}/modules`);
  return data.data ?? data ?? [];
}

function formatSessionLabel(m: CourseModule): string {
  const num = m.sessionNumber ? `Session ${m.sessionNumber}` : m.title;
  return m.section ? `${num} · ${m.section}` : num;
}

export default function AssignmentMasterPage() {
  const [tab, setTab] = useState<Tab>('dashboard');
  const [courseFilter, setCourseFilter] = useState('');
  const [viewId, setViewId] = useState<string | null>(null);
  const [createPreset, setCreatePreset] = useState<{ courseId: string; moduleId: string } | null>(null);
  const qc = useQueryClient();
  const { user } = useAuth();
  const { can } = usePermissions();
  const isTrainer = user?.role === 'TRAINER';
  const canEdit   = can('canEditAssignments');
  const canDelete = can('canDeleteAssignments') && !can('canSoftDeleteOnly');

  const { data: courses = [] } = useQuery({ queryKey: ['courses-asg'], queryFn: fetchCourses });

  function openCreateForSession(courseId: string, moduleId: string) {
    setCreatePreset({ courseId, moduleId });
    setTab('create');
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Assignment master</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            Upload under Course → Session. When that course is on a batch, content packages automatically and releases when the trainer marks the session Done.
          </p>
        </div>
        {tab === 'git-task' && (
          <select
            value={courseFilter}
            onChange={(e) => setCourseFilter(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-200 rounded-xl bg-white shadow-sm min-w-[200px]"
          >
            <option value="">All courses</option>
            {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
        )}
      </div>

      <div className="flex gap-1 p-1 bg-gray-100 rounded-xl w-fit flex-wrap">
        {([
          { id: 'dashboard' as Tab, label: 'Dashboard', icon: LayoutDashboard },
          { id: 'list' as Tab, label: 'By Course', icon: ClipboardList },
          ...(canEdit ? [{ id: 'create' as Tab, label: 'Create Assignment', icon: Plus }] : []),
          ...(canEdit ? [{ id: 'git-task' as Tab, label: 'Git Assignments', icon: GitPullRequest }] : []),
        ]).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => {
              if (id !== 'create') setCreatePreset(null);
              setTab(id);
            }}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all ${
              tab === id
                ? id === 'git-task'
                  ? 'bg-white text-blue-700 shadow-sm'
                  : 'bg-white text-teal-700 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Icon className="w-4 h-4" /> {label}
          </button>
        ))}
      </div>

      {tab === 'dashboard' && <AssignmentDashboard />}
      {tab === 'list' && (
        <AssignmentList
          courses={courses}
          canEdit={canEdit}
          canDelete={canDelete}
          onView={(id) => setViewId(id)}
          onCreateForSession={openCreateForSession}
          qc={qc}
        />
      )}
      {tab === 'create' && (
        <CreateAssignmentForm
          key={createPreset ? `${createPreset.courseId}:${createPreset.moduleId}` : 'blank'}
          courses={courses}
          presetCourseId={createPreset?.courseId}
          presetModuleId={createPreset?.moduleId}
          onSuccess={() => {
            qc.invalidateQueries({ queryKey: ['assignments'] });
            qc.invalidateQueries({ queryKey: ['assignment-dashboard'] });
            qc.invalidateQueries({ queryKey: ['assignments-course-counts'] });
            setCreatePreset(null);
            setTab('list');
          }}
        />
      )}

      {tab === 'git-task' && (
        <GitTaskTab courses={courses} canEdit={canEdit} canDelete={canDelete} courseFilter={courseFilter} />
      )}

      {viewId && (
        <AssignmentDetailDrawer
          id={viewId}
          onClose={() => setViewId(null)}
          qc={qc}
          canEdit={canEdit}
        />
      )}
    </div>
  );
}

/* ─────────────────────────── Dashboard ──────────────────────────── */

function AssignmentDashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ['assignment-dashboard'],
    queryFn: async () => {
      const { data } = await api.get('/assignments/dashboard');
      return data.data;
    },
  });
  const cards = [
    { label: 'Total Assignments', value: data?.totalAssignments, icon: ClipboardList, bg: 'bg-teal-50', iconColor: 'text-teal-600', border: 'border-teal-100' },
    { label: 'Published', value: data?.published, icon: CheckCircle2, bg: 'bg-emerald-50', iconColor: 'text-emerald-600', border: 'border-emerald-100' },
    { label: 'Submissions', value: data?.totalSubmissions, icon: Upload, bg: 'bg-blue-50', iconColor: 'text-blue-600', border: 'border-blue-100' },
    { label: 'Pending Grading', value: data?.pendingGrading, icon: Award, bg: 'bg-amber-50', iconColor: 'text-amber-600', border: 'border-amber-100' },
  ];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {isLoading
          ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)
          : cards.map((c) => (
              <div key={c.label} className={`${c.bg} rounded-2xl p-5 border ${c.border} shadow-sm`}>
                <c.icon className={`w-5 h-5 ${c.iconColor} mb-2`} />
                <p className="text-2xl font-bold text-gray-900">{c.value ?? 0}</p>
                <p className="text-sm text-gray-600">{c.label}</p>
              </div>
            ))}
      </div>

      <div className="bg-gradient-to-r from-teal-50 to-cyan-50 border border-teal-100 rounded-2xl p-5">
        <h3 className="font-semibold text-teal-900 flex items-center gap-2">
          <FileText className="w-5 h-5" /> How PDF Assignments Work
        </h3>
        <ul className="mt-3 space-y-2 text-sm text-teal-800/90">
          <li className="flex items-start gap-2">
            <Upload className="w-4 h-4 mt-0.5 text-teal-500 flex-shrink-0" />
            <span><strong>PDF Upload:</strong> Upload assignment documents as PDFs. They are stored securely and viewable in an embedded reader.</span>
          </li>
          <li className="flex items-start gap-2">
            <Users className="w-4 h-4 mt-0.5 text-teal-500 flex-shrink-0" />
            <span><strong>Batch Mapping:</strong> Assign each assignment to specific batches so only enrolled learners see it.</span>
          </li>
          <li className="flex items-start gap-2">
            <Calendar className="w-4 h-4 mt-0.5 text-teal-500 flex-shrink-0" />
            <span><strong>Session-linked release:</strong> Map an assignment to a session as Draft — publish manually anytime, or it auto-publishes when that session is marked complete in Batch Master.</span>
          </li>
          <li className="flex items-start gap-2">
            <Award className="w-4 h-4 mt-0.5 text-teal-500 flex-shrink-0" />
            <span><strong>Grading:</strong> Review submissions, assign scores, and provide feedback all from one place.</span>
          </li>
        </ul>
      </div>
    </div>
  );
}

/* ─────────────────────────── Assignment List ──────────────────────────── */

function AssignmentList({
  courses,
  canEdit,
  canDelete,
  onView,
  onCreateForSession,
  qc,
}: {
  courses: Course[];
  canEdit: boolean;
  canDelete: boolean;
  onView: (id: string) => void;
  onCreateForSession: (courseId: string, moduleId: string) => void;
  qc: ReturnType<typeof useQueryClient>;
}) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [selectedModuleId, setSelectedModuleId] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');

  const selectedCourse = courses.find((c) => c.id === selectedCourseId);
  const { data: modules = [], isLoading: modulesLoading } = useQuery({
    queryKey: ['course-modules-asg-list', selectedCourseId],
    queryFn: () => fetchModules(selectedCourseId),
    enabled: !!selectedCourseId && step >= 2,
  });
  const selectedModule = modules.find((m) => m.id === selectedModuleId);

  const { data: assignments = [], isLoading } = useQuery({
    queryKey: ['assignments', selectedCourseId, selectedModuleId],
    queryFn: async () => {
      const { data } = await api.get('/assignments', {
        params: { courseId: selectedCourseId, moduleId: selectedModuleId },
      });
      return data.data as Assignment[];
    },
    enabled: !!selectedCourseId && !!selectedModuleId && step === 3,
  });

  const { data: assignmentCounts = [] } = useQuery({
    queryKey: ['assignments-course-counts', selectedCourseId],
    queryFn: async () => {
      const { data } = await api.get('/assignments', { params: { courseId: selectedCourseId } });
      return data.data as Assignment[];
    },
    enabled: !!selectedCourseId && step === 2,
  });

  const countByModule = assignmentCounts.reduce<Record<string, number>>((acc, a) => {
    if (a.moduleId) acc[a.moduleId] = (acc[a.moduleId] ?? 0) + 1;
    return acc;
  }, {});

  const getEffectiveStatus = (a: Assignment) => {
    if (a.status === 'CLOSED') return 'CLOSED';
    if (a.dueDate && new Date(a.dueDate).getTime() < Date.now()) return 'CLOSED';
    return a.status;
  };

  const filtered = assignments.filter((a) => {
    if (search && !a.title.toLowerCase().includes(search.toLowerCase())) return false;
    if (statusFilter === 'SUBMISSIONS') return (a.submissionCount ?? 0) > 0;
    if (statusFilter && getEffectiveStatus(a) !== statusFilter) return false;
    return true;
  });

  const statusBadge = (s: string) => {
    const map: Record<string, string> = {
      PUBLISHED: 'bg-emerald-100 text-emerald-700',
      CLOSED: 'bg-gray-100 text-gray-600',
      DRAFT: 'bg-amber-100 text-amber-700',
    };
    return map[s] ?? 'bg-gray-100 text-gray-600';
  };

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/assignments/${id}`),
    onSuccess: () => {
      toast.success('Assignment deleted');
      qc.invalidateQueries({ queryKey: ['assignments'] });
      qc.invalidateQueries({ queryKey: ['assignments-course-counts'] });
      qc.invalidateQueries({ queryKey: ['assignment-dashboard'] });
    },
    onError: () => toast.error('Failed to delete'),
  });

  const toggleStatusMut = useMutation({
    mutationFn: (a: Assignment) => {
      const isClosed = getEffectiveStatus(a) === 'CLOSED';
      const newStatus = isClosed ? 'PUBLISHED' : 'CLOSED';
      const isPastDue = a.dueDate && new Date(a.dueDate).getTime() < Date.now();
      const payload: Record<string, unknown> = { status: newStatus };
      if (newStatus === 'PUBLISHED' && isPastDue) payload.dueDate = null;
      return api.put(`/assignments/${a.id}`, payload);
    },
    onSuccess: () => {
      toast.success('Assignment status updated');
      qc.invalidateQueries({ queryKey: ['assignments'] });
      qc.invalidateQueries({ queryKey: ['assignment-dashboard'] });
    },
    onError: () => toast.error('Failed to update status'),
  });

  const publishMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'PUBLISHED' | 'DRAFT' }) =>
      api.put(`/assignments/${id}`, { status }),
    onSuccess: (_, { status }) => {
      toast.success(status === 'PUBLISHED' ? 'Assignment published — students notified' : 'Assignment moved back to draft');
      qc.invalidateQueries({ queryKey: ['assignments'] });
      qc.invalidateQueries({ queryKey: ['assignment-dashboard'] });
    },
    onError: (e: { response?: { data?: { message?: string } } }) =>
      toast.error(e.response?.data?.message ?? 'Failed to update assignment status'),
  });

  const crumbs = [
    { step: 1 as const, label: 'Course', val: selectedCourse?.title },
    { step: 2 as const, label: 'Session', val: selectedModule ? formatSessionLabel(selectedModule) : null },
    { step: 3 as const, label: 'Assignments', val: step === 3 ? 'Manage' : null },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1 text-xs flex-wrap">
        {crumbs.map((c, i) => (
          <div key={c.step} className="flex items-center gap-1">
            {i > 0 && <ChevronRight className="w-3 h-3 text-gray-300" />}
            <button
              type="button"
              onClick={() => {
                if (c.step >= step) return;
                setStep(c.step);
                if (c.step === 1) { setSelectedModuleId(''); }
              }}
              disabled={c.step >= step}
              className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
                step === c.step
                  ? 'bg-teal-600 text-white'
                  : c.step < step
                    ? 'bg-teal-50 text-teal-700 hover:bg-teal-100'
                    : 'bg-gray-100 text-gray-400 cursor-default'
              }`}
            >
              {c.step}. {c.val ? (c.val.length > 28 ? `${c.val.slice(0, 28)}…` : c.val) : c.label}
            </button>
          </div>
        ))}
      </div>

      {step === 1 && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {courses.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => { setSelectedCourseId(c.id); setSelectedModuleId(''); setStep(2); }}
              className="text-left p-4 rounded-2xl border border-gray-100 bg-white shadow-sm hover:border-teal-200 hover:shadow-md transition-all"
            >
              <BookOpen className="w-5 h-5 text-teal-600 mb-2" />
              <p className="font-semibold text-gray-900">{c.title}</p>
              <p className="text-xs text-gray-400 mt-1">Select sessions → manage assignments</p>
            </button>
          ))}
          {!courses.length && (
            <div className="col-span-full text-center py-12 text-gray-500 text-sm">No courses yet</div>
          )}
        </div>
      )}

      {step === 2 && (
        <div className="space-y-3">
          {modulesLoading ? (
            <Skeleton className="h-40 rounded-2xl" />
          ) : (
            <div className="space-y-2">
              {modules.map((m) => {
                const count = countByModule[m.id] ?? 0;
                return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    if (canEdit && count === 0) {
                      onCreateForSession(selectedCourseId, m.id);
                      return;
                    }
                    setSelectedModuleId(m.id);
                    setStep(3);
                  }}
                  className="w-full flex items-center justify-between gap-3 p-4 rounded-xl border border-gray-100 bg-white hover:border-teal-200 hover:bg-teal-50/40 transition-colors text-left"
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900 truncate">{formatSessionLabel(m)}</p>
                    <p className="text-xs text-gray-500 mt-0.5 truncate">{m.title}</p>
                    {canEdit && count === 0 && (
                      <p className="text-[11px] text-teal-600 mt-1">Click to upload assignment for this session</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      count === 0 ? 'bg-amber-50 text-amber-700' : 'bg-gray-100 text-gray-600'
                    }`}>
                      {count === 0 ? 'No content — upload' : `${count} assignment${count === 1 ? '' : 's'}`}
                    </span>
                    <ChevronRight className="w-4 h-4 text-gray-400" />
                  </div>
                </button>
                );
              })}
              {!modules.length && (
                <div className="text-center py-12 bg-gray-50 rounded-2xl border border-dashed border-gray-200 text-sm text-gray-500">
                  No sessions for this course yet
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {step === 3 && (
        <>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex flex-col sm:flex-row gap-3 flex-1">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                className="w-full pl-9 pr-4 py-2 text-sm border rounded-lg"
                placeholder="Search assignments..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="flex gap-1 bg-gray-100 p-0.5 rounded-lg h-fit flex-wrap">
              {[
                { val: '', label: 'All' },
                { val: 'PUBLISHED', label: 'Published' },
                { val: 'DRAFT', label: 'Draft' },
                { val: 'CLOSED', label: 'Closed' },
                { val: 'SUBMISSIONS', label: 'Submissions' },
              ].map(({ val, label }) => (
                <button
                  key={val || 'all'}
                  type="button"
                  onClick={() => setStatusFilter(val)}
                  className={`px-2.5 py-1.5 text-xs font-medium rounded ${
                    statusFilter === val ? 'bg-white text-teal-700 shadow-sm' : 'text-gray-500'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            </div>
            {canEdit && selectedCourseId && selectedModuleId && (
              <button
                type="button"
                onClick={() => onCreateForSession(selectedCourseId, selectedModuleId)}
                className="inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold text-white bg-teal-600 rounded-xl hover:bg-teal-700 shrink-0"
              >
                <Plus className="w-3.5 h-3.5" /> Add assignment
              </button>
            )}
          </div>

          <p className="text-xs text-gray-400">
            {filtered.length} assignment{filtered.length !== 1 ? 's' : ''} in this session
          </p>

          {isLoading ? (
            <div className="grid md:grid-cols-2 gap-4">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-48 rounded-2xl" />)}
            </div>
          ) : (
            <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filtered.map((a) => (
                <div key={a.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden hover:shadow-md transition-shadow group">
                  <div className="h-36 bg-gradient-to-br from-teal-500/10 via-cyan-500/5 to-blue-500/10 flex items-center justify-center relative">
                    <div className="w-16 h-20 bg-white rounded-lg shadow-md flex flex-col items-center justify-center border border-red-100 transform group-hover:scale-105 transition-transform">
                      <FileText className="w-8 h-8 text-red-500" />
                      <span className="text-[10px] font-bold text-red-600 mt-1">PDF</span>
                    </div>
                    <span className={`absolute top-3 right-3 text-xs px-2 py-0.5 rounded-full font-medium ${statusBadge(getEffectiveStatus(a))}`}>
                      {getEffectiveStatus(a)}
                    </span>
                  </div>

                  <div className="p-4">
                    <h3 className="font-bold text-gray-900 truncate">{a.title}</h3>
                    <p className="text-xs text-gray-500 mt-0.5">{a.courseTitle}</p>
                    {a.description && (
                      <p className="text-xs text-gray-400 mt-1 line-clamp-2">{a.description}</p>
                    )}

                    <div className="flex items-center gap-3 mt-3 text-xs text-gray-500 flex-wrap">
                      <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {(a.batchIds?.length ?? a.batchCount ?? 0)} batches</span>
                      <span className="flex items-center gap-1"><Upload className="w-3 h-3" /> {a.submissionCount ?? 0} submissions</span>
                      {a.dueDate && (
                        <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> Due: {new Date(a.dueDate).toLocaleString('en-IN')}</span>
                      )}
                      <span className="flex items-center gap-1"><Award className="w-3 h-3" /> Max: {a.maxScore}</span>
                    </div>

                    <div className="flex flex-col gap-2 mt-4">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => onView(a.id)}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-semibold bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors"
                        >
                          <Eye className="w-3.5 h-3.5" /> View Details & PDF
                        </button>
                        {canEdit && (
                          <button
                            type="button"
                            onClick={() => setEditId(a.id)}
                            className="p-2 text-teal-600 bg-teal-50 hover:bg-teal-100 rounded-lg transition-colors"
                            title="Edit & map batches"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                        )}
                        {canDelete && (
                          <button
                            type="button"
                            onClick={() => confirm('Delete this assignment?') && deleteMut.mutate(a.id)}
                            disabled={deleteMut.isPending}
                            className="p-2 text-red-400 hover:bg-red-50 hover:text-red-600 rounded-lg transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                      {canEdit && (
                        <div className="flex flex-col gap-2">
                          {a.status === 'DRAFT' && (
                            <button
                              type="button"
                              onClick={() => publishMut.mutate({ id: a.id, status: 'PUBLISHED' })}
                              disabled={publishMut.isPending}
                              className="w-full flex items-center justify-center gap-1.5 py-2 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors disabled:opacity-50"
                            >
                              <Unlock className="w-3.5 h-3.5" /> Publish Assignment
                            </button>
                          )}
                          {a.status === 'PUBLISHED' && getEffectiveStatus(a) !== 'CLOSED' && (
                            <button
                              type="button"
                              onClick={() => publishMut.mutate({ id: a.id, status: 'DRAFT' })}
                              disabled={publishMut.isPending}
                              className="w-full py-1.5 text-xs font-medium border border-amber-200 rounded-lg text-amber-700 bg-amber-50 hover:bg-amber-100 transition-colors disabled:opacity-50"
                            >
                              Unpublish (Draft)
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => toggleStatusMut.mutate(a)}
                            disabled={toggleStatusMut.isPending || a.status === 'DRAFT'}
                            className="w-full py-1.5 text-xs font-medium border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
                          >
                            {getEffectiveStatus(a) === 'CLOSED' ? 'Open Assignment' : 'Close Assignment'}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {!filtered.length && (
                <div className="col-span-full text-center py-16 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
                  <ClipboardList className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500">
                    {assignments.length ? 'No matching assignments' : 'No assignments for this session yet'}
                  </p>
                  {canEdit && !assignments.length && selectedCourseId && selectedModuleId && (
                    <button
                      type="button"
                      onClick={() => onCreateForSession(selectedCourseId, selectedModuleId)}
                      className="mt-4 inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-teal-600 rounded-xl hover:bg-teal-700"
                    >
                      <Plus className="w-4 h-4" /> Upload assignment for this session
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {editId && (
        <EditAssignmentModal
          id={editId}
          onClose={() => setEditId(null)}
          onDone={() => {
            setEditId(null);
            qc.invalidateQueries({ queryKey: ['assignments'] });
            qc.invalidateQueries({ queryKey: ['assignments-course-counts'] });
          }}
        />
      )}
    </div>
  );
}

function EditAssignmentModal({
  id,
  onClose,
  onDone,
}: {
  id: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [hasDueDate, setHasDueDate] = useState(false);
  const [dueDate, setDueDate] = useState('');
  const [maxScore, setMaxScore] = useState(100);
  const [batchIds, setBatchIds] = useState<string[]>([]);
  const [courseId, setCourseId] = useState('');
  const [loading, setLoading] = useState(false);

  const { data: detail, isLoading } = useQuery({
    queryKey: ['assignment-edit', id],
    queryFn: async () => {
      const { data } = await api.get(`/assignments/${id}`);
      return data.data as Assignment;
    },
  });

  useEffect(() => {
    if (!detail) return;
    setTitle(detail.title);
    setDescription(detail.description ?? '');
    setMaxScore(detail.maxScore);
    setCourseId(detail.courseId);
    setBatchIds(detail.batches?.map((b) => b.id) ?? detail.batchIds ?? []);
    if (detail.dueDate) {
      setHasDueDate(true);
      setDueDate(new Date(detail.dueDate).toISOString().slice(0, 16));
    } else {
      setHasDueDate(false);
      setDueDate('');
    }
  }, [detail]);

  const { data: batches = [] } = useQuery({
    queryKey: ['batches-asg-edit', courseId],
    queryFn: () => fetchBatches(courseId),
    enabled: !!courseId,
  });

  async function submit() {
    if (!title.trim()) { toast.error('Title is required'); return; }
    setLoading(true);
    try {
      await api.put(`/assignments/${id}`, {
        title: title.trim(),
        description: description.trim() || null,
        maxScore,
        dueDate: hasDueDate && dueDate ? new Date(dueDate).toISOString() : null,
        batchIds,
      });
      toast.success('Assignment updated — batch mapping saved (status unchanged)');
      onDone();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message ?? 'Failed to update assignment');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b sticky top-0 bg-white">
          <h2 className="font-bold text-gray-900">Edit assignment</h2>
          <button type="button" onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5 text-gray-500" /></button>
        </div>
        {isLoading || !detail ? (
          <div className="p-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-teal-600" /></div>
        ) : (
          <div className="p-5 space-y-4">
            <div>
              <label className={LABEL_CLS}>Title *</label>
              <input className={INPUT_CLS} value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div>
              <label className={LABEL_CLS}>Description</label>
              <textarea className={INPUT_CLS} rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={LABEL_CLS}>Max score</label>
                <NumericInput className={INPUT_CLS} value={maxScore} onChange={setMaxScore} min={1} />
              </div>
              <div>
                <label className={LABEL_CLS}>Due date</label>
                <div className="flex items-center gap-2 mb-1">
                  <input type="checkbox" checked={hasDueDate} onChange={(e) => setHasDueDate(e.target.checked)} />
                  <span className="text-xs text-gray-500">Set due date</span>
                </div>
                {hasDueDate && (
                  <input type="datetime-local" className={INPUT_CLS} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                )}
              </div>
            </div>

            <div>
              <label className={LABEL_CLS}>Map to batches</label>
              <p className="text-xs text-gray-400 mb-2">
                Mapping does not change Draft status. Students only see this after session Done for their batch.
              </p>
              <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto">
                {batches.map((b) => (
                  <label
                    key={b.id}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs cursor-pointer ${
                      batchIds.includes(b.id) ? 'bg-teal-50 border-teal-200 text-teal-800' : 'bg-gray-50 border-gray-200 text-gray-600'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={batchIds.includes(b.id)}
                      onChange={(e) => setBatchIds(e.target.checked ? [...batchIds, b.id] : batchIds.filter((x) => x !== b.id))}
                    />
                    {b.name}
                  </label>
                ))}
                {!batches.length && (
                  <p className="text-xs text-gray-400">No batches linked to this course yet</p>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={submit}
              disabled={loading}
              className="w-full py-2.5 bg-teal-600 text-white rounded-xl font-semibold disabled:opacity-50 hover:bg-teal-700 flex items-center justify-center gap-2"
            >
              {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : 'Save changes'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────── Create Assignment Form ──────────────────────────── */

function CreateAssignmentForm({
  courses,
  onSuccess,
  presetCourseId,
  presetModuleId,
}: {
  courses: Course[];
  onSuccess: () => void;
  presetCourseId?: string;
  presetModuleId?: string;
}) {
  const qc = useQueryClient();
  const [courseId, setCourseId] = useState(presetCourseId || courses[0]?.id || '');
  const [moduleId, setModuleId] = useState(presetModuleId || '');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [hasDueDate, setHasDueDate] = useState(false);
  const [dueDate, setDueDate] = useState('');
  const [maxScore, setMaxScore] = useState(100);
  const [batchIds, setBatchIds] = useState<string[]>([]);
  const [pdfs, setPdfs] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const lockedToSession = !!(presetCourseId && presetModuleId);

  const { data: modules = [] } = useQuery({
    queryKey: ['course-modules-asg', courseId],
    queryFn: () => fetchModules(courseId),
    enabled: !!courseId,
  });

  useEffect(() => {
    if (lockedToSession) return;
    setModuleId('');
  }, [courseId, lockedToSession]);

  useEffect(() => {
    if (presetCourseId) setCourseId(presetCourseId);
    if (presetModuleId) setModuleId(presetModuleId);
  }, [presetCourseId, presetModuleId]);

  const selectedCourse = courses.find((c) => c.id === courseId);
  const selectedModule = modules.find((m) => m.id === moduleId);

  function pickFiles(list: FileList | File[] | null | undefined) {
    if (!list) return;
    const next: File[] = [];
    for (const f of Array.from(list)) {
      if (!(f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'))) {
        toast.error(`${f.name}: only PDF files are accepted`);
        continue;
      }
      if (f.size > 20 * 1024 * 1024) {
        toast.error(`${f.name}: too large — max 20 MB`);
        continue;
      }
      next.push(f);
    }
    if (next.length) setPdfs((prev) => [...prev, ...next]);
  }

  const { data: batches = [] } = useQuery({
    queryKey: ['batches-asg', courseId],
    queryFn: () => fetchBatches(courseId),
    enabled: !!courseId,
  });

  function titleFromFile(f: File) {
    return f.name.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ').trim() || f.name;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!pdfs.length) {
      toast.error('Please upload at least one PDF');
      return;
    }
    if (!courseId || !moduleId) {
      toast.error('Course and session are required');
      return;
    }
    if (pdfs.length === 1 && !title.trim()) {
      toast.error('Title is required');
      return;
    }
    setLoading(true);
    let ok = 0;
    try {
      for (const pdf of pdfs) {
        const fd = new FormData();
        fd.append('file', pdf);
        fd.append('courseId', courseId);
        fd.append('title', pdfs.length === 1 ? title.trim() : titleFromFile(pdf));
        fd.append('description', description);
        fd.append('maxScore', String(maxScore));
        fd.append('status', 'DRAFT');
        if (hasDueDate && dueDate) fd.append('dueDate', new Date(dueDate).toISOString());
        fd.append('batchIds', JSON.stringify(batchIds));
        fd.append('moduleId', moduleId);
        await api.post('/assignments', fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        ok += 1;
      }
      await refreshLists(qc, [['assignments'], ['assignment-dashboard']]);
      toast.success(ok === 1 ? 'Assignment saved as draft — releases when session is Done' : `${ok} assignments saved — release when session is Done`);
      onSuccess();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg ?? (ok ? `Created ${ok}, then failed` : 'Failed to create assignment'));
    } finally {
      setLoading(false);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    pickFiles(e.dataTransfer.files);
  }

  return (
    <form onSubmit={submit} className="max-w-2xl bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5">
      {lockedToSession && (
        <div className="rounded-xl border border-teal-100 bg-teal-50 px-4 py-3 text-sm text-teal-800">
          <p className="font-semibold">Uploading for selected session</p>
          <p className="text-xs mt-0.5">
            {selectedCourse?.title ?? 'Course'}
            {selectedModule ? ` · ${formatSessionLabel(selectedModule)}` : ''}
          </p>
          <p className="text-[11px] text-teal-700/80 mt-1">
            Fill title + PDF. Batches that include this course get the assignment automatically; students see it when the session is marked Done.
          </p>
        </div>
      )}

      <div
        onClick={() => !pdfs.length && fileRef.current?.click()}
        className={`border-2 border-dashed rounded-2xl p-8 text-center transition-all ${pdfs.length ? '' : 'cursor-pointer'} ${
          dragOver ? 'border-teal-400 bg-teal-50' : pdfs.length ? 'border-emerald-300 bg-emerald-50/50' : 'border-gray-200 hover:border-teal-400'
        }`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        <input
          ref={fileRef}
          type="file"
          accept="application/pdf,.pdf"
          multiple
          className="hidden"
          onChange={(e) => { pickFiles(e.target.files); e.target.value = ''; }}
        />
        {pdfs.length > 0 ? (
          <div className="space-y-3 text-left">
            <p className="text-sm font-semibold text-emerald-800 text-center">{pdfs.length} PDF{pdfs.length > 1 ? 's' : ''} ready</p>
            <ul className="max-h-40 overflow-y-auto space-y-1.5">
              {pdfs.map((f, i) => (
                <li key={`${f.name}-${i}`} className="flex items-center justify-between gap-2 bg-white border border-emerald-100 rounded-lg px-3 py-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText className="w-4 h-4 text-red-500 shrink-0" />
                    <span className="text-xs font-medium text-gray-800 truncate">{f.name}</span>
                    <span className="text-[10px] text-gray-400 shrink-0">{(f.size / 1024).toFixed(0)} KB</span>
                  </div>
                  <button type="button" onClick={() => setPdfs((p) => p.filter((_, j) => j !== i))}
                    className="text-red-400 hover:text-red-600 p-1"><X className="w-3.5 h-3.5" /></button>
                </li>
              ))}
            </ul>
            <div className="flex justify-center gap-3">
              <button type="button" onClick={() => fileRef.current?.click()} className="text-xs text-teal-600 hover:text-teal-800">
                Add more PDFs
              </button>
              <button type="button" onClick={() => setPdfs([])} className="text-xs text-red-500 hover:text-red-700">
                Clear all
              </button>
            </div>
          </div>
        ) : (
          <div>
            <Upload className="w-10 h-10 text-teal-400 mx-auto mb-3" />
            <p className="font-semibold text-gray-700">Drag &amp; drop PDFs here, or click to browse</p>
            <p className="text-xs text-gray-400 mt-1">Upload one or many — each PDF becomes an assignment mapped to the session</p>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); fileRef.current?.click(); }}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-teal-500 rounded-lg hover:bg-teal-600 transition-colors">
              <Upload className="w-4 h-4" /> Browse files
            </button>
          </div>
        )}
      </div>

      <div>
        <label className={LABEL_CLS}>Course *</label>
        <select
          className={INPUT_CLS}
          value={courseId}
          disabled={lockedToSession}
          onChange={(e) => { setCourseId(e.target.value); setBatchIds([]); }}
        >
          <option value="">Select a course</option>
          {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
        </select>
      </div>

      <div>
        <label className={LABEL_CLS}>Link to session *</label>
        <select
          className={INPUT_CLS}
          value={moduleId}
          onChange={(e) => setModuleId(e.target.value)}
          disabled={!courseId || lockedToSession}
          required
        >
          <option value="">Select session</option>
          {modules.map((m) => (
            <option key={m.id} value={m.id}>
              {formatSessionLabel(m)} — {m.title}
              {m.status === 'COMPLETED' ? ' (completed)' : ''}
            </option>
          ))}
        </select>
        <p className="text-xs text-purple-600 mt-1.5 flex items-start gap-1.5">
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          Saved as Draft. When this session is marked <strong>Done</strong> in Batch Master, assignments publish to students.
        </p>
      </div>

      {pdfs.length <= 1 && (
        <div>
          <label className={LABEL_CLS}>Title *</label>
          <input className={INPUT_CLS} value={title} onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Week 3 - React Hooks Assignment"
            required={pdfs.length <= 1} />
        </div>
      )}
      {pdfs.length > 1 && (
        <p className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
          Titles will be taken from each PDF filename. Same session, description, due date, and batches apply to all.
        </p>
      )}

      <div>
        <label className={LABEL_CLS}>Description</label>
        <textarea className={INPUT_CLS} rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Instructions for learners..." />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2 cursor-pointer">
            <input type="checkbox" checked={hasDueDate}
              onChange={(e) => { setHasDueDate(e.target.checked); if (!e.target.checked) setDueDate(''); }}
              className="rounded border-teal-300 text-teal-600 focus:ring-teal-500" />
            Set due date &amp; time
          </label>
          {hasDueDate && (
            <input type="datetime-local" className={INPUT_CLS} value={dueDate}
              onChange={(e) => setDueDate(e.target.value)} required={hasDueDate} />
          )}
        </div>
        <div>
          <label className={LABEL_CLS}>Max score</label>
          <NumericInput className={INPUT_CLS} min={1} value={maxScore} onChange={setMaxScore} />
        </div>
      </div>

      <div>
        <label className={LABEL_CLS}>Map to batches (optional)</label>
        <p className="text-xs text-gray-400 mb-1">
          Leave empty — every batch that includes this course gets the assignment automatically. Optional checkboxes override the set.
        </p>
        <div className="flex flex-wrap gap-2 mt-1">
          {batches.length > 0 ? batches.map((b) => (
            <label key={b.id} className={`flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg border cursor-pointer transition-colors ${
              batchIds.includes(b.id) ? 'bg-teal-50 border-teal-200 text-teal-800' : 'bg-gray-50 border-gray-200 text-gray-600 hover:border-gray-300'
            }`}>
              <input
                type="checkbox"
                checked={batchIds.includes(b.id)}
                onChange={(e) => setBatchIds(e.target.checked ? [...batchIds, b.id] : batchIds.filter((id) => id !== b.id))}
                className="rounded border-teal-300 text-teal-600 focus:ring-teal-500"
              />
              {b.name}
              <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                b.status === 'ONGOING' ? 'bg-emerald-100 text-emerald-600' :
                b.status === 'UPCOMING' ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-500'
              }`}>{b.status}</span>
            </label>
          )) : (
            <div className="flex items-center gap-2 text-xs text-gray-400 py-2">
              <AlertCircle className="w-3.5 h-3.5" />
              {courseId ? 'No batches linked yet — map from Edit when ready' : 'Select a course first'}
            </div>
          )}
        </div>
      </div>

      <div className="bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 text-xs text-amber-800">
        Saved as <strong>Draft</strong>. Students see it only after batch mapping + session marked Done (or manual publish).
      </div>

      <button
        type="submit"
        disabled={loading || !pdfs.length || !moduleId}
        className="w-full py-3 bg-gradient-to-r from-teal-500 to-cyan-600 text-white font-semibold rounded-xl shadow-md disabled:opacity-50 hover:from-teal-600 hover:to-cyan-700 transition-all"
      >
        {loading
          ? <Loader2 className="w-5 h-5 animate-spin mx-auto" />
          : pdfs.length > 1
            ? `Create ${pdfs.length} Assignments`
            : 'Create Assignment with PDF'}
      </button>
    </form>
  );
}

/* ─────────────────────────── Assignment Detail Drawer ──────────────────────────── */

function AssignmentDetailDrawer({
  id,
  onClose,
  qc,
  canEdit,
}: {
  id: string;
  onClose: () => void;
  qc: ReturnType<typeof useQueryClient>;
  canEdit: boolean;
}) {
  const [gradeId, setGradeId]   = useState<string | null>(null);
  const [score, setScore]       = useState('');
  const [feedback, setFeedback] = useState('');
  const [aiResults, setAiResults] = useState<Record<string, AIGradeResult>>({});
  const [aiLoading, setAiLoading] = useState<string | null>(null);

  const { data: a, isLoading } = useQuery({
    queryKey: ['assignment', id],
    queryFn: async () => {
      const { data } = await api.get(`/assignments/${id}`);
      return data.data as Assignment;
    },
  });

  const gradeMut = useMutation({
    mutationFn: () => api.put(`/assignments/submissions/${gradeId}/grade`, { score: +score, feedback }),
    onSuccess: () => {
      toast.success('Submission graded successfully');
      setGradeId(null);
      setScore('');
      setFeedback('');
      qc.invalidateQueries({ queryKey: ['assignment', id] });
      qc.invalidateQueries({ queryKey: ['assignment-dashboard'] });
    },
    onError: () => toast.error('Failed to grade submission'),
  });

  const publishMut = useMutation({
    mutationFn: (status: 'PUBLISHED' | 'DRAFT') => api.put(`/assignments/${id}`, { status }),
    onSuccess: (_, status) => {
      toast.success(status === 'PUBLISHED' ? 'Assignment published' : 'Assignment unpublished');
      qc.invalidateQueries({ queryKey: ['assignment', id] });
      qc.invalidateQueries({ queryKey: ['assignments'] });
      qc.invalidateQueries({ queryKey: ['assignment-dashboard'] });
    },
    onError: (e: { response?: { data?: { message?: string } } }) =>
      toast.error(e.response?.data?.message ?? 'Failed to update status'),
  });

  // pdfUrl is a presigned S3 URL resolved server-side
  const pdfUrl: string | null = a?.pdfUrl ?? null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-sm" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-4xl bg-white h-full shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-right">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b bg-gradient-to-r from-teal-50 to-white flex-shrink-0">
          <div className="min-w-0">
            <h2 className="text-xl font-bold text-gray-900 truncate">{a?.title ?? 'Assignment'}</h2>
            <div className="flex items-center gap-2 mt-0.5">
              <p className="text-sm text-gray-500">{a?.courseTitle}</p>
              {a?.status && (
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  a.status === 'PUBLISHED' ? 'bg-emerald-100 text-emerald-700' :
                  a.status === 'CLOSED' ? 'bg-gray-100 text-gray-600' : 'bg-amber-100 text-amber-700'
                }`}>{a.status}</span>
              )}
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors"><X className="w-5 h-5" /></button>
        </div>

        {canEdit && a?.status && a.status !== 'CLOSED' && (
          <div className="px-6 py-3 border-b bg-white flex gap-2 flex-shrink-0">
            {a.status === 'DRAFT' && (
              <button
                type="button"
                onClick={() => publishMut.mutate('PUBLISHED')}
                disabled={publishMut.isPending}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 disabled:opacity-50"
              >
                <Unlock className="w-4 h-4" /> Publish to Students
              </button>
            )}
            {a.status === 'PUBLISHED' && (
              <button
                type="button"
                onClick={() => publishMut.mutate('DRAFT')}
                disabled={publishMut.isPending}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 disabled:opacity-50"
              >
                Unpublish (Draft)
              </button>
            )}
          </div>
        )}

        {isLoading ? (
          <div className="flex-1 p-6"><Skeleton className="h-full" /></div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            {/* PDF Viewer */}
            <div className="p-4 bg-gray-50 border-b">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-gray-800 flex items-center gap-2">
                  <FileText className="w-5 h-5 text-red-500" /> Assignment PDF
                  <span className="text-xs text-gray-400 font-normal">{a?.pdfFilename}</span>
                </h3>
                {pdfUrl && (
                  <div className="flex items-center gap-2">
                    <a href={pdfUrl} download className="text-xs text-gray-500 font-medium hover:text-gray-700 flex items-center gap-1 transition-colors">
                      <Download className="w-3.5 h-3.5" /> Download
                    </a>
                    <a href={pdfUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-teal-600 font-medium hover:text-teal-800 flex items-center gap-1 transition-colors">
                      <ExternalLink className="w-3.5 h-3.5" /> Open in new tab
                    </a>
                  </div>
                )}
              </div>
              {pdfUrl ? (
                <div className="rounded-xl overflow-hidden border border-gray-200 shadow-lg bg-white" style={{ height: 'min(65vh, 550px)' }}>
                  <iframe
                    src={`${pdfUrl}#toolbar=1&navpanes=0&scrollbar=1`}
                    title={a?.title}
                    className="w-full h-full"
                    style={{ border: 'none' }}
                  />
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 bg-white rounded-xl border border-gray-200">
                  <AlertCircle className="w-8 h-8 text-gray-300 mb-2" />
                  <p className="text-gray-400 text-sm">PDF not available</p>
                </div>
              )}
            </div>

            {/* Details + Submissions */}
            <div className="p-6 grid md:grid-cols-2 gap-6">
              <div>
                <h4 className="font-semibold text-gray-900 mb-3">Assignment Details</h4>
                {a?.description && (
                  <p className="text-sm text-gray-600 mb-4 bg-gray-50 p-3 rounded-lg">{a.description}</p>
                )}
                <dl className="text-sm space-y-2">
                  <div className="flex justify-between py-1 border-b border-gray-50">
                    <dt className="text-gray-500">Status</dt>
                    <dd className="font-medium">{a?.status}</dd>
                  </div>
                  {a?.moduleTitle && (
                    <div className="flex justify-between py-1 border-b border-gray-50">
                      <dt className="text-gray-500 flex items-center gap-1"><BookOpen className="w-3.5 h-3.5" /> Session</dt>
                      <dd className="font-medium text-purple-700 text-right">{a.moduleTitle}</dd>
                    </div>
                  )}
                  <div className="flex justify-between py-1 border-b border-gray-50">
                    <dt className="text-gray-500">Max score</dt>
                    <dd className="font-medium">{a?.maxScore}</dd>
                  </div>
                  {a?.dueDate && (
                    <div className="flex justify-between py-1 border-b border-gray-50">
                      <dt className="text-gray-500 flex items-center gap-1"><Calendar className="w-3.5 h-3.5" /> Due date</dt>
                      <dd className="font-medium">{new Date(a.dueDate).toLocaleString('en-IN')}</dd>
                    </div>
                  )}
                  {a?.pdfSizeBytes && (
                    <div className="flex justify-between py-1 border-b border-gray-50">
                      <dt className="text-gray-500">File size</dt>
                      <dd>{(a.pdfSizeBytes / 1024).toFixed(1)} KB</dd>
                    </div>
                  )}
                </dl>

                <h4 className="font-semibold text-gray-900 mt-5 mb-2 flex items-center gap-2">
                  <BookOpen className="w-4 h-4" /> Mapped Batches
                </h4>
                <div className="space-y-1">
                  {(a?.batches ?? []).map((b) => (
                    <div key={b.id} className="flex items-center justify-between bg-gray-50 px-3 py-2 rounded-lg text-sm">
                      <span>{b.name}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded ${
                        b.status === 'ONGOING' ? 'bg-emerald-100 text-emerald-600' :
                        b.status === 'UPCOMING' ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-500'
                      }`}>{b.status}</span>
                    </div>
                  ))}
                  {!(a?.batches?.length) && <p className="text-gray-400 text-sm">No batches mapped</p>}
                </div>
              </div>

              <div>
                <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <Award className="w-4 h-4" /> Submissions & Grading
                  {(a?.submissions?.length ?? 0) > 0 && (
                    <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">{a?.submissions?.length}</span>
                  )}
                </h4>
                <div className="space-y-3">
                  {(a?.submissions ?? []).map((s) => {
                    const aiRes = s.id ? aiResults[s.id] : undefined;
                    const isAiLoading = s.id ? aiLoading === s.id : false;
                    return (
                    <div key={s.id ?? s.studentId} className={`rounded-xl text-sm border transition-colors ${
                      s.status === 'GRADED' ? 'bg-emerald-50/50 border-emerald-100' : 'bg-gray-50 border-gray-100'
                    }`}>
                      {/* Student row */}
                      <div className="flex items-start justify-between p-3">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-gray-900">{s.studentName}</p>
                          <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                            <Clock className="w-3 h-3" /> {s.submittedAt ? new Date(s.submittedAt).toLocaleString() : '--'}
                          </p>
                          <div className="flex gap-3 mt-1.5">
                            {s.fileUrl && (
                              <a href={s.fileUrl} target="_blank" rel="noopener noreferrer"
                                className="text-xs flex items-center gap-1 text-red-600 hover:text-red-700 font-medium">
                                <FileText className="w-3 h-3" /> PDF <ExternalLink className="w-2.5 h-2.5" />
                              </a>
                            )}
                            {s.zipUrl && (
                              <a href={s.zipUrl} target="_blank" rel="noopener noreferrer"
                                className="text-xs flex items-center gap-1 text-blue-600 hover:text-blue-700 font-medium">
                                <Download className="w-3 h-3" /> ZIP <ExternalLink className="w-2.5 h-2.5" />
                              </a>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {s.status === 'GRADED' ? (
                            <div className="text-right">
                              <span className={`text-lg font-bold ${(s.score ?? 0) >= (a?.maxScore ?? 100) * 0.6 ? 'text-emerald-600' : 'text-red-500'}`}>
                                {s.score}
                              </span>
                              <span className="text-gray-400 text-sm">/{a?.maxScore}</span>
                            </div>
                          ) : s.status === 'PENDING' ? (
                            <span className="text-xs text-amber-600 bg-amber-50 px-2.5 py-1 rounded-md font-medium border border-amber-100">
                              Not Submitted
                            </span>
                          ) : (
                            <button
                              onClick={() => { setGradeId(s.id); setScore(''); setFeedback(''); }}
                              className="text-xs px-3 py-1.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors font-medium"
                            >
                              Grade
                            </button>
                          )}
                          {/* AI Grade button */}
                          {s.status !== 'PENDING' && (
                            <button
                              onClick={async () => {
                                setAiLoading(s.id);
                                try {
                                  const { data } = await api.post(`/assignments/submissions/${s.id}/ai-grade`);
                                  setAiResults((prev) => ({ ...prev, [s.id]: data.data }));
                                  toast.success('AI grading complete');
                                } catch (e: unknown) {
                                  const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
                                  toast.error(msg ?? 'AI grading failed');
                                } finally {
                                  setAiLoading(null);
                                }
                              }}
                              disabled={isAiLoading}
                              title="Auto-grade with AI (Groq)"
                              className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-white rounded-lg transition-colors font-medium"
                            >
                              {isAiLoading
                                ? <><Loader2 className="w-3 h-3 animate-spin" /> Analyzing...</>
                                : <><Sparkles className="w-3 h-3" /> AI Grade</>}
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Manual feedback */}
                      {s.feedback && !aiRes && (
                        <div className="px-3 pb-3">
                          <p className="text-xs text-gray-500 bg-white p-2 rounded border border-gray-100">
                            <strong>Feedback:</strong> {s.feedback}
                          </p>
                        </div>
                      )}

                      {/* AI Result panel */}
                      {aiRes && (
                        <div className="mx-3 mb-3 rounded-xl border border-violet-200 bg-violet-50 p-3 space-y-2">
                          {/* Human review warning banner */}
                          {aiRes.breakdown?.needs_human_review === 'YES — please verify' && (
                            <div className="flex items-center gap-2 bg-amber-50 border border-amber-300 rounded-lg px-3 py-2 text-xs text-amber-800 font-medium">
                              <span className="text-base">⚠️</span>
                              <div>
                                <span className="font-bold">Human review required</span>
                                {aiRes.breakdown.pass1_score && aiRes.breakdown.final_score &&
                                  aiRes.breakdown.pass1_score !== aiRes.breakdown.final_score && (
                                  <span className="ml-1 font-normal">
                                    — score adjusted from {aiRes.breakdown.pass1_score} → {aiRes.breakdown.final_score} by verification pass.
                                    Please confirm or override.
                                  </span>
                                )}
                              </div>
                            </div>
                          )}
                          <div className="flex items-center justify-between">
                            <span className="flex items-center gap-1.5 text-xs font-semibold text-violet-700">
                              <Sparkles className="w-3.5 h-3.5" /> AI Result
                              <span className="text-violet-400 font-normal">· {aiRes.model}</span>
                            </span>
                            <div className="flex items-center gap-2">
                              <div className="text-right">
                                <span className="text-xl font-black text-violet-700">
                                  {aiRes.score}<span className="text-sm text-violet-400">/{a?.maxScore}</span>
                                </span>
                                {aiRes.breakdown?.pass1_score && String(aiRes.breakdown.pass1_score) !== String(aiRes.score) && (
                                  <p className="text-[10px] text-amber-600">initial: {aiRes.breakdown.pass1_score}</p>
                                )}
                              </div>
                              <button
                                onClick={() => {
                                  setGradeId(s.id);
                                  setScore(String(aiRes.score));
                                  setFeedback(aiRes.feedback);
                                }}
                                className="text-xs px-2.5 py-1 bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition-colors font-medium"
                              >
                                Apply
                              </button>
                            </div>
                          </div>
                          <p className="text-xs text-gray-700">{aiRes.feedback}</p>
                          {aiRes.breakdown?.score_calculation && (
                            <p className="text-[10px] text-violet-500 font-mono bg-white border border-violet-100 rounded px-2 py-1">
                              {aiRes.breakdown.score_calculation}
                            </p>
                          )}
                          {Object.keys(aiRes.breakdown).length > 0 && (
                            <div className="grid grid-cols-1 gap-1">
                              {Object.entries(aiRes.breakdown)
                                .filter(([k]) => !['score_calculation','pass1_score','final_score','needs_human_review'].includes(k))
                                .map(([k, v]) => (
                                  <div key={k} className="flex gap-2 text-xs">
                                    <span className="font-semibold text-violet-700 capitalize w-24 flex-shrink-0">{k}:</span>
                                    <span className="text-gray-600">{v}</span>
                                  </div>
                                ))}
                            </div>
                          )}
                          {/* Raw JSON toggle */}
                          <details className="text-[10px]">
                            <summary className="cursor-pointer text-violet-400 hover:text-violet-600">View raw JSON</summary>
                            <pre className="mt-1 bg-white rounded p-2 overflow-x-auto text-gray-600 border border-violet-100">
                              {JSON.stringify(aiRes.raw, null, 2)}
                            </pre>
                          </details>
                        </div>
                      )}
                    </div>
                    );
                  })}
                  {!(a?.submissions?.length) && (
                    <div className="text-center py-8 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                      <Upload className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                      <p className="text-gray-400 text-sm">No submissions yet</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Grading bar */}
        {gradeId && (
          <div className="border-t p-4 bg-gradient-to-r from-gray-50 to-white flex gap-3 items-end flex-shrink-0">
            <div className="w-24">
              <label className={LABEL_CLS}>Score (max {a?.maxScore})</label>
              <input type="number" className={INPUT_CLS} value={score} onChange={(e) => setScore(e.target.value)} max={a?.maxScore} min={0} placeholder="0" />
            </div>
            <div className="flex-1">
              <label className={LABEL_CLS}>Feedback (optional)</label>
              <input className={INPUT_CLS} value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder="Great work! Consider improving..." />
            </div>
            <button
              onClick={() => gradeMut.mutate()}
              disabled={!score || gradeMut.isPending}
              className="px-5 py-2.5 bg-teal-600 text-white rounded-xl font-semibold text-sm disabled:opacity-50 hover:bg-teal-700 transition-colors flex items-center gap-2"
            >
              {gradeMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              Save Grade
            </button>
            <button onClick={() => setGradeId(null)} className="p-2.5 text-gray-400 hover:text-gray-600">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────── Git Task Tab ──────────────────────────── */

function GitTaskTab({
  courses, canEdit, canDelete, courseFilter,
}: {
  courses: Course[];
  canEdit: boolean;
  canDelete: boolean;
  courseFilter: string;
}) {
  const qc = useQueryClient();
  const [selectedTaskId, setSelectedTaskId] = useState<string>('');
  const [showCreate, setShowCreate] = useState(false);
  const [activeView, setActiveView] = useState<'pipeline' | 'info'>('info');

  const { data: tasks = [], isLoading: tasksLoading } = useQuery<GitTask[]>({
    queryKey: ['git-tasks', courseFilter],
    queryFn: async () => {
      const { data } = await api.get('/assignments/git-tasks', {
        params: courseFilter ? { courseId: courseFilter } : {},
      });
      return data.data as GitTask[];
    },
  });

  const selectedTask = tasks.find(t => t.id === selectedTaskId) ?? tasks[0];

  const { data: pipeline = [], isLoading: pipelineLoading } = useQuery<GitTaskSubmission[]>({
    queryKey: ['git-task-pipeline', selectedTask?.id],
    queryFn: async () => {
      const { data } = await api.get(`/assignments/git-tasks/${selectedTask!.id}/pipeline`);
      return data.data as GitTaskSubmission[];
    },
    enabled: !!selectedTask?.id,
    refetchInterval: 8000,
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/assignments/git-tasks/${id}`),
    onSuccess: () => {
      toast.success('Git task deleted');
      setSelectedTaskId('');
      qc.invalidateQueries({ queryKey: ['git-tasks'] });
    },
    onError: () => toast.error('Failed to delete'),
  });

  const gradeMut = useMutation({
    mutationFn: ({ subId, score, feedback }: { subId: string; score: number; feedback: string }) =>
      api.put(`/assignments/submissions/${subId}/grade`, { score, feedback }),
    onSuccess: () => {
      toast.success('Submission graded');
      qc.invalidateQueries({ queryKey: ['git-task-pipeline', selectedTask?.id] });
    },
    onError: () => toast.error('Failed to grade'),
  });

  const statusMut = useMutation({
    mutationFn: (status: string) => api.put(`/assignments/${selectedTask!.id}`, { status }),
    onSuccess: () => {
      toast.success('Git task status updated');
      qc.invalidateQueries({ queryKey: ['git-tasks'] });
    },
    onError: () => toast.error('Failed to update status'),
  });

  const totalSubmitted = pipeline.filter(p => p.status !== 'IN_PROGRESS').length;
  const totalGraded   = pipeline.filter(p => p.status === 'GRADED').length;
  const avgScore      = totalGraded > 0
    ? (pipeline.filter(p => p.score !== null).reduce((a, p) => a + (p.score ?? 0), 0) / totalGraded).toFixed(1)
    : '—';

  return (
    <div className="space-y-4">
      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Git Tasks',   value: tasks.length,       grad: 'from-blue-500 to-cyan-500',    Icon: GitBranch },
          { label: 'Submitted',   value: totalSubmitted,     grad: 'from-purple-500 to-pink-500',  Icon: Send },
          { label: 'Graded',      value: totalGraded,        grad: 'from-emerald-500 to-teal-500', Icon: Award },
          { label: 'Avg Score',   value: totalGraded > 0 ? `${avgScore}` : '—', grad: 'from-amber-500 to-orange-500', Icon: Star },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <div className={`w-8 h-8 rounded-xl bg-gradient-to-br ${s.grad} flex items-center justify-center mb-2`}>
              <s.Icon className="w-4 h-4 text-white" />
            </div>
            <p className="text-2xl font-bold text-gray-900">{s.value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Workflow banner */}
      <div className="bg-gradient-to-r from-blue-50 via-indigo-50 to-purple-50 border border-blue-100 rounded-2xl p-4">
        <p className="text-xs font-bold text-blue-800 mb-3 flex items-center gap-1.5">
          <Zap className="w-3.5 h-3.5 text-blue-600" /> GitHub Assignment Workflow
        </p>
        <div className="flex items-start gap-1.5 overflow-x-auto pb-1">
          {[
            { Icon: GitBranch,      label: '① Admin creates task',     sub: 'publish manually when ready', cls: 'bg-blue-100 text-blue-700' },
            { Icon: GitPullRequest, label: '② Student forks',          sub: 'template to their GitHub',   cls: 'bg-indigo-100 text-indigo-700' },
            { Icon: Code2,          label: '③ Student codes & pushes', sub: 'commits to their fork',      cls: 'bg-amber-100 text-amber-700' },
            { Icon: Send,           label: '④ Student submits',        sub: 'triggers AI evaluation',     cls: 'bg-cyan-100 text-cyan-700' },
            { Icon: Cpu,            label: '⑤ AI grades code',         sub: 'score /100 with breakdown',  cls: 'bg-emerald-100 text-emerald-700' },
          ].map((step, i) => (
            <div key={i} className="flex items-center gap-1 flex-shrink-0">
              <div className={`${step.cls} rounded-xl px-2.5 py-2 text-center min-w-[100px]`}>
                <step.Icon className="w-4 h-4 mx-auto mb-1" />
                <p className="text-[10px] font-bold leading-tight">{step.label}</p>
                <p className="text-[9px] opacity-70 mt-0.5 leading-tight">{step.sub}</p>
              </div>
              {i < 4 && <span className="text-gray-300 text-sm font-bold">→</span>}
            </div>
          ))}
        </div>
      </div>

      {/* Task list + create button */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 p-1 bg-white rounded-xl border border-gray-200 shadow-sm overflow-x-auto flex-1">
          {tasksLoading ? (
            <div className="px-3 py-1.5 text-xs text-gray-400">Loading tasks…</div>
          ) : tasks.length === 0 ? (
            <div className="px-3 py-1.5 text-xs text-gray-400">No git tasks yet. Create one →</div>
          ) : tasks.map(t => (
            <button key={t.id}
              onClick={() => { setSelectedTaskId(t.id); setActiveView('info'); }}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all border flex-shrink-0 ${
                selectedTask?.id === t.id ? 'bg-blue-50 border-blue-300 text-blue-700' : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
              }`}>
              {t.title}
            </button>
          ))}
        </div>
        {canEdit && (
          <button onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-blue-600 to-cyan-600 text-white text-xs font-bold rounded-xl shadow-md flex-shrink-0">
            <Plus className="w-3.5 h-3.5" /> Create Git Task
          </button>
        )}
      </div>

      {/* Selected task detail */}
      {selectedTask ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Left: task info */}
          <div className="space-y-3">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center flex-shrink-0">
                    <GitBranch className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="font-bold text-gray-900 text-sm">{selectedTask.title}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">{selectedTask.courseTitle}</p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      {selectedTask.moduleTitle && (
                        <p className="text-[10px] text-purple-600 flex items-center gap-1">
                          <BookOpen className="w-3 h-3" />
                          {selectedTask.moduleSessionNumber ? `S${selectedTask.moduleSessionNumber}: ` : ''}
                          {selectedTask.moduleTitle}
                        </p>
                      )}
                      {selectedTask.dueDate && (
                        <p className="text-[10px] text-gray-400 flex items-center gap-1">
                          <Calendar className="w-3 h-3" /> Due: {new Date(selectedTask.dueDate).toLocaleDateString('en-IN')}
                        </p>
                      )}
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-200">
                        {selectedTask.artifactType?.replace('[GIT-TASK] ', '') || 'GitHub'}
                      </span>
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${
                        selectedTask.status === 'PUBLISHED' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' :
                        selectedTask.status === 'CLOSED' ? 'bg-gray-100 text-gray-600 border-gray-200' :
                        'bg-amber-100 text-amber-700 border-amber-200'
                      }`}>{selectedTask.status}</span>
                    </div>
                  </div>
                </div>
                {canDelete && (
                  <button
                    onClick={() => confirm(`Delete "${selectedTask.title}"? This removes all student progress.`) && deleteMut.mutate(selectedTask.id)}
                    disabled={deleteMut.isPending}
                    className="p-2 text-red-400 hover:bg-red-50 hover:text-red-600 rounded-xl transition-colors"
                    title="Delete task">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
              {selectedTask.description && (
                <p className="text-xs text-gray-600 mb-4 leading-relaxed">{selectedTask.description}</p>
              )}
              {canEdit && (
                <div className="flex flex-wrap gap-2 mb-4">
                  {selectedTask.status === 'DRAFT' && (
                    <button type="button" onClick={() => statusMut.mutate('PUBLISHED')} disabled={statusMut.isPending}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50">
                      <Eye className="w-3.5 h-3.5" /> Publish to students
                    </button>
                  )}
                  {selectedTask.status === 'PUBLISHED' && (
                    <>
                      <button type="button" onClick={() => statusMut.mutate('DRAFT')} disabled={statusMut.isPending}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 disabled:opacity-50">
                        Unpublish
                      </button>
                      <button type="button" onClick={() => statusMut.mutate('CLOSED')} disabled={statusMut.isPending}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-gray-600 bg-gray-100 border border-gray-200 rounded-lg hover:bg-gray-200 disabled:opacity-50">
                        Close
                      </button>
                    </>
                  )}
                  {selectedTask.status === 'CLOSED' && (
                    <button type="button" onClick={() => statusMut.mutate('PUBLISHED')} disabled={statusMut.isPending}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 disabled:opacity-50">
                      Reopen
                    </button>
                  )}
                </div>
              )}
              {/* Template repo */}
              <div className="bg-gray-50 rounded-xl p-3 mb-3">
                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1.5 flex items-center gap-1">
                  <GitPullRequest className="w-3 h-3" /> Template Repository
                </p>
                {selectedTask.templateRepoUrl ? (
                  <a href={selectedTask.templateRepoUrl} target="_blank" rel="noopener noreferrer"
                    className="text-xs text-blue-600 hover:underline font-mono flex items-center gap-1.5 break-all">
                    {selectedTask.templateRepoUrl.replace('https://github.com/', 'github.com/')}
                    <ExternalLink className="w-3 h-3 flex-shrink-0" />
                  </a>
                ) : (
                  <span className="text-xs text-gray-400 italic">No template repository set</span>
                )}
                <p className="text-[10px] text-gray-400 mt-1.5">Students fork this repo to start coding</p>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-blue-50 rounded-lg p-2.5">
                  <p className="text-blue-500 text-[10px] font-semibold">Batches</p>
                  <p className="text-blue-800 font-bold">{selectedTask.batchCount}</p>
                </div>
                <div className="bg-purple-50 rounded-lg p-2.5">
                  <p className="text-purple-500 text-[10px] font-semibold">Submissions</p>
                  <p className="text-purple-800 font-bold">{selectedTask.submissionCount}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Right: student pipeline */}
          <div className="lg:col-span-2 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <p className="text-sm font-bold text-gray-900 flex items-center gap-2">
                <Users className="w-4 h-4 text-blue-500" />
                Student Pipeline — {selectedTask.title}
              </p>
              <div className="flex gap-1 p-0.5 bg-gray-100 rounded-lg">
                {(['info', 'pipeline'] as const).map(v => (
                  <button key={v} onClick={() => setActiveView(v)}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all capitalize ${
                      activeView === v ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                    }`}>
                    {v === 'pipeline' ? 'Pipeline View' : 'Task Info'}
                  </button>
                ))}
              </div>
            </div>

            {activeView === 'pipeline' ? (
              <div className="space-y-3">
                {pipelineLoading ? (
                  <div className="text-center py-8 text-gray-400 text-xs">Loading pipeline…</div>
                ) : pipeline.length === 0 ? (
                  <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center">
                    <Users className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                    <p className="text-sm text-gray-400">No student submissions yet for this task.</p>
                    <p className="text-xs text-gray-300 mt-1">Students will appear here once they fork and submit.</p>
                  </div>
                ) : pipeline.map(prog => (
                  <GitStudentCard
                    key={prog.id}
                    prog={prog}
                    maxScore={selectedTask.maxScore}
                    onGrade={(subId, score, feedback) => gradeMut.mutate({ subId, score, feedback })}
                    grading={gradeMut.isPending}
                  />
                ))}
              </div>
            ) : (
              // Info view — show full task detail
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
                <div className="bg-gradient-to-r from-blue-50 via-indigo-50 to-purple-50 rounded-xl p-4 border border-blue-100">
                  <p className="text-xs font-bold text-blue-800 mb-2 flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5" /> What happens after creating this task:
                  </p>
                  <ul className="text-xs text-blue-700 space-y-1.5">
                    <li className="flex items-start gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mt-0.5 flex-shrink-0" />Students see this task in their portal with the template repo URL</li>
                    <li className="flex items-start gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mt-0.5 flex-shrink-0" />They fork → code → submit from their GitHub account</li>
                    <li className="flex items-start gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mt-0.5 flex-shrink-0" />On submit, AI evaluates their fork and gives a score /100</li>
                    <li className="flex items-start gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mt-0.5 flex-shrink-0" />You can manually grade or override the AI score here</li>
                  </ul>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-gray-500 mb-0.5">Status</p>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${
                      selectedTask.status === 'PUBLISHED' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-gray-100 text-gray-600 border-gray-200'
                    }`}>{selectedTask.status}</span>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-0.5">Max Score</p>
                    <p className="font-bold text-gray-900">{selectedTask.maxScore}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-0.5">Due Date</p>
                    <p className="font-bold text-gray-900">{selectedTask.dueDate ? new Date(selectedTask.dueDate).toLocaleDateString('en-IN') : '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-0.5">Artifact Type</p>
                    <p className="font-bold text-gray-900">{selectedTask.artifactType?.replace('[GIT-TASK] ', '') || '—'}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : !tasksLoading ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center text-gray-500">
          <GitBranch className="w-10 h-10 mx-auto text-gray-300 mb-3" />
          <p className="font-semibold text-gray-800">No Git Tasks Found</p>
          <p className="text-sm mt-1">Click "Create Git Task" to add your first GitHub-based assignment.</p>
        </div>
      ) : null}

      {/* Create Git Task Modal */}
      {showCreate && (
        <CreateGitTaskModal
          courses={courses}
          onClose={() => setShowCreate(false)}
          onSuccess={(task) => {
            qc.invalidateQueries({ queryKey: ['git-tasks'] });
            setSelectedTaskId(task.id);
            setShowCreate(false);
            toast.success('Git task created successfully!');
          }}
        />
      )}
    </div>
  );
}

/* ── Git Student Pipeline Card ───────────────────────────────────────────── */

function GitStudentCard({
  prog, maxScore, onGrade, grading,
}: {
  prog: GitTaskSubmission;
  maxScore: number;
  onGrade: (subId: string, score: number, feedback: string) => void;
  grading: boolean;
}) {
  const [showGrade, setShowGrade] = useState(false);
  const [score, setScore] = useState('');
  const [feedback, setFeedback] = useState('');

  const statusConfig: Record<string, { label: string; cls: string }> = {
    IN_PROGRESS: { label: 'In Progress', cls: 'bg-blue-100 text-blue-700 border-blue-200' },
    SUBMITTED:   { label: 'Submitted',   cls: 'bg-purple-100 text-purple-700 border-purple-200' },
    GRADED:      { label: 'Graded',      cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
    LATE:        { label: 'Late',        cls: 'bg-red-100 text-red-700 border-red-200' },
  };
  const sc = statusConfig[prog.status] ?? statusConfig['IN_PROGRESS'];

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 hover:border-blue-200 transition-colors">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center text-white font-bold text-xs flex-shrink-0">
            {prog.studentName.split(' ').map(n => n[0]).join('').slice(0, 2)}
          </div>
          <div>
            <p className="font-bold text-gray-900 text-sm">{prog.studentName}</p>
            <p className="text-[10px] text-gray-400 mt-0.5">
              Submitted: {new Date(prog.submittedAt).toLocaleString('en-IN')}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {prog.aiScore !== null && (
            <span className="text-[9px] bg-amber-100 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded-full font-bold flex items-center gap-0.5">
              <Star className="w-2.5 h-2.5 fill-amber-500 text-amber-500" />
              AI: {prog.aiScore}/100
            </span>
          )}
          <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold border ${sc.cls}`}>{sc.label}</span>
        </div>
      </div>

      {/* Fork URL */}
      {prog.forkUrl && (
        <div className="bg-gray-50 rounded-lg p-2.5 mb-3">
          <p className="text-[10px] font-semibold text-gray-500 mb-1 flex items-center gap-1">
            <GitBranch className="w-3 h-3" /> Student Fork
          </p>
          <a href={prog.forkUrl} target="_blank" rel="noopener noreferrer"
            className="text-xs text-blue-600 hover:underline font-mono flex items-center gap-1.5 break-all">
            {prog.forkUrl.replace('https://github.com/', 'github.com/')}
            <ExternalLink className="w-3 h-3 flex-shrink-0" />
          </a>
        </div>
      )}

      {/* Score */}
      {prog.status === 'GRADED' && prog.score !== null && (
        <div className="flex items-center gap-3 mb-3">
          <span className={`text-lg font-bold ${prog.score >= maxScore * 0.6 ? 'text-emerald-600' : 'text-red-500'}`}>
            {prog.score}
          </span>
          <span className="text-gray-400 text-sm">/{maxScore}</span>
          {prog.feedback && <span className="text-xs text-gray-500 flex-1">{prog.feedback}</span>}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        {prog.status !== 'GRADED' && (
          <button onClick={() => setShowGrade(!showGrade)}
            className="text-xs px-3 py-1.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors font-medium">
            Grade
          </button>
        )}
        {prog.status === 'GRADED' && (
          <button onClick={() => setShowGrade(!showGrade)}
            className="text-xs px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors font-medium">
            Re-grade
          </button>
        )}
      </div>

      {/* Grade form */}
      {showGrade && (
        <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] font-semibold text-gray-600 mb-1 block">Score (max {maxScore})</label>
              <input type="number" min={0} max={maxScore} value={score} onChange={e => setScore(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                placeholder="0" />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-gray-600 mb-1 block">Feedback</label>
              <input value={feedback} onChange={e => setFeedback(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                placeholder="Optional feedback..." />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => { onGrade(prog.id, +score, feedback); setShowGrade(false); }}
              disabled={!score || grading}
              className="px-4 py-1.5 bg-teal-600 text-white text-xs rounded-lg disabled:opacity-50 font-semibold">
              {grading ? 'Saving…' : 'Save Grade'}
            </button>
            <button onClick={() => setShowGrade(false)}
              className="px-3 py-1.5 text-gray-500 text-xs rounded-lg hover:bg-gray-100">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Create Git Task Modal ────────────────────────────────────────────────── */

function CreateGitTaskModal({
  courses, onClose, onSuccess,
}: {
  courses: Course[];
  onClose: () => void;
  onSuccess: (task: GitTask) => void;
}) {
  const [courseId, setCourseId] = useState(courses[0]?.id ?? '');
  const [moduleId, setModuleId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [templateRepoUrl, setTemplateRepoUrl] = useState('');
  const [hasDueDate, setHasDueDate] = useState(false);
  const [dueDate, setDueDate] = useState('');
  const [maxScore, setMaxScore] = useState(100);
  const [batchIds, setBatchIds] = useState<string[]>([]);
  const [artifactType, setArtifactType] = useState('Node.js');
  const [publishStatus, setPublishStatus] = useState<'DRAFT' | 'PUBLISHED'>('DRAFT');
  const [loading, setLoading] = useState(false);

  const { data: batches = [] } = useQuery<Batch[]>({
    queryKey: ['batches-git', courseId],
    queryFn: () => fetchBatches(courseId),
    enabled: !!courseId,
  });

  const { data: modules = [] } = useQuery({
    queryKey: ['course-modules-git', courseId],
    queryFn: () => fetchModules(courseId),
    enabled: !!courseId,
  });

  useEffect(() => {
    setModuleId('');
  }, [courseId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!courseId || !title || !templateRepoUrl) {
      toast.error('Course, title and template repo URL are required');
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.post('/assignments/git-tasks', {
        courseId,
        moduleId: moduleId || undefined,
        title, description, templateRepoUrl,
        dueDate: hasDueDate && dueDate ? new Date(dueDate).toISOString() : undefined,
        maxScore, status: publishStatus, batchIds, artifactType,
      });
      onSuccess(data.data as GitTask);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg ?? 'Failed to create git task');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white">
          <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
            <GitPullRequest className="w-5 h-5 text-blue-600" /> Create Git Task
          </h3>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-lg"><X className="w-4 h-4" /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className={LABEL_CLS}>Course *</label>
            <select className={INPUT_CLS} value={courseId} onChange={e => { setCourseId(e.target.value); setBatchIds([]); }}>
              <option value="">Select a course</option>
              {courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select>
          </div>

          <div>
            <label className={LABEL_CLS}>Link to session <span className="text-gray-400 font-normal">(optional)</span></label>
            <select className={INPUT_CLS} value={moduleId} onChange={e => setModuleId(e.target.value)} disabled={!courseId}>
              <option value="">No session — standalone git task</option>
              {modules.map(m => (
                <option key={m.id} value={m.id}>
                  {formatSessionLabel(m)} — {m.title}
                </option>
              ))}
            </select>
            <p className="text-[10px] text-blue-600 mt-1">
              Git tasks are <strong>manually released</strong> — not tied to session completion.
            </p>
          </div>

          <div>
            <label className={LABEL_CLS}>Release *</label>
            <select className={INPUT_CLS} value={publishStatus} onChange={e => setPublishStatus(e.target.value as 'DRAFT' | 'PUBLISHED')}>
              <option value="DRAFT">Draft — publish later from task detail</option>
              <option value="PUBLISHED">Publish now — students can fork immediately</option>
            </select>
          </div>

          <div>
            <label className={LABEL_CLS}>Task Title *</label>
            <input className={INPUT_CLS} value={title} onChange={e => setTitle(e.target.value)}
              placeholder="e.g. User Authentication Module" required />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL_CLS}>Artifact Type</label>
              <select className={INPUT_CLS} value={artifactType} onChange={e => setArtifactType(e.target.value)}>
                {['Python', 'SQL', 'HTML/CSS', 'JavaScript', 'Node.js', 'React', 'Other'].map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className={LABEL_CLS}>Max Score</label>
              <NumericInput className={INPUT_CLS} min={1} value={maxScore} onChange={setMaxScore} />
            </div>
          </div>

          <div>
            <label className={LABEL_CLS}>GitHub Template Repository URL *</label>
            <input type="url" className={INPUT_CLS} value={templateRepoUrl}
              onChange={e => setTemplateRepoUrl(e.target.value)}
              placeholder="https://github.com/your-org/template-repo" required />
            <p className="text-[10px] text-gray-400 mt-1.5 flex items-center gap-1">
              <GitPullRequest className="w-3 h-3" /> Students will fork this repo to their GitHub and start coding
            </p>
          </div>

          <div>
            <label className={LABEL_CLS}>Description</label>
            <textarea className={INPUT_CLS} rows={3} value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Describe what students need to build…" />
          </div>

          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2 cursor-pointer">
              <input type="checkbox" checked={hasDueDate}
                onChange={e => { setHasDueDate(e.target.checked); if (!e.target.checked) setDueDate(''); }}
                className="rounded border-blue-300 text-blue-600 focus:ring-blue-500" />
              Set due date &amp; time
            </label>
            {hasDueDate && (
              <input type="datetime-local" className={INPUT_CLS} value={dueDate}
                onChange={e => setDueDate(e.target.value)} required={hasDueDate} />
            )}
          </div>

          <div>
            <label className={LABEL_CLS}>Map to Batches</label>
            <div className="flex flex-wrap gap-2 mt-1">
              {batches.length > 0 ? batches.map(b => (
                <label key={b.id} className={`flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg border cursor-pointer transition-colors ${
                  batchIds.includes(b.id) ? 'bg-blue-50 border-blue-200 text-blue-800' : 'bg-gray-50 border-gray-200 text-gray-600 hover:border-gray-300'
                }`}>
                  <input type="checkbox" checked={batchIds.includes(b.id)}
                    onChange={e => setBatchIds(e.target.checked ? [...batchIds, b.id] : batchIds.filter(id => id !== b.id))}
                    className="rounded border-blue-300 text-blue-600 focus:ring-blue-500" />
                  {b.name}
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                    b.status === 'ONGOING' ? 'bg-emerald-100 text-emerald-600' :
                    b.status === 'UPCOMING' ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-500'
                  }`}>{b.status}</span>
                </label>
              )) : (
                <div className="flex items-center gap-2 text-xs text-gray-400 py-2">
                  <AlertCircle className="w-3.5 h-3.5" />
                  {courseId ? 'Optional — leave empty and map from Edit later' : 'Select a course first'}
                </div>
              )}
            </div>
          </div>

          <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 space-y-1">
            <p className="text-[10px] font-bold text-blue-800 flex items-center gap-1.5"><Zap className="w-3 h-3" /> What happens next:</p>
            <p className="text-[10px] text-blue-700">1. You control when students see the task (Draft or Publish now)</p>
            <p className="text-[10px] text-blue-700">2. Students fork the template under their GitHub username</p>
            <p className="text-[10px] text-blue-700">3. They code and submit — AI evaluates their fork</p>
          </div>

          <div className="flex gap-3">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 font-medium">Cancel</button>
            <button type="submit" disabled={loading || !title.trim() || !templateRepoUrl.trim()}
              className="flex-1 py-2 text-sm font-bold text-white bg-gradient-to-r from-blue-600 to-cyan-600 rounded-xl disabled:opacity-50 shadow-md flex items-center justify-center gap-2">
              {loading ? <><span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin inline-block" /> Creating…</> : <><GitPullRequest className="w-4 h-4" /> Create Git Task</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
