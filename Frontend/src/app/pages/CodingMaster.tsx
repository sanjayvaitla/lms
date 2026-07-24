import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Code2, Plus, Search, Trash2, Edit, Eye, Users, BookOpen,
  ChevronRight, X, Loader2, CheckCircle2, XCircle, Clock,
  Zap, Target, Award, BarChart2, Play, Send, AlertCircle,
} from 'lucide-react';
import api from '../../lib/axios';
import { useAuth } from '../../store/AuthContext';

// ── Types ─────────────────────────────────────────────────────────────────────
interface Problem {
  id: string; title: string; description: string; language: string;
  difficulty: string; starter_code: string; solution_hint?: string;
  expected_concepts?: string; points: number; status: string;
  course_id?: string; course_title?: string; creator_name?: string;
  due_date?: string; time_limit_mins?: number; max_attempts?: number;
  test_case_count: number; assignment_count: number; created_at: string;
  test_cases: TestCase[];
}
interface TestCase {
  id?: string; input: string; expected_output: string;
  is_hidden: boolean; explanation?: string;
}
interface Assignment {
  id: string; problem_id: string; problem_title: string; difficulty: string;
  language: string; points: number; batch_id: string; batch_name: string;
  due_date?: string; max_attempts: number; status: string;
  submission_count: number; assigned_by_name: string; created_at: string;
}
interface Submission {
  id: string; student_name: string; code: string; language: string;
  execution_status: string; execution_output?: string; stderr?: string;
  runtime_ms?: number; ai_score?: number; ai_grade?: string;
  ai_feedback?: string; ai_suggestions?: string;
  test_cases_passed: number; test_cases_total: number;
  status: string; submitted_at: string;
}

const DIFF_COLORS: Record<string, string> = {
  EASY:   'bg-emerald-100 text-emerald-700 border-emerald-200',
  MEDIUM: 'bg-amber-100 text-amber-700 border-amber-200',
  HARD:   'bg-rose-100 text-rose-700 border-rose-200',
};
const EXEC_COLORS: Record<string, string> = {
  ACCEPTED:      'text-emerald-600 bg-emerald-50',
  WRONG_ANSWER:  'text-rose-600 bg-rose-50',
  RUNTIME_ERROR: 'text-orange-600 bg-orange-50',
  COMPILE_ERROR: 'text-red-600 bg-red-50',
  TIME_LIMIT:    'text-purple-600 bg-purple-50',
  PENDING:       'text-gray-500 bg-gray-50',
  RUNNING:       'text-blue-600 bg-blue-50',
};
const GRADE_COLORS: Record<string, string> = {
  A: 'text-emerald-600', B: 'text-cyan-600', C: 'text-amber-600',
  D: 'text-orange-600',  F: 'text-rose-600',
};

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function CodingMasterPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState<'problems' | 'assignments'>('problems');
  const [search, setSearch] = useState('');
  const [diffFilter, setDiffFilter] = useState('ALL');
  const [showCreate, setShowCreate] = useState(false);
  const [editProblem, setEditProblem] = useState<Problem | null>(null);
  const [showAssign, setShowAssign] = useState<Problem | null>(null);
  const [viewSubmissions, setViewSubmissions] = useState<Assignment | null>(null);

  const { data: problems = [], isLoading: loadingProblems } = useQuery<Problem[]>({
    queryKey: ['coding-problems', search, diffFilter],
    queryFn: async () => {
      const params: any = {};
      if (search) params.search = search;
      if (diffFilter !== 'ALL') params.difficulty = diffFilter;
      const { data } = await api.get('/coding/problems', { params });
      return data.data ?? [];
    },
  });

  const { data: assignments = [], isLoading: loadingAssignments } = useQuery<Assignment[]>({
    queryKey: ['coding-assignments'],
    queryFn: async () => {
      const { data } = await api.get('/coding/assignments');
      return data.data ?? [];
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/coding/problems/${id}`),
    onSuccess: () => { toast.success('Problem deleted'); qc.invalidateQueries({ queryKey: ['coding-problems'] }); },
    onError: () => toast.error('Delete failed'),
  });

  const publishMutation = useMutation({
    mutationFn: (id: string) => api.put(`/coding/problems/${id}`, { status: 'PUBLISHED' }),
    onSuccess: () => { toast.success('Problem published — students can now see it'); qc.invalidateQueries({ queryKey: ['coding-problems'] }); },
    onError: () => toast.error('Publish failed'),
  });

  const closeMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/coding/assignments/${id}/close`),
    onSuccess: () => { toast.success('Assignment closed'); qc.invalidateQueries({ queryKey: ['coding-assignments'] }); },
    onError: () => toast.error('Close failed'),
  });

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Code2 className="w-6 h-6 text-purple-600" /> Coding Test Platform
          </h1>
          <p className="text-gray-500 text-sm mt-0.5">Create problems, assign to batches, AI evaluates automatically</p>
        </div>
        {user?.role !== 'OPERATIONAL_MANAGER' && (
          <button onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-gradient-to-r from-purple-500 to-indigo-600 rounded-xl hover:opacity-90 shadow-md">
            <Plus className="w-4 h-4" /> New Problem
          </button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Problems', value: problems.length, icon: BookOpen, color: 'text-purple-600 bg-purple-50' },
          { label: 'Active Assignments', value: assignments.filter(a => a.status === 'ACTIVE').length, icon: Target, color: 'text-cyan-600 bg-cyan-50' },
          { label: 'Total Submissions', value: assignments.reduce((s, a) => s + a.submission_count, 0), icon: Send, color: 'text-emerald-600 bg-emerald-50' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color}`}>
                <Icon className="w-5 h-5" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{value}</p>
                <p className="text-xs text-gray-500">{label}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        {(['problems', 'assignments'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all capitalize ${tab === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            {t}
          </button>
        ))}
      </div>

      {/* Problems Tab */}
      {tab === 'problems' && (
        <div className="space-y-4">
          <div className="flex gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search problems..." className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500/30 focus:border-purple-400" />
            </div>
            <div className="flex gap-1.5">
              {['ALL', 'EASY', 'MEDIUM', 'HARD'].map(d => (
                <button key={d} onClick={() => setDiffFilter(d)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${diffFilter === d ? 'bg-purple-500 text-white border-purple-500' : 'bg-white text-gray-600 border-gray-200'}`}>
                  {d}
                </button>
              ))}
            </div>
          </div>

          {loadingProblems ? (
            <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />)}</div>
          ) : problems.length === 0 ? (
            <div className="text-center py-16">
              <Code2 className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">No problems yet. Create your first one!</p>
            </div>
          ) : (
            <div className="space-y-3">
              {problems.map(p => (
                <div key={p.id} className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${DIFF_COLORS[p.difficulty] ?? 'bg-gray-100 text-gray-600'}`}>{p.difficulty}</span>
                        <span className="text-xs font-mono bg-gray-100 text-gray-600 px-2 py-0.5 rounded-md">{p.language}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${p.status === 'PUBLISHED' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>{p.status}</span>
                        <span className="text-xs text-gray-400 flex items-center gap-1"><Award className="w-3 h-3" />{p.points} pts</span>
                      </div>
                      <h3 className="font-semibold text-gray-900 mt-1.5 text-base">{p.title}</h3>
                      <p className="text-gray-500 text-sm mt-1 line-clamp-2">{p.description}</p>
                      <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
                        <span>{p.test_case_count} test cases</span>
                        <span>{p.assignment_count} assignments</span>
                        {p.course_title && <span>{p.course_title}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {p.status === 'DRAFT' && (
                        <button onClick={() => publishMutation.mutate(p.id)}
                          className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Publish
                        </button>
                      )}
                      <button onClick={() => setShowAssign(p)}
                        className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-purple-700 bg-purple-50 border border-purple-200 rounded-lg hover:bg-purple-100 transition-colors">
                        <Send className="w-3.5 h-3.5" /> Assign
                      </button>
                      <button onClick={() => setEditProblem(p)}
                        className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                        <Edit className="w-4 h-4" />
                      </button>
                      <button onClick={() => { if (confirm('Delete this problem?')) deleteMutation.mutate(p.id); }}
                        className="p-2 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Assignments Tab */}
      {tab === 'assignments' && (
        <div className="space-y-3">
          {loadingAssignments ? (
            <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />)}</div>
          ) : assignments.length === 0 ? (
            <div className="text-center py-16"><Target className="w-12 h-12 text-gray-300 mx-auto mb-3" /><p className="text-gray-500">No assignments yet.</p></div>
          ) : (
            assignments.map(a => (
              <div key={a.id} className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${DIFF_COLORS[a.difficulty] ?? ''}`}>{a.difficulty}</span>
                      <span className="text-xs font-mono bg-gray-100 text-gray-600 px-2 py-0.5 rounded-md">{a.language}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${a.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>{a.status}</span>
                    </div>
                    <p className="font-semibold text-gray-900">{a.problem_title}</p>
                    <div className="flex items-center gap-4 mt-1 text-xs text-gray-500">
                      <span className="flex items-center gap-1"><Users className="w-3 h-3" />{a.batch_name}</span>
                      <span className="flex items-center gap-1"><Send className="w-3 h-3" />{a.submission_count} submissions</span>
                      <span className="flex items-center gap-1"><Target className="w-3 h-3" />Max {a.max_attempts} attempts</span>
                      {a.due_date && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />Due {new Date(a.due_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>}
                    </div>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <button onClick={() => setViewSubmissions(a)}
                      className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100">
                      <Eye className="w-3.5 h-3.5" /> View Submissions
                    </button>
                    {a.status === 'ACTIVE' && (
                      <button onClick={() => { if (confirm('Close this assignment?')) closeMutation.mutate(a.id); }}
                        className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 border border-gray-200 rounded-lg hover:bg-gray-200">
                        Close
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Modals */}
      {(showCreate || editProblem) && (
        <ProblemModal
          problem={editProblem}
          onClose={() => { setShowCreate(false); setEditProblem(null); }}
          onSuccess={() => { setShowCreate(false); setEditProblem(null); qc.invalidateQueries({ queryKey: ['coding-problems'] }); }}
        />
      )}
      {showAssign && (
        <AssignModal
          problem={showAssign}
          onClose={() => setShowAssign(null)}
          onSuccess={() => { setShowAssign(null); qc.invalidateQueries({ queryKey: ['coding-assignments'] }); setTab('assignments'); }}
        />
      )}
      {viewSubmissions && (
        <SubmissionsModal
          assignment={viewSubmissions}
          onClose={() => setViewSubmissions(null)}
        />
      )}
    </div>
  );
}

// ── Problem Create/Edit Modal ─────────────────────────────────────────────────
function ProblemModal({ problem, onClose, onSuccess }: {
  problem: Problem | null; onClose: () => void; onSuccess: () => void;
}) {
  const isEdit = !!problem;
  const [form, setForm] = useState({
    title: problem?.title ?? '',
    description: problem?.description ?? '',
    language: problem?.language ?? 'python',
    difficulty: problem?.difficulty ?? 'MEDIUM',
    starter_code: problem?.starter_code ?? '',
    solution_hint: problem?.solution_hint ?? '',
    expected_concepts: problem?.expected_concepts ?? '',
    points: problem?.points ?? 10,
    status: problem?.status ?? 'PUBLISHED',  // default PUBLISHED so students see it immediately
    due_date: problem?.due_date ? new Date(problem.due_date).toISOString().slice(0, 16) : '',
    time_limit_mins: problem?.time_limit_mins ?? '',
    max_attempts: problem?.max_attempts ?? 3,
  });
  const [testCases, setTestCases] = useState<TestCase[]>(
    problem?.test_cases?.length ? problem.test_cases :
    [{ input: '', expected_output: '', is_hidden: false, explanation: '' }]
  );
  const [saving, setSaving] = useState(false);

  function addTC() { setTestCases(t => [...t, { input: '', expected_output: '', is_hidden: false, explanation: '' }]); }
  function removeTC(i: number) { setTestCases(t => t.filter((_, idx) => idx !== i)); }
  function updateTC(i: number, key: keyof TestCase, val: any) {
    setTestCases(t => t.map((tc, idx) => idx === i ? { ...tc, [key]: val } : tc));
  }

  async function handleSave() {
    if (!form.title || !form.description) { toast.error('Title and description are required'); return; }
    if (testCases.length === 0) { toast.error('Add at least one test case'); return; }
    setSaving(true);
    try {
      const payload = { 
        ...form, 
        points: form.points || 10,
        max_attempts: form.max_attempts || 3,
        test_cases: testCases 
      };
      if (isEdit) await api.put(`/coding/problems/${problem!.id}`, payload);
      else        await api.post('/coding/problems', payload);
      toast.success(isEdit ? 'Problem updated' : 'Problem created');
      onSuccess();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Save failed');
    } finally { setSaving(false); }
  }

  const inputCls = 'w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-purple-500/30 focus:border-purple-400';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-lg font-bold text-gray-900">{isEdit ? 'Edit Problem' : 'Create Coding Problem'}</h2>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Title */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Title *</label>
            <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} className={inputCls} placeholder="e.g. Fibonacci Sequence" />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Problem Description *</label>
            <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              rows={4} className={inputCls + ' resize-none'} placeholder="Describe the problem clearly. Include examples, constraints, and expected behavior." />
          </div>

          {/* Language / Difficulty / Points / Status */}
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: 'Language', key: 'language', opts: ['python','javascript','java','cpp','c'] },
              { label: 'Difficulty', key: 'difficulty', opts: ['EASY','MEDIUM','HARD'] },
              { label: 'Status', key: 'status', opts: ['DRAFT','PUBLISHED','ARCHIVED'] },
            ].map(({ label, key, opts }) => (
              <div key={key}>
                <label className="block text-xs font-medium text-gray-700 mb-1">{label}</label>
                <select value={(form as any)[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} className={inputCls}>
                  {opts.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
            ))}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Points</label>
              <input type="number" min={1} max={100} value={form.points}
                onChange={e => setForm(f => ({ ...f, points: e.target.value === '' ? ('' as any) : parseInt(e.target.value) }))} className={inputCls} />
            </div>
          </div>

          {/* Time Limit / Due Date / Attempts */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Due Date</label>
              <input type="datetime-local" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Time Limit (mins)</label>
              <input type="number" min={1} placeholder="Optional" value={form.time_limit_mins} onChange={e => setForm(f => ({ ...f, time_limit_mins: parseInt(e.target.value) || '' }))} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Max Attempts per Student</label>
              <input type="number" min={1} max={10} value={form.max_attempts === 0 ? '' : form.max_attempts}
                onChange={e => {
                  const val = e.target.value === '' ? 0 : parseInt(e.target.value);
                  setForm(f => ({ ...f, max_attempts: isNaN(val) ? 0 : val }));
                }} className={inputCls} />
            </div>
          </div>

          {/* Starter Code */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Starter Code (shown to student)</label>
            <textarea value={form.starter_code} onChange={e => setForm(f => ({ ...f, starter_code: e.target.value }))}
              rows={4} className={inputCls + ' resize-none font-mono text-xs'} placeholder="# Write your starter code here..." />
          </div>

          {/* Expected Concepts */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Expected Concepts (for AI evaluation)</label>
            <input value={form.expected_concepts} onChange={e => setForm(f => ({ ...f, expected_concepts: e.target.value }))}
              className={inputCls} placeholder="e.g. loops, recursion, time complexity O(n)" />
          </div>

          {/* Solution Hint */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Solution Hint (admin only)</label>
            <input value={form.solution_hint} onChange={e => setForm(f => ({ ...f, solution_hint: e.target.value }))}
              className={inputCls} placeholder="Hint for the expected approach..." />
          </div>

          {/* Test Cases */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-semibold text-gray-700">Test Cases *</label>
              <button onClick={addTC} className="flex items-center gap-1 text-xs text-purple-600 font-medium hover:text-purple-800">
                <Plus className="w-3.5 h-3.5" /> Add Test Case
              </button>
            </div>
            <div className="space-y-3">
              {testCases.map((tc, i) => (
                <div key={i} className="border border-gray-200 rounded-xl p-4 bg-gray-50 relative">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-gray-600">Test Case {i + 1}</span>
                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
                        <input type="checkbox" checked={tc.is_hidden} onChange={e => updateTC(i, 'is_hidden', e.target.checked)} className="rounded" />
                        Hidden
                      </label>
                      {testCases.length > 1 && (
                        <button onClick={() => removeTC(i)} className="text-rose-500 hover:text-rose-700"><X className="w-3.5 h-3.5" /></button>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Input</label>
                      <textarea value={tc.input} onChange={e => updateTC(i, 'input', e.target.value)}
                        rows={2} className="w-full px-2 py-1.5 text-xs font-mono border border-gray-200 rounded-lg bg-white resize-none focus:outline-none focus:ring-1 focus:ring-purple-400" placeholder="Input (empty if none)" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Expected Output *</label>
                      <textarea value={tc.expected_output} onChange={e => updateTC(i, 'expected_output', e.target.value)}
                        rows={2} className="w-full px-2 py-1.5 text-xs font-mono border border-gray-200 rounded-lg bg-white resize-none focus:outline-none focus:ring-1 focus:ring-purple-400" placeholder="Expected output" />
                    </div>
                  </div>
                  <input value={tc.explanation ?? ''} onChange={e => updateTC(i, 'explanation', e.target.value)}
                    className="w-full mt-2 px-2 py-1.5 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-purple-400" placeholder="Explanation (optional)" />
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="p-6 border-t flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200">Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-purple-500 to-indigo-600 rounded-xl hover:opacity-90 disabled:opacity-60 flex items-center justify-center gap-2">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {isEdit ? 'Save Changes' : 'Create Problem'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Assign Modal ──────────────────────────────────────────────────────────────
function AssignModal({ problem, onClose, onSuccess }: {
  problem: Problem; onClose: () => void; onSuccess: () => void;
}) {
  const [selectedBatchIds, setSelectedBatchIds] = useState<string[]>([]);
  const [due_date, setDueDate] = useState(problem.due_date ? new Date(problem.due_date).toISOString().slice(0, 16) : '');
  const [time_limit_mins, setTimeLimitMins] = useState(problem.time_limit_mins?.toString() ?? '');
  const [max_attempts, setMaxAttempts] = useState(problem.max_attempts?.toString() ?? '3');
  const [saving, setSaving] = useState(false);

  const { data: batches = [] } = useQuery<any[]>({
    queryKey: ['batches-with-enrollments'],
    queryFn: async () => {
      const { data } = await api.get('/batches');
      return data.data ?? [];
    },
  });

  function toggleBatch(id: string) {
    setSelectedBatchIds(prev =>
      prev.includes(id) ? prev.filter(b => b !== id) : [...prev, id]
    );
  }

  const totalStudents = batches
    .filter((b: any) => selectedBatchIds.includes(b.id))
    .reduce((sum: number, b: any) => sum + (b._count?.enrollments ?? 0), 0);

  async function handleAssign() {
    if (selectedBatchIds.length === 0) { toast.error('Select at least one batch'); return; }
    setSaving(true);
    let successCount = 0;
    for (const batch_id of selectedBatchIds) {
      try {
        await api.post('/coding/assignments', {
          problem_id: problem.id,
          batch_id,
          due_date: due_date || undefined,
          time_limit_mins: time_limit_mins ? parseInt(time_limit_mins) : undefined,
          max_attempts: parseInt(max_attempts) || 3,
        });
        successCount++;
      } catch (err: any) {
        const msg = err?.response?.data?.message ?? '';
        if (!msg.toLowerCase().includes('already')) {
          toast.error(`Failed for one batch: ${msg}`);
        } else {
          successCount++; // already assigned = OK
        }
      }
    }
    setSaving(false);
    toast.success(`"${problem.title}" assigned to ${successCount} batch${successCount !== 1 ? 'es' : ''} — ${totalStudents} students notified`);
    onSuccess();
  }

  const inputCls = 'w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-purple-500/30 focus:border-purple-400';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-6 border-b">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Assign to Batch</h2>
            <p className="text-sm text-gray-500 mt-0.5 flex items-center gap-2">
              {problem.title}
              <span className={`text-xs px-2 py-0.5 rounded-full ${problem.status === 'PUBLISHED' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                {problem.status}
              </span>
            </p>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Draft warning */}
          {problem.status !== 'PUBLISHED' && (
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
              <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-amber-800">This problem is <strong>{problem.status}</strong>. Students won't see it until it's Published. Go back and click <strong>Publish</strong> first.</p>
            </div>
          )}

          {/* Batch selection */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-2">
              Select Batches * <span className="font-normal text-gray-400">(check all that apply)</span>
            </label>
            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {batches.map((b: any) => {
                const checked = selectedBatchIds.includes(b.id);
                const count = b._count?.enrollments ?? 0;
                return (
                  <label key={b.id}
                    className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                      checked ? 'border-purple-300 bg-purple-50' : 'border-gray-200 hover:border-gray-300 bg-white'
                    }`}>
                    <input type="checkbox" checked={checked} onChange={() => toggleBatch(b.id)}
                      className="w-4 h-4 rounded accent-purple-600 cursor-pointer" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">{b.name}</p>
                      <p className="text-xs text-gray-400">{b.course?.title ?? ''}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        b.status === 'ONGOING'  ? 'bg-emerald-100 text-emerald-700' :
                        b.status === 'UPCOMING' ? 'bg-cyan-100 text-cyan-700' :
                        'bg-gray-100 text-gray-500'
                      }`}>{b.status}</span>
                      <p className="text-xs text-gray-400 mt-0.5">{count} students</p>
                    </div>
                  </label>
                );
              })}
            </div>

            {/* Summary */}
            {selectedBatchIds.length > 0 && (
              <div className="mt-3 flex items-center gap-2 bg-purple-50 border border-purple-100 rounded-xl px-4 py-2.5">
                <Users className="w-4 h-4 text-purple-500" />
                <p className="text-sm text-purple-800 font-medium">
                  {selectedBatchIds.length} batch{selectedBatchIds.length !== 1 ? 'es' : ''} selected · <strong>{totalStudents} students</strong> will receive this test
                </p>
              </div>
            )}
          </div>

          {/* Settings */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Due Date</label>
              <input type="datetime-local" value={due_date} onChange={e => setDueDate(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Time Limit (mins)</label>
              <input type="number" min={1} placeholder="Optional" value={time_limit_mins} onChange={e => setTimeLimitMins(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Max Attempts per Student</label>
              <input type="number" min={1} max={10} value={max_attempts} onChange={e => setMaxAttempts(e.target.value)} className={inputCls} />
            </div>
          </div>
        </div>

        <div className="p-6 border-t flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200">Cancel</button>
          <button onClick={handleAssign} disabled={saving || selectedBatchIds.length === 0}
            className="flex-1 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-purple-500 to-indigo-600 rounded-xl hover:opacity-90 disabled:opacity-60 flex items-center justify-center gap-2">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {saving ? 'Assigning…' : `Assign to ${selectedBatchIds.length || ''} Batch${selectedBatchIds.length !== 1 ? 'es' : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Submissions Modal ─────────────────────────────────────────────────────────
function SubmissionsModal({ assignment, onClose }: { assignment: Assignment; onClose: () => void }) {
  const [selected, setSelected] = useState<Submission | null>(null);

  const { data: submissions = [], isLoading } = useQuery<Submission[]>({
    queryKey: ['coding-submissions', assignment.id],
    queryFn: async () => {
      const { data } = await api.get(`/coding/assignments/${assignment.id}/submissions`);
      return data.data ?? [];
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-6 border-b">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Submissions — {assignment.problem_title}</h2>
            <p className="text-sm text-gray-500">{assignment.batch_name} · {submissions.length} submissions</p>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex-1 overflow-hidden flex">
          {/* List */}
          <div className="w-80 border-r overflow-y-auto">
            {isLoading ? (
              <div className="p-4 space-y-2">{[1,2,3].map(i => <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />)}</div>
            ) : submissions.length === 0 ? (
              <div className="p-8 text-center text-gray-500"><Send className="w-8 h-8 text-gray-300 mx-auto mb-2" /><p className="text-sm">No submissions yet</p></div>
            ) : (
              <div className="p-3 space-y-2">
                {submissions.map(s => (
                  <button key={s.id} onClick={() => setSelected(s)}
                    className={`w-full text-left p-3 rounded-xl border transition-all ${selected?.id === s.id ? 'border-purple-300 bg-purple-50' : 'border-gray-100 hover:border-gray-200 hover:bg-gray-50'}`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-gray-900 text-sm">{s.student_name}</span>
                      {s.ai_grade && <span className={`font-bold text-lg ${GRADE_COLORS[s.ai_grade] ?? ''}`}>{s.ai_grade}</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${EXEC_COLORS[s.execution_status] ?? ''}`}>{s.execution_status}</span>
                      {s.ai_score !== null && s.ai_score !== undefined && <span className="text-xs text-gray-500">{s.ai_score}/100</span>}
                    </div>
                    <p className="text-xs text-gray-400 mt-1">{s.test_cases_passed}/{s.test_cases_total} tests passed</p>
                  </button>
                ))}
              </div>
            )}
          </div>
          {/* Detail */}
          <div className="flex-1 overflow-y-auto p-6">
            {!selected ? (
              <div className="flex items-center justify-center h-full text-gray-400">
                <div className="text-center"><Eye className="w-10 h-10 mx-auto mb-2 text-gray-300" /><p>Select a submission to view details</p></div>
              </div>
            ) : (
              <SubmissionDetail submission={selected} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Submission Detail ─────────────────────────────────────────────────────────
function SubmissionDetail({ submission: s }: { submission: Submission }) {
  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-bold text-gray-900 text-lg">{s.student_name}</h3>
          <p className="text-gray-500 text-sm">{new Date(s.submitted_at).toLocaleString('en-IN')}</p>
        </div>
        <div className="flex items-center gap-3">
          {s.ai_grade && <span className={`text-4xl font-black ${GRADE_COLORS[s.ai_grade] ?? ''}`}>{s.ai_grade}</span>}
          {s.ai_score !== null && s.ai_score !== undefined && (
            <div className="text-right"><p className="text-2xl font-bold text-gray-900">{s.ai_score}<span className="text-lg text-gray-400">/100</span></p><p className="text-xs text-gray-500">AI Score</p></div>
          )}
        </div>
      </div>

      {/* Test results bar */}
      <div className="bg-gray-50 rounded-xl p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold text-gray-700">Test Cases</span>
          <span className="text-sm font-bold text-gray-900">{s.test_cases_passed}/{s.test_cases_total}</span>
        </div>
        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all ${s.test_cases_passed === s.test_cases_total ? 'bg-emerald-500' : 'bg-amber-500'}`}
            style={{ width: `${s.test_cases_total > 0 ? (s.test_cases_passed / s.test_cases_total) * 100 : 0}%` }} />
        </div>
        <div className="flex items-center gap-3 mt-2">
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${EXEC_COLORS[s.execution_status] ?? ''}`}>{s.execution_status}</span>
          {s.runtime_ms && <span className="text-xs text-gray-400 flex items-center gap-1"><Clock className="w-3 h-3" />{s.runtime_ms}ms</span>}
        </div>
      </div>

      {/* AI Feedback */}
      {s.ai_feedback && (
        <div className="border border-purple-100 bg-purple-50 rounded-xl p-4">
          <p className="text-xs font-semibold text-purple-700 mb-1 flex items-center gap-1"><Zap className="w-3.5 h-3.5" /> AI Feedback</p>
          <p className="text-sm text-gray-700">{s.ai_feedback}</p>
          {s.ai_suggestions && (
            <div className="mt-3 border-t border-purple-100 pt-3">
              <p className="text-xs font-semibold text-purple-600 mb-1">Suggestions</p>
              <p className="text-sm text-gray-600">{s.ai_suggestions}</p>
            </div>
          )}
        </div>
      )}

      {/* Code */}
      <div>
        <p className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1"><Code2 className="w-4 h-4" /> Submitted Code ({s.language})</p>
        <pre className="bg-gray-900 text-gray-100 text-xs rounded-xl p-4 overflow-x-auto max-h-64 font-mono leading-relaxed">{s.code}</pre>
      </div>

      {/* Output */}
      {(s.execution_output || s.stderr) && (
        <div>
          <p className="text-sm font-semibold text-gray-700 mb-2">Execution Output</p>
          {s.execution_output && <pre className="bg-gray-50 text-gray-700 text-xs rounded-xl p-3 overflow-x-auto max-h-32 font-mono border">{s.execution_output}</pre>}
          {s.stderr && <pre className="bg-rose-50 text-rose-700 text-xs rounded-xl p-3 overflow-x-auto max-h-24 font-mono border border-rose-100 mt-2">{s.stderr}</pre>}
        </div>
      )}
    </div>
  );
}
