import React, { useState, useRef, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  LayoutDashboard, BookOpen, ListChecks,
  Plus, Loader2, X, Lock, Unlock, Shuffle,
  PlayCircle, Trash2, Eye, ChevronRight, Upload, FileSpreadsheet, FileText,
  Clock, Award, Filter, ChevronDown, Pencil, Users, AlertCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import api from '../../lib/axios';
import { Skeleton } from '../components/ui/skeleton';
import { NumericInput } from '../components/ui/numeric-input';
import { INPUT_CLS, LABEL_CLS } from '../../lib/constants';
import { usePermissions } from '../../store/PermissionsContext';
import type { Course, CourseModule, Quiz, Batch } from '../../types/api';

type Tab = 'dashboard' | 'quizzes' | 'attempts';

async function fetchCourses(): Promise<Course[]> {
  const { data } = await api.get('/courses');
  return data.data?.courses ?? data.data ?? [];
}

async function fetchModules(courseId: string): Promise<CourseModule[]> {
  const { data } = await api.get(`/courses/${courseId}/modules`);
  return data.data ?? data ?? [];
}

async function fetchBatches(courseId: string): Promise<Batch[]> {
  const { data } = await api.get('/batches', { params: { courseId } });
  return data.data ?? [];
}

function formatSessionLabel(m: CourseModule): string {
  const num = m.sessionNumber ? `Session ${m.sessionNumber}` : m.title;
  return m.section ? `${num} · ${m.section}` : num;
}

export default function QuizMasterPage() {
  const [tab, setTab] = useState<Tab>('quizzes');
  const [showCsvImportGlobal, setShowCsvImportGlobal] = useState(false);
  const qc = useQueryClient();
  const { can } = usePermissions();
  const canEdit   = can('canEditQuizzes');
  const canDelete = can('canDeleteQuizzes') && !can('canSoftDeleteOnly');

  const { data: courses = [] } = useQuery({ queryKey: ['courses-quiz'], queryFn: fetchCourses });

  const tabs: { id: Tab; label: string; icon: typeof LayoutDashboard }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'quizzes', label: 'By Course', icon: ListChecks },
    { id: 'attempts', label: 'Attempts', icon: PlayCircle },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Quiz master</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            Upload under Course → Session. When that course is on a batch, content packages automatically and releases when the trainer marks the session Done.
          </p>
        </div>
        {canEdit && (
          <button
            onClick={() => setShowCsvImportGlobal(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl hover:bg-emerald-100 transition-colors"
          >
            <FileSpreadsheet className="w-4 h-4" /> Import Quiz CSV
          </button>
        )}
      </div>

      {showCsvImportGlobal && (
        <CsvImportModal
          courseId=""
          onClose={() => setShowCsvImportGlobal(false)}
          onDone={() => {
            setShowCsvImportGlobal(false);
            qc.invalidateQueries({ queryKey: ['quizzes-list'] });
            qc.invalidateQueries({ queryKey: ['quiz-dashboard'] });
            setTab('quizzes');
          }}
        />
      )}

      <div className="flex flex-wrap gap-1 p-1 bg-gray-100 rounded-xl w-fit">
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
      {tab === 'quizzes' && <QuizzesTab courses={courses} canEdit={canEdit} canDelete={canDelete} qc={qc} />}
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
    { label: 'Total Quizzes', value: data?.totalQuizzes, color: 'cyan', icon: ListChecks },
    { label: 'Released', value: data?.releasedQuizzes, color: 'emerald', icon: Unlock },
    { label: 'Draft', value: Math.max(0, (data?.totalQuizzes ?? 0) - (data?.releasedQuizzes ?? 0)), color: 'amber', icon: Lock },
    { label: 'Attempts', value: data?.totalAttempts, color: 'purple', icon: Award },
  ];

  const colorMap: Record<string, string> = {
    purple: 'bg-purple-50 text-purple-600 border-purple-100',
    cyan: 'bg-cyan-50 text-cyan-600 border-cyan-100',
    emerald: 'bg-emerald-50 text-emerald-600 border-emerald-100',
    amber: 'bg-amber-50 text-amber-600 border-amber-100',
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {isLoading
          ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)
          : cards.map((c) => (
              <div key={c.label} className={`rounded-2xl border p-4 shadow-sm ${colorMap[c.color]}`}>
                <c.icon className="w-5 h-5 mb-2 opacity-70" />
                <p className="text-2xl font-bold text-gray-900 mt-1">{c.value ?? 0}</p>
                <p className="text-xs text-gray-500 mt-0.5">{c.label}</p>
              </div>
            ))}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
        <h3 className="font-semibold text-gray-900 mb-3">Release flow</h3>
        <div className="flex items-center gap-2 text-sm flex-wrap">
          <span className="px-3 py-1.5 bg-gray-100 rounded-full text-gray-600 font-medium">1. Course → Session upload</span>
          <ChevronRight className="w-4 h-4 text-gray-400" />
          <span className="px-3 py-1.5 bg-blue-100 rounded-full text-blue-700 font-medium">2. Batch gets the course</span>
          <ChevronRight className="w-4 h-4 text-gray-400" />
          <span className="px-3 py-1.5 bg-emerald-100 rounded-full text-emerald-700 font-medium">3. Mark session Done → students see it</span>
        </div>
      </div>
    </div>
  );
}

/* Quizzes — Course → Session → Manage ──────────────────────────── */

function QuizzesTab({
  courses,
  canEdit,
  canDelete,
  qc,
}: {
  courses: Course[];
  canEdit: boolean;
  canDelete: boolean;
  qc: ReturnType<typeof useQueryClient>;
}) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [selectedModuleId, setSelectedModuleId] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [showCsvImport, setShowCsvImport] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [editQuiz, setEditQuiz] = useState<Quiz | null>(null);

  const selectedCourse = courses.find((c) => c.id === selectedCourseId);

  const { data: modules = [], isLoading: modulesLoading } = useQuery({
    queryKey: ['course-modules-quiz-builder', selectedCourseId],
    queryFn: () => fetchModules(selectedCourseId),
    enabled: !!selectedCourseId && step >= 2,
  });
  const selectedModule = modules.find((m) => m.id === selectedModuleId);

  const { data: courseQuizzes = [] } = useQuery({
    queryKey: ['quizzes-list', selectedCourseId],
    queryFn: async () => {
      const { data } = await api.get('/quizzes', { params: { courseId: selectedCourseId } });
      return data.data as Quiz[];
    },
    enabled: !!selectedCourseId && step >= 2,
  });

  const quizByModule = useMemo(() => {
    const map = new Map<string, Quiz>();
    for (const q of courseQuizzes) if (q.moduleId) map.set(q.moduleId, q);
    return map;
  }, [courseQuizzes]);

  const { data: quizzes = [], isLoading } = useQuery({
    queryKey: ['quizzes-list', selectedCourseId, selectedModuleId],
    queryFn: async () => {
      const { data } = await api.get('/quizzes', {
        params: { courseId: selectedCourseId, moduleId: selectedModuleId },
      });
      return data.data as Quiz[];
    },
    enabled: !!selectedCourseId && !!selectedModuleId && step === 3,
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

  const toggleMut = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'release' | 'lock' }) =>
      api.patch(`/quizzes/${id}/${action}`),
    onSuccess: (_, { action }) => {
      toast.success(action === 'release' ? 'Quiz released — students can attempt it' : 'Quiz locked — hidden from students');
      qc.invalidateQueries({ queryKey: ['quizzes-list'] });
      qc.invalidateQueries({ queryKey: ['quiz-dashboard'] });
    },
    onError: (e: { response?: { data?: { message?: string } } }, { action }) =>
      toast.error(e.response?.data?.message ?? `Failed to ${action} quiz`),
  });

  const crumbs = [
    { step: 1 as const, label: 'Course', val: selectedCourse?.title },
    { step: 2 as const, label: 'Session', val: selectedModule ? formatSessionLabel(selectedModule) : null },
    { step: 3 as const, label: 'Quizzes', val: step === 3 ? 'Manage' : null },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-1 text-xs flex-wrap">
          {crumbs.map((c, i) => (
            <div key={c.step} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="w-3 h-3 text-gray-300" />}
              <button
                type="button"
                onClick={() => {
                  if (c.step >= step) return;
                  setStep(c.step);
                  if (c.step === 1) setSelectedModuleId('');
                }}
                disabled={c.step >= step}
                className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
                  step === c.step
                    ? 'bg-purple-600 text-white'
                    : c.step < step
                      ? 'bg-purple-50 text-purple-700 hover:bg-purple-100'
                      : 'bg-gray-100 text-gray-400 cursor-default'
                }`}
              >
                {c.step}. {c.val ? (c.val.length > 28 ? `${c.val.slice(0, 28)}…` : c.val) : c.label}
              </button>
            </div>
          ))}
        </div>
        {canEdit && step === 3 && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setShowCsvImport(true)}
              className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl hover:bg-emerald-100"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" /> Import CSV
            </button>
            {!quizzes.length && (
              <button
                type="button"
                onClick={() => setShowAdd(true)}
                className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-white bg-purple-600 rounded-xl hover:bg-purple-700"
              >
                <Plus className="w-3.5 h-3.5" /> Upload quiz
              </button>
            )}
          </div>
        )}
      </div>

      {step === 1 && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {courses.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => { setSelectedCourseId(c.id); setSelectedModuleId(''); setStep(2); }}
              className="text-left p-4 rounded-2xl border border-gray-100 bg-white shadow-sm hover:border-purple-200 hover:shadow-md transition-all"
            >
              <BookOpen className="w-5 h-5 text-purple-600 mb-2" />
              <p className="font-semibold text-gray-900">{c.title}</p>
              <p className="text-xs text-gray-400 mt-1">Select session → manage quiz</p>
            </button>
          ))}
          {!courses.length && (
            <div className="col-span-full text-center py-12 text-gray-500 text-sm">No courses yet</div>
          )}
        </div>
      )}

      {step === 2 && (
        <div className="space-y-2">
          {modulesLoading ? (
            <Skeleton className="h-40 rounded-2xl" />
          ) : (
            <>
              {modules.map((m) => {
                const quiz = quizByModule.get(m.id);
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      setSelectedModuleId(m.id);
                      if (canEdit && !quiz) {
                        setStep(3);
                        setShowAdd(true);
                        return;
                      }
                      setStep(3);
                    }}
                    className="w-full flex items-center justify-between gap-3 p-4 rounded-xl border border-gray-100 bg-white hover:border-purple-200 hover:bg-purple-50/40 transition-colors text-left"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900 truncate">{formatSessionLabel(m)}</p>
                      <p className="text-xs text-gray-500 mt-0.5 truncate">{m.title}</p>
                      {canEdit && !quiz && (
                        <p className="text-[11px] text-purple-600 mt-1">Click to upload quiz for this session</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {quiz ? (
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          quiz.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                        }`}>
                          {quiz.status === 'ACTIVE' ? 'Released' : 'Draft'}
                        </span>
                      ) : (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">No content — upload</span>
                      )}
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
            </>
          )}
        </div>
      )}

      {step === 3 && (
        <>
          <p className="text-sm text-gray-500">
            One quiz per session. Content packages to batches that include this course; students see it when the trainer marks this session Done.
          </p>

          {isLoading ? <Skeleton className="h-40" /> : (
            <div className="grid md:grid-cols-2 gap-4">
              {quizzes.map((q) => {
                const isActive = q.status === 'ACTIVE';
                const isToggling = toggleMut.isPending && (toggleMut.variables as { id?: string })?.id === q.id;
                return (
                  <div key={q.id} className={`rounded-2xl border p-5 shadow-sm transition-all hover:shadow-md group ${
                    isActive ? 'bg-gradient-to-br from-emerald-50/80 to-green-50/50 border-emerald-200' : 'bg-white border-gray-100'
                  }`}>
                    <div className="flex justify-between items-start">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-bold text-gray-900">{q.title}</h3>
                        <p className="text-xs text-gray-500 mt-0.5">{q.courseTitle}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${
                          isActive ? 'bg-emerald-100 text-emerald-700' :
                          q.status === 'DRAFT' ? 'bg-amber-100 text-amber-700' :
                          'bg-gray-100 text-gray-600'
                        }`}>
                          {isActive ? 'Released' : q.status === 'DRAFT' ? 'Draft' : 'Archived'}
                        </span>
                        {canEdit && (
                          <button
                            type="button"
                            onClick={() => setEditQuiz(q)}
                            className="p-1.5 text-purple-600 bg-purple-50 hover:bg-purple-100 rounded-lg"
                            title="Edit & map batches"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                        )}
                        {canDelete && (
                          <button
                            type="button"
                            onClick={() => confirm('Delete this quiz?') && deleteMut.mutate(q.id)}
                            className="text-red-400 hover:text-red-600 p-1"
                            title="Delete quiz"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-gray-600">
                      <span className="flex items-center gap-1"><BookOpen className="w-3 h-3" /> Pool: {q.poolSize} questions</span>
                      <span className="flex items-center gap-1"><Filter className="w-3 h-3" /> Per attempt: {q.questionsPerAttempt}</span>
                      <span className="flex items-center gap-1"><Users className="w-3 h-3" /> Batches: {q.batchIds?.length ?? q.batchCount ?? 0}</span>
                      <span className="flex items-center gap-1"><Award className="w-3 h-3" /> Pass: {q.passingScore}%</span>
                      <span className="flex items-center gap-1"><PlayCircle className="w-3 h-3" /> Max attempts: {q.maxAttempts}</span>
                      {q.timeLimitMinutes && <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {q.timeLimitMinutes} min</span>}
                    </div>

                    {canEdit && q.status !== 'ARCHIVED' && (
                      <div className="mt-3 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => toggleMut.mutate({ id: q.id, action: isActive ? 'lock' : 'release' })}
                          disabled={isToggling}
                          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold border transition-all disabled:opacity-50 ${
                            isActive
                              ? 'text-amber-700 bg-amber-50 border-amber-200 hover:bg-amber-100'
                              : 'text-emerald-700 bg-emerald-50 border-emerald-200 hover:bg-emerald-100'
                          }`}
                        >
                          {isToggling
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : isActive
                              ? <><Lock className="w-3.5 h-3.5" /> Lock Quiz</>
                              : <><Unlock className="w-3.5 h-3.5" /> Release Quiz</>
                          }
                        </button>
                        <button
                          type="button"
                          onClick={() => setPreviewId(q.id)}
                          className="flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-medium text-purple-600 bg-purple-50 border border-purple-200 hover:bg-purple-100"
                        >
                          <Eye className="w-3.5 h-3.5" /> Preview
                        </button>
                      </div>
                    )}

                    {!isActive && q.status === 'DRAFT' && (
                      <div className="mt-2 flex items-center gap-2 text-xs text-amber-600 bg-amber-50 px-3 py-1.5 rounded-lg">
                        <Lock className="w-3.5 h-3.5" />
                        Draft — packages to course batches; students see it when session is marked Done
                      </div>
                    )}
                  </div>
                );
              })}
              {!quizzes.length && (
                <div className="col-span-full text-center py-12 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
                  <ListChecks className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500 text-sm">No quiz for this session yet</p>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => setShowAdd(true)}
                      className="mt-4 inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-purple-600 rounded-xl hover:bg-purple-700"
                    >
                      <Plus className="w-4 h-4" /> Upload quiz for this session
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {showAdd && (
        <CreateQuizModal
          courseId={selectedCourseId}
          presetModuleId={selectedModuleId}
          onClose={() => setShowAdd(false)}
          onDone={() => {
            setShowAdd(false);
            qc.invalidateQueries({ queryKey: ['quizzes-list'] });
            qc.invalidateQueries({ queryKey: ['quiz-dashboard'] });
          }}
        />
      )}
      {showCsvImport && (
        <CsvImportModal
          courseId={selectedCourseId}
          presetModuleId={selectedModuleId}
          onClose={() => setShowCsvImport(false)}
          onDone={() => {
            setShowCsvImport(false);
            qc.invalidateQueries({ queryKey: ['quizzes-list'] });
            qc.invalidateQueries({ queryKey: ['quiz-dashboard'] });
            qc.invalidateQueries({ queryKey: ['quiz-questions'] });
          }}
        />
      )}

      {previewId && preview && (
        <QuizPreviewModal preview={preview} onClose={() => setPreviewId(null)} />
      )}

      {editQuiz && (
        <EditQuizModal
          quiz={editQuiz}
          onClose={() => setEditQuiz(null)}
          onDone={() => {
            setEditQuiz(null);
            qc.invalidateQueries({ queryKey: ['quizzes-list'] });
          }}
        />
      )}
    </div>
  );
}

function EditQuizModal({
  quiz,
  onClose,
  onDone,
}: {
  quiz: Quiz;
  onClose: () => void;
  onDone: () => void;
}) {
  const [title, setTitle] = useState(quiz.title);
  const [passingScore, setPassingScore] = useState(quiz.passingScore);
  const [maxAttempts, setMaxAttempts] = useState(quiz.maxAttempts);
  const [questionsPerAttempt, setQuestionsPerAttempt] = useState(quiz.questionsPerAttempt);
  const [timeLimitMinutes, setTimeLimitMinutes] = useState<number | ''>(quiz.timeLimitMinutes ?? '');
  const [batchIds, setBatchIds] = useState<string[]>(quiz.batchIds ?? []);
  const [loading, setLoading] = useState(false);

  const { data: batches = [] } = useQuery({
    queryKey: ['batches-quiz-edit', quiz.courseId],
    queryFn: () => fetchBatches(quiz.courseId),
    enabled: !!quiz.courseId,
  });

  async function submit() {
    if (!title.trim()) { toast.error('Title is required'); return; }
    setLoading(true);
    try {
      await api.put(`/quizzes/${quiz.id}`, {
        title: title.trim(),
        passingScore,
        maxAttempts,
        questionsPerAttempt,
        timeLimitMinutes: timeLimitMinutes === '' ? null : timeLimitMinutes,
        batchIds,
      });
      toast.success('Quiz updated — batch mapping saved (status unchanged)');
      onDone();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message ?? 'Failed to update quiz');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b sticky top-0 bg-white">
          <h2 className="font-bold text-gray-900">Edit quiz</h2>
          <button type="button" onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5 text-gray-500" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className={LABEL_CLS}>Title *</label>
            <input className={INPUT_CLS} value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL_CLS}>Questions / attempt</label>
              <NumericInput className={INPUT_CLS} value={questionsPerAttempt} onChange={setQuestionsPerAttempt} min={1} />
            </div>
            <div>
              <label className={LABEL_CLS}>Passing score %</label>
              <NumericInput className={INPUT_CLS} value={passingScore} onChange={setPassingScore} min={0} max={100} />
            </div>
            <div>
              <label className={LABEL_CLS}>Max attempts</label>
              <NumericInput className={INPUT_CLS} value={maxAttempts} onChange={setMaxAttempts} min={1} />
            </div>
            <div>
              <label className={LABEL_CLS}>Time limit (min)</label>
              <input
                type="number"
                min={1}
                className={INPUT_CLS}
                placeholder="No limit"
                value={timeLimitMinutes}
                onChange={(e) => setTimeLimitMinutes(e.target.value === '' ? '' : +e.target.value)}
              />
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
                    batchIds.includes(b.id) ? 'bg-purple-50 border-purple-200 text-purple-800' : 'bg-gray-50 border-gray-200 text-gray-600'
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
              {!batches.length && <p className="text-xs text-gray-400">No batches linked to this course yet</p>}
            </div>
          </div>

          <button
            type="button"
            onClick={submit}
            disabled={loading}
            className="w-full py-2.5 bg-purple-600 text-white rounded-xl font-semibold disabled:opacity-50 hover:bg-purple-700 flex items-center justify-center gap-2"
          >
            {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : 'Save changes'}
          </button>
        </div>
      </div>
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

function CsvImportModal({
  courseId,
  presetModuleId,
  onClose,
  onDone,
}: {
  courseId: string;
  presetModuleId?: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile]         = useState<File | null>(null);
  const [loading, setLoading]   = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [selectedSection, setSelectedSection] = useState('');
  const lockedToSession = !!(courseId && presetModuleId);
  const [form, setForm] = useState({
    courseId: courseId || '',
    moduleId: presetModuleId || '',
    title: '', questionsPerAttempt: 10 as number | string, passingScore: 60,
    timeLimitMinutes: '' as string | number,
    maxAttempts: 3 as number | string, status: 'DRAFT' as 'DRAFT' | 'ACTIVE',
  });

  const { data: courses = [] } = useQuery({ queryKey: ['c-z'], queryFn: fetchCourses });
  const cid = form.courseId || courses[0]?.id || '';
  const { data: modules = [] } = useQuery({
    queryKey: ['mod-z', cid],
    queryFn: async () => {
      const { data } = await api.get(`/courses/${cid}/modules`);
      return data.data as CourseModule[];
    },
    enabled: !!cid,
  });

  useEffect(() => {
    if (courseId) setForm((f) => ({ ...f, courseId }));
    if (presetModuleId) setForm((f) => ({ ...f, moduleId: presetModuleId }));
  }, [courseId, presetModuleId]);

  useEffect(() => {
    if (!presetModuleId || !modules.length) return;
    const mod = modules.find((m) => m.id === presetModuleId);
    if (mod?.section) setSelectedSection(mod.section);
  }, [presetModuleId, modules]);

  const selectedCourse = courses.find((c) => c.id === form.courseId);
  const selectedModule = modules.find((m) => m.id === form.moduleId);

  const csvSections = useMemo(
    () => [...new Set((modules as any[]).map((m) => m.section).filter(Boolean))] as string[],
    [modules],
  );
  const csvModulesBySection = useMemo(
    () => selectedSection ? modules.filter((m) => (m as any).section === selectedSection) : modules,
    [modules, selectedSection],
  );

  function handleFile(f: File) {
    const lower = f.name.toLowerCase();
    if (!lower.endsWith('.csv') && !lower.endsWith('.xlsx') && !lower.endsWith('.xls')) {
      toast.error('Please upload a .csv, .xlsx, or .xls file');
      return;
    }
    setFile(f);
    if (!form.title) {
      const base = f.name.replace(/\.(csv|xlsx|xls)$/i, '');
      setForm(prev => ({ ...prev, title: base + ' Quiz' }));
    }
  }

  async function submit() {
    if (!form.courseId) { toast.error('Please select a course'); return; }
    if (!file) { toast.error('Please select a CSV file'); return; }
    if (!form.moduleId) { toast.error('Please select a module'); return; }
    if (!form.title) { toast.error('Please enter a quiz title'); return; }
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('courseId', form.courseId);
      fd.append('moduleId', form.moduleId);
      fd.append('title', form.title);
      fd.append('questionsPerAttempt', String(form.questionsPerAttempt));
      fd.append('passingScore', String(form.passingScore));
      fd.append('maxAttempts', String(form.maxAttempts));
      fd.append('status', form.status);
      if (form.timeLimitMinutes) fd.append('timeLimitMinutes', String(form.timeLimitMinutes));
      const { data } = await api.post('/quizzes/csv-import', fd);
      const importedCount = data?.data?.questionsImported ?? 0;
      const quizTitle = data?.data?.quiz?.title ?? data?.data?.title ?? form.title;
      toast.success(`Imported ${importedCount} questions into "${quizTitle}" as Draft — packages to batches with this course; releases on session Done`);
      onDone();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } }; message?: string };
      console.error('CSV import error:', err?.response?.data ?? e);
      toast.error(err?.response?.data?.message ?? err?.message ?? 'CSV import failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal title="Import Quiz from CSV / Excel" onClose={onClose} wide>
      <div className="space-y-4">
        {lockedToSession && (
          <div className="rounded-xl border border-purple-100 bg-purple-50 px-4 py-3 text-sm text-purple-800">
            <p className="font-semibold">Uploading for selected session</p>
            <p className="text-xs mt-0.5">
              {selectedCourse?.title ?? 'Course'}
              {selectedModule ? ` · ${formatSessionLabel(selectedModule)}` : ''}
            </p>
            <p className="text-[11px] text-purple-700/80 mt-1">
              Add CSV + title. Batches that include this course get the quiz automatically; students see it when the session is marked Done.
            </p>
          </div>
        )}

        {/* CSV/Excel format hint */}
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
          <p className="text-xs font-semibold text-emerald-800 mb-1 flex items-center gap-1.5">
            <FileSpreadsheet className="w-3.5 h-3.5" /> Expected Format (CSV or Excel)
          </p>
          <code className="text-xs text-emerald-700 font-mono block leading-relaxed">
            question, optionA, optionB, optionC, optionD, correct_answer, points<br />
            What is React?, A library, A framework, A database, A language, A, 2<br />
            What is JSX?, HTML in JS, CSS syntax, DB query, Config file, A, 1
          </code>
          <p className="text-xs text-emerald-600 mt-1.5">correct_answer: A/B/C/D (auto-mapped to option text) · points optional (default: 1)</p>
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
          <input ref={fileRef} type="file" accept=".csv, .xlsx, .xls" className="hidden"
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
              <p className="text-sm font-medium text-gray-600">Drop CSV or Excel file here or click to browse</p>
              <p className="text-xs text-gray-400">.csv, .xlsx, .xls only · max 25 MB</p>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          {/* Course picker */}
          <div className="col-span-2">
            <label className="text-xs font-semibold text-gray-600 mb-1 block">Course *</label>
            <select className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl bg-white"
              value={form.courseId}
              disabled={lockedToSession}
              onChange={(e) => { setForm({ ...form, courseId: e.target.value, moduleId: '' }); setSelectedSection(''); }}>
              <option value="">Select course</option>
              {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select>
          </div>

          {/* Section picker */}
          {form.courseId && csvSections.length > 0 && !lockedToSession && (
            <div className="col-span-2">
              <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Section *</label>
              <div className="flex flex-wrap gap-2">
                {csvSections.map((sec) => (
                  <button
                    key={sec}
                    type="button"
                    onClick={() => { setSelectedSection(prev => prev === sec ? '' : sec); setForm(f => ({ ...f, moduleId: '' })); }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                      selectedSection === sec
                        ? 'bg-emerald-600 text-white border-transparent shadow-sm'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-emerald-300 hover:bg-emerald-50'
                    }`}
                  >
                    {sec}
                  </button>
                ))}
              </div>
              {!selectedSection && (
                <p className="text-xs text-amber-600 mt-1.5 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" /> Select a section to see its sessions
                </p>
              )}
            </div>
          )}

          {/* Module picker */}
          <div className="col-span-2">
            <label className="text-xs font-semibold text-gray-600 mb-1 block">Session / Module *</label>
            <select className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl bg-white"
              value={form.moduleId} onChange={(e) => setForm({ ...form, moduleId: e.target.value })}
              disabled={lockedToSession || !form.courseId || (csvSections.length > 0 && !selectedSection && !lockedToSession)}>
              <option value="">
                {!form.courseId ? 'Select a course first' :
                 csvSections.length > 0 && !selectedSection && !lockedToSession ? 'Select a section first' : 'Select session'}
              </option>
              {csvModulesBySection.map((m) => (
                <option key={m.id} value={m.id}>
                  {formatSessionLabel(m)} — {m.title}{m.quizId ? ' (has quiz — will be replaced)' : ''}
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
              value={form.questionsPerAttempt} onChange={(e) => setForm({ ...form, questionsPerAttempt: e.target.value })} />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-600 mb-1 block">Passing score %</label>
            <input type="number" min={0} max={100} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl"
              value={form.passingScore} onChange={(e) => setForm({ ...form, passingScore: +e.target.value })} />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-600 mb-1 block">Max attempts</label>
            <input type="number" min={1} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl"
              value={form.maxAttempts} onChange={(e) => setForm({ ...form, maxAttempts: e.target.value })} />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-600 mb-1 block">Time limit (min, optional)</label>
            <input type="number" min={1} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl"
              placeholder="No limit" value={form.timeLimitMinutes}
              onChange={(e) => setForm({ ...form, timeLimitMinutes: e.target.value })} />
          </div>
          <div className="col-span-2">
            <p className="text-xs text-purple-700 bg-purple-50 border border-purple-100 rounded-xl px-3 py-2">
              Saved as <strong>Draft</strong> — packages onto batches that include this course; students see it when the session is marked Done.
            </p>
          </div>
        </div>

        <div className="bg-purple-50 border border-purple-100 rounded-xl p-3 text-xs text-purple-700 flex items-start gap-2">
          <Shuffle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>All imported quizzes use <strong>randomized questions + shuffled options</strong> per student. Each learner gets a unique draw from the question pool.</span>
        </div>

        <button onClick={submit} disabled={loading || !file || !form.courseId || !form.moduleId || !form.title}
          className="w-full py-2.5 bg-emerald-600 text-white rounded-xl font-semibold disabled:opacity-50 hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2">
          {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Importing...</> : <><FileSpreadsheet className="w-4 h-4" /> Import Questions & Create Quiz</>}
        </button>
      </div>
    </Modal>
  );
}

function CreateQuizModal({
  courseId,
  presetModuleId,
  onClose,
  onDone,
}: {
  courseId: string;
  presetModuleId?: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const lockedToSession = !!(courseId && presetModuleId);
  const [mode, setMode] = useState<'manual' | 'csv' | 'bulk'>('csv');
  const fileRef = useRef<HTMLInputElement>(null);
  const bulkRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [bulkFiles, setBulkFiles] = useState<{ file: File; moduleId: string; title: string }[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [hasAvailability, setHasAvailability] = useState(false);

  const [form, setForm] = useState({
    courseId, moduleId: presetModuleId || '', title: '', description: '', questionsPerAttempt: 5 as number | string, passingScore: 60,
    timeLimitMinutes: '' as string | number,
    randomizeQuestions: true, randomizeOptions: true, maxAttempts: 2 as number | string,
    status: 'DRAFT' as 'DRAFT' | 'ACTIVE',
    startDate: '', endDate: '',
  });
  const [loading, setLoading] = useState(false);
  const [selectedSection, setSelectedSection] = useState('');
  const { data: courses = [] } = useQuery({ queryKey: ['c-z'], queryFn: fetchCourses });
  const cid = form.courseId;
  const { data: modules = [] } = useQuery({
    queryKey: ['mod-z', cid],
    queryFn: async () => {
      const { data } = await api.get(`/courses/${cid}/modules`);
      return data.data as CourseModule[];
    },
    enabled: !!cid,
  });

  useEffect(() => {
    if (courseId) setForm((f) => ({ ...f, courseId }));
    if (presetModuleId) setForm((f) => ({ ...f, moduleId: presetModuleId }));
  }, [courseId, presetModuleId]);

  useEffect(() => {
    if (!presetModuleId || !modules.length) return;
    const mod = modules.find((m) => m.id === presetModuleId);
    if (mod?.section) setSelectedSection(mod.section);
  }, [presetModuleId, modules]);

  useEffect(() => {
    if (lockedToSession && mode === 'bulk') setMode('csv');
  }, [lockedToSession, mode]);

  const selectedCourse = courses.find((c) => c.id === form.courseId);
  const selectedModule = modules.find((m) => m.id === form.moduleId);

  const sections = useMemo(
    () => [...new Set((modules as any[]).map((m) => m.section).filter(Boolean))] as string[],
    [modules],
  );
  const modulesBySection = useMemo(
    () => selectedSection ? modules.filter((m) => (m as any).section === selectedSection) : modules,
    [modules, selectedSection],
  );

  function handleFile(f: File) {
    if (!f.name.endsWith('.csv') && !f.name.endsWith('.xlsx') && !f.name.endsWith('.xls')) { 
      toast.error('Please upload a .csv, .xlsx, or .xls file'); 
      return; 
    }
    setFile(f);
    if (!form.title) {
      const baseName = f.name.replace(/\.(csv|xlsx|xls)$/i, '');
      setForm(prev => ({ ...prev, title: baseName + ' Quiz' }));
    }
  }

  function addBulkFiles(list: FileList | null) {
    if (!list) return;
    const next = [...bulkFiles];
    for (const f of Array.from(list)) {
      if (!/\.(csv|xlsx|xls)$/i.test(f.name)) {
        toast.error(`${f.name}: CSV/Excel only`);
        continue;
      }
      const base = f.name.replace(/\.(csv|xlsx|xls)$/i, '');
      next.push({ file: f, moduleId: '', title: `${base} Quiz` });
    }
    setBulkFiles(next);
  }

  async function submit() {
    if (!form.courseId && !cid) { toast.error('Please select a course'); return; }
    const courseIdResolved = form.courseId || cid;

    if (mode === 'bulk') {
      if (!bulkFiles.length) { toast.error('Add at least one quiz file'); return; }
      if (bulkFiles.some((r) => !r.moduleId)) { toast.error('Map every file to a session'); return; }
      setLoading(true);
      let ok = 0;
      try {
        for (const row of bulkFiles) {
          const fd = new FormData();
          fd.append('file', row.file);
          fd.append('courseId', courseIdResolved);
          fd.append('moduleId', row.moduleId);
          fd.append('title', row.title.trim() || row.file.name);
          fd.append('questionsPerAttempt', String(form.questionsPerAttempt));
          fd.append('passingScore', String(form.passingScore));
          fd.append('maxAttempts', String(form.maxAttempts));
          fd.append('status', 'DRAFT');
          if (form.timeLimitMinutes) fd.append('timeLimitMinutes', String(form.timeLimitMinutes));
          if (hasAvailability && form.startDate) fd.append('availableFrom', new Date(form.startDate).toISOString());
          if (hasAvailability && form.endDate) fd.append('availableUntil', new Date(form.endDate).toISOString());
          await api.post('/quizzes/csv-import', fd);
          ok += 1;
        }
        toast.success(`${ok} quiz${ok > 1 ? 'zes' : ''} imported as Draft — packages to course batches; releases on session Done`);
        onDone();
      } catch (e: unknown) {
        const err = e as { response?: { data?: { message?: string; error?: string } } };
        toast.error(err?.response?.data?.message ?? err?.response?.data?.error ?? (ok ? `Imported ${ok}, then failed` : 'Bulk import failed'));
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!form.moduleId) { toast.error('Please select a module'); return; }
    if (!form.title.trim()) { toast.error('Please enter a title'); return; }

    setLoading(true);
    try {
      if (mode === 'csv') {
        if (!file) { toast.error('Please select a CSV file'); setLoading(false); return; }
        const fd = new FormData();
        fd.append('file', file);
        fd.append('courseId', courseIdResolved);
        fd.append('moduleId', form.moduleId);
        fd.append('title', form.title.trim());
        fd.append('questionsPerAttempt', String(form.questionsPerAttempt));
        fd.append('passingScore', String(form.passingScore));
        fd.append('maxAttempts', String(form.maxAttempts));
        fd.append('status', 'DRAFT');
        if (form.timeLimitMinutes) fd.append('timeLimitMinutes', String(form.timeLimitMinutes));
        if (hasAvailability && form.startDate) fd.append('availableFrom', new Date(form.startDate).toISOString());
        if (hasAvailability && form.endDate) fd.append('availableUntil', new Date(form.endDate).toISOString());
        const { data } = await api.post('/quizzes/csv-import', fd);
        const importedCount = data?.data?.questionsImported ?? 0;
        const quizTitle = data?.data?.quiz?.title ?? data?.data?.title ?? form.title;
        toast.success(`Imported ${importedCount} questions into "${quizTitle}" as Draft — packages to batches with this course; releases on session Done`);
      } else {
        const payload: Record<string, unknown> = {
          courseId: courseIdResolved,
          moduleId: form.moduleId,
          title: form.title.trim(),
          questionsPerAttempt: Math.max(1, Number(form.questionsPerAttempt) || 1),
          passingScore: form.passingScore,
          randomizeQuestions: form.randomizeQuestions,
          randomizeOptions: form.randomizeOptions,
          maxAttempts: Math.max(1, Number(form.maxAttempts) || 1),
          status: 'DRAFT',
        };
        if (form.description.trim()) payload.description = form.description.trim();
        if (form.timeLimitMinutes && Number(form.timeLimitMinutes) > 0) {
          payload.timeLimitMinutes = Number(form.timeLimitMinutes);
        }
        if (hasAvailability && form.startDate) payload.availableFrom = new Date(form.startDate).toISOString();
        if (hasAvailability && form.endDate) payload.availableUntil = new Date(form.endDate).toISOString();
        await api.post('/quizzes', payload);
        toast.success('Quiz created as Draft — packages to batches with this course; releases on session Done');
      }
      onDone();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string; error?: string } } };
      const msg = err?.response?.data?.message ?? err?.response?.data?.error ?? 'Failed to create quiz';
      console.error('Create quiz error:', err?.response?.data ?? e);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  const availableModules = mode === 'manual' ? modulesBySection.filter((m) => !m.quizId) : modulesBySection;

  return (
    <Modal title="Create Quiz" onClose={onClose} wide>
      <div className="space-y-4">
        {lockedToSession && (
          <div className="rounded-xl border border-purple-100 bg-purple-50 px-4 py-3 text-sm text-purple-800">
            <p className="font-semibold">Uploading for selected session</p>
            <p className="text-xs mt-0.5">
              {selectedCourse?.title ?? 'Course'}
              {selectedModule ? ` · ${formatSessionLabel(selectedModule)}` : ''}
            </p>
            <p className="text-[11px] text-purple-700/80 mt-1">
              Add title + CSV (or create manually). Batches that include this course get the quiz automatically; students see it when the session is marked Done.
            </p>
          </div>
        )}

        {/* Mode toggle */}
        <div className="flex gap-1 p-1 bg-gray-100 rounded-xl flex-wrap">
          <button
            type="button"
            onClick={() => setMode('manual')}
            className={`flex-1 min-w-[100px] flex items-center justify-center gap-2 py-2 text-sm font-medium rounded-lg transition-all ${
              mode === 'manual' ? 'bg-white text-purple-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Plus className="w-4 h-4" /> Manual
          </button>
          <button
            type="button"
            onClick={() => setMode('csv')}
            className={`flex-1 min-w-[100px] flex items-center justify-center gap-2 py-2 text-sm font-medium rounded-lg transition-all ${
              mode === 'csv' ? 'bg-white text-emerald-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4" /> Single CSV
          </button>
          {!lockedToSession && (
            <button
              type="button"
              onClick={() => setMode('bulk')}
              className={`flex-1 min-w-[100px] flex items-center justify-center gap-2 py-2 text-sm font-medium rounded-lg transition-all ${
                mode === 'bulk' ? 'bg-white text-teal-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <Upload className="w-4 h-4" /> Bulk upload
            </button>
          )}
        </div>

        {mode === 'bulk' && (
          <div className="space-y-3">
            <div className="bg-teal-50 border border-teal-200 rounded-xl p-3 text-xs text-teal-800">
              Upload all quiz files at once. Map each to its session — release manually or auto-activate on session Done.
            </div>
            <div>
              <label className={LABEL_CLS}>Course *</label>
              <select className={INPUT_CLS} value={form.courseId}
                onChange={(e) => { setForm({ ...form, courseId: e.target.value, moduleId: '' }); setBulkFiles([]); }}>
                <option value="">Select course</option>
                {courses.map((c: any) => <option key={c.id} value={c.id}>{c.title}</option>)}
              </select>
            </div>
            <input ref={bulkRef} type="file" accept=".csv,.xlsx,.xls" multiple className="hidden"
              onChange={(e) => { addBulkFiles(e.target.files); e.target.value = ''; }} />
            <button type="button" onClick={() => bulkRef.current?.click()} disabled={!form.courseId}
              className="w-full py-3 border-2 border-dashed border-teal-300 rounded-xl text-sm text-teal-700 hover:bg-teal-50 font-medium flex items-center justify-center gap-2 disabled:opacity-50">
              <Upload className="w-4 h-4" /> Add CSV / Excel files
            </button>
            {bulkFiles.length > 0 && (
              <ul className="space-y-2 max-h-56 overflow-y-auto">
                {bulkFiles.map((row, i) => (
                  <li key={`${row.file.name}-${i}`} className="bg-gray-50 border border-gray-200 rounded-xl p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold text-gray-800 truncate">{row.file.name}</p>
                      <button type="button" onClick={() => setBulkFiles((p) => p.filter((_, j) => j !== i))}
                        className="text-red-400 hover:text-red-600"><X className="w-3.5 h-3.5" /></button>
                    </div>
                    <input className={INPUT_CLS} value={row.title}
                      onChange={(e) => setBulkFiles((p) => p.map((r, j) => j === i ? { ...r, title: e.target.value } : r))}
                      placeholder="Quiz title" />
                    <select className={INPUT_CLS} value={row.moduleId}
                      onChange={(e) => setBulkFiles((p) => p.map((r, j) => j === i ? { ...r, moduleId: e.target.value } : r))}>
                      <option value="">Select session *</option>
                      {modules.map((m) => (
                        <option key={m.id} value={m.id}>
                          {(m as any).sessionNumber ? `S${(m as any).sessionNumber}: ` : ''}{m.title}
                          {m.quizId ? ' — has quiz (will replace)' : ''}
                        </option>
                      ))}
                    </select>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* CSV format hint + file picker (only in CSV mode) */}
        {mode === 'csv' && (
          <>
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
              <p className="text-xs font-semibold text-emerald-800 mb-1 flex items-center gap-1.5">
                <FileSpreadsheet className="w-3.5 h-3.5" /> Expected Format (CSV or Excel)
              </p>
              <code className="text-xs text-emerald-700 font-mono block leading-relaxed">
                question, optionA, optionB, optionC, optionD, correct_answer, points<br />
                What is React?, A library, A framework, A database, A language, A, 2
              </code>
              <p className="text-xs text-emerald-600 mt-1.5">
                correct_answer must be A, B, C, or D · points column is optional (default: 1)
              </p>
            </div>

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
          </>
        )}

        {/* Common fields (single create / CSV) */}
        {mode !== 'bulk' && (
        <>
        <div>
          <label className={LABEL_CLS}>Course *</label>
          <select className={INPUT_CLS} value={form.courseId || cid || ''}
            disabled={lockedToSession}
            onChange={(e) => { setForm({ ...form, courseId: e.target.value, moduleId: '' }); setSelectedSection(''); }}>
            <option value="">Select a course</option>
            {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
        </div>

        {/* Section picker — only shows once a course is selected and sections exist */}
        {cid && sections.length > 0 && !lockedToSession && (
          <div>
            <label className={LABEL_CLS}>Section *</label>
            <div className="flex flex-wrap gap-2 mt-1">
              {sections.map((sec) => (
                <button
                  key={sec}
                  type="button"
                  onClick={() => { setSelectedSection(prev => prev === sec ? '' : sec); setForm(f => ({ ...f, moduleId: '' })); }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                    selectedSection === sec
                      ? 'bg-purple-600 text-white border-transparent shadow-sm'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-purple-300 hover:bg-purple-50'
                  }`}
                >
                  {sec}
                </button>
              ))}
            </div>
            {!selectedSection && (
              <p className="text-xs text-amber-600 mt-1.5 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" /> Select a section to see its sessions
              </p>
            )}
          </div>
        )}

        <div>
          <label className={LABEL_CLS}>Quiz title *</label>
          <input className={INPUT_CLS} placeholder="e.g. Module 1 Assessment" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </div>

        <div>
          <label className={LABEL_CLS}>Session / Module (one quiz per session) *</label>
          <select className={INPUT_CLS} value={form.moduleId} onChange={(e) => setForm({ ...form, moduleId: e.target.value })}
            disabled={lockedToSession || !cid || (sections.length > 0 && !selectedSection && !lockedToSession) || (!lockedToSession && availableModules.length === 0)}>
            <option value="">
              {!cid ? 'Select a course first' :
               sections.length > 0 && !selectedSection && !lockedToSession ? 'Select a section first' :
               modules.length === 0 ? 'No modules yet — upload a syllabus' :
               availableModules.length === 0 ? 'All modules already have quizzes' :
               'Select a session'}
            </option>
            {(lockedToSession ? modules.filter((m) => m.id === form.moduleId) : availableModules).map((m) => (
              <option key={m.id} value={m.id}>
                {formatSessionLabel(m)} — {m.title}{mode === 'csv' && m.quizId ? ' — has quiz, will be replaced' : ''}
              </option>
            ))}
          </select>
          <p className="text-xs text-purple-600 mt-1">Saved as Draft — packages to course batches; releases when session is marked Done.</p>
          {cid && modules.length === 0 && (
            <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" /> This course has no modules. Go to Curriculum Master → Manage → Syllabus tab to upload one.
            </p>
          )}
          {cid && mode === 'manual' && modules.length > 0 && selectedSection && availableModules.length === 0 && !lockedToSession && (
            <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" /> All sessions in this section already have quizzes. Switch to CSV mode to replace one.
            </p>
          )}
        </div>
        </>
        )}

        {mode === 'manual' && (
          <div>
            <label className={LABEL_CLS}>Description</label>
            <textarea className={INPUT_CLS} rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Optional quiz description" />
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={LABEL_CLS}>Questions per attempt</label>
            <input type="number" className={INPUT_CLS} min={1} value={form.questionsPerAttempt}
              onChange={(e) => setForm({ ...form, questionsPerAttempt: e.target.value })} />
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
              onChange={(e) => setForm({ ...form, maxAttempts: e.target.value })} />
          </div>
          <div>
            <label className={LABEL_CLS}>Time limit (minutes, optional)</label>
            <input type="number" className={INPUT_CLS} min={1} value={form.timeLimitMinutes} placeholder="No limit"
              onChange={(e) => setForm({ ...form, timeLimitMinutes: e.target.value })} />
          </div>
        </div>

        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2 cursor-pointer">
            <input type="checkbox" checked={hasAvailability}
              onChange={(e) => {
                setHasAvailability(e.target.checked);
                if (!e.target.checked) setForm((f) => ({ ...f, startDate: '', endDate: '' }));
              }}
              className="rounded border-purple-300 text-purple-600 focus:ring-purple-500" />
            Set availability window (optional)
          </label>
          {hasAvailability && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={LABEL_CLS}>Available from</label>
                <input type="datetime-local" className={INPUT_CLS} value={form.startDate}
                  onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
              </div>
              <div>
                <label className={LABEL_CLS}>Available until</label>
                <input type="datetime-local" className={INPUT_CLS} value={form.endDate}
                  onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
              </div>
            </div>
          )}
        </div>

        <div className="bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 text-xs text-amber-800">
          Defaults to <strong>Draft</strong> — packages onto batches that include this course; students see it when the trainer marks the session Done.
        </div>

        {mode === 'manual' && (
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
        )}

        <button onClick={submit} disabled={loading || (mode === 'bulk'
          ? (!form.courseId || !bulkFiles.length)
          : (!form.moduleId || !form.title || (mode === 'csv' && !file)))}
          className={`w-full py-2.5 text-white rounded-xl font-semibold disabled:opacity-50 transition-colors flex items-center justify-center gap-2 ${
            mode === 'bulk' ? 'bg-teal-600 hover:bg-teal-700' : mode === 'csv' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-purple-600 hover:bg-purple-700'
          }`}>
          {loading
            ? <><Loader2 className="w-4 h-4 animate-spin" /> {mode === 'manual' ? 'Creating…' : 'Importing…'}</>
            : mode === 'bulk'
              ? <><Upload className="w-4 h-4" /> Import {bulkFiles.length || ''} Quizzes</>
              : mode === 'csv'
                ? <><FileSpreadsheet className="w-4 h-4" /> Import & Create Quiz</>
                : <><Plus className="w-4 h-4" /> Create Quiz</>
          }
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
