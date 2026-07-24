import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ClipboardList, Clock, CheckCircle, Calendar, Upload, X, FileText,
  Archive, Loader2, ExternalLink, Award, AlertCircle, Eye, Sparkles,
  GitPullRequest, GitBranch, Code2, Play,
} from 'lucide-react';
import { toast } from 'sonner';
import api from '../../../lib/axios';
import { useAuth } from '../../../store/AuthContext';
import { refreshStudentActivity } from '../../../lib/lmsCache';
import { useInAppViewer } from '../../components/ui/InAppDocumentViewer';
import type { User } from '../../../types/api';

interface StudentAssignment {
  id: string;
  title: string;
  description?: string;
  courseTitle: string;
  batchName: string;
  moduleTitle?: string;
  sessionNumber?: number;
  dueDate: string | null;
  maxScore: number;
  status: 'PUBLISHED';
  pdfUrl: string | null;
  pdfFilename: string | null;
  submissionId: string | null;
  submissionStatus: 'SUBMITTED' | 'GRADED' | 'LATE' | 'IN_PROGRESS' | null;
  submissionPdfUrl: string | null;
  submissionZipUrl: string | null;
  submittedAt: string | null;
  score: number | null;
  feedback: string | null;
  aiScore: number | null;
  aiFeedback: string | null;
  aiBreakdown: Record<string, string> | null;
  aiGradedAt: string | null;
  aiModel: string | null;
  githubTemplateUrl?: string | null;
  githubForkUrl?: string | null;
}

export default function MyAssignmentsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [submitFor, setSubmitFor] = useState<StudentAssignment | null>(null);
  const [manualFork, setManualFork] = useState<{ assignmentId: string; templateUrl: string; githubUsername: string } | null>(null);
  const [forkUrlInput, setForkUrlInput] = useState('');
  const { open: openDoc, viewer: docViewer } = useInAppViewer();

  // Fresh profile (avoids stale localStorage missing githubUsername)
  const { data: meProfile } = useQuery({
    queryKey: ['my-profile'],
    queryFn: async () => {
      const { data } = await api.get('/auth/me');
      return data.data as User;
    },
    enabled: !!user,
    staleTime: 30_000,
  });
  const githubUsername = (meProfile?.githubUsername ?? user?.githubUsername)?.trim() || '';

  const { data: assignments = [], isLoading, isError } = useQuery<StudentAssignment[]>({
    queryKey: ['student-assignments'],
    queryFn: async () => {
      const { data } = await api.get('/assignments/student/list');
      return data.data ?? [];
    },
    enabled: !!user,
    refetchInterval: (query) => {
      const rows = query.state.data as StudentAssignment[] | undefined;
      const now  = Date.now();
      const hasFreshPending = rows?.some((a) => {
        if (!a.submissionId || a.aiGradedAt) return false;
        const age = a.submittedAt ? now - new Date(a.submittedAt).getTime() : Infinity;
        return age < 3 * 60 * 1000;
      });
      return hasFreshPending ? 4000 : false;
    },
  });

  const pending   = assignments.filter((a) => !a.submissionId || (a.githubTemplateUrl && a.submissionStatus === 'IN_PROGRESS'));
  const submitted = assignments.filter((a) => !!a.submissionId && a.submissionStatus !== 'IN_PROGRESS');

  const forkMut = useMutation({
    mutationFn: async (assignmentId: string) => {
      const { data } = await api.post(`/assignments/${assignmentId}/start-github-task`);
      return { assignmentId, ...(data.data ?? data) };
    },
    onSuccess: (result: any) => {
      if (result.needsManualFork) {
        setManualFork({
          assignmentId: result.assignmentId,
          templateUrl: result.templateUrl,
          githubUsername: result.githubUsername,
        });
        setForkUrlInput('');
        if (result.templateUrl) window.open(result.templateUrl, '_blank', 'noopener,noreferrer');
        toast.message('Fork the template under your GitHub account, then paste the fork URL below.');
        return;
      }
      toast.success('Template repository forked successfully!');
      void refreshStudentActivity(qc, { kind: 'assignment' });
    },
    onError: (e: any) => {
      toast.error(e.response?.data?.message ?? 'Failed to fork repository');
    },
  });

  const confirmForkMut = useMutation({
    mutationFn: async ({ assignmentId, forkUrl }: { assignmentId: string; forkUrl: string }) => {
      const { data } = await api.post(`/assignments/${assignmentId}/confirm-github-fork`, { forkUrl });
      return data;
    },
    onSuccess: () => {
      toast.success('Fork linked successfully!');
      setManualFork(null);
      setForkUrlInput('');
      void refreshStudentActivity(qc, { kind: 'assignment' });
    },
    onError: (e: any) => {
      toast.error(e.response?.data?.message ?? 'Could not confirm fork URL');
    },
  });

  const submitGitMut = useMutation({
    mutationFn: async (assignmentId: string) => {
      const { data } = await api.post(`/assignments/${assignmentId}/submit`, { github_submission: true });
      return data;
    },
    onSuccess: () => {
      toast.success('GitHub task submitted successfully!');
      void refreshStudentActivity(qc, { kind: 'assignment' });
    },
    onError: (e: any) => {
      const msg = e.response?.data?.message ?? 'Failed to submit GitHub task';
      toast.error(msg);
    }
  });

  function dueBadge(dueDate: string | null) {
    if (!dueDate) return { label: 'No due date', cls: 'bg-slate-100 text-slate-600' };
    const diff = Math.ceil((new Date(dueDate).getTime() - Date.now()) / 86400000);
    if (diff < 0)  return { label: 'Overdue',        cls: 'bg-rose-100 text-rose-600 border border-rose-200' };
    if (diff <= 2) return { label: `Due in ${diff}d`, cls: 'bg-orange-100 text-orange-600 border border-orange-200' };
    return           { label: `Due in ${diff}d`,     cls: 'bg-blue-100 text-blue-600 border border-blue-200' };
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => <div key={i} className="h-28 rounded-2xl bg-slate-200 animate-pulse" />)}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">My Assignments</h1>
        <p className="text-slate-500 text-sm mt-1">View and submit your assignments</p>
      </div>

      {!githubUsername && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 flex items-start gap-3">
          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-sm text-amber-900">
            <p className="font-semibold">GitHub username required for Git tasks</p>
            <p className="text-xs text-amber-800 mt-0.5">
              Add your GitHub login on <a href="/my-profile" className="underline font-medium">My Profile</a>.
              It does not need to match your real name or email — but must be unique and exact.
            </p>
          </div>
        </div>
      )}

      {manualFork && (
        <div className="rounded-2xl border border-purple-200 bg-purple-50 p-4 space-y-3">
          <p className="text-sm font-semibold text-purple-900">Confirm your fork under @{manualFork.githubUsername}</p>
          <p className="text-xs text-purple-800">
            Template opened in a new tab. After forking, paste the fork URL (must start with{' '}
            <code className="bg-white/70 px-1 rounded">github.com/{manualFork.githubUsername}/</code>).
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              value={forkUrlInput}
              onChange={(e) => setForkUrlInput(e.target.value)}
              placeholder={`https://github.com/${manualFork.githubUsername}/your-fork`}
              className="flex-1 px-3 py-2 text-sm border border-purple-200 rounded-xl bg-white"
            />
            <button
              disabled={!forkUrlInput.trim() || confirmForkMut.isPending}
              onClick={() => confirmForkMut.mutate({ assignmentId: manualFork.assignmentId, forkUrl: forkUrlInput.trim() })}
              className="px-4 py-2 text-sm font-semibold text-white bg-purple-600 hover:bg-purple-700 rounded-xl disabled:opacity-50"
            >
              {confirmForkMut.isPending ? 'Saving…' : 'Link fork'}
            </button>
            <button onClick={() => setManualFork(null)} className="px-3 py-2 text-sm text-purple-700">Cancel</button>
          </div>
        </div>
      )}

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center flex-shrink-0">
            <Clock className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <p className="text-2xl font-bold text-slate-900">{pending.length}</p>
            <p className="text-xs text-slate-500">Pending</p>
          </div>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center flex-shrink-0">
            <CheckCircle className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <p className="text-2xl font-bold text-slate-900">{submitted.length}</p>
            <p className="text-xs text-slate-500">Submitted</p>
          </div>
        </div>
      </div>

      {/* Error state */}
      {isError && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-sm text-rose-600 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          Failed to load assignments. Refresh to try again.
        </div>
      )}

      {/* Pending Submissions */}
      {pending.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-base font-semibold text-slate-900">Pending Submission</h2>
          {pending.map((a) => {
            const badge = dueBadge(a.dueDate);
            const isGitTask = !!a.githubTemplateUrl;
            return (
              <div key={a.id} className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3 shadow-sm">
                <div className={`w-10 h-10 rounded-lg flex-shrink-0 flex items-center justify-center ${isGitTask ? 'bg-purple-50' : 'bg-blue-50'}`}>
                  {isGitTask ? <GitPullRequest className="w-5 h-5 text-purple-600" /> : <ClipboardList className="w-5 h-5 text-blue-600" />}
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-slate-900 text-sm font-semibold truncate">{a.title}</p>
                  <p className="text-slate-500 text-xs truncate mt-0.5">
                    {[a.courseTitle, a.batchName].filter(Boolean).join(' · ')} · Max {a.maxScore} pts
                    {a.moduleTitle && (
                      <span> · {a.sessionNumber ? `S${a.sessionNumber}: ` : ''}{a.moduleTitle}</span>
                    )}
                  </p>
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    {a.dueDate && (
                      <span className="text-slate-500 text-xs flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {new Date(a.dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                      </span>
                    )}
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${badge.cls}`}>
                      {badge.label}
                    </span>
                    {isGitTask && (
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-purple-100 text-purple-700">
                        Git Task
                      </span>
                    )}
                  </div>
                  {isGitTask && a.githubForkUrl && (
                    <div className="mt-2 text-xs flex items-center gap-1.5 bg-slate-50 border border-slate-100 rounded-lg p-2 w-fit">
                      <GitBranch className="w-3.5 h-3.5 text-slate-500" />
                      <span className="text-slate-500">Your fork:</span>
                      <a href={a.githubForkUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline font-mono">
                        {a.githubForkUrl.replace('https://github.com/', '')}
                      </a>
                    </div>
                  )}
                </div>

                {isGitTask ? (
                  <div className="flex items-center gap-2">
                    {!a.githubForkUrl ? (
                      <button
                        onClick={() => {
                          if (!githubUsername) {
                            toast.error('Add your GitHub username on My Profile first');
                            return;
                          }
                          forkMut.mutate(a.id);
                        }}
                        disabled={forkMut.isPending}
                        className="flex-shrink-0 flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-purple-600 hover:bg-purple-700 disabled:bg-purple-400 text-white rounded-lg transition-colors"
                      >
                        {forkMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <GitPullRequest className="w-3.5 h-3.5" />}
                        Fork Template
                      </button>
                    ) : (
                      <button
                        onClick={() => submitGitMut.mutate(a.id)}
                        disabled={submitGitMut.isPending}
                        className="flex-shrink-0 flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg transition-colors"
                      >
                        {submitGitMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                        Submit Task
                      </button>
                    )}
                  </div>
                ) : (
                  <>
                    {a.pdfUrl && (
                      <button
                        type="button"
                        onClick={() => openDoc({ url: a.pdfUrl!, title: a.title })}
                        className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 border border-slate-200 hover:border-slate-300 rounded-lg transition-colors bg-white"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        View
                      </button>
                    )}
                    <button
                      onClick={() => setSubmitFor(a)}
                      className="flex-shrink-0 flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      Submit
                    </button>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Submitted */}
      {submitted.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-base font-semibold text-slate-900">Submitted</h2>
          {submitted.map((a) => {
            const aiAge      = a.submittedAt ? Date.now() - new Date(a.submittedAt).getTime() : 0;
            const aiTimedOut = !a.aiGradedAt && aiAge > 3 * 60 * 1000;
            const aiPending  = !a.aiGradedAt && !aiTimedOut;
            return (
              <div key={a.id} className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 shadow-sm">

                {/* Top row */}
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg flex-shrink-0 flex items-center justify-center bg-blue-50">
                    {a.submissionStatus === 'GRADED'
                      ? <Award className="w-5 h-5 text-blue-600" />
                      : <CheckCircle className="w-5 h-5 text-blue-600" />}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-slate-900 text-sm font-semibold truncate">{a.title}</p>
                    <p className="text-slate-500 text-xs truncate mt-0.5">
                      {[a.courseTitle, a.batchName].filter(Boolean).join(' · ')}
                      {a.moduleTitle && (
                        <span> · {a.sessionNumber ? `S${a.sessionNumber}: ` : ''}{a.moduleTitle}</span>
                      )}
                    </p>
                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                      {a.submittedAt && (
                        <span className="text-slate-500 text-xs">
                          {new Date(a.submittedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                        </span>
                      )}
                      {a.submissionPdfUrl && (
                        <button
                          type="button"
                          onClick={() => openDoc({ url: a.submissionPdfUrl!, title: `${a.title} — submission` })}
                          className="text-xs flex items-center gap-1 text-blue-600 hover:text-blue-700"
                        >
                          <FileText className="w-3 h-3" /> My PDF
                        </button>
                      )}
                      {a.submissionZipUrl && (
                        <a href={a.submissionZipUrl} download
                          className="text-xs flex items-center gap-1 text-blue-600 hover:text-blue-700">
                          <Archive className="w-3 h-3" /> My ZIP
                        </a>
                      )}
                      {a.githubForkUrl && (
                        <a href={a.githubForkUrl} target="_blank" rel="noopener noreferrer"
                          className="text-xs flex items-center gap-1 text-purple-600 hover:text-purple-700">
                          <Code2 className="w-3 h-3" /> My Code
                        </a>
                      )}
                    </div>
                  </div>

                  <div className="flex-shrink-0 flex flex-col items-end gap-1.5">
                    {a.submissionStatus === 'GRADED' && a.score !== null ? (
                      <div className="text-right">
                        <span className={`text-xl font-bold ${(a.score ?? 0) >= a.maxScore * 0.6 ? 'text-blue-600' : 'text-rose-500'}`}>
                          {a.score}
                        </span>
                        <span className="text-slate-500 text-sm">/{a.maxScore}</span>
                      </div>
                    ) : (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-200 whitespace-nowrap">
                        Awaiting grade
                      </span>
                    )}
                    <div className="flex items-center gap-2">
                      {a.pdfUrl && !a.githubTemplateUrl && (
                        <button
                          type="button"
                          onClick={() => openDoc({ url: a.pdfUrl!, title: a.title })}
                          className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700"
                        >
                          <Eye className="w-3 h-3" /> View
                        </button>
                      )}
                      {a.githubTemplateUrl ? (
                        <button
                          onClick={() => submitGitMut.mutate(a.id)}
                          disabled={submitGitMut.isPending}
                          className="flex items-center gap-1 text-xs text-slate-500 hover:text-blue-600 disabled:opacity-50"
                        >
                          {submitGitMut.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                          Re-submit
                        </button>
                      ) : (
                        <button onClick={() => setSubmitFor(a)}
                          className="flex items-center gap-1 text-xs text-slate-500 hover:text-blue-600">
                          <Upload className="w-3 h-3" /> Re-submit
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Trainer feedback */}
                {a.feedback && (
                  <p className="text-xs text-slate-600 bg-slate-50 px-2 py-1.5 rounded border border-slate-200">
                    <strong className="text-slate-700">Trainer:</strong> {a.feedback}
                  </p>
                )}

                {/* AI Grade panel */}
                <div className={`rounded-xl border p-3 ${
                  a.aiGradedAt ? 'border-blue-200 bg-blue-50' : 'border-slate-200 bg-slate-50'
                }`}>
                  {aiTimedOut ? (
                    <p className="text-xs text-slate-500 flex items-center gap-1.5">
                      <Sparkles className="w-3 h-3" /> AI grade unavailable — re-submit to retry
                    </p>
                  ) : aiPending ? (
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500" />
                      AI grading in progress…
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between mb-2">
                        <span className="flex items-center gap-1.5 text-xs font-semibold text-blue-600">
                          <Sparkles className="w-3.5 h-3.5" /> AI Grade
                        </span>
                        <span className="text-base font-black text-blue-700">
                          {a.aiScore}<span className="text-xs text-blue-400 font-normal">/{a.maxScore}</span>
                        </span>
                      </div>
                      {a.aiFeedback && <p className="text-xs text-slate-600 leading-relaxed">{a.aiFeedback}</p>}
                      {a.aiBreakdown && Object.keys(a.aiBreakdown).length > 0 && (
                        <div className="mt-2 space-y-1">
                          {Object.entries(a.aiBreakdown)
                            .filter(([k]) => !['pass1_score','final_score','needs_human_review','verification','score_calculation'].includes(k))
                            .map(([k, v]) => (
                              <div key={k} className="flex gap-2 text-[11px]">
                                <span className="text-blue-600 capitalize font-medium w-24 flex-shrink-0">{k.replace(/_/g, ' ')}:</span>
                                <span className="text-slate-600">{String(v)}</span>
                              </div>
                            ))}
                        </div>
                      )}
                    </>
                  )}
                </div>

              </div>
            );
          })}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !isError && assignments.length === 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center shadow-sm">
          <ClipboardList className="w-10 h-10 text-slate-400 mx-auto mb-3" />
          <p className="text-slate-900 font-medium">No assignments yet</p>
          <p className="text-slate-500 text-sm mt-1">
            Published assignments for your enrolled batches will appear here.
          </p>
        </div>
      )}

      {docViewer}

      {/* Submit Modal */}
      {submitFor && (
        <SubmitModal
          assignment={submitFor}
          onClose={() => setSubmitFor(null)}
          onSuccess={() => {
            setSubmitFor(null);
            void refreshStudentActivity(qc, { kind: 'assignment' });
          }}
          onOpenPdf={(url, title) => openDoc({ url, title })}
        />
      )}
    </div>
  );
}

/* Submit Modal */
function SubmitModal({
  assignment,
  onClose,
  onSuccess,
  onOpenPdf,
}: {
  assignment: StudentAssignment;
  onClose: () => void;
  onSuccess: () => void;
  onOpenPdf?: (url: string, title: string) => void;
}) {
  const [pdfFile, setPdfFile]           = useState<File | null>(null);
  const [zipFile, setZipFile]           = useState<File | null>(null);
  const [pdfConfirmed, setPdfConfirmed] = useState(false);
  const [zipConfirmed, setZipConfirmed] = useState(false);
  const [dragOver, setDragOver]         = useState<'pdf' | 'zip' | null>(null);
  const pdfRef = useRef<HTMLInputElement>(null);
  const zipRef = useRef<HTMLInputElement>(null);

  const isPastDue = assignment.dueDate ? new Date(assignment.dueDate).getTime() < Date.now() : false;

  const canSubmit =
    !isPastDue &&
    (pdfFile !== null || zipFile !== null) &&
    (pdfFile === null || pdfConfirmed) &&
    (zipFile === null || zipConfirmed);

  const submitMut = useMutation({
    mutationFn: async () => {
      const fd = new FormData();
      if (pdfFile) fd.append('pdf', pdfFile);
      if (zipFile) fd.append('zip', zipFile);
      await api.post(`/assignments/${assignment.id}/submit`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    },
    onSuccess: () => {
      toast.success('Assignment submitted successfully!');
      onSuccess();
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg ?? 'Submission failed. Please try again.');
    },
  });

  function handleDrop(e: React.DragEvent, type: 'pdf' | 'zip') {
    e.preventDefault();
    if (isPastDue) return;
    setDragOver(null);
    const file = e.dataTransfer.files[0];
    if (!file) return;
    const name = file.name.toLowerCase();
    if (type === 'pdf') {
      if (name.endsWith('.pdf')) { setPdfFile(file); setPdfConfirmed(false); }
      else toast.error('Please drop a .pdf file');
    } else {
      if (name.endsWith('.zip')) { setZipFile(file); setZipConfirmed(false); }
      else toast.error('Please drop a .zip file');
    }
  }

  function removePdf(e: React.MouseEvent) {
    e.stopPropagation();
    setPdfFile(null);
    setPdfConfirmed(false);
  }

  function removeZip(e: React.MouseEvent) {
    e.stopPropagation();
    setZipFile(null);
    setZipConfirmed(false);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-lg bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-start justify-between px-6 py-5 border-b border-slate-200">
          <div className="min-w-0 pr-3">
            <h2 className="text-lg font-bold text-slate-900">Submit Assignment</h2>
            <p className="text-slate-500 text-sm mt-0.5 truncate">{assignment.title}</p>
            <p className="text-slate-500 text-xs mt-0.5">{[assignment.courseTitle, assignment.batchName].filter(Boolean).join(' · ')}</p>
          </div>
          <button onClick={onClose} className="flex-shrink-0 p-2 hover:bg-slate-100 rounded-lg transition-colors mt-0.5">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        <div className="p-6 space-y-5">

          {/* Due date info */}
          {assignment.dueDate && (
            <div className={`flex items-center gap-2 text-xs rounded-lg px-3 py-2 ${
              isPastDue ? 'bg-rose-50 text-rose-600 border border-rose-200' : 'bg-slate-50 text-slate-600 border border-slate-200'
            }`}>
              <Calendar className="w-3.5 h-3.5" />
              {isPastDue ? 'Past Due:' : 'Due:'} {new Date(assignment.dueDate).toLocaleDateString('en-IN', {
                day: 'numeric', month: 'long', year: 'numeric',
              })}
            </div>
          )}

          {isPastDue ? (
            <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-center">
              <AlertCircle className="w-8 h-8 text-rose-500 mx-auto mb-2" />
              <p className="text-slate-900 font-medium">Submission Closed</p>
              <p className="text-rose-600 text-sm mt-1">
                The due date for this assignment has passed. You can no longer submit or update your files.
              </p>
            </div>
          ) : (
            <>
              <p className="text-xs text-slate-500 flex items-start gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-blue-500" />
                Upload your PDF report, ZIP with code/files, or both. Check the confirmation box for each
                uploaded file, then click Submit.
              </p>

              {/* PDF Upload Zone */}
              <div className="space-y-2">
                <div
                  className={`border-2 border-dashed rounded-xl p-4 cursor-pointer transition-all ${
                    dragOver === 'pdf'
                      ? 'border-blue-400 bg-blue-50'
                      : pdfFile
                      ? 'border-blue-300 bg-blue-50'
                      : 'border-slate-300 hover:border-blue-400 hover:bg-blue-50'
                  }`}
                  onDragOver={(e) => { e.preventDefault(); setDragOver('pdf'); }}
                  onDragLeave={() => setDragOver(null)}
                  onDrop={(e) => handleDrop(e, 'pdf')}
                  onClick={() => pdfRef.current?.click()}
                >
                  <input ref={pdfRef} type="file" accept=".pdf,application/pdf" className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0] ?? null; setPdfFile(f); setPdfConfirmed(false); e.target.value = ''; }} />
                  {pdfFile ? (
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                        <FileText className="w-5 h-5 text-blue-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-slate-900 text-sm font-medium truncate">{pdfFile.name}</p>
                        <p className="text-slate-500 text-xs">{(pdfFile.size / 1024).toFixed(1)} KB · PDF</p>
                      </div>
                      <button type="button" onClick={removePdf}
                        className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-700 transition-colors flex-shrink-0">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
                        <FileText className="w-5 h-5 text-slate-500" />
                      </div>
                      <div>
                        <p className="text-slate-700 text-sm font-medium">PDF File</p>
                        <p className="text-slate-400 text-xs">Drag & drop or click to browse · .pdf</p>
                      </div>
                    </div>
                  )}
                </div>

                {pdfFile && (
                  <label className="flex items-center gap-2.5 cursor-pointer px-1 select-none">
                    <input type="checkbox" checked={pdfConfirmed}
                      onChange={(e) => setPdfConfirmed(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-400 cursor-pointer" />
                    <span className="text-xs text-slate-600">
                      I confirm <span className="text-slate-900 font-medium">{pdfFile.name}</span> is my final PDF submission
                    </span>
                  </label>
                )}
              </div>

              {/* ZIP Upload Zone */}
              <div className="space-y-2">
                <div
                  className={`border-2 border-dashed rounded-xl p-4 cursor-pointer transition-all ${
                    dragOver === 'zip'
                      ? 'border-blue-400 bg-blue-50'
                      : zipFile
                      ? 'border-blue-300 bg-blue-50'
                      : 'border-slate-300 hover:border-blue-400 hover:bg-blue-50'
                  }`}
                  onDragOver={(e) => { e.preventDefault(); setDragOver('zip'); }}
                  onDragLeave={() => setDragOver(null)}
                  onDrop={(e) => handleDrop(e, 'zip')}
                  onClick={() => zipRef.current?.click()}
                >
                  <input ref={zipRef} type="file" accept=".zip,application/zip,application/x-zip-compressed" className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0] ?? null; setZipFile(f); setZipConfirmed(false); e.target.value = ''; }} />
                  {zipFile ? (
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                        <Archive className="w-5 h-5 text-blue-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-slate-900 text-sm font-medium truncate">{zipFile.name}</p>
                        <p className="text-slate-500 text-xs">{(zipFile.size / 1024).toFixed(1)} KB · ZIP</p>
                      </div>
                      <button type="button" onClick={removeZip}
                        className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-700 transition-colors flex-shrink-0">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
                        <Archive className="w-5 h-5 text-slate-500" />
                      </div>
                      <div>
                        <p className="text-slate-700 text-sm font-medium">ZIP File</p>
                        <p className="text-slate-400 text-xs">Drag & drop or click to browse · .zip</p>
                      </div>
                    </div>
                  )}
                </div>

                {zipFile && (
                  <label className="flex items-center gap-2.5 cursor-pointer px-1 select-none">
                    <input type="checkbox" checked={zipConfirmed}
                      onChange={(e) => setZipConfirmed(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-300 text-blue-500 focus:ring-blue-400 cursor-pointer" />
                    <span className="text-xs text-slate-600">
                      I confirm <span className="text-slate-900 font-medium">{zipFile.name}</span> is my final ZIP submission
                    </span>
                  </label>
                )}
              </div>
            </>
          )}

          {assignment.pdfUrl && (
            <button
              type="button"
              onClick={() => onOpenPdf?.(assignment.pdfUrl!, assignment.title)}
              className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 transition-colors w-fit"
            >
              <Eye className="w-3.5 h-3.5" />
              View assignment instructions
            </button>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 pb-6 flex gap-3">
          <button onClick={onClose} disabled={submitMut.isPending}
            className="flex-1 py-2.5 text-sm font-medium text-slate-600 hover:text-slate-900 border border-slate-200 hover:border-slate-300 rounded-xl transition-colors disabled:opacity-40">
            {isPastDue ? 'Close' : 'Cancel'}
          </button>
          {!isPastDue && (
            <button onClick={() => submitMut.mutate()} disabled={!canSubmit || submitMut.isPending}
              className="flex-1 py-2.5 text-sm font-semibold bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white rounded-xl transition-colors flex items-center justify-center gap-2">
              {submitMut.isPending
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Uploading to cloud...</>
                : <><Upload className="w-4 h-4" /> Submit Assignment</>}
            </button>
          )}
        </div>

        {!isPastDue && (pdfFile || zipFile) && !canSubmit && !submitMut.isPending && (
          <p className="px-6 pb-4 text-xs text-blue-600 text-center -mt-2">
            Check the confirmation box{pdfFile && zipFile ? 'es' : ''} above to enable submit
          </p>
        )}
      </div>
    </div>
  );
}
