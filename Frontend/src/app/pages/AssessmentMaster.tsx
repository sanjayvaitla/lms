import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ClipboardCheck, LayoutDashboard, Plus, Search, FileText, Upload,
  Loader2, X, Eye, Trash2, Users, CheckCircle2, Calendar, BookOpen,
  Download, AlertCircle, Award, Clock, ExternalLink,
} from 'lucide-react';
import { toast } from 'sonner';
import api from '../../lib/axios';
import { Skeleton } from '../components/ui/skeleton';
import { NumericInput } from '../components/ui/numeric-input';
import { INPUT_CLS, LABEL_CLS } from '../../lib/constants';
import { useAuth } from '../../store/AuthContext';
import type { Assessment, Course, Batch } from '../../types/api';

type Tab = 'dashboard' | 'list' | 'create';

async function fetchCourses(): Promise<Course[]> {
  const { data } = await api.get('/courses');
  return data.data?.courses ?? data.data ?? [];
}

async function fetchBatches(courseId: string): Promise<Batch[]> {
  const { data } = await api.get('/batches', { params: { courseId } });
  return data.data ?? [];
}

export default function AssessmentMasterPage() {
  const [tab, setTab]               = useState<Tab>('dashboard');
  const [courseFilter, setCourseFilter] = useState('');
  const [viewId, setViewId]         = useState<string | null>(null);
  const qc = useQueryClient();
  const { user } = useAuth();
  const canEdit = user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN' || user?.role === 'LD_MANAGER';

  const { data: courses = [] } = useQuery({ queryKey: ['courses-asm'], queryFn: fetchCourses });

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Assessment master</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            Upload PDF assessments with Part A (MCQ) and Part B (practical), track submissions and manual grading.
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
          { id: 'dashboard' as Tab, label: 'Dashboard',         icon: LayoutDashboard },
          { id: 'list'      as Tab, label: 'Assessment List',   icon: ClipboardCheck },
          ...(canEdit ? [{ id: 'create' as Tab, label: 'Create Assessment', icon: Plus }] : []),
        ]).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all ${
              tab === id ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Icon className="w-4 h-4" /> {label}
          </button>
        ))}
      </div>

      {tab === 'dashboard' && <AssessmentDashboard />}
      {tab === 'list' && (
        <AssessmentList
          courseFilter={courseFilter}
          onView={(id) => setViewId(id)}
          qc={qc}
          canEdit={canEdit}
        />
      )}
      {tab === 'create' && (
        <CreateAssessmentForm
          courses={courses}
          onSuccess={() => {
            qc.invalidateQueries({ queryKey: ['assessments'] });
            qc.invalidateQueries({ queryKey: ['assessment-dashboard'] });
            setTab('list');
            toast.success('Assessment created successfully');
          }}
        />
      )}

      {viewId && (
        <AssessmentDetailDrawer
          id={viewId}
          onClose={() => setViewId(null)}
          qc={qc}
        />
      )}
    </div>
  );
}

/* ─── Dashboard ─────────────────────────────────────────────────────────── */

function AssessmentDashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ['assessment-dashboard'],
    queryFn: async () => {
      const { data } = await api.get('/assessments/dashboard');
      return data.data;
    },
  });

  const cards = [
    { label: 'Total Assessments', value: data?.totalAssessments, icon: ClipboardCheck, bg: 'bg-indigo-50',  iconColor: 'text-indigo-600',  border: 'border-indigo-100' },
    { label: 'Published',         value: data?.published,         icon: CheckCircle2,   bg: 'bg-emerald-50', iconColor: 'text-emerald-600', border: 'border-emerald-100' },
    { label: 'Submissions',       value: data?.totalSubmissions,  icon: Upload,         bg: 'bg-blue-50',    iconColor: 'text-blue-600',    border: 'border-blue-100' },
    { label: 'Pending Grading',   value: data?.pendingGrading,    icon: Award,          bg: 'bg-amber-50',   iconColor: 'text-amber-600',   border: 'border-amber-100' },
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

      <div className="bg-gradient-to-r from-indigo-50 to-violet-50 border border-indigo-100 rounded-2xl p-5">
        <h3 className="font-semibold text-indigo-900 flex items-center gap-2">
          <ClipboardCheck className="w-5 h-5" /> Assessment Structure
        </h3>
        <div className="mt-4 grid md:grid-cols-2 gap-4">
          <div className="bg-white rounded-xl p-4 border border-indigo-100">
            <div className="flex items-center justify-between mb-2">
              <span className="font-semibold text-indigo-800 text-sm">Part A — MCQ</span>
              <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-bold">25%</span>
            </div>
            <p className="text-xs text-gray-500">25–50 multiple choice questions. Score entered manually by admin after evaluation.</p>
          </div>
          <div className="bg-white rounded-xl p-4 border border-violet-100">
            <div className="flex items-center justify-between mb-2">
              <span className="font-semibold text-violet-800 text-sm">Part B — Practical</span>
              <span className="text-xs bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full font-bold">75%</span>
            </div>
            <div className="space-y-1 text-xs text-gray-500">
              <div className="flex justify-between"><span>Approach correctness</span><span className="font-medium text-violet-600">40% of B</span></div>
              <div className="flex justify-between"><span>Viva</span><span className="font-medium text-violet-600">25% of B</span></div>
              <div className="flex justify-between"><span>Solution quality</span><span className="font-medium text-violet-600">35% of B</span></div>
            </div>
          </div>
        </div>
        <ul className="mt-3 space-y-2 text-sm text-indigo-800/90">
          <li className="flex items-start gap-2">
            <Upload className="w-4 h-4 mt-0.5 text-indigo-500 flex-shrink-0" />
            <span><strong>PDF Upload:</strong> Upload the assessment question paper as a PDF. Visible to enrolled students.</span>
          </li>
          <li className="flex items-start gap-2">
            <Users className="w-4 h-4 mt-0.5 text-indigo-500 flex-shrink-0" />
            <span><strong>Batch Mapping:</strong> Assign to specific batches so only enrolled learners see it.</span>
          </li>
          <li className="flex items-start gap-2">
            <Award className="w-4 h-4 mt-0.5 text-indigo-500 flex-shrink-0" />
            <span><strong>Manual Grading:</strong> Review student PDFs and enter Part A score + Part B sub-scores (approach, viva, solution) separately.</span>
          </li>
        </ul>
      </div>
    </div>
  );
}

/* ─── Assessment List ───────────────────────────────────────────────────── */

function AssessmentList({
  courseFilter,
  onView,
  qc,
  canEdit,
}: {
  courseFilter: string;
  onView: (id: string) => void;
  qc: ReturnType<typeof useQueryClient>;
  canEdit: boolean;
}) {
  const [search, setSearch]           = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const { data: assessments = [], isLoading } = useQuery({
    queryKey: ['assessments', courseFilter],
    queryFn: async () => {
      const { data } = await api.get('/assessments', {
        params: courseFilter ? { courseId: courseFilter } : {},
      });
      return data.data as Assessment[];
    },
  });

  const getEffectiveStatus = (a: Assessment): string => {
    if (a.status === 'CLOSED') return 'CLOSED';
    if (a.dueDate && new Date(a.dueDate).getTime() < Date.now()) return 'CLOSED';
    return a.status;
  };

  const filtered = assessments.filter((a) => {
    if (search && !a.title.toLowerCase().includes(search.toLowerCase())) return false;
    if (statusFilter === 'SUBMISSIONS') return (a.submissionCount ?? 0) > 0;
    if (statusFilter && getEffectiveStatus(a) !== statusFilter) return false;
    return true;
  });

  const statusBadge = (s: string) => {
    const map: Record<string, string> = {
      PUBLISHED: 'bg-emerald-100 text-emerald-700',
      CLOSED:    'bg-gray-100 text-gray-600',
      DRAFT:     'bg-amber-100 text-amber-700',
    };
    return map[s] ?? 'bg-gray-100 text-gray-600';
  };

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/assessments/${id}`),
    onSuccess: () => {
      toast.success('Assessment deleted');
      qc.invalidateQueries({ queryKey: ['assessments'] });
      qc.invalidateQueries({ queryKey: ['assessment-dashboard'] });
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
            placeholder="Search assessments..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-1 bg-gray-100 p-0.5 rounded-lg h-fit flex-wrap">
          {[
            { val: '',            label: 'All' },
            { val: 'PUBLISHED',   label: 'Published' },
            { val: 'DRAFT',       label: 'Draft' },
            { val: 'CLOSED',      label: 'Closed' },
            { val: 'SUBMISSIONS', label: 'Submissions' },
          ].map(({ val, label }) => (
            <button
              key={val}
              onClick={() => setStatusFilter(val)}
              className={`px-2.5 py-1.5 text-xs font-medium rounded ${
                statusFilter === val ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <p className="text-xs text-gray-400">
        {filtered.length} assessment{filtered.length !== 1 ? 's' : ''}
      </p>

      {isLoading ? (
        <div className="grid md:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-52 rounded-2xl" />)}
        </div>
      ) : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((a) => (
            <div key={a.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden hover:shadow-md transition-shadow group">
              {/* Header */}
              <div className="h-36 bg-gradient-to-br from-orange-500/10 via-amber-500/5 to-yellow-500/10 flex items-center justify-center relative">
                <div className="w-16 h-20 bg-white rounded-lg shadow-md flex flex-col items-center justify-center border border-orange-100 transform group-hover:scale-105 transition-transform">
                  <FileText className="w-8 h-8 text-orange-500" />
                  <span className="text-[10px] font-bold text-orange-600 mt-1">PDF</span>
                </div>
                <span className={`absolute top-3 right-3 text-xs px-2 py-0.5 rounded-full font-medium ${statusBadge(getEffectiveStatus(a))}`}>
                  {getEffectiveStatus(a)}
                </span>
                {/* Part A / Part B chips */}
                <div className="absolute bottom-3 left-3 flex gap-1">
                  <span className="text-[10px] bg-orange-500 text-white px-2 py-0.5 rounded-full font-semibold">A: {a.partAMarks}m</span>
                  <span className="text-[10px] bg-amber-500 text-white px-2 py-0.5 rounded-full font-semibold">B: {a.partBMarks}m</span>
                </div>
              </div>

              <div className="p-4">
                <h3 className="font-bold text-gray-900 truncate">{a.title}</h3>
                <p className="text-xs text-gray-500 mt-0.5">{a.courseTitle}</p>
                {a.description && (
                  <p className="text-xs text-gray-400 mt-1 line-clamp-2">{a.description}</p>
                )}

                <div className="flex items-center gap-3 mt-3 text-xs text-gray-500 flex-wrap">
                  <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {a.batchCount ?? 0} batches</span>
                  <span className="flex items-center gap-1"><Upload className="w-3 h-3" /> {a.submissionCount ?? 0} submissions</span>
                  {a.dueDate && (
                    <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> Due: {new Date(a.dueDate).toLocaleString('en-IN')}</span>
                  )}
                  <span className="flex items-center gap-1"><Award className="w-3 h-3" /> Total: {a.totalMarks}m</span>
                </div>

                <div className="flex gap-2 mt-4">
                  <button
                    onClick={() => onView(a.id)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-semibold bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors"
                  >
                    <Eye className="w-3.5 h-3.5" /> View & Grade
                  </button>
                  {canEdit && (
                    <button
                      onClick={() => confirm('Delete this assessment?') && deleteMut.mutate(a.id)}
                      disabled={deleteMut.isPending}
                      className="p-2 text-red-400 hover:bg-red-50 hover:text-red-600 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
          {!filtered.length && (
            <div className="col-span-full text-center py-16 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
              <ClipboardCheck className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">
                {assessments.length ? 'No matching assessments' : 'No assessments yet'}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Create Assessment Form ────────────────────────────────────────────── */

function CreateAssessmentForm({ courses, onSuccess }: { courses: Course[]; onSuccess: () => void }) {
  const [courseId, setCourseId]   = useState(courses[0]?.id ?? '');
  const [title, setTitle]         = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate]     = useState('');
  const [totalMarks, setTotalMarks]   = useState(100);
  const [partAMarks, setPartAMarks]   = useState(25);
  const [partBMarks, setPartBMarks]   = useState(75);
  const [approachMarks, setApproachMarks] = useState(30);
  const [vivaMarks, setVivaMarks]         = useState(20);
  const [status, setStatus]       = useState<'DRAFT' | 'PUBLISHED'>('PUBLISHED');
  const [aiRubric, setAiRubric]   = useState('');
  const [batchIds, setBatchIds]   = useState<string[]>([]);
  const [pdf, setPdf]             = useState<File | null>(null);
  const [csvFile, setCsvFile]     = useState<File | null>(null);
  const [rubricPdf, setRubricPdf] = useState<File | null>(null);
  const [loading, setLoading]     = useState(false);
  const [dragOverPdf, setDragOverPdf] = useState(false);
  const [dragOverCsv, setDragOverCsv] = useState(false);
  const [dragOverRubricPdf, setDragOverRubricPdf] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const csvFileRef = useRef<HTMLInputElement>(null);
  const rubricPdfRef = useRef<HTMLInputElement>(null);

  function pickFile(f: File | null | undefined, isRubric = false) {
    if (!f) return;
    if (f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')) {
      if (f.size > 20 * 1024 * 1024) { toast.error('PDF too large — max 20 MB'); return; }
      if (isRubric) setRubricPdf(f);
      else setPdf(f);
    } else {
      toast.error('Only PDF files are accepted');
    }
  }

  function pickCsvFile(f: File | null | undefined) {
    if (!f) return;
    if (f.type === 'text/csv' || f.name.toLowerCase().endsWith('.csv') || f.name.toLowerCase().endsWith('.txt')) {
      setCsvFile(f);
    } else {
      toast.error('Only CSV files are accepted for Part A');
    }
  }

  const { data: batches = [] } = useQuery({
    queryKey: ['batches-asm', courseId],
    queryFn: () => fetchBatches(courseId),
    enabled: !!courseId,
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!pdf) { toast.error('Please upload a PDF file'); return; }
    if (!courseId || !title) { toast.error('Course and title are required'); return; }
    if (partAMarks + partBMarks !== totalMarks) {
      toast.error(`Part A (${partAMarks}) + Part B (${partBMarks}) must equal Total Marks (${totalMarks})`);
      return;
    }
    if (approachMarks + vivaMarks >= partBMarks) {
      toast.error(`Approach + Viva marks (${approachMarks + vivaMarks}) must be less than Part B marks (${partBMarks})`);
      return;
    }
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append('file', pdf);
      if (csvFile) fd.append('csv', csvFile);
      if (rubricPdf) fd.append('rubricPdf', rubricPdf);
      fd.append('courseId', courseId);
      fd.append('title', title);
      fd.append('description', description);
      fd.append('totalMarks', String(totalMarks));
      fd.append('partAMarks', String(partAMarks));
      fd.append('partBMarks', String(partBMarks));
      
      const relApproachPct = (approachMarks / partBMarks) * 100;
      const relVivaPct = (vivaMarks / partBMarks) * 100;
      
      fd.append('partBApproachPct', String(relApproachPct));
      fd.append('partBVivaPct', String(relVivaPct));
      fd.append('status', status);
      if (aiRubric) fd.append('aiRubric', aiRubric);
      if (dueDate) fd.append('dueDate', new Date(dueDate).toISOString());
      fd.append('batchIds', JSON.stringify(batchIds));
      await api.post('/assessments', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      onSuccess();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg ?? 'Failed to create assessment');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="max-w-2xl bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5">
      <div className="grid md:grid-cols-2 gap-4">
        {/* PDF Upload */}
        <div
          onClick={() => !pdf && fileRef.current?.click()}
          className={`border-2 border-dashed rounded-2xl p-6 text-center transition-all ${pdf ? '' : 'cursor-pointer'} ${
            dragOverPdf ? 'border-indigo-400 bg-indigo-50' : pdf ? 'border-emerald-300 bg-emerald-50/50' : 'border-gray-200 hover:border-indigo-400'
          }`}
          onDragOver={(e) => { e.preventDefault(); setDragOverPdf(true); }}
          onDragLeave={() => setDragOverPdf(false)}
          onDrop={(e) => { e.preventDefault(); setDragOverPdf(false); pickFile(e.dataTransfer.files[0], false); }}
        >
          <input ref={fileRef} type="file" accept="application/pdf,.pdf" className="hidden"
            onChange={(e) => { pickFile(e.target.files?.[0], false); e.target.value = ''; }} />
          {pdf ? (
            <div className="flex flex-col items-center justify-center gap-2">
              <FileText className="w-8 h-8 text-indigo-500" />
              <div className="text-center">
                <p className="font-semibold text-gray-900 text-sm truncate max-w-[200px]">{pdf.name}</p>
                <div className="flex gap-2 justify-center mt-2">
                  <button type="button" onClick={() => fileRef.current?.click()} className="text-xs text-indigo-600">Change</button>
                  <button type="button" onClick={() => setPdf(null)} className="text-xs text-red-500">Remove</button>
                </div>
              </div>
            </div>
          ) : (
            <div>
              <Upload className="w-8 h-8 text-indigo-400 mx-auto mb-2" />
              <p className="font-semibold text-gray-700 text-sm">Upload Part B (PDF)</p>
              <p className="text-[10px] text-gray-400 mt-1">Question paper only (max 20 MB)</p>
            </div>
          )}
        </div>

        {/* CSV Upload */}
        <div
          onClick={() => !csvFile && csvFileRef.current?.click()}
          className={`border-2 border-dashed rounded-2xl p-6 text-center transition-all ${csvFile ? '' : 'cursor-pointer'} ${
            dragOverCsv ? 'border-indigo-400 bg-indigo-50' : csvFile ? 'border-emerald-300 bg-emerald-50/50' : 'border-gray-200 hover:border-indigo-400'
          }`}
          onDragOver={(e) => { e.preventDefault(); setDragOverCsv(true); }}
          onDragLeave={() => setDragOverCsv(false)}
          onDrop={(e) => { e.preventDefault(); setDragOverCsv(false); pickCsvFile(e.dataTransfer.files[0]); }}
        >
          <input ref={csvFileRef} type="file" accept=".csv" className="hidden"
            onChange={(e) => { pickCsvFile(e.target.files?.[0]); e.target.value = ''; }} />
          {csvFile ? (
            <div className="flex flex-col items-center justify-center gap-2">
              <FileText className="w-8 h-8 text-emerald-500" />
              <div className="text-center">
                <p className="font-semibold text-gray-900 text-sm truncate max-w-[200px]">{csvFile.name}</p>
                <div className="flex gap-2 justify-center mt-2">
                  <button type="button" onClick={() => csvFileRef.current?.click()} className="text-xs text-indigo-600">Change</button>
                  <button type="button" onClick={() => setCsvFile(null)} className="text-xs text-red-500">Remove</button>
                </div>
              </div>
            </div>
          ) : (
            <div>
              <Upload className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
              <p className="font-semibold text-gray-700 text-sm">Upload Part A (CSV)</p>
              <p className="text-[10px] text-gray-400 mt-1">MCQs (25-50 questions)</p>
            </div>
          )}
        </div>
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
        <input className={INPUT_CLS} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Mid-Term Assessment — Module 4" required />
      </div>

      <div>
        <label className={LABEL_CLS}>Description</label>
        <textarea className={INPUT_CLS} rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Instructions for learners..." />
      </div>

      <div>
        <label className={LABEL_CLS}>AI Grading Rubric / Model Answer (Optional)</label>
        <div className="grid md:grid-cols-2 gap-4 mt-1 mb-3">
          <div
            onClick={() => !rubricPdf && rubricPdfRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-4 text-center transition-all ${rubricPdf ? '' : 'cursor-pointer'} ${
              dragOverRubricPdf ? 'border-indigo-400 bg-indigo-50' : rubricPdf ? 'border-emerald-300 bg-emerald-50/50' : 'border-gray-200 hover:border-indigo-400'
            }`}
            onDragOver={(e) => { e.preventDefault(); setDragOverRubricPdf(true); }}
            onDragLeave={() => setDragOverRubricPdf(false)}
            onDrop={(e) => { e.preventDefault(); setDragOverRubricPdf(false); pickFile(e.dataTransfer.files[0], true); }}
          >
            <input ref={rubricPdfRef} type="file" accept="application/pdf,.pdf" className="hidden"
              onChange={(e) => { pickFile(e.target.files?.[0], true); e.target.value = ''; }} />
            {rubricPdf ? (
              <div className="flex flex-col items-center justify-center gap-2">
                <FileText className="w-6 h-6 text-indigo-500" />
                <div className="text-center">
                  <p className="font-semibold text-gray-900 text-xs truncate max-w-[150px]">{rubricPdf.name}</p>
                  <div className="flex gap-2 justify-center mt-1">
                    <button type="button" onClick={(e) => { e.stopPropagation(); rubricPdfRef.current?.click(); }} className="text-[10px] text-indigo-600">Change</button>
                    <button type="button" onClick={(e) => { e.stopPropagation(); setRubricPdf(null); }} className="text-[10px] text-red-500">Remove</button>
                  </div>
                </div>
              </div>
            ) : (
              <div>
                <Upload className="w-6 h-6 text-indigo-400 mx-auto mb-1" />
                <p className="font-medium text-gray-700 text-xs">Upload Model Answer (PDF)</p>
              </div>
            )}
          </div>
          <div>
            <textarea className={`${INPUT_CLS} h-full min-h-[96px] resize-none`} value={aiRubric} onChange={(e) => setAiRubric(e.target.value)} placeholder="Or type model answers/instructions here..." />
          </div>
        </div>
        <p className="text-[10px] text-gray-400 mt-1">If provided, the AI will use this exactly to grade Part B. If both are provided, both will be used.</p>
      </div>

      <div>
        <label className={LABEL_CLS}>Due date & Time</label>
        <input type="datetime-local" className={INPUT_CLS} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
      </div>

      {/* Marks configuration */}
      <div className="bg-gradient-to-br from-indigo-50 to-violet-50 rounded-xl p-4 border border-indigo-100 space-y-4">
        <p className="text-sm font-semibold text-indigo-900">Marks Configuration</p>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className={LABEL_CLS}>Total marks</label>
            <NumericInput className={INPUT_CLS} min={1} value={totalMarks}
              onChange={(t) => { setTotalMarks(t); setPartAMarks(Math.round(t * 0.25)); setPartBMarks(t - Math.round(t * 0.25)); }} />
          </div>
          <div>
            <label className={LABEL_CLS}>Part A marks <span className="text-indigo-500">(MCQ — 25%)</span></label>
            <NumericInput className={INPUT_CLS} min={1} value={partAMarks}
              onChange={(a) => { setPartAMarks(a); setPartBMarks(totalMarks - a); }} />
          </div>
          <div>
            <label className={LABEL_CLS}>Part B marks <span className="text-violet-500">(practical — 75%)</span></label>
            <NumericInput className={INPUT_CLS} min={1} value={partBMarks}
              onChange={(b) => { setPartBMarks(b); setPartAMarks(totalMarks - b); }} />
          </div>
        </div>

        {partAMarks + partBMarks !== totalMarks && (
          <p className="text-xs text-red-500 flex items-center gap-1">
            <AlertCircle className="w-3 h-3" /> Part A + Part B must equal Total Marks
          </p>
        )}

        <div>
          <p className="text-xs font-semibold text-violet-800 mb-2">Part B breakdown (marks)</p>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={LABEL_CLS}>Approach marks</label>
              <input type="number" className={INPUT_CLS} min={1} max={partBMarks - 2} value={approachMarks || ''} onChange={(e) => setApproachMarks(+e.target.value)} />
              <p className="text-[10px] text-gray-400 mt-0.5">out of {partBMarks}</p>
            </div>
            <div>
              <label className={LABEL_CLS}>Viva marks</label>
              <input type="number" className={INPUT_CLS} min={1} max={partBMarks - 2} value={vivaMarks || ''} onChange={(e) => setVivaMarks(+e.target.value)} />
              <p className="text-[10px] text-gray-400 mt-0.5">out of {partBMarks}</p>
            </div>
            <div>
              <label className={LABEL_CLS}>Solution marks <span className="text-gray-400 font-normal">(auto)</span></label>
              <input type="number" className={INPUT_CLS + ' bg-gray-50 cursor-not-allowed'} value={partBMarks - approachMarks - vivaMarks} readOnly />
              <p className="text-[10px] text-gray-400 mt-0.5">out of {partBMarks}</p>
            </div>
          </div>
          {(partBMarks - approachMarks - vivaMarks) <= 0 && (
            <p className="text-xs text-red-500 flex items-center gap-1 mt-1">
              <AlertCircle className="w-3 h-3" /> Approach + Viva must leave room for Solution marks
            </p>
          )}
        </div>
      </div>

      {/* Batch mapping */}
      <div>
        <label className={LABEL_CLS}>Map to batches</label>
        <div className="flex flex-wrap gap-2 mt-1">
          {batches.length > 0 ? batches.map((b) => (
            <label key={b.id} className={`flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg border cursor-pointer transition-colors ${
              batchIds.includes(b.id) ? 'bg-indigo-50 border-indigo-200 text-indigo-800' : 'bg-gray-50 border-gray-200 text-gray-600 hover:border-gray-300'
            }`}>
              <input type="checkbox" checked={batchIds.includes(b.id)}
                onChange={(e) => setBatchIds(e.target.checked ? [...batchIds, b.id] : batchIds.filter((id) => id !== b.id))}
                className="rounded border-indigo-300 text-indigo-600 focus:ring-indigo-500" />
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

      {/* Status */}
      <div>
        <label className={LABEL_CLS}>Status</label>
        <div className="flex gap-2 mt-1">
          {(['DRAFT', 'PUBLISHED'] as const).map((s) => (
            <button key={s} type="button" onClick={() => setStatus(s)}
              className={`flex-1 py-2 text-sm font-medium rounded-lg border transition-colors ${
                status === s
                  ? s === 'PUBLISHED' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-amber-50 border-amber-200 text-amber-700'
                  : 'bg-gray-50 border-gray-200 text-gray-500'
              }`}>
              {s === 'PUBLISHED' ? 'Published (visible to learners)' : 'Draft (hidden)'}
            </button>
          ))}
        </div>
      </div>

      <button type="submit" disabled={loading || !pdf}
        className="w-full py-3 bg-gradient-to-r from-indigo-500 to-violet-600 text-white font-semibold rounded-xl shadow-md disabled:opacity-50 hover:from-indigo-600 hover:to-violet-700 transition-all">
        {loading ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'Create Assessment with PDF'}
      </button>
    </form>
  );
}

/* ─── Assessment Detail Drawer ──────────────────────────────────────────── */

function AssessmentDetailDrawer({
  id,
  onClose,
  qc,
}: {
  id: string;
  onClose: () => void;
  qc: ReturnType<typeof useQueryClient>;
}) {
  const [gradeId, setGradeId]       = useState<string | null>(null);
  const [approachScore, setApproachScore] = useState('');
  const [vivaScore, setVivaScore]   = useState('');
  const [solutionScore, setSolutionScore] = useState('');
  const [feedback, setFeedback]     = useState('');

  const { data: a, isLoading } = useQuery({
    queryKey: ['assessment', id],
    queryFn: async () => {
      const { data } = await api.get(`/assessments/${id}`);
      return data.data as Assessment;
    },
  });

  const gradeMut = useMutation({
    mutationFn: () => api.put(`/assessments/submissions/${gradeId}/grade`, {
      approachScore: approachScore ? +approachScore : undefined,
      vivaScore:     vivaScore     ? +vivaScore     : undefined,
      solutionScore: solutionScore ? +solutionScore : undefined,
      feedback,
    }),
    onSuccess: () => {
      toast.success('Submission graded successfully');
      resetGrade();
      qc.invalidateQueries({ queryKey: ['assessment', id] });
      qc.invalidateQueries({ queryKey: ['assessment-dashboard'] });
    },
    onError: () => toast.error('Failed to grade submission'),
  });

  function resetGrade() {
    setGradeId(null);
    setApproachScore('');
    setVivaScore('');
    setSolutionScore('');
    setFeedback('');
  }

  const pdfUrl: string | null = a?.pdfUrl ?? null;
  const approachMax  = a ? (a.partBMarks * a.partBApproachPct / 100) : 0;
  const vivaMax      = a ? (a.partBMarks * a.partBVivaPct / 100) : 0;
  const solutionMax  = a ? (a.partBMarks * (100 - a.partBApproachPct - a.partBVivaPct) / 100) : 0;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-4xl bg-white h-full shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-right">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b bg-gradient-to-r from-indigo-50 to-white flex-shrink-0">
          <div className="min-w-0">
            <h2 className="text-xl font-bold text-gray-900 truncate">{a?.title ?? 'Assessment'}</h2>
            <div className="flex items-center gap-2 mt-0.5">
              <p className="text-sm text-gray-500">{a?.courseTitle}</p>
              {a?.status && (
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  a.status === 'PUBLISHED' ? 'bg-emerald-100 text-emerald-700' :
                  a.status === 'CLOSED'    ? 'bg-gray-100 text-gray-600' : 'bg-amber-100 text-amber-700'
                }`}>{a.status}</span>
              )}
              {a && (
                <div className="flex gap-1">
                  <span className="text-[10px] bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-bold">A: {a.partAMarks}m</span>
                  <span className="text-[10px] bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full font-bold">B: {a.partBMarks}m</span>
                  <span className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-bold">Total: {a.totalMarks}m</span>
                </div>
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
                  <FileText className="w-5 h-5 text-indigo-500" /> Assessment PDF
                  <span className="text-xs text-gray-400 font-normal">{a?.pdfFilename}</span>
                </h3>
                {pdfUrl && (
                  <div className="flex items-center gap-2">
                    <a href={pdfUrl} download className="text-xs text-gray-500 font-medium hover:text-gray-700 flex items-center gap-1">
                      <Download className="w-3.5 h-3.5" /> Download
                    </a>
                    <a href={pdfUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-indigo-600 font-medium hover:text-indigo-800 flex items-center gap-1">
                      <ExternalLink className="w-3.5 h-3.5" /> Open in new tab
                    </a>
                  </div>
                )}
              </div>
              {pdfUrl ? (
                <div className="rounded-xl overflow-hidden border border-gray-200 shadow-lg bg-white" style={{ height: 'min(65vh, 550px)' }}>
                  <iframe src={`${pdfUrl}#toolbar=1&navpanes=0&scrollbar=1`} title={a?.title} className="w-full h-full" style={{ border: 'none' }} />
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
              {/* Left: details */}
              <div>
                <h4 className="font-semibold text-gray-900 mb-3">Assessment Details</h4>
                {a?.description && (
                  <p className="text-sm text-gray-600 mb-4 bg-gray-50 p-3 rounded-lg">{a.description}</p>
                )}
                <dl className="text-sm space-y-2">
                  <div className="flex justify-between py-1 border-b border-gray-50">
                    <dt className="text-gray-500">Status</dt>
                    <dd className="font-medium">{a?.status}</dd>
                  </div>
                  <div className="flex justify-between py-1 border-b border-gray-50">
                    <dt className="text-gray-500">Total marks</dt>
                    <dd className="font-medium">{a?.totalMarks}</dd>
                  </div>
                  {a?.dueDate && (
                    <div className="flex justify-between py-1 border-b border-gray-50">
                      <dt className="text-gray-500 flex items-center gap-1"><Calendar className="w-3.5 h-3.5" /> Due date</dt>
                      <dd className="font-medium">{new Date(a.dueDate).toLocaleString('en-IN')}</dd>
                    </div>
                  )}
                </dl>

                {/* Marks breakdown table */}
                <div className="mt-4 bg-indigo-50/60 rounded-xl p-3 border border-indigo-100">
                  <p className="text-xs font-semibold text-indigo-800 mb-2">Marks Breakdown</p>
                  <table className="w-full text-xs">
                    <tbody className="divide-y divide-indigo-100">
                      <tr className="py-1">
                        <td className="py-1.5 text-gray-600">Part A (MCQ)</td>
                        <td className="py-1.5 text-right font-semibold text-indigo-700">{a?.partAMarks}m (25%)</td>
                      </tr>
                      <tr>
                        <td className="py-1.5 text-gray-600">Part B total</td>
                        <td className="py-1.5 text-right font-semibold text-violet-700">{a?.partBMarks}m (75%)</td>
                      </tr>
                      <tr>
                        <td className="py-1.5 pl-3 text-gray-500">→ Approach ({a?.partBApproachPct}%)</td>
                        <td className="py-1.5 text-right text-gray-600">{approachMax.toFixed(1)}m</td>
                      </tr>
                      <tr>
                        <td className="py-1.5 pl-3 text-gray-500">→ Viva ({a?.partBVivaPct}%)</td>
                        <td className="py-1.5 text-right text-gray-600">{vivaMax.toFixed(1)}m</td>
                      </tr>
                      <tr>
                        <td className="py-1.5 pl-3 text-gray-500">→ Solution ({a ? 100 - a.partBApproachPct - a.partBVivaPct : 35}%)</td>
                        <td className="py-1.5 text-right text-gray-600">{solutionMax.toFixed(1)}m</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <h4 className="font-semibold text-gray-900 mt-5 mb-2 flex items-center gap-2">
                  <BookOpen className="w-4 h-4" /> Mapped Batches
                </h4>
                <div className="space-y-1">
                  {(a?.batches ?? []).map((b) => (
                    <div key={b.id} className="flex items-center justify-between bg-gray-50 px-3 py-2 rounded-lg text-sm">
                      <span>{b.name}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded ${
                        b.status === 'ONGOING'  ? 'bg-emerald-100 text-emerald-600' :
                        b.status === 'UPCOMING' ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-500'
                      }`}>{b.status}</span>
                    </div>
                  ))}
                  {!(a?.batches?.length) && <p className="text-gray-400 text-sm">No batches mapped</p>}
                </div>
              </div>

              {/* Right: submissions */}
              <div>
                <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <Award className="w-4 h-4" /> Submissions & Grading
                  {(a?.submissions?.length ?? 0) > 0 && (
                    <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">{a?.submissions?.length}</span>
                  )}
                </h4>
                <div className="space-y-3">
                  {(a?.submissions ?? []).map((s) => (
                    <div key={s.id ?? s.studentId} className={`rounded-xl text-sm border transition-colors ${
                      s.status === 'GRADED' ? 'bg-emerald-50/50 border-emerald-100' : 'bg-gray-50 border-gray-100'
                    }`}>
                      <div className="flex items-start justify-between p-3">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-gray-900">{s.studentName}</p>
                          <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                            <Clock className="w-3 h-3" /> {s.submittedAt ? new Date(s.submittedAt).toLocaleString() : '--'}
                          </p>
                          {s.fileUrl && (
                            <a href={s.fileUrl} target="_blank" rel="noopener noreferrer"
                              className="mt-1.5 inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700 font-medium">
                              <FileText className="w-3 h-3" /> View PDF <ExternalLink className="w-2.5 h-2.5" />
                            </a>
                          )}
                          {/* Inline PDF viewer for submission */}
                          {s.fileUrl && (
                            <details className="mt-2">
                              <summary className="text-[10px] cursor-pointer text-indigo-400 hover:text-indigo-600">Preview submission PDF</summary>
                              <div className="mt-2 rounded-lg overflow-hidden border border-gray-200" style={{ height: '300px' }}>
                                <iframe src={`${s.fileUrl}#toolbar=1&navpanes=0`} className="w-full h-full" style={{ border: 'none' }} title={`${s.studentName} submission`} />
                              </div>
                            </details>
                          )}
                        </div>

                        <div className="flex items-start gap-2 flex-shrink-0 ml-2">
                          {s.status === 'GRADED' ? (
                            <div className="text-right space-y-0.5">
                              <p className={`text-lg font-black ${(s.totalScore ?? 0) >= (a?.totalMarks ?? 100) * 0.6 ? 'text-emerald-600' : 'text-red-500'}`}>
                                {Number(s.totalScore ?? 0).toFixed(1)}<span className="text-xs text-gray-400">/{a?.totalMarks}</span>
                              </p>
                                <div className="text-[10px] text-gray-500 space-y-0.5 text-right">
                                  <div className="flex items-center justify-end gap-1">
                                    A: {s.partAScore ?? '—'}
                                    <span className="text-[9px] bg-indigo-100 text-indigo-600 px-1 rounded">auto</span>
                                  </div>
                                  <div>Approach: {s.approachScore ?? '—'}</div>
                                  <div>Viva: {s.vivaScore ?? '—'}</div>
                                  <div>Solution: {s.solutionScore ?? '—'}</div>
                                </div>
                              <button
                                onClick={() => {
                                  setGradeId(s.id);
                                  setApproachScore(s.approachScore != null ? String(s.approachScore) : '');
                                  setVivaScore(s.vivaScore != null ? String(s.vivaScore) : '');
                                  setSolutionScore(s.solutionScore != null ? String(s.solutionScore) : '');
                                  setFeedback(s.feedback ?? '');
                                }}
                                className="text-[10px] px-2 py-1 border border-gray-200 text-gray-500 rounded hover:bg-gray-50 mt-1"
                              >
                                Re-grade
                              </button>
                            </div>
                          ) : s.status === 'PENDING' ? (
                            <span className="text-xs text-amber-600 bg-amber-50 px-2.5 py-1 rounded-md font-medium border border-amber-100 mt-1 inline-block">
                              Not Attempted
                            </span>
                          ) : (
                            <button
                              onClick={() => { setGradeId(s.id); setApproachScore(''); setVivaScore(''); setSolutionScore(''); setFeedback(''); }}
                              className="text-xs px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium"
                            >
                              Grade
                            </button>
                          )}
                        </div>
                      </div>
                      
                      {/* AI Grading Status / Feedback */}
                      {s.aiStatus === 'COMPLETED' && !s.status.includes('GRADED') && (
                        <div className="px-3 pb-3">
                          <div className="bg-indigo-50/50 border border-indigo-100 p-2 rounded-lg text-xs space-y-1">
                            <div className="flex items-center justify-between font-semibold text-indigo-800">
                              <span className="flex items-center gap-1">✨ AI Suggested Scores</span>
                              <span>Approach: {Number(s.aiApproachScore).toFixed(1)} | Solution: {Number(s.aiSolutionScore).toFixed(1)}</span>
                            </div>
                            <p className="text-gray-600 text-[11px]">{s.aiFeedback}</p>
                          </div>
                        </div>
                      )}
                      {s.aiStatus === 'PENDING' && (
                        <div className="px-3 pb-3">
                          <p className="text-xs text-indigo-500 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> AI grading in progress...</p>
                        </div>
                      )}
                      {s.aiStatus === 'FAILED' && (
                        <div className="px-3 pb-3">
                          <p className="text-xs text-red-500 flex items-center gap-1"><AlertCircle className="w-3 h-3" /> AI grading failed</p>
                        </div>
                      )}

                      {s.status === 'GRADED' && s.feedback && (
                        <div className="px-3 pb-3">
                          <p className="text-xs text-gray-500 bg-white p-2 rounded border border-gray-100">
                            <strong>Feedback:</strong> {s.feedback}
                          </p>
                        </div>
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
          <div className="border-t p-4 bg-gradient-to-r from-indigo-50 to-white flex-shrink-0">
            <div className="flex items-center gap-2 mb-3">
              <p className="text-xs font-semibold text-indigo-800">Enter Part B scores (Part A is auto-graded from MCQ)</p>
              {(() => {
                const sub = a?.submissions?.find((s) => s.id === gradeId);
                return sub?.partAScore != null ? (
                  <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-medium">
                    Part A: {sub.partAScore}/{a?.partAMarks} (auto)
                  </span>
                ) : null;
              })()}
            </div>
            <div className="flex gap-3 items-end flex-wrap">
              <div className="w-28">
                <label className={LABEL_CLS}>Approach <span className="text-gray-400">(max {approachMax.toFixed(0)})</span></label>
                <input type="number" className={INPUT_CLS} value={approachScore} onChange={(e) => setApproachScore(e.target.value)} min={0} max={approachMax} placeholder="—" />
                {(() => {
                  const sub = a?.submissions?.find((s) => s.id === gradeId);
                  return sub?.aiStatus === 'COMPLETED' && sub?.aiApproachScore != null ? (
                    <button onClick={() => setApproachScore(String(sub.aiApproachScore))} className="text-[10px] text-indigo-600 font-medium hover:underline flex items-center gap-1 mt-1">
                      ✨ Use AI ({Number(sub.aiApproachScore).toFixed(1)})
                    </button>
                  ) : null;
                })()}
              </div>
              <div className="w-28">
                <label className={LABEL_CLS}>Viva <span className="text-gray-400">(max {vivaMax.toFixed(0)})</span></label>
                <input type="number" className={INPUT_CLS} value={vivaScore} onChange={(e) => setVivaScore(e.target.value)} min={0} max={vivaMax} placeholder="—" />
              </div>
              <div className="w-28">
                <label className={LABEL_CLS}>Solution <span className="text-gray-400">(max {solutionMax.toFixed(0)})</span></label>
                <input type="number" className={INPUT_CLS} value={solutionScore} onChange={(e) => setSolutionScore(e.target.value)} min={0} max={solutionMax} placeholder="—" />
                {(() => {
                  const sub = a?.submissions?.find((s) => s.id === gradeId);
                  return sub?.aiStatus === 'COMPLETED' && sub?.aiSolutionScore != null ? (
                    <button onClick={() => setSolutionScore(String(sub.aiSolutionScore))} className="text-[10px] text-indigo-600 font-medium hover:underline flex items-center gap-1 mt-1">
                      ✨ Use AI ({Number(sub.aiSolutionScore).toFixed(1)})
                    </button>
                  ) : null;
                })()}
              </div>
              <div className="flex-1 min-w-[180px]">
                <label className={LABEL_CLS}>Feedback (optional)</label>
                <input className={INPUT_CLS} value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder="Good work! Consider..." />
              </div>
              <button
                onClick={() => gradeMut.mutate()}
                disabled={gradeMut.isPending}
                className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl font-semibold text-sm disabled:opacity-50 hover:bg-indigo-700 transition-colors flex items-center gap-2"
              >
                {gradeMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                Save Grade
              </button>
              <button onClick={resetGrade} className="p-2.5 text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
