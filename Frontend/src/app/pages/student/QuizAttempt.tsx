import { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import {
  ChevronLeft, CheckCircle2, XCircle, Clock, Award, Loader2,
  ChevronRight, ChevronLeft as ChevLeft, Trophy, AlertCircle,
} from 'lucide-react';
import api from '../../../lib/axios';
import { useAuth } from '../../../store/AuthContext';
import { refreshStudentActivity } from '../../../lib/lmsCache';
import { toast } from 'sonner';

interface Question {
  id: string;
  questionText: string;
  questionType: string;
  options: string[];
  points: number;
  difficulty: string;
}

interface AttemptStart {
  attemptId: string;
  attemptNumber: number;
  quizTitle?: string;
  timeLimitMinutes: number | null;
  passingScore: number;
  questions: Question[];
}

interface AttemptResult {
  attemptId: string;
  score: number;
  passed: boolean;
  earnedPoints: number;
  totalPoints: number;
}

export default function QuizAttemptPage() {
  const { quizId, enrollmentId } = useParams<{ quizId: string; enrollmentId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const courseId = searchParams.get('courseId');
  const backUrl = `/my-courses/${enrollmentId}${courseId ? `?courseId=${courseId}` : ''}`;
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [attempt, setAttempt] = useState<AttemptStart | null>(null);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<AttemptResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [reviewMode, setReviewMode] = useState<Record<string, { isCorrect: boolean; correctAnswer: string }> | null>(null);

  const [quizTitle, setQuizTitle] = useState<string>('Quiz');
  const startedRef = useRef(false);

  useEffect(() => {
    if (!quizId || startedRef.current) return;
    startedRef.current = true;
    api.post(`/quizzes/${quizId}/attempt`, {})
      .then(({ data }) => {
        const attemptData = data.data as AttemptStart;
        if (!attemptData.questions?.length) {
          toast.error('This quiz has no questions yet. Contact your trainer.');
          navigate(backUrl);
          return;
        }
        setAttempt(attemptData);
        if (attemptData.quizTitle) setQuizTitle(attemptData.quizTitle);
        if (attemptData.timeLimitMinutes) {
          setTimeLeft(attemptData.timeLimitMinutes * 60);
        }
      })
      .catch((e) => {
        const msg = e?.response?.data?.message ?? 'Failed to start quiz';
        toast.error(msg);
        navigate(backUrl);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quizId]);

  useEffect(() => {
    if (timeLeft === null || timeLeft <= 0 || result) return;
    const t = setInterval(() => {
      setTimeLeft((prev) => (prev !== null ? prev - 1 : null));
    }, 1000);
    return () => clearInterval(t);
  }, [timeLeft, result]);

  useEffect(() => {
    if (timeLeft === 0 && attempt && !result) {
      submitAttempt();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft]);

  function selectAnswer(questionId: string, answer: string) {
    if (result) return;
    setAnswers((prev) => ({ ...prev, [questionId]: answer }));
  }

  async function submitAttempt() {
    if (!attempt || submitting || result) return;
    setSubmitting(true);
    try {
      const payload = attempt.questions.map((q) => ({
        questionId: q.id,
        selectedAnswer: answers[q.id] ?? '',
      }));
      const { data } = await api.post(`/quizzes/attempts/${attempt.attemptId}/submit`, {
        answers: payload,
      });
      setResult(data.data);

      // Optimistic: patch quiz list caches so Course / My Quizzes update instantly
      const score = data.data.score as number;
      const passed = data.data.passed as boolean;
      queryClient.setQueriesData({ queryKey: ['enrollment-quizzes'] }, (old: any) => {
        if (!Array.isArray(old)) return old;
        return old.map((q: any) => {
          if (String(q.id) !== String(quizId)) return q;
          const prevBest = q.bestAttempt;
          const isBetter = !prevBest || score >= (prevBest.score ?? 0);
          return {
            ...q,
            attemptsUsed: (q.attemptsUsed ?? 0) + 1,
            bestAttempt: isBetter
              ? { score, passed }
              : prevBest,
          };
        });
      });
      queryClient.setQueriesData({ queryKey: ['student-dashboard'] }, (old: any) => {
        if (!old?.quizzes) return old;
        const pendingList = (old.quizzes.pendingList ?? []).filter(
          (q: any) => String(q.quizId) !== String(quizId),
        );
        const recentAttempts = [
          {
            id: attempt.attemptId,
            quizId,
            quizTitle,
            score,
            passed,
            submittedAt: new Date().toISOString(),
            courseTitle: old.quizzes.recentAttempts?.[0]?.courseTitle ?? '',
          },
          ...(old.quizzes.recentAttempts ?? []),
        ].slice(0, 10);
        return {
          ...old,
          quizzes: {
            ...old.quizzes,
            pending: Math.max(0, (old.quizzes.pending ?? 0) - 1),
            completed: (old.quizzes.completed ?? 0) + 1,
            pendingList,
            recentAttempts,
          },
        };
      });

      // Confirm with server so status stays correct after navigate-back
      await refreshStudentActivity(queryClient, {
        kind: 'quiz',
        enrollmentId: enrollmentId,
        courseId: courseId ?? undefined,
      });

      try {
        const submission = {
          quizId,
          quizTitle,
          attemptId: attempt.attemptId,
          attemptNumber: attempt.attemptNumber,
          studentName: user?.name ?? 'Unknown',
          studentEmail: user?.email ?? '',
          score: data.data.score,
          passed: data.data.passed,
          earnedPoints: data.data.earnedPoints,
          totalPoints: data.data.totalPoints,
          submittedAt: new Date().toISOString(),
          answers: attempt.questions.map((q) => ({
            question: q.questionText,
            selectedAnswer: answers[q.id] ?? '',
            options: q.options,
          })),
        };
        const key = 'lms_quiz_submissions';
        const existing = JSON.parse(localStorage.getItem(key) ?? '[]');
        existing.push(submission);
        localStorage.setItem(key, JSON.stringify(existing));
      } catch {}

      try {
        const { data: review } = await api.get(`/quizzes/attempts/${attempt.attemptId}/review`);
        const reviewData: Record<string, { isCorrect: boolean; correctAnswer: string }> = {};
        for (const a of review.data ?? []) {
          reviewData[a.questionId] = {
            isCorrect: a.isCorrect,
            correctAnswer: a.correctAnswer,
          };
        }
        setReviewMode(reviewData);
      } catch {}
      toast.success(data.data.passed ? 'Congratulations — you passed!' : 'Quiz submitted');
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? 'Failed to submit quiz');
    } finally {
      setSubmitting(false);
    }
  }

  const answeredCount = useMemo(() => Object.keys(answers).length, [answers]);

  if (!attempt) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-4">
        <Loader2 className="w-10 h-10 text-orange-500 animate-spin" />
        <p className="text-slate-500 text-sm">Preparing your quiz…</p>
      </div>
    );
  }

  // Result view
  if (result) {
    const pct = result.score;
    const accent = result.passed ? '#3b82f6' : '#f43f5e';
    return (
      <div className="min-h-screen bg-slate-50 py-10 px-6">
        <div className="max-w-2xl mx-auto space-y-6">
          {/* Result card */}
          <div
            className="rounded-3xl border-2 p-8 text-center bg-white shadow-sm"
            style={{ borderColor: accent + '60' }}
          >
            <div
              className="w-20 h-20 mx-auto rounded-full flex items-center justify-center mb-4"
              style={{ background: accent + '15', border: `2px solid ${accent}60` }}
            >
              {result.passed
                ? <Trophy className="w-10 h-10" style={{ color: accent }} />
                : <XCircle className="w-10 h-10" style={{ color: accent }} />
              }
            </div>
            <h1 className="text-3xl font-bold text-slate-900 mb-2">
              {result.passed ? 'Congratulations!' : 'Better luck next time'}
            </h1>
            <p className="text-slate-500 text-sm mb-6">
              {quizTitle} — Attempt #{attempt.attemptNumber}
            </p>

            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="rounded-xl bg-slate-50 border border-slate-200 p-4">
                <p className="text-3xl font-bold" style={{ color: accent }}>{pct}%</p>
                <p className="text-xs text-slate-500 mt-1">Score</p>
              </div>
              <div className="rounded-xl bg-slate-50 border border-slate-200 p-4">
                <p className="text-3xl font-bold text-slate-900">{result.earnedPoints}/{result.totalPoints}</p>
                <p className="text-xs text-slate-500 mt-1">Points</p>
              </div>
              <div className="rounded-xl bg-slate-50 border border-slate-200 p-4">
                <p className="text-3xl font-bold text-slate-900">{attempt.passingScore}%</p>
                <p className="text-xs text-slate-500 mt-1">Required</p>
              </div>
            </div>

            <div className="flex gap-3 justify-center">
              <Link
                to={backUrl}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold border transition-all bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100"
              >
                <ChevronLeft className="w-4 h-4" /> Back to Course
              </Link>
            </div>
          </div>

          {/* Review section */}
          {reviewMode && (
            <div className="space-y-3">
              <h2 className="text-base font-semibold text-slate-900">Review your answers</h2>
              {attempt.questions.map((q, idx) => {
                const myAns = answers[q.id];
                const rev = reviewMode[q.id];
                const wasCorrect = rev?.isCorrect;
                const wasWrong = rev && !wasCorrect;
                return (
                  <div key={q.id} className="rounded-2xl border border-slate-200 bg-white shadow-sm p-5">
                    <div className="flex items-start gap-3 mb-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${
                        wasCorrect ? 'bg-emerald-100 text-emerald-700' :
                        wasWrong ? 'bg-rose-100 text-rose-600' :
                        'bg-slate-100 text-slate-500'
                      }`}>
                        {idx + 1}
                      </div>
                      <p className="text-sm text-slate-900 font-medium flex-1">{q.questionText}</p>
                      {wasCorrect && <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />}
                      {wasWrong && <XCircle className="w-5 h-5 text-rose-500 flex-shrink-0" />}
                    </div>
                    <div className="space-y-2 ml-11">
                      {q.options.map((opt, i) => {
                        const letter = String.fromCharCode(65 + i);
                        const isMine = myAns === opt;
                        const isTheCorrectOne = rev?.correctAnswer === opt;
                        
                        let optionStyle = 'bg-slate-50 border-slate-200 text-slate-600';
                        if (isMine && wasCorrect) {
                          optionStyle = 'bg-emerald-50 border-emerald-300 text-emerald-800';
                        } else if (isMine && wasWrong) {
                          optionStyle = 'bg-rose-50 border-rose-300 text-rose-800';
                        } else if (isTheCorrectOne) {
                          optionStyle = 'bg-emerald-50 border-emerald-300 text-emerald-900';
                        }

                        return (
                          <div key={i} className={`px-3 py-2 rounded-lg text-sm border flex items-center justify-between ${optionStyle}`}>
                            <div>
                              <span className="font-mono mr-2 opacity-60">{letter}.</span> {opt}
                            </div>
                            {isTheCorrectOne && !isMine && (
                              <div className="flex items-center gap-1 text-emerald-700 text-xs font-bold bg-emerald-100 px-2 py-1 rounded-md">
                                <CheckCircle2 className="w-3.5 h-3.5" /> Correct Answer
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Attempt mode
  const q = attempt.questions[currentIdx];
  const myAnswer = answers[q.id];
  const isLast = currentIdx === attempt.questions.length - 1;

  return (
    <div className="min-h-screen bg-slate-50 py-6 px-6">
      <div className="max-w-3xl mx-auto space-y-5">

        {/* Top bar */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <Link to={backUrl} className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900 transition-colors">
            <ChevronLeft className="w-4 h-4" /> Exit quiz
          </Link>
          <div className="flex items-center gap-3">
            {timeLeft !== null && (
              <span className={`flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-full border ${
                timeLeft < 60
                  ? 'bg-rose-50 text-rose-600 border-rose-200'
                  : 'bg-blue-50 text-blue-600 border-blue-200'
              }`}>
                <Clock className="w-3.5 h-3.5" />
                {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, '0')}
              </span>
            )}
            <span className="text-sm text-slate-500">
              <span className="text-slate-900 font-bold">{answeredCount}</span> / {attempt.questions.length} answered
            </span>
          </div>
        </div>

        {/* Quiz title */}
        {quizTitle && (
          <div className="text-center">
            <h1 className="text-xl font-bold text-slate-900">{quizTitle}</h1>
            <p className="text-xs text-slate-500 mt-1">
              Pass: {attempt.passingScore}% · Attempt #{attempt.attemptNumber}
            </p>
          </div>
        )}

        {/* Question progress */}
        <div className="flex gap-1.5">
          {attempt.questions.map((qq, i) => (
            <button
              key={qq.id}
              onClick={() => setCurrentIdx(i)}
              className={`flex-1 h-1.5 rounded-full transition-all ${
                i === currentIdx
                  ? 'bg-blue-600'
                  : answers[qq.id]
                    ? 'bg-blue-400 hover:bg-blue-500'
                    : 'bg-slate-200 hover:bg-slate-300'
              }`}
              title={`Question ${i + 1}${answers[qq.id] ? ' (answered)' : ''}`}
            />
          ))}
        </div>

        {/* Question card */}
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-6">
          <div className="flex items-start gap-3 mb-5">
            <div className="w-10 h-10 rounded-xl bg-blue-100 border border-blue-200 flex items-center justify-center text-blue-700 font-bold flex-shrink-0">
              {currentIdx + 1}
            </div>
            <div className="flex-1">
              <p className="text-base text-slate-900 leading-relaxed">{q.questionText}</p>
              <div className="flex items-center gap-3 mt-2 flex-wrap">
                <span className="text-xs text-slate-500 flex items-center gap-1">
                  <Award className="w-3 h-3" /> {q.points} pt{q.points !== 1 ? 's' : ''}
                </span>
                <span className="text-[10px] uppercase tracking-wider text-slate-500 px-2 py-0.5 rounded-full bg-slate-100 border border-slate-200">
                  {q.difficulty}
                </span>
              </div>
            </div>
          </div>

          <div className="space-y-2.5">
            {q.options.map((opt, i) => {
              const letter = String.fromCharCode(65 + i);
              const isSelected = myAnswer === opt;
              return (
                <button
                  key={i}
                  onClick={() => selectAnswer(q.id, opt)}
                  className={`w-full text-left px-4 py-3.5 rounded-xl border transition-all flex items-center gap-3 ${
                    isSelected
                      ? 'bg-blue-50 border-blue-400 text-slate-900 shadow-sm'
                      : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-blue-50 hover:border-blue-300'
                  }`}
                >
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold flex-shrink-0 transition-all ${
                    isSelected ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-600'
                  }`}>
                    {letter}
                  </div>
                  <span className="text-sm leading-relaxed flex-1">{opt}</span>
                  {isSelected && <CheckCircle2 className="w-5 h-5 text-blue-600 flex-shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Nav buttons */}
        <div className="flex items-center justify-between gap-3">
          <button
            onClick={() => setCurrentIdx(Math.max(0, currentIdx - 1))}
            disabled={currentIdx === 0}
            className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            <ChevLeft className="w-4 h-4" /> Previous
          </button>

          {isLast ? (
            <button
              onClick={() => {
                if (answeredCount < attempt.questions.length) {
                  if (!confirm(`You've only answered ${answeredCount}/${attempt.questions.length} questions. Submit anyway?`)) return;
                }
                submitAttempt();
              }}
              disabled={submitting}
              className="flex items-center gap-1.5 px-5 py-2.5 text-sm font-bold text-white bg-blue-600 rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-all shadow-sm"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              Submit Quiz
            </button>
          ) : (
            <button
              onClick={() => setCurrentIdx(Math.min(attempt.questions.length - 1, currentIdx + 1))}
              className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-all"
            >
              Next <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>

        {answeredCount < attempt.questions.length && isLast && (
          <div className="flex items-center gap-2 text-xs text-orange-700 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
            <span>{attempt.questions.length - answeredCount} unanswered question{attempt.questions.length - answeredCount !== 1 ? 's' : ''}</span>
          </div>
        )}
      </div>
    </div>
  );
}
