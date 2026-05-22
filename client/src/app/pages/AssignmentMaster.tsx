import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ClipboardList, LayoutDashboard, Plus, Search, FileText, Upload,
  Loader2, X, Eye, Trash2, Users, CheckCircle2, Calendar, BookOpen,
  Download, AlertCircle, Award, Clock, ExternalLink,
} from 'lucide-react';
import { toast } from 'sonner';
import api from '../../lib/axios';
import { Skeleton } from '../components/ui/skeleton';
import { INPUT_CLS, LABEL_CLS } from '../../lib/constants';
import type { Assignment, Course, Batch } from '../../types/api';

type Tab = 'dashboard' | 'list' | 'create';

async function fetchCourses(): Promise<Course[]> {
  const { data } = await api.get('/courses');
  return data.data?.courses ?? data.data ?? [];
}

async function fetchBatches(courseId: string): Promise<Batch[]> {
  const { data } = await api.get('/batches', { params: { courseId } });
  return data.data ?? [];
}

export default function AssignmentMasterPage() {
  const [tab, setTab] = useState<Tab>('dashboard');
  const [courseFilter, setCourseFilter] = useState('');
  const [viewId, setViewId] = useState<string | null>(null);
  const qc = useQueryClient();

  const { data: courses = [] } = useQuery({ queryKey: ['courses-asg'], queryFn: fetchCourses });

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Assignment master</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            Upload PDF assignments, map to batches, track submissions and grading.
          </p>
        </div>
        <select
          value={courseFilter}
          onChange={(e) => setCourseFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-200 rounded-xl bg-white shadow-sm min-w-[200px]"
        >
          <option value="">All courses</option>
          {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
        </select>
      </div>

      <div className="flex gap-1 p-1 bg-gray-100 rounded-xl w-fit">
        {([
          { id: 'dashboard' as Tab, label: 'Dashboard', icon: LayoutDashboard },
          { id: 'list' as Tab, label: 'Assignment List', icon: ClipboardList },
          { id: 'create' as Tab, label: 'Create Assignment', icon: Plus },
        ]).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all ${
              tab === id ? 'bg-white text-teal-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Icon className="w-4 h-4" /> {label}
          </button>
        ))}
      </div>

      {tab === 'dashboard' && <AssignmentDashboard />}
      {tab === 'list' && (
        <AssignmentList
          courseFilter={courseFilter}
          onView={(id) => setViewId(id)}
          qc={qc}
        />
      )}
      {tab === 'create' && (
        <CreateAssignmentForm
          courses={courses}
          onSuccess={() => {
            qc.invalidateQueries({ queryKey: ['assignments'] });
            qc.invalidateQueries({ queryKey: ['assignment-dashboard'] });
            setTab('list');
            toast.success('Assignment created successfully');
          }}
        />
      )}

      {viewId && (
        <AssignmentDetailDrawer
          id={viewId}
          onClose={() => setViewId(null)}
          qc={qc}
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
  courseFilter,
  onView,
  qc,
}: {
  courseFilter: string;
  onView: (id: string) => void;
  qc: ReturnType<typeof useQueryClient>;
}) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const { data: assignments = [], isLoading } = useQuery({
    queryKey: ['assignments', courseFilter],
    queryFn: async () => {
      const { data } = await api.get('/assignments', {
        params: courseFilter ? { courseId: courseFilter } : {},
      });
      return data.data as Assignment[];
    },
  });

  const filtered = assignments.filter((a) => {
    if (search && !a.title.toLowerCase().includes(search.toLowerCase())) return false;
    if (statusFilter && a.status !== statusFilter) return false;
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
      qc.invalidateQueries({ queryKey: ['assignment-dashboard'] });
    },
    onError: () => toast.error('Failed to delete'),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            className="w-full pl-9 pr-4 py-2 text-sm border rounded-lg"
            placeholder="Search assignments..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-1 bg-gray-100 p-0.5 rounded-lg h-fit">
          {['', 'PUBLISHED', 'DRAFT', 'CLOSED'].map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-2.5 py-1.5 text-xs font-medium rounded ${
                statusFilter === s ? 'bg-white text-teal-700 shadow-sm' : 'text-gray-500'
              }`}
            >
              {s || 'All'}
            </button>
          ))}
        </div>
      </div>

      <p className="text-xs text-gray-400">
        {filtered.length} assignment{filtered.length !== 1 ? 's' : ''}
      </p>

      {isLoading ? (
        <div className="grid md:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-48 rounded-2xl" />)}
        </div>
      ) : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((a) => (
            <div key={a.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden hover:shadow-md transition-shadow group">
              {/* PDF Preview Header */}
              <div className="h-36 bg-gradient-to-br from-teal-500/10 via-cyan-500/5 to-blue-500/10 flex items-center justify-center relative">
                <div className="w-16 h-20 bg-white rounded-lg shadow-md flex flex-col items-center justify-center border border-red-100 transform group-hover:scale-105 transition-transform">
                  <FileText className="w-8 h-8 text-red-500" />
                  <span className="text-[10px] font-bold text-red-600 mt-1">PDF</span>
                </div>
                <span className={`absolute top-3 right-3 text-xs px-2 py-0.5 rounded-full font-medium ${statusBadge(a.status)}`}>
                  {a.status}
                </span>
                {a.pdfSizeBytes && (
                  <span className="absolute bottom-3 left-3 text-[10px] bg-black/50 text-white px-2 py-0.5 rounded-full">
                    {(a.pdfSizeBytes / 1024).toFixed(0)} KB
                  </span>
                )}
              </div>

              <div className="p-4">
                <h3 className="font-bold text-gray-900 truncate">{a.title}</h3>
                <p className="text-xs text-gray-500 mt-0.5">{a.courseTitle}</p>
                {a.description && (
                  <p className="text-xs text-gray-400 mt-1 line-clamp-2">{a.description}</p>
                )}
                <p className="text-xs text-gray-400 mt-1 truncate flex items-center gap-1">
                  <FileText className="w-3 h-3" /> {a.pdfFilename}
                </p>

                <div className="flex items-center gap-3 mt-3 text-xs text-gray-500 flex-wrap">
                  <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {a.batchCount ?? 0} batches</span>
                  <span className="flex items-center gap-1"><Upload className="w-3 h-3" /> {a.submissionCount ?? 0} submissions</span>
                  {a.dueDate && (
                    <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> Due: {new Date(a.dueDate).toLocaleDateString()}</span>
                  )}
                  <span className="flex items-center gap-1"><Award className="w-3 h-3" /> Max: {a.maxScore}</span>
                </div>

                <div className="flex gap-2 mt-4">
                  <button
                    onClick={() => onView(a.id)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-semibold bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors"
                  >
                    <Eye className="w-3.5 h-3.5" /> View Details & PDF
                  </button>
                  <button
                    onClick={() => confirm('Delete this assignment?') && deleteMut.mutate(a.id)}
                    disabled={deleteMut.isPending}
                    className="p-2 text-red-400 hover:bg-red-50 hover:text-red-600 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
          {!filtered.length && (
            <div className="col-span-full text-center py-16 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
              <ClipboardList className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">
                {assignments.length ? 'No matching assignments' : 'No assignments yet'}
              </p>
              <p className="text-gray-400 text-xs mt-1">
                {!assignments.length && 'Create your first assignment with a PDF upload'}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────── Create Assignment Form ──────────────────────────── */

function CreateAssignmentForm({ courses, onSuccess }: { courses: Course[]; onSuccess: () => void }) {
  const [courseId, setCourseId] = useState(courses[0]?.id ?? '');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [maxScore, setMaxScore] = useState(100);
  const [status, setStatus] = useState<'DRAFT' | 'PUBLISHED'>('PUBLISHED');
  const [batchIds, setBatchIds] = useState<string[]>([]);
  const [pdf, setPdf] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const { data: batches = [] } = useQuery({
    queryKey: ['batches-asg', courseId],
    queryFn: () => fetchBatches(courseId),
    enabled: !!courseId,
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!pdf) {
      toast.error('Please upload a PDF file');
      return;
    }
    if (!courseId || !title) {
      toast.error('Course and title are required');
      return;
    }
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append('pdf', pdf);
      fd.append('courseId', courseId);
      fd.append('title', title);
      fd.append('description', description);
      fd.append('maxScore', String(maxScore));
      fd.append('status', status);
      if (dueDate) fd.append('dueDate', new Date(dueDate).toISOString());
      fd.append('batchIds', JSON.stringify(batchIds));
      await api.post('/assignments', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      onSuccess();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg ?? 'Failed to create assignment');
    } finally {
      setLoading(false);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file && (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'))) {
      setPdf(file);
    } else {
      toast.error('Only PDF files are accepted');
    }
  }

  return (
    <form onSubmit={submit} className="max-w-2xl bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5">
      {/* PDF Upload Section */}
      <div
        className={`border-2 border-dashed rounded-2xl p-8 text-center transition-all ${
          dragOver ? 'border-teal-400 bg-teal-50' : pdf ? 'border-emerald-300 bg-emerald-50/50' : 'border-gray-200 hover:border-teal-400'
        }`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        {pdf ? (
          <div className="flex items-center justify-center gap-4">
            <div className="w-14 h-18 bg-white rounded-lg shadow flex flex-col items-center justify-center border border-red-100 p-2">
              <FileText className="w-8 h-8 text-red-500" />
              <span className="text-[9px] font-bold text-red-600 mt-0.5">PDF</span>
            </div>
            <div className="text-left">
              <p className="font-semibold text-gray-900">{pdf.name}</p>
              <p className="text-xs text-gray-500">{(pdf.size / 1024).toFixed(1)} KB</p>
              <button type="button" onClick={() => setPdf(null)} className="text-xs text-red-500 mt-1 hover:text-red-700">
                Remove & choose another
              </button>
            </div>
          </div>
        ) : (
          <div>
            <Upload className="w-10 h-10 text-teal-400 mx-auto mb-3" />
            <p className="font-semibold text-gray-700">Drag & drop a PDF here, or click to browse</p>
            <p className="text-xs text-gray-400 mt-1">Only PDF files accepted (max 20 MB)</p>
            <input
              type="file"
              accept="application/pdf,.pdf"
              onChange={(e) => setPdf(e.target.files?.[0] ?? null)}
              className="mt-3 text-sm mx-auto block"
            />
          </div>
        )}
      </div>

      <div>
        <label className={LABEL_CLS}>Course *</label>
        <select className={INPUT_CLS} value={courseId} onChange={(e) => { setCourseId(e.target.value); setBatchIds([]); }}>
          <option value="">Select a course</option>
          {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
        </select>
      </div>

      <div>
        <label className={LABEL_CLS}>Title *</label>
        <input className={INPUT_CLS} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Week 3 - React Hooks Assignment" required />
      </div>

      <div>
        <label className={LABEL_CLS}>Description</label>
        <textarea className={INPUT_CLS} rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Instructions for learners..." />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={LABEL_CLS}>Due date</label>
          <input type="date" className={INPUT_CLS} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </div>
        <div>
          <label className={LABEL_CLS}>Max score</label>
          <input type="number" className={INPUT_CLS} min={1} value={maxScore} onChange={(e) => setMaxScore(+e.target.value || 100)} />
        </div>
      </div>

      <div>
        <label className={LABEL_CLS}>Map to batches</label>
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
              {courseId ? 'No batches for this course' : 'Select a course first'}
            </div>
          )}
        </div>
      </div>

      <div>
        <label className={LABEL_CLS}>Status</label>
        <div className="flex gap-2 mt-1">
          {(['DRAFT', 'PUBLISHED'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(s)}
              className={`flex-1 py-2 text-sm font-medium rounded-lg border transition-colors ${
                status === s
                  ? s === 'PUBLISHED' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-amber-50 border-amber-200 text-amber-700'
                  : 'bg-gray-50 border-gray-200 text-gray-500'
              }`}
            >
              {s === 'PUBLISHED' ? 'Published (visible to learners)' : 'Draft (hidden)'}
            </button>
          ))}
        </div>
      </div>

      <button
        type="submit"
        disabled={loading || !pdf}
        className="w-full py-3 bg-gradient-to-r from-teal-500 to-cyan-600 text-white font-semibold rounded-xl shadow-md disabled:opacity-50 hover:from-teal-600 hover:to-cyan-700 transition-all"
      >
        {loading ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'Create Assignment with PDF'}
      </button>
    </form>
  );
}

/* ─────────────────────────── Assignment Detail Drawer ──────────────────────────── */

function AssignmentDetailDrawer({
  id,
  onClose,
  qc,
}: {
  id: string;
  onClose: () => void;
  qc: ReturnType<typeof useQueryClient>;
}) {
  const [gradeId, setGradeId] = useState<string | null>(null);
  const [score, setScore] = useState('');
  const [feedback, setFeedback] = useState('');

  const { data: a, isLoading } = useQuery({
    queryKey: ['assignment', id],
    queryFn: async () => {
      const { data } = await api.get(`/assignments/${id}`);
      return data.data as Assignment;
    },
  });

  const gradeMut = useMutation({
    mutationFn: () => api.post(`/assignments/submissions/${gradeId}/grade`, { score: +score, feedback }),
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

  const pdfUrl = a?.pdfPath ? `/uploads/${a.pdfPath}` : null;

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
                  <div className="flex justify-between py-1 border-b border-gray-50">
                    <dt className="text-gray-500">Max score</dt>
                    <dd className="font-medium">{a?.maxScore}</dd>
                  </div>
                  {a?.dueDate && (
                    <div className="flex justify-between py-1 border-b border-gray-50">
                      <dt className="text-gray-500 flex items-center gap-1"><Calendar className="w-3.5 h-3.5" /> Due date</dt>
                      <dd className="font-medium">{new Date(a.dueDate).toLocaleDateString()}</dd>
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
                <div className="space-y-2">
                  {(a?.submissions ?? []).map((s) => (
                    <div key={s.id} className={`rounded-xl p-3 text-sm border transition-colors ${
                      s.status === 'GRADED' ? 'bg-emerald-50/50 border-emerald-100' : 'bg-gray-50 border-gray-100'
                    }`}>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-gray-900">{s.studentName}</p>
                          <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                            <Clock className="w-3 h-3" /> {new Date(s.submittedAt).toLocaleString()}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {s.status === 'GRADED' ? (
                            <div className="text-right">
                              <span className={`text-lg font-bold ${(s.score ?? 0) >= (a?.maxScore ?? 100) * 0.6 ? 'text-emerald-600' : 'text-red-500'}`}>
                                {s.score}
                              </span>
                              <span className="text-gray-400 text-sm">/{a?.maxScore}</span>
                            </div>
                          ) : (
                            <button
                              onClick={() => { setGradeId(s.id); setScore(''); setFeedback(''); }}
                              className="text-xs px-3 py-1.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors font-medium"
                            >
                              Grade
                            </button>
                          )}
                        </div>
                      </div>
                      {s.feedback && (
                        <p className="text-xs text-gray-500 mt-2 bg-white p-2 rounded border border-gray-100">
                          <strong>Feedback:</strong> {s.feedback}
                        </p>
                      )}
                    </div>
                  ))}
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
