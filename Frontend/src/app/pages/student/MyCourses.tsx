import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { BookOpen, Users, TrendingUp, ChevronRight, GraduationCap } from 'lucide-react';
import api from '../../../lib/axios';
import { useAuth } from '../../../store/AuthContext';
import { Skeleton } from '../../components/ui/skeleton';
import { EmptyState } from '../../components/ui/EmptyState';
import { AnimatedNumber } from '../../components/ui/AnimatedNumber';

interface EnrollmentItem {
  enrollmentId: string;
  courseId: string;
  courseTitle: string;
  courseCategory: string;
  colorToken: string;
  batchId: string;
  batchName: string;
  batchStatus: string;
  trainerName: string | null;
  completionPct: number;
  enrolledAt: string;
}

const COLOR_MAP: Record<string, string> = {
  cyan:   '#0ea5e9',
  purple: '#8b5cf6',
  indigo: '#6366f1',
  amber:  '#f59e0b',
  sky:    '#0ea5e9',
  rose:   '#f43f5e',
  blue:   '#3b82f6',
  teal:   '#14b8a6',
  green:  '#22c55e',
  orange: '#f97316',
};

const GRADIENT_MAP: Record<string, string> = {
  cyan:   'from-sky-50 to-blue-50',
  purple: 'from-violet-50 to-indigo-50',
  indigo: 'from-indigo-50 to-blue-50',
  amber:  'from-amber-50 to-orange-50',
  sky:    'from-sky-50 to-cyan-50',
  rose:   'from-rose-50 to-pink-50',
  blue:   'from-blue-50 to-indigo-50',
  teal:   'from-teal-50 to-cyan-50',
  green:  'from-green-50 to-teal-50',
  orange: 'from-orange-50 to-amber-50',
};

function statusConfig(status: string) {
  const map: Record<string, { cls: string; dot: string }> = {
    ONGOING:   { cls: 'bg-blue-100 text-blue-700 border border-blue-200',   dot: 'bg-blue-500'   },
    UPCOMING:  { cls: 'bg-orange-100 text-orange-700 border border-orange-200', dot: 'bg-orange-500' },
    COMPLETED: { cls: 'bg-slate-100 text-slate-600 border border-slate-200', dot: 'bg-slate-400'  },
  };
  return map[status] ?? map.UPCOMING;
}

export default function MyCoursesPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ['student-dashboard'],
    queryFn: async () => {
      const { data } = await api.get('/dashboard/student');
      return data.data;
    },
    enabled: !!user,
  });

  const enrollments: EnrollmentItem[] = data?.enrollments ?? [];

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48 rounded-lg" />
        <div className="grid grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-2xl" />
          ))}
        </div>
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-44 rounded-2xl" />
        ))}
      </div>
    );
  }

  if (!enrollments.length) {
    return (
      <EmptyState
        icon={BookOpen}
        title="No courses yet"
        description="You haven't been enrolled in any course. Browse programs or contact your administrator."
        hint="New enrollments appear here automatically"
        action={
          <button
            type="button"
            onClick={() => navigate('/programs')}
            className="lms-press px-4 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors duration-300 ease-out"
          >
            Browse programs
          </button>
        }
      />
    );
  }

  const ongoing = enrollments.filter(e => e.batchStatus === 'ONGOING').length;
  const avgPct  = Math.round(enrollments.reduce((a, e) => a + e.completionPct, 0) / enrollments.length);

  return (
    <div className="space-y-6 pb-4">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">My Courses</h1>
        <p className="text-slate-500 text-sm mt-1">
          {enrollments.length} course{enrollments.length !== 1 ? 's' : ''} enrolled
        </p>
      </div>

      {/* Quick stats row */}
      <div className="grid grid-cols-3 gap-3 lms-stagger">
        {[
          { label: 'Enrolled',     value: enrollments.length, color: '#3b82f6', bg: 'from-blue-50 to-blue-100', suffix: '' },
          { label: 'Active Now',   value: ongoing,            color: '#f97316', bg: 'from-orange-50 to-orange-100', suffix: '' },
          { label: 'Avg Progress', value: avgPct,             color: '#3b82f6', bg: 'from-blue-50 to-indigo-100', suffix: '%' },
        ].map(({ label, value, color, bg, suffix }) => (
          <div key={label}
            className={`lms-card-lift rounded-2xl bg-gradient-to-br ${bg} border border-slate-200 p-4 text-center`}>
            <p className="text-2xl font-bold tabular-nums" style={{ color }}>
              <AnimatedNumber value={typeof value === 'number' ? value : 0} suffix={suffix} />
            </p>
            <p className="text-xs text-slate-500 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Course cards */}
      <div className="space-y-3 lms-stagger">
        {enrollments.map((e, idx) => {
          const color   = COLOR_MAP[e.colorToken]    ?? '#3b82f6';
          const gradCls = GRADIENT_MAP[e.colorToken] ?? 'from-blue-50 to-indigo-50';
          const { cls: badgeCls, dot: dotCls } = statusConfig(e.batchStatus);

          return (
            <button
              key={`${e.enrollmentId}-${e.courseId}`}
              onClick={() => navigate(`/my-courses/${e.enrollmentId}?courseId=${e.courseId}`)}
              className={`lms-card-lift w-full text-left rounded-2xl border border-slate-200 overflow-hidden
                         bg-gradient-to-br ${gradCls}
                         hover:border-slate-300 group lms-press`}
              style={{ boxShadow: `0 4px 32px ${color}15` }}
            >
              <div className="p-5">
                <div className="flex items-start justify-between gap-4">
                  {/* Left: icon + info */}
                  <div className="flex items-center gap-3.5 flex-1 min-w-0">
                    <div
                      className="w-13 h-13 rounded-xl flex items-center justify-center flex-shrink-0 relative"
                      style={{ backgroundColor: color + '20', border: `1.5px solid ${color}40` }}
                    >
                      <BookOpen className="w-6 h-6" style={{ color }} />
                      <div
                        className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-white flex items-center justify-center"
                        style={{ backgroundColor: color + '30' }}
                      >
                        <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-slate-900 font-bold text-base leading-tight truncate group-hover:text-slate-800 transition-colors">
                        {e.courseTitle}
                      </h3>
                      <p className="text-slate-500 text-xs mt-0.5 truncate">{e.courseCategory}</p>
                      <div className="flex items-center gap-2.5 mt-1.5 flex-wrap">
                        <span className="text-slate-500 text-xs flex items-center gap-1">
                          <Users className="w-3 h-3" /> {e.batchName}
                        </span>
                        {e.trainerName && (
                          <span className="text-slate-500 text-xs flex items-center gap-1">
                            <GraduationCap className="w-3 h-3" /> {e.trainerName}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right: badge + progress + arrow */}
                  <div className="flex flex-col items-end gap-2 flex-shrink-0">
                    <span className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-semibold ${badgeCls}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${dotCls} animate-pulse`} />
                      {e.batchStatus}
                    </span>
                    <div className="flex items-center gap-1" style={{ color }}>
                      <TrendingUp className="w-3.5 h-3.5" />
                      <span className="text-sm font-bold">{e.completionPct}%</span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-slate-700 group-hover:translate-x-0.5 transition-all" />
                  </div>
                </div>

                {/* Progress bar */}
                <div className="mt-4">
                  <div className="flex justify-between text-xs text-slate-500 mb-1.5">
                    <span>Course Progress</span>
                    <span style={{ color }}>{e.completionPct}%</span>
                  </div>
                  <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{ width: `${e.completionPct}%`, backgroundColor: color }}
                    />
                  </div>
                </div>

                <p className="text-slate-500 text-xs mt-2.5">
                  Enrolled {new Date(e.enrolledAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
