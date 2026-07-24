import { useState, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ClipboardCheck, Clock, CheckCircle, Calendar, Upload, FileText,
  ExternalLink, Award, AlertCircle, X, Loader2, CheckCircle2,
} from 'lucide-react';
import { toast } from 'sonner';
import api from '../../../lib/axios';
import { useAuth } from '../../../store/AuthContext';
import { refreshStudentActivity } from '../../../lib/lmsCache';
import { useInAppViewer } from '../../components/ui/InAppDocumentViewer';
import AssessmentAttempt from './AssessmentAttempt';

interface StudentAssessment {
  id: string;
  title: string;
  description?: string | null;
  courseTitle: string;
  batchName: string;
  dueDate: string | null;
  totalMarks: number;
  partAMarks: number;
  partBMarks: number;
  partBApproachPct: number;
  partBVivaPct: number;
  partAQuestions: any[] | null;
  status: 'PUBLISHED';
  pdfUrl: string | null;
  pdfFilename: string | null;
  submissionId: string | null;
  submissionStatus: 'SUBMITTED' | 'GRADED' | null;
  submissionPdfUrl: string | null;
  submittedAt: string | null;
  partAScore: number | null;
  approachScore: number | null;
  vivaScore: number | null;
  solutionScore: number | null;
  totalScore: number | null;
  feedback: string | null;
  gradedAt: string | null;
}

export default function MyAssessmentsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [attemptFor, setAttemptFor] = useState<StudentAssessment | null>(null);
  const [submitFor, setSubmitFor] = useState<StudentAssessment | null>(null);

  const [pdf, setPdf] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [submitting, setSubmitting] = useState(false);
  const { open: openDoc, viewer: docViewer } = useInAppViewer();

  const { data: assessments = [], isLoading } = useQuery<StudentAssessment[]>({
    queryKey: ['student-assessments'],
    queryFn: async () => {
      const { data } = await api.get('/assessments/student/list');
      return data.data ?? [];
    },
    enabled: !!user,
  });

  const pending = assessments.filter((a) =>
    !a.submissionStatus ||
    (a.submissionStatus === 'SUBMITTED' && !a.submissionPdfUrl),
  );
  const submitted = assessments.filter((a) =>
    (a.submissionStatus === 'SUBMITTED' && !!a.submissionPdfUrl) ||
    a.submissionStatus === 'GRADED',
  );

  function dueBadge(dueDate: string | null) {
    if (!dueDate) return { label: 'No due date', cls: 'bg-slate-100 text-slate-600' };
    const diff = Math.ceil((new Date(dueDate).getTime() - Date.now()) / 86400000);
    if (diff < 0)  return { label: 'Overdue',        cls: 'bg-rose-100 text-rose-600 border border-rose-200' };
    if (diff <= 2) return { label: `Due in ${diff}d`, cls: 'bg-orange-100 text-orange-600 border border-orange-200' };
    return           { label: `Due in ${diff}d`,     cls: 'bg-blue-100 text-blue-600 border border-blue-200' };
  }

  function pickFile(f: File | null | undefined) {
    if (!f) return;
    if (f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')) {
      if (f.size > 20 * 1024 * 1024) { toast.error('PDF too large — max 20 MB'); return; }
      setPdf(f);
    } else {
      toast.error('Only PDF files accepted');
    }
  }

  async function submitPartA(answers: Record<string, string>) {
    if (!attemptFor || submitting) return;
    setSubmitting(true);
    try {
      const answersArr = Object.entries(answers).map(([qId, ans]) => ({ questionId: qId, selectedAnswer: ans }));
      await api.post(`/assessments/${attemptFor.id}/submit-part-a`, { partAAnswers: answersArr });
      toast.success('Part A submitted successfully!');
      setAttemptFor(null);
      await refreshStudentActivity(qc, { kind: 'assessment' });
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? 'Submission failed.');
    } finally {
      setSubmitting(false);
    }
  }

  async function finalSubmit() {
    if (!submitFor) return;
    if (!pdf) { toast.error('Please attach your answer PDF'); return; }

    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append('file', pdf);
      await api.post(`/assessments/${submitFor.id}/submit`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      toast.success('Assessment Part B submitted successfully!');
      setSubmitFor(null);
      setPdf(null);
      await refreshStudentActivity(qc, { kind: 'assessment' });
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? 'Submission failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (attemptFor) {
    return (
      <AssessmentAttempt
        assessment={attemptFor}
        onCancel={() => setAttemptFor(null)}
        onSave={(answers) => submitPartA(answers)}
      />
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => <div key={i} className="h-28 rounded-2xl bg-slate-200 animate-pulse" />)}
      </div>
    );
  }

  return (
    <div className="space-y-6 relative">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">My Assessments</h1>
        <p className="text-slate-500 text-sm mt-0.5">View and submit your assessments. Part A (MCQ) and Part B (PDF) can be submitted separately.</p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Total',     value: assessments.length, color: 'text-blue-600',   bg: 'bg-blue-50 border-blue-200'   },
          { label: 'Pending',   value: pending.length,     color: 'text-blue-600',  bg: 'bg-blue-50 border-blue-200'   },
          { label: 'Submitted', value: submitted.length,   color: 'text-blue-700',   bg: 'bg-blue-50 border-blue-200'   },
        ].map((s) => (
          <div key={s.label} className={`rounded-xl p-3 text-center border ${s.bg}`}>
            <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
            <p className="text-xs text-slate-600 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Pending */}
      {pending.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-widest mb-3 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-orange-500" /> Pending Submission
          </h2>
          <div className="space-y-3">
            {pending.map((a) => {
              const due = dueBadge(a.dueDate);
              const hasPartA = !!a.partAQuestions?.length;
              const mcqDone = a.partAScore !== null;
              return (
                <div key={a.id} className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold text-slate-900 truncate">{a.title}</h3>
                      <p className="text-xs text-slate-500 mt-0.5">{[a.courseTitle, a.batchName].filter(Boolean).join(' · ')}</p>
                      {a.description && <p className="text-xs text-slate-500 mt-1 line-clamp-2">{a.description}</p>}
                    </div>
                    <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${due.cls}`}>
                        {a.dueDate ? <span className="flex items-center gap-1"><Calendar className="w-2.5 h-2.5" />{due.label}</span> : due.label}
                      </span>
                      <span className="text-[10px] text-slate-500">{a.totalMarks} marks</span>
                    </div>
                  </div>

                  {/* Part breakdown */}
                  <div className="flex gap-2 flex-wrap items-center">
                    {hasPartA && (
                      <span className="text-[10px] bg-blue-100 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full font-medium">
                        Part A (MCQ) — {a.partAMarks}m
                      </span>
                    )}
                    <span className="text-[10px] bg-blue-100 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full font-medium">
                      Part B (Practical) — {a.partBMarks}m
                    </span>
                    {mcqDone && (
                      <span className="text-[10px] bg-blue-100 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full font-medium flex items-center gap-1 ml-2">
                        <CheckCircle2 className="w-3 h-3" /> Part A Submitted ({a.partAScore}/{a.partAMarks})
                      </span>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-3 pt-2">
                    {a.pdfUrl && (
                      <button
                        type="button"
                        onClick={() => openDoc({ url: a.pdfUrl!, title: `${a.title} — Question Paper` })}
                        className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 font-medium"
                      >
                        <FileText className="w-3.5 h-3.5" /> View Question Paper
                      </button>
                    )}
                    <div className="ml-auto flex items-center gap-2">
                      {hasPartA && !mcqDone && (
                        <button
                          onClick={() => setAttemptFor(a)}
                          className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl transition-colors shadow-sm"
                        >
                          Start MCQ
                        </button>
                      )}
                      <button
                        onClick={() => { setSubmitFor(a); setPdf(null); }}
                        className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl transition-colors shadow-sm"
                      >
                        Submit Part B (PDF)
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Submitted */}
      {submitted.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-widest mb-3 flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-blue-500" /> Submitted
          </h2>
          <div className="space-y-3">
            {submitted.map((a) => (
              <div key={a.id} className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold text-slate-900 truncate">{a.title}</h3>
                    <p className="text-xs text-slate-500 mt-0.5">{[a.courseTitle, a.batchName].filter(Boolean).join(' · ')}</p>
                    {a.submittedAt && (
                      <p className="text-xs text-slate-500 flex items-center gap-1 mt-1">
                        <Clock className="w-3 h-3" /> Submitted {new Date(a.submittedAt).toLocaleString()}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      a.submissionStatus === 'GRADED'
                        ? 'bg-blue-100 text-blue-700 border border-blue-200'
                        : 'bg-blue-100 text-blue-700 border border-blue-200'
                    }`}>
                      {a.submissionStatus === 'GRADED' ? 'Graded' : 'Awaiting Grade'}
                    </span>
                  </div>
                </div>

                {/* Score breakdown when graded */}
                {a.submissionStatus === 'GRADED' && (
                  <div className="bg-slate-50 rounded-xl p-3 border border-slate-200">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                        <Award className="w-3.5 h-3.5 text-blue-500" /> Score Breakdown
                      </span>
                      <span className={`text-lg font-black ${(a.totalScore ?? 0) >= a.totalMarks * 0.6 ? 'text-blue-600' : 'text-red-500'}`}>
                        {Number(a.totalScore ?? 0).toFixed(1)}<span className="text-xs text-slate-500">/{a.totalMarks}</span>
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="bg-blue-50 rounded-lg p-2 border border-blue-100">
                        <p className="text-slate-500 text-[10px]">Part A (MCQ)</p>
                        <p className="font-bold text-blue-700 mt-0.5">
                          {a.partAScore ?? '—'}<span className="text-slate-500 font-normal">/{a.partAMarks}</span>
                        </p>
                      </div>
                      <div className="bg-blue-50 rounded-lg p-2 border border-blue-100">
                        <p className="text-slate-500 text-[10px]">Approach ({a.partBApproachPct}%)</p>
                        <p className="font-bold text-orange-700 mt-0.5">
                          {a.approachScore ?? '—'}<span className="text-slate-500 font-normal">/{(a.partBMarks * a.partBApproachPct / 100).toFixed(1)}</span>
                        </p>
                      </div>
                      <div className="bg-blue-50 rounded-lg p-2 border border-blue-100">
                        <p className="text-slate-500 text-[10px]">Correctness</p>
                        <p className="font-bold text-blue-700 mt-0.5">
                          {a.solutionScore ?? '—'}
                        </p>
                      </div>
                      <div className="bg-blue-50 rounded-lg p-2 border border-blue-100">
                        <p className="text-slate-500 text-[10px]">Viva ({a.partBVivaPct}%)</p>
                        <p className="font-bold text-orange-700 mt-0.5">
                          {a.vivaScore ?? '—'}<span className="text-slate-500 font-normal">/{(a.partBMarks * a.partBVivaPct / 100).toFixed(1)}</span>
                        </p>
                      </div>
                    </div>
                    {a.feedback && (
                      <p className="mt-2 text-xs text-slate-600 bg-white rounded-lg p-2 border border-slate-200">
                        <strong className="text-slate-700">Feedback:</strong> {a.feedback}
                      </p>
                    )}
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center gap-2 pt-1">
                  {a.pdfUrl && (
                    <button
                      type="button"
                      onClick={() => openDoc({ url: a.pdfUrl!, title: `${a.title} — Question Paper` })}
                      className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 font-medium"
                    >
                      <FileText className="w-3.5 h-3.5" /> Question Paper
                    </button>
                  )}
                  {a.submissionPdfUrl && (
                    <button
                      type="button"
                      onClick={() => openDoc({ url: a.submissionPdfUrl!, title: `${a.title} — My Submission` })}
                      className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 font-medium ml-auto"
                    >
                      <FileText className="w-3.5 h-3.5" /> My Submission
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* PDF Submission Modal */}
      {submitFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden p-6 space-y-4">
            <div className="flex items-center justify-between mb-2">
              <div>
                <h3 className="font-bold text-slate-900 text-lg">Submit Part B (PDF)</h3>
                <p className="text-xs text-slate-500 mt-0.5">{submitFor.title}</p>
              </div>
              <button onClick={() => setSubmitFor(null)} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div
              onClick={() => !pdf && fileRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-6 text-center transition-all ${pdf ? '' : 'cursor-pointer'} ${
                dragOver ? 'border-blue-400 bg-blue-50' : pdf ? 'border-blue-400 bg-blue-50' : 'border-slate-300 hover:border-blue-400 hover:bg-blue-50'
              }`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); pickFile(e.dataTransfer.files[0]); }}
            >
              <input ref={fileRef} type="file" accept="application/pdf,.pdf" className="hidden"
                onChange={(e) => { pickFile(e.target.files?.[0]); e.target.value = ''; }} />
              {pdf ? (
                <div className="flex items-center justify-center gap-3">
                  <FileText className="w-8 h-8 text-orange-500" />
                  <div className="text-left">
                    <p className="font-semibold text-slate-900 text-sm truncate max-w-[200px]">{pdf.name}</p>
                    <p className="text-xs text-slate-500">{(pdf.size / 1024).toFixed(1)} KB</p>
                    <div className="flex gap-3 mt-1">
                      <button type="button" onClick={() => fileRef.current?.click()} className="text-xs text-blue-600 hover:text-blue-700">Change</button>
                      <button type="button" onClick={() => setPdf(null)} className="text-xs text-red-500 hover:text-red-600">Remove</button>
                    </div>
                  </div>
                </div>
              ) : (
                <div>
                  <Upload className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                  <p className="text-sm text-slate-600">Drag & drop your answer PDF here</p>
                  <p className="text-xs text-slate-400 mt-1">or click to browse</p>
                </div>
              )}
            </div>

            <div className="flex gap-3 pt-2">
              <button onClick={() => setSubmitFor(null)} className="flex-1 py-2.5 border border-slate-200 text-slate-600 text-sm font-medium rounded-xl hover:bg-slate-50 transition-colors">
                Cancel
              </button>
              <button onClick={finalSubmit} disabled={submitting || !pdf}
                className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
                {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Submitting...</> : 'Final Submit'}
              </button>
            </div>
          </div>
        </div>
      )}

      {assessments.length === 0 && (
        <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-slate-300 shadow-sm">
          <ClipboardCheck className="w-12 h-12 text-slate-400 mx-auto mb-3" />
          <p className="text-slate-700 font-medium">No assessments assigned yet</p>
          <p className="text-slate-500 text-xs mt-1">Check back when your trainer publishes an assessment</p>
        </div>
      )}

      {docViewer}
    </div>
  );
}
