import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { HelpCircle, CheckCircle, Clock, Award, XCircle, Play, AlertCircle } from 'lucide-react';
import api from '../../../lib/axios';
import { useAuth } from '../../../store/AuthContext';

function quizLink(enrollmentId: string, quizId: string, courseId?: string) {
  const qs = courseId ? `?courseId=${courseId}` : '';
  return `/my-courses/${enrollmentId}/quiz/${quizId}${qs}`;
}

export default function MyQuizzesPage() {
  const { user } = useAuth();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['student-dashboard'],
    queryFn: async () => {
      const { data } = await api.get('/dashboard/student');
      return data.data;
    },
    enabled: !!user,
  });

  const quizzes = data?.quizzes ?? { pending: 0, completed: 0, recentAttempts: [], pendingList: [] };

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1,2,3].map(i => <div key={i} className="h-24 rounded-2xl bg-slate-200 animate-pulse" />)}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-sm text-rose-600 flex items-center gap-2">
        <AlertCircle className="w-4 h-4 flex-shrink-0" />
        Failed to load quizzes. Refresh to try again.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">My Quizzes</h1>
        <p className="text-slate-500 text-sm mt-1">Your quiz history and pending attempts</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
            <Clock className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <p className="text-2xl font-bold text-slate-900">{quizzes.pending}</p>
            <p className="text-xs text-slate-500">Pending</p>
          </div>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
            <CheckCircle className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <p className="text-2xl font-bold text-slate-900">{quizzes.completed}</p>
            <p className="text-xs text-slate-500">Completed</p>
          </div>
        </div>
      </div>

      {/* Pending quizzes */}
      {(quizzes.pendingList?.length ?? 0) > 0 && (
        <div>
          <h2 className="text-base font-semibold text-slate-900 mb-3">Pending Quizzes</h2>
          <div className="space-y-3">
            {quizzes.pendingList.map((q: any) => (
              <Link
                key={q.quizId}
                to={quizLink(q.enrollmentId, q.quizId, q.courseId)}
                className="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between gap-4 shadow-sm hover:border-indigo-300 hover:bg-indigo-50/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-indigo-50 flex items-center justify-center">
                    <Play className="w-4 h-4 text-indigo-600" />
                  </div>
                  <div>
                    <p className="text-slate-900 text-sm font-medium">{q.quizTitle}</p>
                    <p className="text-slate-500 text-xs">
                      {q.courseTitle}
                      {q.moduleTitle && (
                        <span> • {q.sessionNumber ? `S${q.sessionNumber}: ` : ''}{q.moduleTitle}</span>
                      )}
                    </p>
                  </div>
                </div>
                <span className="text-xs font-semibold text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full">
                  Start Quiz
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Recent attempts */}
      <div>
        <h2 className="text-base font-semibold text-slate-900 mb-3">Recent Attempts</h2>
        {quizzes.recentAttempts.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center shadow-sm">
            <HelpCircle className="w-10 h-10 text-blue-400 mx-auto mb-2" />
            <p className="text-slate-900 font-medium">No attempts yet</p>
            <p className="text-slate-500 text-sm">Complete a quiz to see your results here.</p>
            {quizzes.pending > 0 && (
              <Link to="/my-courses" className="inline-block mt-3 text-sm text-indigo-600 hover:text-indigo-800 font-medium">
                Browse courses to find quizzes
              </Link>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {quizzes.recentAttempts.map((a: any) => {
              const passed = a.passed === true;
              const failed = a.passed === false;
              return (
              <div key={a.id} className="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between gap-4 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                    passed ? 'bg-blue-50' : failed ? 'bg-rose-50' : 'bg-slate-50'
                  }`}>
                    {passed
                      ? <CheckCircle className="w-4 h-4 text-blue-600" />
                      : failed
                        ? <XCircle className="w-4 h-4 text-rose-500" />
                        : <Clock className="w-4 h-4 text-slate-500" />
                    }
                  </div>
                  <div>
                    <p className="text-slate-900 text-sm font-medium">{a.quizTitle}</p>
                    <p className="text-slate-500 text-xs truncate max-w-[200px] sm:max-w-md">
                      {a.courseTitle && <span>{a.courseTitle} • </span>}
                      {a.moduleTitle && (
                        <span>{a.sessionNumber ? `S${a.sessionNumber}: ` : ''}{a.moduleTitle} • </span>
                      )}
                      {a.submittedAt
                        ? new Date(a.submittedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
                        : '—'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <div className="flex items-center gap-1">
                    <Award className="w-4 h-4 text-orange-500" />
                    <span className="text-slate-900 font-semibold text-sm">{a.score ?? '—'}</span>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    passed
                      ? 'bg-blue-100 text-blue-700 border border-blue-200'
                      : failed
                        ? 'bg-rose-100 text-rose-600 border border-rose-200'
                        : 'bg-slate-100 text-slate-600 border border-slate-200'
                  }`}>
                    {passed ? 'Passed' : failed ? 'Failed' : 'Submitted'}
                  </span>
                </div>
              </div>
            );})}
          </div>
        )}
      </div>
    </div>
  );
}
