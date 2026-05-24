import React, { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  HelpCircle, LayoutDashboard, Layers, Database, BookOpen, ListChecks,
  Plus, Search, Loader2, X, CheckCircle2, Lock, Unlock, Shuffle,
  PlayCircle, Trash2, Eye, ChevronRight, Upload, FileText, FileSpreadsheet,
  AlertCircle, Clock, Award, BarChart3, Filter, Download, ChevronDown,
} from 'lucide-react';
import { toast } from 'sonner';
import api from '../../lib/axios';
import { Skeleton } from '../components/ui/skeleton';
import { INPUT_CLS, LABEL_CLS } from '../../lib/constants';
import type { Course, CourseModule, Quiz, QuizDataset, QuizQuestion } from '../../types/api';

type Tab = 'dashboard' | 'modules' | 'datasets' | 'questions' | 'quizzes' | 'attempts';

async function fetchCourses(): Promise<Course[]> {
  const { data } = await api.get('/courses');
  return data.data?.courses ?? data.data ?? [];
}

export default function QuizMasterPage() {
  const [tab, setTab] = useState<Tab>('dashboard');
  const [courseId, setCourseId] = useState('');
  const [showCsvImportGlobal, setShowCsvImportGlobal] = useState(false);
  const qc = useQueryClient();

  const { data: courses = [] } = useQuery({ queryKey: ['courses-quiz'], queryFn: fetchCourses });

  const tabs: { id: Tab; label: string; icon: typeof HelpCircle }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'modules', label: 'Modules & Release', icon: Layers },
    { id: 'datasets', label: 'Datasets', icon: Database },
    { id: 'questions', label: 'Question Bank', icon: BookOpen },
    { id: 'quizzes', label: 'Quiz Builder', icon: ListChecks },
    { id: 'attempts', label: 'Attempts', icon: PlayCircle },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Quiz master</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            Module-by-module quiz release, randomized questions per learner, and reference datasets.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setShowCsvImportGlobal(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl hover:bg-emerald-100 transition-colors"
          >
            <FileSpreadsheet className="w-4 h-4" /> Import Quiz CSV
          </button>
          <select
            value={courseId}
            onChange={(e) => setCourseId(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-200 rounded-xl bg-white shadow-sm min-w-[180px]"
          >
            <option value="">All courses</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>{c.title}</option>
            ))}
          </select>
        </div>
      </div>

      {showCsvImportGlobal && (
        <CsvImportModal
          courseId={courseId}
          onClose={() => setShowCsvImportGlobal(false)}
          onDone={() => {
            setShowCsvImportGlobal(false);
            qc.invalidateQueries({ queryKey: ['quizzes-list'] });
            qc.invalidateQueries({ queryKey: ['quiz-dashboard'] });
            qc.invalidateQueries({ queryKey: ['questions'] });
            setTab('quizzes');
          }}
        />
      )}

      <div className="flex flex-wrap gap-1 p-1 bg-gray-100 rounded-xl">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-all ${
              tab === id ? 'bg-white text-purple-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Icon className="w-4 h-4" /> {label}
          </button>
        ))}
      </div>

      {tab === 'dashboard' && <QuizDashboardTab />}
      {tab === 'modules' && <ModulesTab courseId={courseId} qc={qc} />}
      {tab === 'datasets' && <DatasetsTab courseId={courseId} qc={qc} />}
      {tab === 'questions' && <QuestionsTab courseId={courseId} qc={qc} />}
      {tab === 'quizzes' && <QuizzesTab courseId={courseId} qc={qc} />}
      {tab === 'attempts' && <AttemptsTab />}
    </div>
  );
}

/* Dashboard ──────────────────────────── */

function QuizDashboardTab() {
  const { data, isLoading } = useQuery({
    queryKey: ['quiz-dashboard'],
    queryFn: async () => {
      const { data } = await api.get('/quizzes/dashboard');
      return data.data;
    },
  });
  const cards = [
    { label: 'Course Modules', value: data?.totalModules, color: 'purple', icon: Layers },
    { label: 'Question Bank', value: data?.totalQuestions, color: 'blue', icon: BookOpen },
    { label: 'Active Quizzes', value: data?.totalQuizzes, color: 'cyan', icon: ListChecks },
    { label: 'Released Quizzes', value: data?.releasedQuizzes, color: 'emerald', icon: Unlock },
    { label: 'Submissions', value: data?.totalAttempts, color: 'amber', icon: Award },
  ];

  const colorMap: Record<string, string> = {
    purple: 'bg-purple-50 text-purple-600 border-purple-100',
    blue: 'bg-blue-50 text-blue-600 border-blue-100',
    cyan: 'bg-cyan-50 text-cyan-600 border-cyan-100',
    emerald: 'bg-emerald-50 text-emerald-600 border-emerald-100',
    amber: 'bg-amber-50 text-amber-600 border-amber-100',
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {isLoading
          ? Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)
          : cards.map((c) => (
              <div key={c.label} className={`rounded-2xl border p-4 shadow-sm ${colorMap[c.color]}`}>
                <c.icon className="w-5 h-5 mb-2 opacity-70" />
                <p className="text-2xl font-bold text-gray-900 mt-1">{c.value ?? 0}</p>
                <p className="text-xs text-gray-500 mt-0.5">{c.label}</p>
              </div>
            ))}
      </div>

      <div className="col-span-full bg-gradient-to-r from-purple-50 to-violet-50 border border-purple-100 rounded-2xl p-5">
        <h3 className="font-semibold text-purple-900 flex items-center gap-2">
          <Shuffle className="w-5 h-5" /> How Randomized Quizzes Work
        </h3>
        <ul className="mt-3 space-y-2 text-sm text-purple-800/90">
          <li className="flex items-start gap-2">
            <Lock className="w-4 h-4 mt-0.5 text-purple-500 flex-shrink-0" />
            <span><strong>Module-locked release:</strong> Quizzes stay locked until the trainer completes each module sequentially. Learners cannot access quizzes ahead of schedule.</span>
          </li>
          <li className="flex items-start gap-2">
            <Shuffle className="w-4 h-4 mt-0.5 text-purple-500 flex-shrink-0" />
            <span><strong>Per-student randomization:</strong> Each learner gets a unique set of questions drawn randomly from the module question pool, so no two quiz attempts are the same.</span>
          </li>
          <li className="flex items-start gap-2">
            <BarChart3 className="w-4 h-4 mt-0.5 text-purple-500 flex-shrink-0" />
            <span><strong>Option shuffling:</strong> MCQ answer options are also shuffled per attempt, preventing answer copying between learners.</span>
          </li>
          <li className="flex items-start gap-2">
            <Database className="w-4 h-4 mt-0.5 text-purple-500 flex-shrink-0" />
            <span><strong>Dataset references:</strong> Upload PDF, Excel, CSV, or JSON reference datasets that trainers can refer to when creating questions.</span>
          </li>
        </ul>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
        <h3 className="font-semibold text-gray-900 flex items-center gap-2 mb-3">
          <Clock className="w-5 h-5 text-gray-500" /> Quiz Release Flow
        </h3>
        <div className="flex items-center gap-2 text-sm flex-wrap">
          <span className="px-3 py-1.5 bg-gray-100 rounded-full text-gray-600 font-medium">1. Create Modules</span>
          <ChevronRight className="w-4 h-4 text-gray-400" />
          <span className="px-3 py-1.5 bg-blue-100 rounded-full text-blue-700 font-medium">2. Add Questions</span>
          <ChevronRight className="w-4 h-4 text-gray-400" />
          <span className="px-3 py-1.5 bg-purple-100 rounded-full text-purple-700 font-medium">3. Build Quiz</span>
          <ChevronRight className="w-4 h-4 text-gray-400" />
          <span className="px-3 py-1.5 bg-emerald-100 rounded-full text-emerald-700 font-medium">4. Complete Module = Quiz Released</span>
        </div>
      </div>
    </div>
  );
}

/* Modules ──────────────────────────── */

function ModulesTab({ courseId, qc }: { courseId: string; qc: ReturnType<typeof useQueryClient> }) {
  const [showAdd, setShowAdd] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const { data: courses = [] } = useQuery({ queryKey: ['courses-mod'], queryFn: fetchCourses });
  const cid = courseId || courses[0]?.id || '';

  const { data: modules = [], isLoading } = useQuery({
    queryKey: ['modules', cid],
    queryFn: async () => {
      if (!cid) return [];
      const { data } = await api.get(`/courses/${cid}/modules`);
      return data.data as CourseModule[];
    },
    enabled: !!cid,
  });

  const completeMut = useMutation({
    mutationFn: (id: string) => api.post(`/courses/${cid}/modules/${id}/complete`),
    onSuccess: () => {
      toast.success('Module completed — next module released and quiz is now live!');
      qc.invalidateQueries({ queryKey: ['modules'] });
      qc.invalidateQueries({ queryKey: ['quizzes-list'] });
      qc.invalidateQueries({ queryKey: ['quiz-dashboard'] });
    },
    onError: (e: { response?: { data?: { message?: string } } }) =>
      toast.error(e.response?.data?.message ?? 'Failed to complete module'),
  });

  const addMut = useMutation({
    mutationFn: () => api.post(`/courses/${cid}/modules`, { title, description: description || undefined }),
    onSuccess: () => {
      toast.success('Module added');
      setShowAdd(false);
      setTitle('');
      setDescription('');
      qc.invalidateQueries({ queryKey: ['modules'] });
      qc.invalidateQueries({ queryKey: ['quiz-dashboard'] });
    },
    onError: () => toast.error('Failed to add module'),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => api.delete(`/courses/${cid}/modules/${id}`),
    onSuccess: () => {
      toast.success('Module deleted');
      qc.invalidateQueries({ queryKey: ['modules'] });
      qc.invalidateQueries({ queryKey: ['quiz-dashboard'] });
    },
    onError: () => toast.error('Failed to delete module'),
  });

  const statusIcon = (s: string) => {
    if (s === 'COMPLETED') return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
    if (s === 'RELEASED') return <Unlock className="w-4 h-4 text-blue-500" />;
    return <Lock className="w-4 h-4 text-gray-400" />;
  };

  return (
    <div className="space-y-4">
      {!cid && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-3 text-sm text-amber-800">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          Select a course from the dropdown above to manage modules.
        </div>
      )}
      {cid && (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">
              Modules are released sequentially. Complete each module to release its quiz and unlock the next.
            </p>
            <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-purple-600 rounded-xl hover:bg-purple-700 transition-colors">
              <Plus className="w-4 h-4" /> Add Module
            </button>
          </div>
          {isLoading ? (
            <Skeleton className="h-40 rounded-2xl" />
          ) : modules.length === 0 ? (
            <div className="text-center py-12 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
              <Layers className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 text-sm">No modules yet. Add your first module to get started.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {modules.map((m, idx) => (
                <div key={m.id} className={`bg-white rounded-2xl border p-4 flex items-center gap-4 shadow-sm transition-all ${
                  m.status === 'COMPLETED' ? 'border-emerald-200 bg-emerald-50/30' :
                  m.status === 'RELEASED' ? 'border-blue-200 bg-blue-50/30' : 'border-gray-100'
                }`}>
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold ${
                    m.status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-700' :
                    m.status === 'RELEASED' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'
                  }`}>
                    {idx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {statusIcon(m.status)}
                      <h3 className="font-semibold text-gray-900">{m.title}</h3>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        m.status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-700' :
                        m.status === 'RELEASED' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
                      }`}>{m.status}</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {m.questionCount} questions · {m.quizTitle ? `Quiz: ${m.quizTitle}` : 'No quiz linked yet'}
                      {m.status === 'COMPLETED' && m.completedByName && ` · Completed by ${m.completedByName}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {m.status === 'RELEASED' && (
                      <button
                        onClick={() => confirm(`Mark "${m.title}" complete? This will:\n- Release its quiz to learners\n- Unlock the next module`) && completeMut.mutate(m.id)}
                        disabled={completeMut.isPending}
                        className="px-3 py-1.5 text-xs font-semibold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors flex items-center gap-1.5"
                      >
                        {completeMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                        Complete & Release Quiz
                      </button>
                    )}
                    {m.status === 'COMPLETED' && (
                      <span className="text-xs text-emerald-600 font-medium flex items-center gap-1 px-2">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Quiz live
                      </span>
                    )}
                    {m.status === 'LOCKED' && (
                      <span className="text-xs text-gray-400 flex items-center gap-1 px-2">
                        <Lock className="w-3.5 h-3.5" /> Locked
                      </span>
                    )}
                    <button
                      onClick={() => confirm(`Are you sure you want to delete the module "${m.title}"?`) && delMut.mutate(m.id)}
                      disabled={delMut.isPending}
                      className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                      title="Delete module"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
      {showAdd && (
        <Modal title="Add Module" onClose={() => setShowAdd(false)}>
          <div className="space-y-3">
            <div>
              <label className={LABEL_CLS}>Module title *</label>
              <input className={INPUT_CLS} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Introduction to React" />
            </div>
            <div>
              <label className={LABEL_CLS}>Description (optional)</label>
              <textarea className={INPUT_CLS} rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Brief description of this module" />
            </div>
            <button onClick={() => addMut.mutate()} disabled={!title.trim() || addMut.isPending} className="mt-2 w-full py-2.5 bg-purple-600 text-white rounded-xl font-semibold disabled:opacity-50 hover:bg-purple-700 transition-colors">
              {addMut.isPending ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Create Module'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* Datasets ──────────────────────────── */

function DatasetsTab({ courseId, qc }: { courseId: string; qc: ReturnType<typeof useQueryClient> }) {
  const [showUpload, setShowUpload] = useState(false);
  const [viewId, setViewId] = useState<string | null>(null);
  const { data: datasets = [], isLoading } = useQuery({
    queryKey: ['datasets', courseId],
    queryFn: async () => {
      const { data } = await api.get('/quizzes/datasets', { params: courseId ? { courseId } : {} });
      return data.data as QuizDataset[];
    },
  });
  const { data: detail } = useQuery({
    queryKey: ['dataset', viewId],
    queryFn: async () => {
      const { data } = await api.get(`/quizzes/datasets/${viewId}`);
      return data.data as QuizDataset;
    },
    enabled: !!viewId,
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/quizzes/datasets/${id}`),
    onSuccess: () => {
      toast.success('Dataset deleted');
      qc.invalidateQueries({ queryKey: ['datasets'] });
    },
    onError: () => toast.error('Failed to delete'),
  });

  const fileTypeIcon = (ft: string) => {
    const colors: Record<string, string> = {
      PDF: 'bg-red-100 text-red-600',
      EXCEL: 'bg-emerald-100 text-emerald-600',
      CSV: 'bg-blue-100 text-blue-600',
      JSON: 'bg-amber-100 text-amber-600',
    };
    return colors[ft] ?? 'bg-gray-100 text-gray-600';
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <p className="text-sm text-gray-500">Upload reference datasets (PDF, Excel, CSV, JSON) for question authoring.</p>
          <p className="text-xs text-gray-400 mt-0.5">Trainers can refer to these while creating quiz questions.</p>
        </div>
        <button onClick={() => setShowUpload(true)} className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-purple-600 rounded-xl hover:bg-purple-700 transition-colors">
          <Upload className="w-4 h-4" /> Upload Dataset
        </button>
      </div>
      {isLoading ? <Skeleton className="h-32" /> : (
        <div className="grid md:grid-cols-2 gap-3">
          {datasets.map((d) => (
            <div key={d.id} className="bg-white rounded-2xl border p-4 shadow-sm hover:shadow-md transition-shadow group">
              <div className="flex items-start gap-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${fileTypeIcon(d.fileType)}`}>
                  <FileText className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-900 truncate">{d.title}</h3>
                  <p className="text-xs text-gray-500">{d.filename} · {d.fileType}</p>
                  {d.uploadedByName && <p className="text-xs text-gray-400 mt-0.5">By {d.uploadedByName}</p>}
                  <p className="text-xs text-gray-400 mt-1 line-clamp-2">{d.preview || 'No preview available'}</p>
                </div>
                <div className="flex flex-col gap-1">
                  <button onClick={() => setViewId(d.id)} className="text-purple-600 text-xs font-medium hover:text-purple-800 transition-colors">
                    <Eye className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => confirm('Delete this dataset?') && deleteMut.mutate(d.id)}
                    className="text-red-400 text-xs hover:text-red-600 transition-colors opacity-0 group-hover:opacity-100"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
          {!datasets.length && (
            <div className="col-span-full text-center py-12 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
              <Database className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 text-sm">No datasets uploaded yet</p>
              <p className="text-gray-400 text-xs mt-1">Upload reference materials for question creation</p>
            </div>
          )}
        </div>
      )}
      {showUpload && <DatasetUploadModal courseId={courseId} onClose={() => setShowUpload(false)} onDone={() => { setShowUpload(false); qc.invalidateQueries({ queryKey: ['datasets'] }); }} />}
      {viewId && detail && (
        <Modal title={detail.title} onClose={() => setViewId(null)} wide>
          <div className="space-y-3">
            <div className="flex items-center gap-3 text-sm text-gray-500">
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${fileTypeIcon(detail.fileType)}`}>{detail.fileType}</span>
              <span>{detail.filename}</span>
              {detail.contentText && <span>{detail.contentText.length.toLocaleString()} chars extracted</span>}
            </div>
            <pre className="text-xs bg-gray-50 p-4 rounded-xl max-h-96 overflow-auto whitespace-pre-wrap font-mono text-gray-700 border">
              {detail.contentText || 'No extracted content available'}
            </pre>
          </div>
        </Modal>
      )}
    </div>
  );
}

function DatasetUploadModal({ courseId, onClose, onDone }: { courseId: string; onClose: () => void; onDone: () => void }) {
  const [title, setTitle] = useState('');
  const [cid, setCid] = useState(courseId);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const { data: courses = [] } = useQuery({ queryKey: ['courses-ds'], queryFn: fetchCourses });

  async function submit() {
    if (!file || !title || !cid) return;
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('title', title);
      fd.append('courseId', cid);
      await api.post('/quizzes/datasets', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      toast.success('Dataset uploaded successfully');
      onDone();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg ?? 'Upload failed — check file format and size');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal title="Upload Reference Dataset" onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className={LABEL_CLS}>Course *</label>
          <select className={INPUT_CLS} value={cid} onChange={(e) => setCid(e.target.value)}>
            <option value="">Select course</option>
            {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
        </div>
        <div>
          <label className={LABEL_CLS}>Dataset title *</label>
          <input className={INPUT_CLS} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Chapter 3 Reference Material" />
        </div>
        <div>
          <label className={LABEL_CLS}>File (PDF, Excel, CSV, JSON) *</label>
          <div className="border-2 border-dashed border-gray-200 rounded-xl p-4 text-center hover:border-purple-400 transition-colors">
            <input type="file" accept=".pdf,.xlsx,.xls,.csv,.json" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-sm" />
            {file && (
              <p className="mt-2 text-xs text-purple-600 font-medium">
                {file.name} ({(file.size / 1024).toFixed(1)} KB)
              </p>
            )}
          </div>
        </div>
        <button onClick={submit} disabled={loading || !file || !title || !cid} className="w-full py-2.5 bg-purple-600 text-white rounded-xl font-semibold disabled:opacity-50 hover:bg-purple-700 transition-colors">
          {loading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Upload'}
        </button>
      </div>
    </Modal>
  );
}

/** Safely parse options JSONB field (could be array, stringified JSON, or null) */
function parseOptions(options: unknown): string[] {
  if (Array.isArray(options)) return options;
  if (typeof options === 'string') {
    try { const parsed = JSON.parse(options); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
  }
  return [];
}

/* Questions ──────────────────────────── */

function QuestionsTab({ courseId, qc }: { courseId: string; qc: ReturnType<typeof useQueryClient> }) {
  const [showAdd, setShowAdd] = useState(false);
  const [filter, setFilter] = useState<'all' | 'MCQ' | 'TRUE_FALSE' | 'SHORT_ANSWER'>('all');
  const [search, setSearch] = useState('');

  const { data: questions = [], isLoading } = useQuery({
    queryKey: ['quiz-questions', courseId],
    queryFn: async () => {
      const { data } = await api.get('/quizzes/questions', { params: courseId ? { courseId } : {} });
      return data.data as QuizQuestion[];
    },
  });

  const filtered = questions.filter((q) => {
    if (filter !== 'all' && q.questionType !== filter) return false;
    if (search && !q.questionText.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const difficultyBadge = (d: string) => {
    const map: Record<string, string> = {
      EASY: 'bg-emerald-100 text-emerald-700',
      MEDIUM: 'bg-amber-100 text-amber-700',
      HARD: 'bg-red-100 text-red-700',
    };
    return map[d] ?? 'bg-gray-100 text-gray-600';
  };

  const typeBadge = (t: string) => {
    const map: Record<string, string> = {
      MCQ: 'bg-blue-100 text-blue-700',
      TRUE_FALSE: 'bg-purple-100 text-purple-700',
      SHORT_ANSWER: 'bg-cyan-100 text-cyan-700',
    };
    return map[t] ?? 'bg-gray-100 text-gray-600';
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              className="pl-9 pr-4 py-2 text-sm border rounded-lg w-64"
              placeholder="Search questions..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex gap-1 bg-gray-100 p-0.5 rounded-lg">
            {(['all', 'MCQ', 'TRUE_FALSE', 'SHORT_ANSWER'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-2 py-1 text-xs font-medium rounded ${
                  filter === f ? 'bg-white text-purple-700 shadow-sm' : 'text-gray-500'
                }`}
              >
                {f === 'all' ? 'All' : f === 'TRUE_FALSE' ? 'T/F' : f === 'SHORT_ANSWER' ? 'Short' : 'MCQ'}
              </button>
            ))}
          </div>
        </div>
        <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-purple-600 rounded-xl hover:bg-purple-700 transition-colors">
          <Plus className="w-4 h-4" /> Add Question
        </button>
      </div>

      <p className="text-xs text-gray-400">
        {filtered.length} question{filtered.length !== 1 ? 's' : ''} {filter !== 'all' ? `(${filter})` : ''} in bank
      </p>

      {isLoading ? <Skeleton className="h-40" /> : (
        <div className="space-y-2">
          {filtered.map((q) => (
            <div key={q.id} className="bg-white rounded-xl border p-4 flex gap-3 hover:shadow-sm transition-shadow group">
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900">{q.questionText}</p>
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${typeBadge(q.questionType)}`}>
                    {q.questionType === 'TRUE_FALSE' ? 'True/False' : q.questionType === 'SHORT_ANSWER' ? 'Short Answer' : 'MCQ'}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${difficultyBadge(q.difficulty)}`}>
                    {q.difficulty}
                  </span>
                  <span className="text-xs text-gray-400">{q.points} pts</span>
                  {q.moduleTitle && <span className="text-xs text-gray-400">· {q.moduleTitle}</span>}
                </div>
                {q.questionType === 'MCQ' && q.options && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {parseOptions(q.options).map((opt, i) => (
                      <span key={i} className={`text-xs px-2 py-0.5 rounded border ${
                        opt === q.correctAnswer ? 'bg-emerald-50 border-emerald-200 text-emerald-700 font-medium' : 'bg-gray-50 border-gray-200 text-gray-600'
                      }`}>
                        {opt} {opt === q.correctAnswer && '✓'}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <button onClick={async () => {
                if (!confirm('Delete this question?')) return;
                await api.delete(`/quizzes/questions/${q.id}`);
                qc.invalidateQueries({ queryKey: ['quiz-questions'] });
                toast.success('Deleted');
              }} className="text-red-400 p-1 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 className="w-4 h-4" /></button>
            </div>
          ))}
          {!filtered.length && (
            <div className="text-center py-12 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
              <BookOpen className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 text-sm">{questions.length ? 'No matching questions' : 'No questions in bank yet'}</p>
            </div>
          )}
        </div>
      )}
      {showAdd && <AddQuestionModal courseId={courseId} onClose={() => setShowAdd(false)} onDone={() => { setShowAdd(false); qc.invalidateQueries({ queryKey: ['quiz-questions'] }); qc.invalidateQueries({ queryKey: ['quiz-dashboard'] }); }} />}
    </div>
  );
}

function AddQuestionModal({ courseId, onClose, onDone }: { courseId: string; onClose: () => void; onDone: () => void }) {
  const [form, setForm] = useState({
    courseId: courseId, moduleId: '', datasetId: '', questionText: '', questionType: 'MCQ' as 'MCQ' | 'TRUE_FALSE' | 'SHORT_ANSWER',
    options: ['', '', '', ''], correctAnswer: '', explanation: '', points: 1, difficulty: 'MEDIUM',
  });
  const [loading, setLoading] = useState(false);
  const { data: courses = [] } = useQuery({ queryKey: ['c-q'], queryFn: fetchCourses });
  const cid = form.courseId || courses[0]?.id;
  const { data: modules = [] } = useQuery({
    queryKey: ['mod-q', cid],
    queryFn: async () => {
      const { data } = await api.get(`/courses/${cid}/modules`);
      return data.data;
    },
    enabled: !!cid,
  });
  const { data: datasets = [] } = useQuery({
    queryKey: ['ds-q', cid],
    queryFn: async () => {
      const { data } = await api.get('/quizzes/datasets', { params: cid ? { courseId: cid } : {} });
      return data.data as QuizDataset[];
    },
    enabled: !!cid,
  });

  async function submit() {
    if (!form.questionText || !form.correctAnswer) {
      toast.error('Question text and correct answer are required');
      return;
    }
    setLoading(true);
    try {
      await api.post('/quizzes/questions', {
        ...form,
        courseId: cid,
        options: form.questionType === 'MCQ' ? form.options.filter(Boolean) : undefined,
        moduleId: form.moduleId || undefined,
        datasetId: form.datasetId || undefined,
        explanation: form.explanation || undefined,
      });
      toast.success('Question added to bank');
      onDone();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg ?? 'Failed to add question');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal title="Add to Question Bank" onClose={onClose} wide>
      <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={LABEL_CLS}>Course *</label>
            <select className={INPUT_CLS} value={cid} onChange={(e) => setForm({ ...form, courseId: e.target.value })}>
              {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select>
          </div>
          <div>
            <label className={LABEL_CLS}>Module (required for quiz release)</label>
            <select className={INPUT_CLS} value={form.moduleId} onChange={(e) => setForm({ ...form, moduleId: e.target.value })}>
              <option value="">Select module</option>
              {(modules as CourseModule[]).map((m) => <option key={m.id} value={m.id}>{m.title} ({m.status})</option>)}
            </select>
          </div>
        </div>

        {datasets.length > 0 && (
          <div>
            <label className={LABEL_CLS}>Reference Dataset (optional)</label>
            <select className={INPUT_CLS} value={form.datasetId} onChange={(e) => setForm({ ...form, datasetId: e.target.value })}>
              <option value="">No dataset reference</option>
              {datasets.map((d) => <option key={d.id} value={d.id}>{d.title} ({d.fileType})</option>)}
            </select>
          </div>
        )}

        <div>
          <label className={LABEL_CLS}>Question *</label>
          <textarea className={INPUT_CLS} rows={3} value={form.questionText} onChange={(e) => setForm({ ...form, questionText: e.target.value })} placeholder="Enter the question text..." />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className={LABEL_CLS}>Type</label>
            <select className={INPUT_CLS} value={form.questionType} onChange={(e) => setForm({ ...form, questionType: e.target.value as 'MCQ' })}>
              <option value="MCQ">Multiple Choice</option>
              <option value="TRUE_FALSE">True / False</option>
              <option value="SHORT_ANSWER">Short Answer</option>
            </select>
          </div>
          <div>
            <label className={LABEL_CLS}>Difficulty</label>
            <select className={INPUT_CLS} value={form.difficulty} onChange={(e) => setForm({ ...form, difficulty: e.target.value })}>
              <option value="EASY">Easy</option>
              <option value="MEDIUM">Medium</option>
              <option value="HARD">Hard</option>
            </select>
          </div>
          <div>
            <label className={LABEL_CLS}>Points</label>
            <input type="number" className={INPUT_CLS} min={1} value={form.points} onChange={(e) => setForm({ ...form, points: +e.target.value || 1 })} />
          </div>
        </div>

        {form.questionType === 'MCQ' && (
          <div>
            <label className={LABEL_CLS}>Options (at least 2)</label>
            <div className="space-y-2">
              {form.options.map((o, i) => (
                <input key={i} className={INPUT_CLS} placeholder={`Option ${i + 1}${i < 2 ? ' *' : ' (optional)'}`} value={o}
                  onChange={(e) => { const opts = [...form.options]; opts[i] = e.target.value; setForm({ ...form, options: opts }); }} />
              ))}
            </div>
          </div>
        )}

        <div>
          <label className={LABEL_CLS}>Correct answer *</label>
          {form.questionType === 'TRUE_FALSE' ? (
            <select className={INPUT_CLS} value={form.correctAnswer} onChange={(e) => setForm({ ...form, correctAnswer: e.target.value })}>
              <option value="">Select</option>
              <option value="True">True</option>
              <option value="False">False</option>
            </select>
          ) : (
            <input className={INPUT_CLS} value={form.correctAnswer} onChange={(e) => setForm({ ...form, correctAnswer: e.target.value })}
              placeholder={form.questionType === 'MCQ' ? 'Must match one of the options exactly' : 'Expected answer'} />
          )}
        </div>

        <div>
          <label className={LABEL_CLS}>Explanation (shown after grading)</label>
          <textarea className={INPUT_CLS} rows={2} value={form.explanation} onChange={(e) => setForm({ ...form, explanation: e.target.value })} placeholder="Optional explanation for the correct answer" />
        </div>

        <button onClick={submit} disabled={loading || !form.questionText || !form.correctAnswer}
          className="w-full py-2.5 bg-purple-600 text-white rounded-xl font-semibold disabled:opacity-50 hover:bg-purple-700 transition-colors">
          {loading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Save Question'}
        </button>
      </div>
    </Modal>
  );
}

/* Quizzes ──────────────────────────── */

function QuizzesTab({ courseId, qc }: { courseId: string; qc: ReturnType<typeof useQueryClient> }) {
  const [showAdd, setShowAdd] = useState(false);
  const [showCsvImport, setShowCsvImport] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const { data: quizzes = [], isLoading } = useQuery({
    queryKey: ['quizzes-list', courseId],
    queryFn: async () => {
      const { data } = await api.get('/quizzes', { params: courseId ? { courseId } : {} });
      return data.data as Quiz[];
    },
  });
  const { data: preview } = useQuery({
    queryKey: ['quiz-preview', previewId],
    queryFn: async () => {
      const { data } = await api.get(`/quizzes/${previewId}/preview`);
      return data.data;
    },
    enabled: !!previewId,
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/quizzes/${id}`),
    onSuccess: () => {
      toast.success('Quiz deleted');
      qc.invalidateQueries({ queryKey: ['quizzes-list'] });
      qc.invalidateQueries({ queryKey: ['quiz-dashboard'] });
    },
    onError: () => toast.error('Failed to delete quiz'),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          Each module gets one quiz. Quizzes stay locked until the trainer completes the linked module.
        </p>
        <div className="flex gap-2">
          <button onClick={() => setShowCsvImport(true)} className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl hover:bg-emerald-100 transition-colors">
            <FileSpreadsheet className="w-4 h-4" /> Import CSV
          </button>
          <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-purple-600 rounded-xl hover:bg-purple-700 transition-colors">
            <Plus className="w-4 h-4" /> Create Quiz
          </button>
        </div>
      </div>

      {isLoading ? <Skeleton className="h-40" /> : (
        <div className="grid md:grid-cols-2 gap-4">
          {quizzes.map((q) => (
            <div key={q.id} className={`rounded-2xl border p-5 shadow-sm transition-all hover:shadow-md group ${
              q.isReleased ? 'bg-gradient-to-br from-emerald-50/80 to-green-50/50 border-emerald-200' : 'bg-white border-gray-100'
            }`}>
              <div className="flex justify-between items-start">
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-gray-900">{q.title}</h3>
                  <p className="text-xs text-gray-500 mt-0.5">{q.courseTitle} · Module {((q.moduleOrder ?? 0) + 1)}: {q.moduleTitle}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${
                    q.isReleased ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                  }`}>
                    {q.isReleased ? 'Released' : 'Locked'}
                  </span>
                  <button
                    onClick={() => confirm('Delete this quiz?') && deleteMut.mutate(q.id)}
                    className="text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity p-1"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-gray-600">
                <span className="flex items-center gap-1"><BookOpen className="w-3 h-3" /> Pool: {q.poolSize} questions</span>
                <span className="flex items-center gap-1"><Filter className="w-3 h-3" /> Per attempt: {q.questionsPerAttempt}</span>
                <span className="flex items-center gap-1"><Shuffle className="w-3 h-3" /> Randomize: {q.randomizeQuestions ? 'Yes' : 'No'}</span>
                <span className="flex items-center gap-1"><Award className="w-3 h-3" /> Pass: {q.passingScore}%</span>
                <span className="flex items-center gap-1"><PlayCircle className="w-3 h-3" /> Max attempts: {q.maxAttempts}</span>
                {q.timeLimitMinutes && <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {q.timeLimitMinutes} min</span>}
              </div>

              {!q.isReleased && (
                <div className="mt-3 flex items-center gap-2 text-xs text-amber-600 bg-amber-50 px-3 py-1.5 rounded-lg">
                  <Lock className="w-3.5 h-3.5" /> Complete the module to release this quiz to learners
                </div>
              )}

              <button onClick={() => setPreviewId(q.id)} className="mt-3 text-xs text-purple-600 font-medium flex items-center gap-1 hover:text-purple-800 transition-colors">
                <Eye className="w-3.5 h-3.5" /> Preview random draws <ChevronRight className="w-3 h-3" />
              </button>
            </div>
          ))}
          {!quizzes.length && (
            <div className="col-span-full text-center py-12 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
              <ListChecks className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 text-sm">No quizzes yet — create one per module</p>
            </div>
          )}
        </div>
      )}

      {showAdd && <CreateQuizModal courseId={courseId} onClose={() => setShowAdd(false)} onDone={() => { setShowAdd(false); qc.invalidateQueries({ queryKey: ['quizzes-list'] }); qc.invalidateQueries({ queryKey: ['quiz-dashboard'] }); }} />}
      {showCsvImport && <CsvImportModal courseId={courseId} onClose={() => setShowCsvImport(false)} onDone={() => { setShowCsvImport(false); qc.invalidateQueries({ queryKey: ['quizzes-list'] }); qc.invalidateQueries({ queryKey: ['quiz-dashboard'] }); qc.invalidateQueries({ queryKey: ['questions'] }); }} />}

      {previewId && preview && (
        <QuizPreviewModal preview={preview} onClose={() => setPreviewId(null)} />
      )}
    </div>
  );
}


/* Quiz Preview Modal */
type PreviewQuestion = { id: string; text: string; type: string; options: string[]; correctAnswer: string; explanation: string | null; points: number; difficulty: string };
type PreviewDraw    = { studentLabel: string; questions: PreviewQuestion[] };
type PreviewData    = { quizTitle: string; poolSize: number; questionsPerAttempt: number; passingScore: number; timeLimitMinutes: number | null; draws: PreviewDraw[] };

function QuizPreviewModal({ preview, onClose }: { preview: PreviewData; onClose: () => void }) {
  const [activeStudent, setActiveStudent] = React.useState(0);
  const [expandedQ, setExpandedQ]         = React.useState<Set<number>>(new Set());

  const diffColor = (d: string) =>
    d === 'EASY' ? 'bg-emerald-100 text-emerald-700' :
    d === 'HARD' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700';

  const toggle = (i: number) =>
    setExpandedQ(prev => { const s = new Set(prev); s.has(i) ? s.delete(i) : s.add(i); return s; });

  const draw = preview.draws[activeStudent];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b bg-gradient-to-r from-purple-50 to-indigo-50">
          <div>
            <h2 className="font-bold text-gray-900 text-lg">{preview.quizTitle}</h2>
            <p className="text-xs text-gray-500 mt-0.5">Trainer Preview — how each student experiences this quiz</p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-white/80 rounded-lg transition-colors"><X className="w-5 h-5 text-gray-500" /></button>
        </div>

        {/* Stats bar */}
        <div className="grid grid-cols-4 divide-x border-b bg-gray-50 text-center">
          {[
            { label: 'Question Pool', value: preview.poolSize },
            { label: 'Per Attempt',   value: preview.questionsPerAttempt },
            { label: 'Passing Score', value: `${preview.passingScore}%` },
            { label: 'Time Limit',    value: preview.timeLimitMinutes ? `${preview.timeLimitMinutes} min` : 'No limit' },
          ].map(s => (
            <div key={s.label} className="py-3 px-2">
              <p className="text-base font-bold text-gray-900">{s.value}</p>
              <p className="text-[10px] text-gray-500 uppercase tracking-wide">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Student tabs */}
        <div className="flex gap-1 px-4 pt-3 border-b">
          {preview.draws.map((d, i) => (
            <button key={i} onClick={() => { setActiveStudent(i); setExpandedQ(new Set()); }}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
                activeStudent === i ? 'bg-purple-600 text-white' : 'text-gray-500 hover:bg-gray-100'
              }`}>
              {d.studentLabel}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-1 pb-1">
            <div className="flex items-center gap-1.5 text-xs text-purple-600 bg-purple-50 px-3 py-1 rounded-full border border-purple-100">
              <Shuffle className="w-3 h-3" />
              Each student gets a different random set
            </div>
          </div>
        </div>

        {/* Questions list */}
        <div className="overflow-y-auto flex-1 p-4 space-y-2">
          {draw.questions.map((q, i) => (
            <div key={q.id} className="border border-gray-100 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
              {/* Question header */}
              <button className="w-full flex items-start gap-3 p-4 text-left bg-white hover:bg-gray-50 transition-colors" onClick={() => toggle(i)}>
                <span className="min-w-[26px] h-[26px] rounded-full bg-purple-100 text-purple-700 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 leading-snug">{q.text}</p>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${diffColor(q.difficulty)}`}>{q.difficulty}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-blue-50 text-blue-700">{q.type}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-gray-100 text-gray-600">{q.points} pt{q.points !== 1 ? 's' : ''}</span>
                  </div>
                </div>
                <ChevronDown className={`w-4 h-4 text-gray-400 shrink-0 mt-1 transition-transform ${expandedQ.has(i) ? 'rotate-180' : ''}`} />
              </button>

              {/* Expanded: options + answer + explanation */}
              {expandedQ.has(i) && (
                <div className="border-t bg-gray-50/60 px-4 py-3 space-y-2">
                  {q.options.length > 0 && (
                    <div className="grid grid-cols-1 gap-1.5">
                      {q.options.map((opt, oi) => {
                        const letter = String.fromCharCode(65 + oi);
                        const isCorrect = opt === q.correctAnswer;
                        return (
                          <div key={oi} className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm border ${
                            isCorrect ? 'bg-emerald-50 border-emerald-200 text-emerald-800 font-medium' : 'bg-white border-gray-100 text-gray-700'
                          }`}>
                            <span className={`w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center shrink-0 ${
                              isCorrect ? 'bg-emerald-500 text-white' : 'bg-gray-200 text-gray-600'
                            }`}>{letter}</span>
                            {opt}
                            {isCorrect && <span className="ml-auto text-[10px] text-emerald-600 font-semibold">CORRECT</span>}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {q.options.length === 0 && (
                    <p className="text-xs text-gray-500 italic">Answer: <span className="font-medium text-gray-800 not-italic">{q.correctAnswer}</span></p>
                  )}
                  {q.explanation && (
                    <div className="flex gap-2 mt-2 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 text-xs text-blue-800">
                      <BookOpen className="w-3.5 h-3.5 shrink-0 mt-0.5 text-blue-500" />
                      <span>{q.explanation}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* CSV Import Modal ──────────────────────────── */

function CsvImportModal({ courseId, onClose, onDone }: { courseId: string; onClose: () => void; onDone: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile]         = useState<File | null>(null);
  const [loading, setLoading]   = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [form, setForm] = useState({
    courseId, moduleId: '',
    title: '', questionsPerAttempt: 10, passingScore: 60,
    timeLimitMinutes: '' as string | number,
    maxAttempts: 1, status: 'DRAFT' as 'DRAFT' | 'ACTIVE',
  });

  const { data: courses = [] } = useQuery({ queryKey: ['c-z'], queryFn: fetchCourses });
  const cid = form.courseId || courseId || courses[0]?.id;
  const { data: modules = [] } = useQuery({
    queryKey: ['mod-z', cid],
    queryFn: async () => {
      const { data } = await api.get(`/courses/${cid}/modules`);
      return data.data as CourseModule[];
    },
    enabled: !!cid,
  });

  function handleFile(f: File) {
    if (!f.name.endsWith('.csv')) { toast.error('Please upload a .csv file'); return; }
    setFile(f);
    if (!form.title) setForm(prev => ({ ...prev, title: f.name.replace('.csv', '') + ' Quiz' }));
  }

  async function submit() {
    if (!file) { toast.error('Please select a CSV file'); return; }
    if (!form.moduleId) { toast.error('Please select a module'); return; }
    if (!form.title) { toast.error('Please enter a quiz title'); return; }
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('courseId', cid);
      fd.append('moduleId', form.moduleId);
      fd.append('title', form.title);
      fd.append('questionsPerAttempt', String(form.questionsPerAttempt));
      fd.append('passingScore', String(form.passingScore));
      fd.append('maxAttempts', String(form.maxAttempts));
      fd.append('status', form.status);
      if (form.timeLimitMinutes) fd.append('timeLimitMinutes', String(form.timeLimitMinutes));
      const { data } = await api.post('/quizzes/csv-import', fd);
      toast.success(`Imported ${data.data.questionsImported} questions into "${data.data.quiz.title}"!`);
      onDone();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg ?? 'CSV import failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal title="Import Quiz from CSV" onClose={onClose} wide>
      <div className="space-y-4">
        {/* CSV format hint */}
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
          <p className="text-xs font-semibold text-emerald-800 mb-1 flex items-center gap-1.5">
            <FileSpreadsheet className="w-3.5 h-3.5" /> Expected CSV format
          </p>
          <code className="text-xs text-emerald-700 font-mono block leading-relaxed">
            question, optionA, optionB, optionC, optionD, correct_answer, points<br />
            What is React?, A library, A framework, A database, A language, A, 2<br />
            What is JSX?, HTML in JS, CSS syntax, DB query, Config file, A, 1
          </code>
          <p className="text-xs text-emerald-600 mt-1.5">correct_answer must be A, B, C, or D · points column is optional (default: 1)</p>
        </div>

        {/* File drop zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
          onClick={() => fileRef.current?.click()}
          className={`cursor-pointer rounded-xl border-2 border-dashed p-5 text-center transition-all ${
            file ? 'border-emerald-400 bg-emerald-50' : dragOver ? 'border-purple-400 bg-purple-50' : 'border-gray-200 hover:border-purple-300 hover:bg-gray-50'
          }`}
        >
          <input ref={fileRef} type="file" accept=".csv" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
          {file ? (
            <div className="flex items-center justify-center gap-3">
              <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center">
                <FileText className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="text-left">
                <p className="text-sm font-semibold text-emerald-700">{file.name}</p>
                <p className="text-xs text-gray-400">{(file.size / 1024).toFixed(1)} KB · click to replace</p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-1.5">
              <Upload className="w-7 h-7 text-gray-300" />
              <p className="text-sm font-medium text-gray-600">Drop CSV file here or click to browse</p>
              <p className="text-xs text-gray-400">.csv only · max 5 MB</p>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          {/* Module picker */}
          <div className="col-span-2">
            <label className="text-xs font-semibold text-gray-600 mb-1 block">Module *</label>
            <select className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl bg-white"
              value={form.moduleId} onChange={(e) => setForm({ ...form, moduleId: e.target.value })}>
              <option value="">Select module</option>
              {modules.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.title} · {m.status}{m.quizId ? ' (has quiz — will be replaced)' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Quiz title */}
          <div className="col-span-2">
            <label className="text-xs font-semibold text-gray-600 mb-1 block">Quiz title *</label>
            <input className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl"
              placeholder="e.g. Module 1 — SQL Fundamentals Quiz"
              value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-600 mb-1 block">Questions per attempt</label>
            <input type="number" min={1} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl"
              value={form.questionsPerAttempt} onChange={(e) => setForm({ ...form, questionsPerAttempt: +e.target.value || 1 })} />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-600 mb-1 block">Passing score %</label>
            <input type="number" min={0} max={100} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl"
              value={form.passingScore} onChange={(e) => setForm({ ...form, passingScore: +e.target.value })} />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-600 mb-1 block">Max attempts</label>
            <input type="number" min={1} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl"
              value={form.maxAttempts} onChange={(e) => setForm({ ...form, maxAttempts: +e.target.value || 1 })} />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-600 mb-1 block">Time limit (min, optional)</label>
            <input type="number" min={1} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl"
              placeholder="No limit" value={form.timeLimitMinutes}
              onChange={(e) => setForm({ ...form, timeLimitMinutes: e.target.value })} />
          </div>
          <div className="col-span-2">
            <label className="text-xs font-semibold text-gray-600 mb-1 block">Status after import</label>
            <select className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl bg-white"
              value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as 'DRAFT' | 'ACTIVE' })}>
              <option value="DRAFT">Draft (activate manually)</option>
              <option value="ACTIVE">Active (releases with module)</option>
            </select>
          </div>
        </div>

        <div className="bg-purple-50 border border-purple-100 rounded-xl p-3 text-xs text-purple-700 flex items-start gap-2">
          <Shuffle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>All imported quizzes use <strong>randomized questions + shuffled options</strong> per student. Each learner gets a unique draw from the question pool.</span>
        </div>

        <button onClick={submit} disabled={loading || !file || !form.moduleId || !form.title}
          className="w-full py-2.5 bg-emerald-600 text-white rounded-xl font-semibold disabled:opacity-50 hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2">
          {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Importing...</> : <><FileSpreadsheet className="w-4 h-4" /> Import Questions & Create Quiz</>}
        </button>
      </div>
    </Modal>
  );
}

function CreateQuizModal({ courseId, onClose, onDone }: { courseId: string; onClose: () => void; onDone: () => void }) {
  const [form, setForm] = useState({
    courseId, moduleId: '', title: '', description: '', questionsPerAttempt: 5, passingScore: 60,
    timeLimitMinutes: '' as string | number,
    randomizeQuestions: true, randomizeOptions: true, maxAttempts: 2,
  });
  const [loading, setLoading] = useState(false);
  const { data: courses = [] } = useQuery({ queryKey: ['c-z'], queryFn: fetchCourses });
  const cid = form.courseId || courses[0]?.id;
  const { data: modules = [] } = useQuery({
    queryKey: ['mod-z', cid],
    queryFn: async () => {
      const { data } = await api.get(`/courses/${cid}/modules`);
      return data.data as CourseModule[];
    },
    enabled: !!cid,
  });

  async function submit() {
    if (!form.moduleId || !form.title) {
      toast.error('Module and title are required');
      return;
    }
    setLoading(true);
    try {
      await api.post('/quizzes', {
        ...form,
        courseId: cid,
        description: form.description || undefined,
        timeLimitMinutes: form.timeLimitMinutes ? Number(form.timeLimitMinutes) : undefined,
      });
      toast.success('Quiz created (will be released when module is completed)');
      onDone();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg ?? 'Failed to create quiz');
    } finally {
      setLoading(false);
    }
  }

  const availableModules = modules.filter((m) => !m.quizId);

  return (
    <Modal title="Create Quiz" onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className={LABEL_CLS}>Quiz title *</label>
          <input className={INPUT_CLS} placeholder="e.g. Module 1 Assessment" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </div>
        <div>
          <label className={LABEL_CLS}>Module (one quiz per module) *</label>
          <select className={INPUT_CLS} value={form.moduleId} onChange={(e) => setForm({ ...form, moduleId: e.target.value })}>
            <option value="">Select a module</option>
            {availableModules.map((m) => <option key={m.id} value={m.id}>{m.title} ({m.status})</option>)}
          </select>
          {availableModules.length === 0 && modules.length > 0 && (
            <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" /> All modules already have quizzes
            </p>
          )}
        </div>
        <div>
          <label className={LABEL_CLS}>Description</label>
          <textarea className={INPUT_CLS} rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Optional quiz description" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={LABEL_CLS}>Questions per attempt</label>
            <input type="number" className={INPUT_CLS} min={1} value={form.questionsPerAttempt}
              onChange={(e) => setForm({ ...form, questionsPerAttempt: +e.target.value || 1 })} />
          </div>
          <div>
            <label className={LABEL_CLS}>Passing %</label>
            <input type="number" className={INPUT_CLS} min={0} max={100} value={form.passingScore}
              onChange={(e) => setForm({ ...form, passingScore: +e.target.value })} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={LABEL_CLS}>Max attempts</label>
            <input type="number" className={INPUT_CLS} min={1} value={form.maxAttempts}
              onChange={(e) => setForm({ ...form, maxAttempts: +e.target.value || 1 })} />
          </div>
          <div>
            <label className={LABEL_CLS}>Time limit (minutes, optional)</label>
            <input type="number" className={INPUT_CLS} min={1} value={form.timeLimitMinutes} placeholder="No limit"
              onChange={(e) => setForm({ ...form, timeLimitMinutes: e.target.value })} />
          </div>
        </div>
        <div className="space-y-2 bg-purple-50 p-3 rounded-xl border border-purple-100">
          <p className="text-xs font-medium text-purple-800 mb-1">Randomization settings</p>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={form.randomizeQuestions} onChange={(e) => setForm({ ...form, randomizeQuestions: e.target.checked })}
              className="rounded border-purple-300 text-purple-600 focus:ring-purple-500" />
            <span className="text-gray-700">Randomize questions per student</span>
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={form.randomizeOptions} onChange={(e) => setForm({ ...form, randomizeOptions: e.target.checked })}
              className="rounded border-purple-300 text-purple-600 focus:ring-purple-500" />
            <span className="text-gray-700">Shuffle MCQ options per student</span>
          </label>
        </div>
        <button onClick={submit} disabled={loading || !form.moduleId || !form.title}
          className="w-full py-2.5 bg-purple-600 text-white rounded-xl font-semibold disabled:opacity-50 hover:bg-purple-700 transition-colors">
          {loading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Create Quiz'}
        </button>
      </div>
    </Modal>
  );
}

/* Attempts ──────────────────────────── */

function AttemptsTab() {
  const { data: attempts = [], isLoading } = useQuery({
    queryKey: ['quiz-attempts'],
    queryFn: async () => {
      const { data } = await api.get('/quizzes/attempts/list');
      return data.data;
    },
  });

  const statusBadge = (s: string) => {
    const map: Record<string, string> = {
      IN_PROGRESS: 'bg-blue-100 text-blue-700',
      SUBMITTED: 'bg-emerald-100 text-emerald-700',
      GRADED: 'bg-purple-100 text-purple-700',
    };
    return map[s] ?? 'bg-gray-100 text-gray-600';
  };

  return (
    <div className="bg-white rounded-2xl border overflow-hidden shadow-sm">
      {isLoading ? <Skeleton className="h-40" /> : attempts.length === 0 ? (
        <div className="text-center py-12">
          <PlayCircle className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">No quiz attempts yet</p>
          <p className="text-gray-400 text-xs mt-1">Attempts will appear here when learners take released quizzes</p>
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs text-gray-500 uppercase">
            <tr>
              <th className="px-4 py-3">Student</th>
              <th className="px-4 py-3">Quiz</th>
              <th className="px-4 py-3">Attempt</th>
              <th className="px-4 py-3">Score</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Submitted</th>
            </tr>
          </thead>
          <tbody>
            {attempts.map((a: { id: string; studentName: string; quizTitle: string; attemptNumber: number; score: number; status: string; submittedAt: string; questionCount: number }) => (
              <tr key={a.id} className="border-t hover:bg-gray-50/50">
                <td className="px-4 py-3 font-medium">{a.studentName}</td>
                <td className="px-4 py-3">{a.quizTitle}</td>
                <td className="px-4 py-3 text-gray-500">#{a.attemptNumber} ({a.questionCount} Qs)</td>
                <td className="px-4 py-3">
                  {a.score != null ? (
                    <span className={`font-semibold ${a.score >= 60 ? 'text-emerald-600' : 'text-red-500'}`}>{a.score}%</span>
                  ) : '—'}
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusBadge(a.status)}`}>{a.status}</span>
                </td>
                <td className="px-4 py-3 text-gray-500">{a.submittedAt ? new Date(a.submittedAt).toLocaleString() : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function Modal({ title, children, onClose, wide }: { title: string; children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`bg-white rounded-2xl shadow-2xl w-full ${wide ? 'max-w-3xl' : 'max-w-md'} max-h-[90vh] overflow-hidden flex flex-col`}>
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h2 className="font-bold text-gray-900">{title}</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg transition-colors"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
