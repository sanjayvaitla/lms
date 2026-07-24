import { useState, useEffect, useRef, startTransition } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Editor from '@monaco-editor/react';
import { toast } from 'sonner';
import {
  Code2, ChevronLeft, Clock, Award, Play, Send, Loader2, Eye,
  RotateCcw, BookOpen, Terminal, CheckCircle2, XCircle,
  Zap, Target, AlertCircle, History,
} from 'lucide-react';
import api from '../../../lib/axios';
import { refreshStudentActivity } from '../../../lib/lmsCache';
import { useAuth } from '../../../store/AuthContext';
import { Skeleton } from '../../components/ui/skeleton';
import { EmptyState } from '../../components/ui/EmptyState';

interface Assignment {
  id: string; problem_id: string; problem_title: string; description: string;
  difficulty: string; language: string; points: number; starter_code: string;
  batch_name: string; course_title: string; color_token: string;
  due_date?: string; max_attempts: number; time_limit_mins?: number;
  attempt_count: number; last_status?: string; best_score?: number;
}
interface Submission {
  id: string; code: string; language: string; execution_status: string;
  execution_output?: string; stderr?: string; runtime_ms?: number;
  ai_score?: number; ai_grade?: string; ai_feedback?: string;
  ai_suggestions?: string; test_cases_passed: number; test_cases_total: number;
  status: string; submitted_at: string;
}

const DIFF_COLORS: Record<string, string> = {
  EASY:   'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
  MEDIUM: 'bg-amber-500/15 text-amber-400 border-amber-500/25',
  HARD:   'bg-rose-500/15 text-rose-400 border-rose-500/25',
};
const DIFF_LIST: Record<string, string> = {
  EASY:   'bg-emerald-50 text-emerald-700 border-emerald-200',
  MEDIUM: 'bg-amber-50 text-amber-700 border-amber-200',
  HARD:   'bg-rose-50 text-rose-700 border-rose-200',
};
const EXEC_BADGE: Record<string, string> = {
  ACCEPTED:      'text-emerald-300 bg-emerald-500/15 border border-emerald-500/25',
  WRONG_ANSWER:  'text-rose-300 bg-rose-500/15 border border-rose-500/25',
  RUNTIME_ERROR: 'text-orange-300 bg-orange-500/15 border border-orange-500/25',
  COMPILE_ERROR: 'text-red-300 bg-red-500/15 border border-red-500/25',
  TIME_LIMIT:    'text-amber-300 bg-amber-500/15 border border-amber-500/25',
};
const GRADE_CLR: Record<string, string> = {
  A: 'text-emerald-400', B: 'text-sky-400', C: 'text-amber-400', D: 'text-orange-400', F: 'text-rose-400',
};
const MONACO_LANG: Record<string, string> = {
  python: 'python', javascript: 'javascript', java: 'java', cpp: 'cpp', c: 'c',
};

export default function MyCodingTestsPage() {
  const { user } = useAuth();
  const [selected, setSelected] = useState<Assignment | null>(null);

  const { data: assignments = [], isLoading, isError, refetch } = useQuery<Assignment[]>({
    queryKey: ['student-coding-assignments', user?.id],
    queryFn: async () => {
      const { data } = await api.get('/coding/student/assignments');
      return data.data ?? [];
    },
    enabled: !!user,
    staleTime: 30_000,
  });

  if (selected) {
    const currentAssignment = assignments.find((x) => x.id === selected.id) ?? selected;
    return (
      <CodingEditor
        assignment={currentAssignment}
        onBack={() => startTransition(() => setSelected(null))}
      />
    );
  }

  return (
    <div className="space-y-6 sm:space-y-7 pb-2">
      <div className="lms-enter">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 mb-1.5">Practice</p>
        <h1 className="text-2xl font-semibold text-slate-900 tracking-tight flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-white shadow-sm">
            <Code2 className="w-4.5 h-4.5 w-[18px] h-[18px]" />
          </span>
          Coding Tests
        </h1>
        <p className="text-slate-500 text-sm mt-1.5 leading-relaxed max-w-xl">
          Write code, run with your own input, then submit for AI evaluation — calm, focused, in-portal.
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
        </div>
      ) : isError ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <AlertCircle className="w-9 h-9 text-rose-400" />
          <p className="text-sm font-semibold text-slate-900">Couldn’t load coding tests</p>
          <button type="button" onClick={() => refetch()} className="lms-press px-4 py-2 text-sm font-semibold text-white bg-slate-900 rounded-xl">
            Retry
          </button>
        </div>
      ) : assignments.length === 0 ? (
        <EmptyState
          icon={Code2}
          title="No coding tests yet"
          description="Your trainer will assign problems here when they’re ready."
          hint="Assigned tests appear instantly after publish"
        />
      ) : (
        <div className="space-y-3 lms-stagger">
          {assignments.map((a) => {
            const attemptsLeft = a.max_attempts - a.attempt_count;
            const isPastDue = a.due_date ? new Date() > new Date(a.due_date) : false;
            const hasBestScore = a.best_score !== null && a.best_score !== undefined;
            const locked = attemptsLeft <= 0 || isPastDue;

            return (
              <article
                key={a.id}
                className="lms-list-item group relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm lms-card-lift"
              >
                <div className="absolute inset-y-0 left-0 w-0.5 bg-slate-900/0 group-hover:bg-slate-900/80 transition-colors duration-300 ease-out" />
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-2.5">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${DIFF_LIST[a.difficulty] ?? ''}`}>
                        {a.difficulty}
                      </span>
                      <span className="text-[10px] font-mono bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md">
                        {a.language}
                      </span>
                      <span className="text-xs text-slate-500 flex items-center gap-1">
                        <Award className="w-3 h-3" />{a.points} pts
                      </span>
                      {a.due_date && (
                        <span className="text-xs text-slate-500 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          Due {new Date(a.due_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                        </span>
                      )}
                    </div>
                    <h3 className="text-slate-900 font-semibold text-[15px] tracking-tight leading-snug">
                      {a.problem_title}
                    </h3>
                    <p className="text-slate-500 text-sm mt-1.5 line-clamp-2 leading-relaxed">{a.description}</p>
                    <div className="flex items-center gap-3 mt-3 text-xs text-slate-400">
                      <span>{a.batch_name}</span>
                      <span className="w-1 h-1 rounded-full bg-slate-300" />
                      <span className={attemptsLeft <= 0 ? 'text-rose-500' : ''}>
                        {a.attempt_count}/{a.max_attempts} attempts
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2.5 flex-shrink-0">
                    {hasBestScore && (
                      <div className="text-right">
                        <p className="text-2xl font-semibold tabular-nums text-slate-900 tracking-tight">
                          {a.best_score}
                          <span className="text-sm font-medium text-slate-400">/100</span>
                        </p>
                        <p className="text-[10px] uppercase tracking-wide text-slate-400">Best</p>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => startTransition(() => setSelected(a))}
                      className={`lms-press flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-xl transition-colors duration-300 ease-out ${
                        locked
                          ? 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          : 'bg-slate-900 hover:bg-slate-800 text-white shadow-sm'
                      }`}
                    >
                      {locked ? (
                        <><Eye className="w-4 h-4" /> View</>
                      ) : hasBestScore ? (
                        <><RotateCcw className="w-4 h-4" /> Retry</>
                      ) : (
                        <><Play className="w-4 h-4" /> Start</>
                      )}
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── Immersive coding studio ───────────────────────────────────────────────── */
function CodingEditor({ assignment: a, onBack }: { assignment: Assignment; onBack: () => void }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [code, setCode] = useState(a.starter_code || getDefaultCode(a.language));
  const [submitting, setSubmitting] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<Submission | null>(null);
  const [attemptCount, setAttemptCount] = useState(a.attempt_count);
  const [leftTab, setLeftTab] = useState<'problem' | 'run' | 'result'>('problem');
  const [customInput, setCustomInput] = useState('');
  const [runResult, setRunResult] = useState<{ stdout: string; stderr: string; time: number; status: string } | null>(null);
  const [showHistory, setShowHistory] = useState(true);
  const [editorReady, setEditorReady] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      mounted.current = false;
      document.body.style.overflow = prev;
    };
  }, []);

  const { data: history = [] } = useQuery<Submission[]>({
    queryKey: ['my-coding-submissions', user?.id, a.id],
    queryFn: async () => {
      const { data } = await api.get(`/coding/student/submissions/${a.id}`);
      return data.data ?? [];
    },
    staleTime: 20_000,
  });

  async function handleRun() {
    if (!code.trim()) { toast.error('Write some code first'); return; }
    setRunning(true);
    setLeftTab('run');
    setRunResult(null);
    try {
      const { data } = await api.post('/coding/run', { code, language: a.language, stdin: customInput });
      if (mounted.current) setRunResult(data.data);
    } catch (err: any) {
      if (mounted.current) {
        setRunResult({
          stdout: '',
          stderr: err?.response?.data?.message ?? 'Run failed',
          time: 0,
          status: 'Runtime Error',
        });
      }
    } finally {
      if (mounted.current) setRunning(false);
    }
  }

  async function handleSubmit() {
    if (!code.trim()) { toast.error('Write some code first'); return; }
    setSubmitting(true);
    try {
      const { data } = await api.post('/coding/student/submit', {
        assignment_id: a.id,
        code,
        language: a.language,
      });
      if (!mounted.current) return;
      setResult(data.data);
      setAttemptCount((c) => c + 1);
      setLeftTab('result');
      await refreshStudentActivity(qc, { kind: 'coding' });
      toast.success('Submitted — AI evaluation complete');
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? 'Submission failed';
      toast.error(msg);
      const codeErr = err?.response?.data?.code;
      if (codeErr === 'MAX_ATTEMPTS' || codeErr === 'PAST_DUE') onBack();
    } finally {
      if (mounted.current) setSubmitting(false);
    }
  }

  const attemptsLeft = a.max_attempts - attemptCount;
  const isPastDue = a.due_date ? new Date() > new Date(a.due_date) : false;

  return (
    <div className="coding-studio fixed inset-0 z-30 lg:left-64 flex flex-col bg-[#0b0f17] text-slate-200 overflow-hidden">
      {/* Top bar */}
      <header className="flex items-center justify-between gap-3 px-4 sm:px-5 h-14 border-b border-white/[0.06] bg-[#0d121c]/90 backdrop-blur-md shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onBack}
            className="lms-press flex items-center gap-1.5 text-slate-400 hover:text-white text-sm transition-colors duration-300 ease-out shrink-0"
          >
            <ChevronLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Back</span>
          </button>
          <div className="w-px h-5 bg-white/10 shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white truncate leading-tight">{a.problem_title}</p>
            <div className="flex items-center gap-2 mt-0.5">
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md border ${DIFF_COLORS[a.difficulty] ?? ''}`}>
                {a.difficulty}
              </span>
              <span className="text-[10px] font-mono text-slate-500">{a.language}</span>
              <span className={`text-[10px] ${attemptsLeft <= 1 ? 'text-rose-400' : 'text-slate-500'}`}>
                {attemptCount}/{a.max_attempts} attempts
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setShowHistory((h) => !h)}
            className={`lms-press hidden sm:flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors duration-300 ease-out ${
              showHistory
                ? 'bg-white/10 text-white border-white/15'
                : 'bg-transparent text-slate-400 border-white/10 hover:text-white hover:bg-white/5'
            }`}
          >
            <History className="w-3.5 h-3.5" /> {history.length}
          </button>
          <button
            type="button"
            onClick={handleRun}
            disabled={running || submitting}
            className="lms-press flex items-center gap-1.5 px-3.5 py-2 text-sm font-semibold text-slate-900 bg-white hover:bg-slate-100 rounded-xl disabled:opacity-45 transition-colors duration-300 ease-out"
          >
            {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            <span className="hidden sm:inline">{running ? 'Running…' : 'Run'}</span>
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || running || attemptsLeft <= 0 || isPastDue}
            className="lms-press flex items-center gap-1.5 px-3.5 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-xl disabled:opacity-45 transition-colors duration-300 ease-out shadow-lg shadow-blue-600/20"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            <span className="hidden sm:inline">{submitting ? 'Evaluating…' : 'Submit'}</span>
          </button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Left panel */}
        <aside className="w-full max-w-[420px] hidden md:flex flex-col border-r border-white/[0.06] bg-[#0d121c] overflow-hidden shrink-0">
          <div className="flex border-b border-white/[0.06] shrink-0">
            {([
              { id: 'problem' as const, label: 'Problem', icon: BookOpen },
              { id: 'run' as const, label: 'Run', icon: Terminal },
              { id: 'result' as const, label: 'Result', icon: Zap },
            ]).map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setLeftTab(id)}
                className={`relative flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-semibold transition-colors duration-300 ease-out ${
                  leftTab === id ? 'text-white' : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
                {(id === 'result' && result) || (id === 'run' && runResult) ? (
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                ) : null}
                {leftTab === id && (
                  <span className="absolute bottom-0 inset-x-4 h-0.5 rounded-full bg-blue-500" />
                )}
              </button>
            ))}
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain coding-panel-scroll flex flex-col">
            <div key={leftTab} className="coding-tab-pane p-5 space-y-4 shrink-0">
              {leftTab === 'problem' && (
                <>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md border ${DIFF_COLORS[a.difficulty] ?? ''}`}>
                      {a.difficulty}
                    </span>
                    <span className="text-xs text-slate-500 flex items-center gap-1">
                      <Award className="w-3 h-3" />{a.points} pts
                    </span>
                  </div>
                  <h2 className="text-lg font-semibold text-white tracking-tight leading-snug">{a.problem_title}</h2>
                  <p className="text-slate-400 text-sm leading-relaxed whitespace-pre-wrap">{a.description}</p>
                  <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-3.5">
                    <p className="text-[11px] font-semibold text-slate-300 mb-1.5">Workflow</p>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      1. Write in the editor → 2. <span className="text-slate-300">Run</span> with custom input →
                      3. Confirm output → 4. <span className="text-blue-400">Submit</span> for official test cases + score
                    </p>
                  </div>
                </>
              )}

              {leftTab === 'run' && (
                <>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-2 uppercase tracking-wide">
                    Custom input (stdin)
                  </label>
                  <textarea
                    value={customInput}
                    onChange={(e) => setCustomInput(e.target.value)}
                    placeholder={'3\n5'}
                    rows={5}
                    className="w-full px-3 py-2.5 text-sm font-mono bg-[#080b12] border border-white/10 rounded-xl text-slate-200 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/40 placeholder-slate-600 transition-[border-color,box-shadow] duration-300 ease-out"
                  />
                  <button
                    type="button"
                    onClick={handleRun}
                    disabled={running}
                    className="lms-press w-full flex items-center justify-center gap-2 py-2.5 text-sm font-semibold text-slate-900 bg-white hover:bg-slate-100 rounded-xl disabled:opacity-50 transition-colors duration-300 ease-out"
                  >
                    {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                    {running ? 'Running…' : 'Run with this input'}
                  </button>
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    Run only checks this custom input. Your score comes from <span className="text-slate-300">Submit</span> against the assignment test cases.
                  </p>

                  {runResult && !running && (
                    <div className="space-y-3 coding-fade">
                      <div className="flex items-center gap-2">
                        <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${
                          runResult.status === 'Accepted'
                            ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25'
                            : 'bg-orange-500/15 text-orange-300 border-orange-500/25'
                        }`}>
                          {runResult.status}
                        </span>
                        {runResult.time > 0 && (
                          <span className="text-xs text-slate-500 flex items-center gap-1">
                            <Clock className="w-3 h-3" />{runResult.time}ms
                          </span>
                        )}
                      </div>
                      {runResult.stdout && (
                        <pre className="bg-[#080b12] border border-white/10 rounded-xl p-3 text-sm text-emerald-300/90 font-mono overflow-x-auto whitespace-pre-wrap">
                          {runResult.stdout}
                        </pre>
                      )}
                      {runResult.stderr && (
                        <pre className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-3 text-xs text-rose-300 font-mono overflow-x-auto whitespace-pre-wrap">
                          {runResult.stderr}
                        </pre>
                      )}
                      {!runResult.stdout && !runResult.stderr && (
                        <p className="text-sm text-slate-500 italic">No output produced.</p>
                      )}
                    </div>
                  )}
                </>
              )}

              {leftTab === 'result' && (
                !result ? (
                  <div className="text-center py-12 text-slate-500">
                    <Zap className="w-9 h-9 mx-auto mb-3 text-slate-600" />
                    <p className="text-sm">Submit to see your AI evaluation here.</p>
                  </div>
                ) : (
                  <div className="space-y-4 coding-fade">
                    <div className="flex items-center justify-between rounded-2xl p-4 border border-white/[0.06] bg-gradient-to-br from-blue-500/10 to-transparent">
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Score</p>
                        <p className="text-3xl font-semibold tabular-nums text-white">
                          {result.ai_score ?? 0}
                          <span className="text-base text-slate-500 font-medium">/100</span>
                        </p>
                      </div>
                      {result.ai_grade && (
                        <p className={`text-5xl font-semibold ${GRADE_CLR[result.ai_grade] ?? ''}`}>
                          {result.ai_grade}
                        </p>
                      )}
                    </div>

                    <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-400 transition-[width] duration-700 ease-out"
                        style={{ width: `${result.ai_score ?? 0}%` }}
                      />
                    </div>

                    <div className={`flex items-center justify-between rounded-xl px-4 py-3 border ${
                      result.test_cases_passed === result.test_cases_total
                        ? 'bg-emerald-500/10 border-emerald-500/20'
                        : 'bg-rose-500/10 border-rose-500/20'
                    }`}>
                      <div className="flex items-center gap-2">
                        {result.test_cases_passed === result.test_cases_total
                          ? <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                          : <XCircle className="w-5 h-5 text-rose-400" />}
                        <span className="text-sm font-semibold text-white">
                          {result.test_cases_passed}/{result.test_cases_total} tests
                        </span>
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${EXEC_BADGE[result.execution_status] ?? ''}`}>
                        {result.execution_status}
                      </span>
                    </div>

                    {result.ai_feedback && (
                      <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4">
                        <p className="text-[11px] font-semibold text-amber-400/90 mb-2 flex items-center gap-1.5">
                          <Zap className="w-3.5 h-3.5" /> Feedback
                        </p>
                        <p className="text-sm text-slate-300 leading-relaxed">{result.ai_feedback}</p>
                      </div>
                    )}
                    {result.ai_suggestions && (
                      <div className="rounded-xl border border-blue-500/15 bg-blue-500/5 p-4">
                        <p className="text-[11px] font-semibold text-blue-400 mb-2 flex items-center gap-1.5">
                          <Target className="w-3.5 h-3.5" /> Improve
                        </p>
                        <p className="text-sm text-slate-300 leading-relaxed">{result.ai_suggestions}</p>
                      </div>
                    )}
                  </div>
                )
              )}
            </div>

            {/* History sits in the empty left-panel space (below tab content) */}
            {showHistory && history.length > 0 && (
              <div className="mt-auto border-t border-white/[0.06] bg-[#080b12]/80 px-4 pt-3 pb-4 shrink-0">
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">History</p>
                <div className="space-y-2 max-h-52 overflow-y-auto coding-panel-scroll pr-0.5">
                  {history.map((h, i) => (
                    <div key={h.id} className="rounded-xl p-3 border border-white/[0.06] bg-white/[0.02]">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-slate-500">Attempt {history.length - i}</span>
                        <div className="flex items-center gap-2">
                          {h.ai_grade && <span className={`font-semibold ${GRADE_CLR[h.ai_grade] ?? ''}`}>{h.ai_grade}</span>}
                          {h.ai_score != null && <span className="text-xs text-slate-500">{h.ai_score}/100</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full ${EXEC_BADGE[h.execution_status] ?? 'text-slate-500'}`}>
                          {h.execution_status}
                        </span>
                        <span className="text-[10px] text-slate-500">
                          {h.test_cases_passed}/{h.test_cases_total} tests
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </aside>

        {/* Editor */}
        <section className="flex-1 flex flex-col min-w-0 overflow-hidden bg-[#0b0f17]">
          <div className="px-4 py-2 border-b border-white/[0.06] flex items-center justify-between shrink-0 bg-[#0d121c]/80">
            <span className="text-[11px] text-slate-500 font-mono">
              solution.{getExt(a.language)}
            </span>
            <button
              type="button"
              onClick={() => setCode(a.starter_code || getDefaultCode(a.language))}
              className="lms-press flex items-center gap-1 text-[11px] text-slate-500 hover:text-white transition-colors duration-300 ease-out"
            >
              <RotateCcw className="w-3 h-3" /> Reset
            </button>
          </div>

          <div className={`flex-1 overflow-hidden relative transition-opacity duration-500 ease-out ${editorReady ? 'opacity-100' : 'opacity-0'}`}>
            {!editorReady && (
              <div className="absolute inset-0 flex items-center justify-center z-10">
                <Loader2 className="w-6 h-6 text-slate-600 animate-spin" />
              </div>
            )}
            <Editor
              height="100%"
              language={MONACO_LANG[a.language] ?? 'python'}
              value={code}
              onChange={(v) => setCode(v ?? '')}
              theme="vs-dark"
              loading={<div className="h-full bg-[#0b0f17]" />}
              onMount={() => setEditorReady(true)}
              options={{
                fontSize: 14,
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                lineNumbers: 'on',
                automaticLayout: true,
                tabSize: 4,
                fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
                fontLigatures: true,
                padding: { top: 16, bottom: 16 },
                wordWrap: 'on',
                renderLineHighlight: 'line',
                cursorBlinking: 'smooth',
                cursorSmoothCaretAnimation: 'on',
                smoothScrolling: true,
                bracketPairColorization: { enabled: true },
                suggestOnTriggerCharacters: true,
                overviewRulerLanes: 0,
                hideCursorInOverviewRuler: true,
                scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8 },
              }}
            />
          </div>

          <footer className="px-4 py-2 border-t border-white/[0.06] bg-[#0d121c] flex items-center justify-between shrink-0 text-[11px] text-slate-500">
            <div className="flex items-center gap-3">
              <span>{code.split('\n').length} lines</span>
              <span>{code.length} chars</span>
              {runResult && (
                <span className={runResult.status === 'Accepted' ? 'text-emerald-400' : 'text-slate-400'}>
                  Last run · {runResult.status}
                </span>
              )}
            </div>
            <div>
              {isPastDue ? (
                <span className="text-slate-400 flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5" /> Expired</span>
              ) : attemptsLeft <= 0 ? (
                <span className="text-rose-400 flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5" /> No attempts left</span>
              ) : (
                <span>{attemptsLeft} attempt{attemptsLeft !== 1 ? 's' : ''} left</span>
              )}
            </div>
          </footer>
        </section>
      </div>

      {/* Mobile tab strip */}
      <div className="md:hidden flex border-t border-white/[0.06] bg-[#0d121c] shrink-0">
        {(['problem', 'run', 'result'] as const).map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setLeftTab(id)}
            className={`flex-1 py-2.5 text-[11px] font-semibold capitalize ${
              leftTab === id ? 'text-white' : 'text-slate-500'
            }`}
          >
            {id}
          </button>
        ))}
      </div>
      {['problem', 'run', 'result'].includes(leftTab) && (
        <div className="md:hidden max-h-[40vh] overflow-y-auto border-t border-white/[0.06] bg-[#0d121c] p-4">
          {/* reuse left content on mobile via simplified panels */}
          {leftTab === 'problem' && (
            <p className="text-sm text-slate-400 whitespace-pre-wrap leading-relaxed">{a.description}</p>
          )}
          {leftTab === 'run' && (
            <div className="space-y-3">
              <textarea
                value={customInput}
                onChange={(e) => setCustomInput(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 text-sm font-mono bg-[#080b12] border border-white/10 rounded-xl text-slate-200"
                placeholder="stdin"
              />
              {runResult?.stdout && (
                <pre className="text-xs text-emerald-300 font-mono whitespace-pre-wrap">{runResult.stdout}</pre>
              )}
            </div>
          )}
          {leftTab === 'result' && result && (
            <p className="text-sm text-slate-300">
              Score {result.ai_score}/100 · Grade {result.ai_grade} · {result.test_cases_passed}/{result.test_cases_total} tests
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function getExt(lang: string): string {
  return { python: 'py', javascript: 'js', java: 'java', cpp: 'cpp', c: 'c' }[lang] ?? 'txt';
}

function getDefaultCode(lang: string): string {
  const d: Record<string, string> = {
    python: `# Read from stdin, print only the answer
# Example (two integers):
# a = int(input())
# b = int(input())
# print(a + b)

`,
    javascript: `// Read from stdin, print only the answer
const fs = require('fs');
const lines = fs.readFileSync(0, 'utf8').trim().split(/\\s+/);
// const a = Number(lines[0]);
// const b = Number(lines[1]);
// console.log(a + b);

`,
    java:       'public class Solution {\n    public static void main(String[] args) {\n        // Write your solution here\n    }\n}\n',
    cpp:        '#include <iostream>\nusing namespace std;\n\nint main() {\n    // Write your solution here\n    return 0;\n}\n',
    c:          '#include <stdio.h>\n\nint main() {\n    // Write your solution here\n    return 0;\n}\n',
  };
  return d[lang] ?? '// Write your solution here\n';
}
