import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import {
  BookOpen, ClipboardList, HelpCircle, Calendar, TrendingUp,
  CheckCircle, Award, AlertCircle, GraduationCap, ArrowRight,
  PlayCircle, ListTodo,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { Skeleton } from '../components/ui/skeleton';
import { AnimatedNumber } from '../components/ui/AnimatedNumber';
import { Reveal } from '../components/ui/Reveal';
import { DashStatCard } from '../components/ui/DashStatCard';
import api from '../../lib/axios';
import { useAuth } from '../../store/AuthContext';

interface StudentDashData {
  enrolled: boolean;
  nextSession: {
    id: string; title: string; sessionNumber: string | null;
    batchId: string; enrollmentId: string; courseId: string;
  } | null;
  primaryEnrollment: {
    enrollmentId: string;
    courseId: string;
    courseTitle: string; courseCategory: string; courseLevel: string;
    batchName: string; batchStatus: string; completionPct: number;
    colorToken: string; trainerName: string | null;
    startDate: string; endDate: string;
  } | null;
  enrollments: any[];
  attendance: {
    overall: number; total: number; present: number; absent: number; late: number;
    monthly: { month: string; present: number; absent: number; late: number; total: number }[];
  };
  assignments: {
    pending: number; completed: number;
    upcoming: { id: string; title: string; dueDate: string | null; maxScore: number; courseTitle: string; colorToken: string }[];
  };
  quizzes: {
    pending: number; completed: number;
    recentAttempts: { id: string; quizId: string; quizTitle: string; score: number | null; passed: boolean | null; submittedAt: string; courseTitle: string }[];
    pendingList?: { quizId: string; quizTitle: string; courseTitle: string; enrollmentId: string; courseId?: string }[];
  };
  sessions?: { total: number; released: number; completed: number };
}

async function fetchStudentDash(): Promise<StudentDashData> {
  const { data } = await api.get('/dashboard/student');
  return data.data;
}

const COLOR_MAP: Record<string, string> = {
  cyan:   '#06b6d4', purple: '#8b5cf6', indigo: '#6366f1',
  amber:  '#f59e0b', sky:    '#0ea5e9', rose:   '#f43f5e',
  teal:   '#14b8a6', blue:   '#3b82f6', orange: '#f97316',
};
function courseColor(token: string) { return COLOR_MAP[token] ?? '#06b6d4'; }

function daysUntil(d: string | null) {
  if (!d) return null;
  return Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);
}
function formatDate(d: string | null) {
  if (!d) return 'No deadline';
  const diff = daysUntil(d)!;
  if (diff < 0) return 'Overdue';
  if (diff === 0) return 'Due today';
  if (diff === 1) return 'Due tomorrow';
  return `Due in ${diff} days`;
}
function dueBadgeColor(d: string | null) {
  if (!d) return 'bg-slate-100 text-slate-500';
  const diff = daysUntil(d)!;
  if (diff < 0) return 'bg-rose-100 text-rose-700';
  if (diff <= 2) return 'bg-orange-100 text-orange-700';
  return 'bg-blue-100 text-blue-700';
}

function CircleProgress({ pct, color, size = 80 }: { pct: number; color: string; size?: number }) {
  const r = (size - 12) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e2e8f0" strokeWidth={6} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={6}
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
        style={{ transition: 'stroke-dasharray 0.8s ease' }}
      />
    </svg>
  );
}

function NotEnrolled() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-5 px-4">
      <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-lg text-white">
        <GraduationCap className="w-10 h-10" />
      </div>
      <div className="text-center max-w-sm">
        <h2 className="text-xl font-bold text-slate-900">Not enrolled yet</h2>
        <p className="text-slate-500 text-sm mt-2 leading-relaxed">
          You are not enrolled in a course. Browse programs or contact your administrator to get started.
        </p>
        <Link
          to="/programs"
          className="lms-press inline-flex mt-5 px-4 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors duration-300 ease-out"
        >
          Browse programs
        </Link>
      </div>
    </div>
  );
}

/** Shared card shell for dashboard sections */
function DashSection({
  title,
  description,
  icon: Icon,
  iconClass,
  action,
  children,
  className = '',
}: {
  title: string;
  description?: string;
  icon?: React.ComponentType<{ className?: string }>;
  iconClass?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`bg-white border border-slate-200/80 rounded-2xl p-5 sm:p-6 shadow-sm lms-card ${className}`}>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-start gap-2.5 min-w-0">
          {Icon && (
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-50 ring-1 ring-slate-100 mt-0.5">
              <Icon className={`h-4 w-4 ${iconClass ?? 'text-slate-500'}`} />
            </div>
          )}
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
            {description && (
              <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{description}</p>
            )}
          </div>
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

type DoNextItem = {
  key: string;
  kind: 'assignment' | 'quiz' | 'session';
  title: string;
  subtitle: string;
  badge: string;
  badgeClass: string;
  to: string;
  priority: number;
};

export default function StudentDashboard() {
  const { user } = useAuth();
  const [activeFeeReminder, setActiveFeeReminder] = useState<any | null>(null);
  const [hasShownReminder, setHasShownReminder] = useState(false);

  const { data: fees = [] } = useQuery<any[]>({
    queryKey: ['my-fees'],
    queryFn: async () => {
      const { data } = await api.get('/fees-v2/my-fees');
      return data.data ?? [];
    },
    enabled: !!user,
  });

  useEffect(() => {
    if (fees.length > 0 && !hasShownReminder) {
      for (const fee of fees) {
        const milestones = [
          { label: 'Registration', exp: parseFloat(fee.registration_expected) || 0, paid: parseFloat(fee.registration_amount) || 0, date: fee.registration_date },
          { label: '1st Installment', exp: parseFloat(fee.installment1_expected) || 0, paid: parseFloat(fee.installment1_amount) || 0, date: fee.installment1_date },
          { label: '2nd Installment', exp: parseFloat(fee.installment2_expected) || 0, paid: parseFloat(fee.installment2_amount) || 0, date: fee.installment2_date },
          { label: '3rd Installment', exp: parseFloat(fee.installment3_expected) || 0, paid: parseFloat(fee.installment3_amount) || 0, date: fee.installment3_date },
        ];

        for (const m of milestones) {
          if (m.exp > 0 && m.paid < m.exp && m.date) {
            const dueDate = new Date(m.date);
            const today = new Date();
            dueDate.setHours(0, 0, 0, 0);
            today.setHours(0, 0, 0, 0);
            const diffDays = Math.ceil((dueDate.getTime() - today.getTime()) / 86400000);

            if (diffDays === 7 || diffDays === 3 || diffDays === 1 || diffDays === 0 || diffDays < 0) {
              setActiveFeeReminder({
                milestone: m.label,
                dueDate: m.date,
                amountDue: m.exp - m.paid,
                diffDays,
              });
              setHasShownReminder(true);
              return;
            }
          }
        }
      }
    }
  }, [fees, hasShownReminder]);

  const { data, isLoading, error, refetch } = useQuery<StudentDashData>({
    queryKey: ['student-dashboard'],
    queryFn: fetchStudentDash,
    staleTime: 60_000,
    retry: 1,
  });

  const doNext = useMemo((): DoNextItem[] => {
    if (!data?.enrolled) return [];
    const items: DoNextItem[] = [];

    for (const asg of data.assignments.upcoming) {
      const d = daysUntil(asg.dueDate);
      let priority = 40;
      let badge = formatDate(asg.dueDate);
      if (d !== null && d < 0) priority = 10;
      else if (d !== null && d <= 2) priority = 20;
      else priority = 35;
      items.push({
        key: `asg-${asg.id}`,
        kind: 'assignment',
        title: asg.title,
        subtitle: asg.courseTitle,
        badge,
        badgeClass: dueBadgeColor(asg.dueDate),
        to: '/my-assignments',
        priority,
      });
    }

    for (const q of data.quizzes.pendingList ?? []) {
      items.push({
        key: `quiz-${q.quizId}`,
        kind: 'quiz',
        title: q.quizTitle,
        subtitle: q.courseTitle,
        badge: 'Quiz ready',
        badgeClass: 'bg-cyan-100 text-cyan-700',
        to: `/my-courses/${q.enrollmentId}/quiz/${q.quizId}${q.courseId ? `?courseId=${q.courseId}` : ''}`,
        priority: 30,
      });
    }

    if (data.nextSession) {
      const label = data.nextSession.sessionNumber
        ? `Session ${data.nextSession.sessionNumber}`
        : 'Next session';
      items.push({
        key: `sess-${data.nextSession.id}`,
        kind: 'session',
        title: data.nextSession.title,
        subtitle: label,
        badge: 'Continue',
        badgeClass: 'bg-emerald-100 text-emerald-700',
        to: `/my-courses/${data.nextSession.enrollmentId}/session/${data.nextSession.id}?courseId=${data.nextSession.courseId}`,
        priority: 50,
      });
    }

    return items.sort((a, b) => a.priority - b.priority).slice(0, 5);
  }, [data]);

  if (isLoading) {
    return (
      <div className="space-y-6 sm:space-y-8">
        <Skeleton className="h-40 sm:h-44 rounded-2xl" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28 sm:h-32 rounded-2xl" />)}
        </div>
        <Skeleton className="h-36 rounded-2xl" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <Skeleton className="h-64 rounded-2xl" />
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (error) {
    const msg = (error as any)?.response?.data?.message ?? (error as any)?.message ?? 'Failed to load dashboard data';
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center">
          <AlertCircle className="w-8 h-8 text-rose-400" />
        </div>
        <div className="text-center">
          <h2 className="text-lg font-bold text-slate-900">Dashboard error</h2>
          <p className="text-slate-500 text-sm mt-1 max-w-xs">{msg}</p>
        </div>
        <button onClick={() => refetch()}
          className="lms-press px-4 py-2 bg-blue-500 hover:bg-blue-400 text-white text-sm font-medium rounded-xl transition-colors duration-300 ease-out">
          Try again
        </button>
      </div>
    );
  }

  if (!data || !data.enrolled) return <NotEnrolled />;

  const { primaryEnrollment: enr, attendance, assignments, quizzes, enrollments, sessions, nextSession } = data;
  const cc = courseColor(enr?.colorToken ?? 'cyan');
  const continueHref = nextSession
    ? `/my-courses/${nextSession.enrollmentId}/session/${nextSession.id}?courseId=${nextSession.courseId}`
    : enr
      ? `/my-courses/${enr.enrollmentId}?courseId=${enr.courseId}`
      : '/my-courses';

  return (
    <div className="space-y-6 sm:space-y-8 pb-6">

      {/* Welcome hero */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-blue-600 via-blue-700 to-blue-900 text-white p-5 sm:p-7">
        <div className="absolute inset-0 opacity-10"
          style={{ backgroundImage: `radial-gradient(circle at 80% 50%, ${cc} 0%, transparent 60%)` }} />
        <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] text-blue-100/90 font-semibold uppercase tracking-widest mb-2">My learning</p>
            <h1 className="text-2xl sm:text-[1.65rem] font-bold text-white leading-tight">
              Welcome back, {user?.name?.split(' ')[0]}
            </h1>
            <div className="mt-2 space-y-0.5 text-sm text-blue-50/95">
              {enr?.courseTitle && <p className="font-medium truncate">{enr.courseTitle}</p>}
              <p className="text-blue-100/90 text-xs sm:text-sm">
                {[enr?.batchName, enr?.trainerName ? `Trainer: ${enr.trainerName}` : null].filter(Boolean).join(' · ')}
              </p>
            </div>
            <Link
              to={continueHref}
              className="lms-press inline-flex items-center gap-2 mt-5 px-4 py-2.5 rounded-xl bg-white text-blue-700 text-sm font-semibold hover:bg-blue-50 transition-colors duration-300 ease-out shadow-sm"
              title={nextSession ? 'Open your next session' : 'Open your course'}
            >
              <PlayCircle className="w-4 h-4 shrink-0" />
              {nextSession ? 'Continue learning' : 'Open course'}
              <ArrowRight className="w-3.5 h-3.5 shrink-0" />
            </Link>
          </div>
          <div className="flex items-center gap-4 sm:gap-5 shrink-0">
            <div className="text-left sm:text-right">
              <p className="text-[11px] text-blue-100/90 font-medium uppercase tracking-wide">Course progress</p>
              <p className="text-3xl font-bold text-white tabular-nums mt-0.5">
                <AnimatedNumber value={enr?.completionPct ?? 0} suffix="%" />
              </p>
              {sessions && sessions.total > 0 && (
                <p className="text-xs text-blue-100/80 mt-1">
                  {sessions.completed} of {sessions.total} sessions complete
                </p>
              )}
            </div>
            <div className="relative hidden sm:block shrink-0">
              <CircleProgress pct={enr?.completionPct ?? 0} color="#fff" size={76} />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-xs font-bold text-white">{enr?.completionPct ?? 0}%</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Do next */}
      <Reveal>
        <DashSection
          title="What to do next"
          description="Your highest-priority tasks — tap any item to open it"
          icon={ListTodo}
          iconClass="text-indigo-500"
        >
          {doNext.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center gap-2">
              <CheckCircle className="w-9 h-9 text-emerald-500/80" />
              <p className="text-sm font-medium text-slate-800">You are all caught up</p>
              <p className="text-xs text-slate-500 max-w-xs leading-relaxed">
                New assignments and quizzes will appear here when your trainer releases them.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {doNext.map((item) => {
                const kindLabel = item.kind === 'assignment' ? 'Assignment' : item.kind === 'quiz' ? 'Quiz' : 'Session';
                return (
                  <Link
                    key={item.key}
                    to={item.to}
                    className="lms-card-lift flex items-center gap-3 p-3.5 rounded-xl bg-slate-50/80 border border-slate-200/80 hover:border-indigo-200 hover:bg-indigo-50/30 transition-colors duration-300 ease-out"
                  >
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                      item.kind === 'assignment' ? 'bg-orange-100' :
                      item.kind === 'quiz' ? 'bg-cyan-100' : 'bg-emerald-100'
                    }`}>
                      {item.kind === 'assignment' ? <ClipboardList className="w-4 h-4 text-orange-600" /> :
                       item.kind === 'quiz' ? <HelpCircle className="w-4 h-4 text-cyan-600" /> :
                       <PlayCircle className="w-4 h-4 text-emerald-600" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-0.5">{kindLabel}</p>
                      <p className="text-sm font-medium text-slate-900 truncate">{item.title}</p>
                      <p className="text-xs text-slate-500 truncate mt-0.5">{item.subtitle}</p>
                    </div>
                    <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-full shrink-0 ${item.badgeClass}`}>
                      {item.badge}
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
        </DashSection>
      </Reveal>

      {/* Overview stats */}
      <div>
        <div className="mb-3 px-0.5">
          <h2 className="text-sm font-semibold text-slate-900">At a glance</h2>
          <p className="text-xs text-slate-500 mt-0.5">Quick summary of your learning activity</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 lms-stagger">
          <DashStatCard
            label="Course progress"
            hint="How much of the syllabus you have finished"
            value={<AnimatedNumber value={enr?.completionPct ?? 0} suffix="%" />}
            footer={sessions && sessions.total > 0 ? `${sessions.completed} of ${sessions.total} sessions done` : undefined}
            icon={TrendingUp}
            iconClass="text-purple-500"
            accent="purple"
          >
            <div className="mt-3 h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full rounded-full bg-purple-500 transition-all duration-700" style={{ width: `${enr?.completionPct ?? 0}%` }} />
            </div>
          </DashStatCard>

          <DashStatCard
            label="Attendance"
            hint="Your overall attendance rate"
            value={<AnimatedNumber value={attendance.overall} suffix="%" />}
            footer={`${attendance.present} present · ${attendance.late} late · ${attendance.absent} absent`}
            icon={Calendar}
            iconClass="text-blue-500"
            to="/my-attendance"
            accent="blue"
          />

          <DashStatCard
            label="Assignments"
            hint="Pending work you still need to submit"
            value={<AnimatedNumber value={assignments.pending} />}
            footer={assignments.pending === 0
              ? `${assignments.completed} already submitted`
              : `${assignments.completed} submitted · ${assignments.pending} waiting for you`}
            icon={ClipboardList}
            iconClass="text-orange-500"
            to="/my-assignments"
            accent="orange"
          />

          <DashStatCard
            label="Quizzes"
            hint="Quizzes available for you to attempt"
            value={<AnimatedNumber value={quizzes.pending} />}
            footer={quizzes.pending === 0
              ? `${quizzes.completed} attempts completed`
              : `${quizzes.pending} to attempt · ${quizzes.completed} done`}
            icon={HelpCircle}
            iconClass="text-cyan-500"
            to="/my-quizzes"
            accent="cyan"
          />
        </div>
      </div>

      {/* Sessions + attendance chart */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-5">
        <DashSection
          title="Sessions completed"
          description="Syllabus sessions marked done for your batch"
          icon={BookOpen}
          iconClass="text-emerald-500"
        >
          {!(sessions && sessions.total > 0) ? (
            <p className="text-sm text-slate-400 py-8 text-center">No sessions in your syllabus yet</p>
          ) : (
            <>
              <p className="text-3xl font-bold text-slate-900 tabular-nums">
                {sessions.completed}
                <span className="text-lg text-slate-400 font-medium"> / {sessions.total}</span>
              </p>
              <p className="text-xs text-slate-500 mt-1">sessions marked complete</p>
              <div className="mt-4 h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                  style={{ width: `${Math.round((sessions.completed / sessions.total) * 100)}%` }}
                />
              </div>
              <p className="text-xs text-slate-500 mt-2.5">
                <span className="font-medium text-slate-700">{sessions.released}</span> sessions currently open for you
              </p>
            </>
          )}
        </DashSection>

        <div className="lg:col-span-2">
          <DashSection
            title="Monthly attendance"
            description="Present, late, and absent days over the last 6 months"
            icon={Calendar}
            iconClass="text-blue-500"
            action={
              <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-[10px] sm:text-xs">
                {([['#10b981', 'Present'], ['#f59e0b', 'Late'], ['#f43f5e', 'Absent']] as const).map(([c, l]) => (
                  <span key={l} className="flex items-center gap-1.5 text-slate-500">
                    <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: c }} />
                    {l}
                  </span>
                ))}
              </div>
            }
          >
            {attendance.monthly.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-44 sm:h-48 text-slate-400 gap-2">
                <Calendar className="w-8 h-8 opacity-40" />
                <p className="text-sm text-slate-500">No attendance records yet</p>
                <p className="text-xs text-slate-400">Records appear after your first marked session</p>
              </div>
            ) : (
              <div className="lms-chart-in -mx-1">
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={attendance.monthly} barSize={14} barGap={3}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                    <XAxis dataKey="month" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12 }} />
                    <Bar dataKey="present" name="Present" fill="#10b981" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="late" name="Late" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="absent" name="Absent" fill="#f43f5e" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </DashSection>
        </div>
      </div>

      {/* Assignments + quizzes */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5">
        <DashSection
          title="Pending assignments"
          description="Work due soon — open to view details and submit"
          icon={ClipboardList}
          iconClass="text-orange-500"
          action={
            <Link to="/my-assignments" className="text-xs text-blue-600 hover:text-blue-800 font-medium whitespace-nowrap lms-press">
              View all →
            </Link>
          }
        >
          {assignments.upcoming.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center gap-2">
              <CheckCircle className="w-8 h-8 text-emerald-500/60" />
              <p className="text-sm font-medium text-slate-700">No pending assignments</p>
              <p className="text-xs text-slate-500">You have submitted everything due so far.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {assignments.upcoming.map((asg) => (
                <Link key={asg.id} to="/my-assignments"
                  className="lms-card-lift flex items-center gap-3 p-3.5 rounded-xl bg-slate-50/80 border border-slate-200/80 hover:border-orange-200 hover:bg-orange-50/20 transition-colors duration-300 ease-out">
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                    style={{ backgroundColor: courseColor(asg.colorToken) + '22' }}>
                    <ClipboardList className="w-4 h-4" style={{ color: courseColor(asg.colorToken) }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">{asg.title}</p>
                    <p className="text-xs text-slate-500 truncate mt-0.5">{asg.courseTitle}</p>
                  </div>
                  <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-full shrink-0 ${dueBadgeColor(asg.dueDate)}`}>
                    {formatDate(asg.dueDate)}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </DashSection>

        <DashSection
          title={(quizzes.pendingList?.length ?? 0) > 0 && quizzes.recentAttempts.length === 0
            ? 'Quizzes to attempt'
            : 'Recent quiz results'}
          description={
            (quizzes.pendingList?.length ?? 0) > 0 && quizzes.recentAttempts.length === 0
              ? 'Available quizzes — tap to start an attempt'
              : 'Your latest submitted quiz scores'
          }
          icon={HelpCircle}
          iconClass="text-cyan-500"
          action={
            <Link to="/my-quizzes" className="text-xs text-blue-600 hover:text-blue-800 font-medium whitespace-nowrap lms-press">
              View all →
            </Link>
          }
        >
          {(quizzes.pendingList?.length ?? 0) > 0 && quizzes.recentAttempts.length === 0 ? (
            <div className="space-y-2">
              {(quizzes.pendingList ?? []).slice(0, 5).map((q) => (
                <Link key={q.quizId} to={`/my-courses/${q.enrollmentId}/quiz/${q.quizId}${q.courseId ? `?courseId=${q.courseId}` : ''}`}
                  className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200 hover:border-cyan-300 hover:bg-cyan-50/40 transition-colors">
                  <div className="w-8 h-8 rounded-lg bg-cyan-100 flex items-center justify-center shrink-0">
                    <HelpCircle className="w-4 h-4 text-cyan-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">{q.quizTitle}</p>
                    <p className="text-xs text-slate-500">{q.courseTitle}</p>
                  </div>
                  <span className="text-[10px] font-semibold px-2 py-1 rounded-full bg-cyan-100 text-cyan-700">Start</span>
                </Link>
              ))}
            </div>
          ) : quizzes.recentAttempts.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-36 text-slate-400 gap-2">
              <HelpCircle className="w-8 h-8 opacity-40" />
              <p className="text-sm">No quiz attempts yet</p>
              {quizzes.pending > 0 && (
                <p className="text-xs text-cyan-600">{quizzes.pending} quiz{quizzes.pending > 1 ? 'zes' : ''} waiting</p>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {quizzes.recentAttempts.map((qa) => (
                <Link key={qa.id} to="/my-quizzes"
                  className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/50 transition-colors">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                    qa.passed === true ? 'bg-emerald-100' : qa.passed === false ? 'bg-rose-100' : 'bg-slate-100'
                  }`}>
                    {qa.passed === true
                      ? <Award className="w-4 h-4 text-emerald-600" />
                      : qa.passed === false
                        ? <AlertCircle className="w-4 h-4 text-rose-500" />
                        : <HelpCircle className="w-4 h-4 text-slate-400" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">{qa.quizTitle}</p>
                    <p className="text-xs text-slate-500">{qa.courseTitle}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    {qa.score !== null ? (
                      <>
                        <p className={`text-sm font-bold ${qa.passed ? 'text-emerald-600' : 'text-rose-500'}`}>
                          {qa.score}%
                        </p>
                        <p className="text-[10px] text-slate-500">{qa.passed ? 'Passed' : 'Failed'}</p>
                      </>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </DashSection>
      </div>

      {/* Multi-course */}
      {enrollments.length > 1 && (
        <DashSection
          title={`All your courses (${enrollments.length})`}
          description="Switch between enrolled programs"
          icon={BookOpen}
          iconClass="text-cyan-500"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {enrollments.map((e: any) => (
              <Link
                key={`${e.enrollmentId}-${e.courseId}`}
                to={`/my-courses/${e.enrollmentId}?courseId=${e.courseId}`}
                className="lms-card-lift p-4 rounded-xl bg-slate-50/80 border border-slate-200/80 hover:border-blue-200 transition-colors duration-300 ease-out"
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: courseColor(e.colorToken) }} />
                  <span className="text-xs font-semibold text-slate-700 truncate">{e.courseTitle}</span>
                </div>
                <p className="text-xs text-slate-500 mb-3">{e.batchName}</p>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs text-slate-500">Progress</span>
                  <span className="text-xs font-bold text-slate-900">{e.completionPct}%</span>
                </div>
                <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all"
                    style={{ width: `${e.completionPct}%`, backgroundColor: courseColor(e.colorToken) }} />
                </div>
              </Link>
            ))}
          </div>
        </DashSection>
      )}

      {/* Fee reminder */}
      {activeFeeReminder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="relative w-full max-w-md bg-white border border-amber-200 rounded-2xl p-6 shadow-2xl text-center space-y-4">
            <div className="w-14 h-14 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center mx-auto">
              <AlertCircle className="w-7 h-7 text-amber-500" />
            </div>
            <div className="space-y-1">
              <h2 className="text-xl font-bold text-slate-900">Payment reminder</h2>
              <p className="text-xs text-slate-500">An installment is due for your enrollment.</p>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2 text-left text-xs text-slate-600">
              <div className="flex justify-between border-b border-slate-100 pb-2">
                <span>Milestone</span>
                <span className="font-bold text-slate-900">{activeFeeReminder.milestone}</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 pb-2">
                <span>Amount due</span>
                <span className="font-bold text-blue-600 font-mono">
                  {new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(activeFeeReminder.amountDue)}
                </span>
              </div>
              <div className="flex justify-between border-b border-slate-100 pb-2">
                <span>Due date</span>
                <span className="font-bold text-slate-900">
                  {new Date(activeFeeReminder.dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
                </span>
              </div>
              <div className="flex justify-between pt-1">
                <span>Status</span>
                <span className={`font-bold px-2 py-0.5 rounded-full text-[10px] ${
                  activeFeeReminder.diffDays < 0 ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'
                }`}>
                  {activeFeeReminder.diffDays < 0
                    ? `Overdue by ${Math.abs(activeFeeReminder.diffDays)} days`
                    : activeFeeReminder.diffDays === 0
                      ? 'Due today'
                      : `${activeFeeReminder.diffDays} days remaining`}
                </span>
              </div>
            </div>
            <p className="text-[11px] text-slate-500">
              Please complete payment to keep full access to the learning portal.
            </p>
            <button
              onClick={() => setActiveFeeReminder(null)}
              className="w-full py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors"
            >
              Acknowledge
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
