import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import {
  BookOpen, Users, Layers, Award, GraduationCap, ClipboardList,
  AlertTriangle, Lock, PlayCircle, ArrowRight, Layers3, HelpCircle, FolderOpen,
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, BarChart, Bar,
} from 'recharts';
import { Skeleton } from '../components/ui/skeleton';
import { AnimatedNumber } from '../components/ui/AnimatedNumber';
import { Reveal } from '../components/ui/Reveal';
import api from '../../lib/axios';
import type { DashboardStats } from '../../types/api';

const PIE_COLORS = ['#06b6d4', '#6366f1', '#f59e0b', '#10b981', '#f43f5e', '#3b82f6'];
const BATCH_COLORS: Record<string, string> = {
  ONGOING:   '#10b981',
  UPCOMING:  '#3b82f6',
  COMPLETED: '#9ca3af',
  ARCHIVED:  '#cbd5e1',
};
const COLOR_MAP: Record<string, string> = {
  cyan: '#06b6d4', purple: '#8b5cf6', indigo: '#6366f1',
  amber: '#f59e0b', sky: '#0ea5e9', rose: '#f43f5e',
  teal: '#14b8a6', blue: '#3b82f6', orange: '#f97316',
};

async function fetchStats(): Promise<DashboardStats> {
  const { data } = await api.get('/dashboard/stats');
  return data.data;
}

export default function DashboardPage() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: fetchStats,
  });

  const sess = stats?.sessionStats;
  const sessPct = sess && sess.total > 0
    ? Math.round((sess.completed / sess.total) * 100)
    : 0;

  const kpiCards = stats
    ? [
        {
          label: 'Courses',
          value: stats.totalCourses,
          icon: BookOpen,
          bg: 'bg-cyan-50',
          iconBg: 'bg-cyan-500',
          hint: `${stats.activeCourses} active`,
        },
        {
          label: 'Students',
          value: stats.totalStudents,
          icon: Users,
          bg: 'bg-indigo-50',
          iconBg: 'bg-indigo-500',
          hint: 'Registered learners',
        },
        {
          label: 'Active batches',
          value: stats.activeBatches,
          icon: Layers,
          bg: 'bg-emerald-50',
          iconBg: 'bg-emerald-500',
          hint: 'Status: Ongoing',
        },
        {
          label: 'Trainers',
          value: stats.totalTrainers,
          icon: GraduationCap,
          bg: 'bg-teal-50',
          iconBg: 'bg-teal-500',
          hint: sess ? `${sessPct}% sessions completed` : 'Faculty',
        },
      ]
    : [];

  const attention = stats
    ? [
        {
          label: 'Ungraded submissions',
          value: stats.ungradedSubmissions ?? 0,
          hint: 'Need grading',
          to: '/assignments',
          icon: ClipboardList,
          tone: 'amber' as const,
        },
        {
          label: 'Overdue assignments',
          value: stats.overdueAssignments ?? 0,
          hint: 'Past due date',
          to: '/assignments',
          icon: AlertTriangle,
          tone: 'rose' as const,
        },
        {
          label: 'Locked sessions',
          value: sess?.locked ?? 0,
          hint: `${sess?.released ?? 0} released · ${sess?.completed ?? 0} done`,
          to: '/content',
          icon: Lock,
          tone: 'slate' as const,
        },
      ]
    : [];

  const quickLinks = [
    { label: 'Batches', to: '/batches', icon: Layers3 },
    { label: 'Content', to: '/content', icon: FolderOpen },
    { label: 'Assignments', to: '/assignments', icon: ClipboardList },
    { label: 'Quizzes', to: '/quizzes', icon: HelpCircle },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Platform overview</h1>
        <p className="text-gray-500 text-sm mt-0.5">
          {isLoading
            ? 'Loading live platform metrics…'
            : stats
              ? `${stats.totalStudents} students · ${stats.activeBatches} active batches · ${sessPct}% sessions completed`
              : 'Live platform metrics'}
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 lms-stagger">
        {isLoading
          ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)
          : kpiCards.map((card) => (
              <div key={card.label} className={`lms-card-lift ${card.bg} rounded-2xl p-4 sm:p-5 border border-white shadow-sm`}>
                <div className="flex items-start justify-between mb-3">
                  <div className={`${card.iconBg} p-2.5 rounded-xl shadow-sm`}>
                    <card.icon className="w-5 h-5 text-white" />
                  </div>
                </div>
                <p className="text-3xl font-bold text-gray-900 tabular-nums">
                  <AnimatedNumber value={card.value} />
                </p>
                <p className="text-sm text-gray-700 mt-0.5 font-medium">{card.label}</p>
                <p className="text-xs text-gray-500 mt-1">{card.hint}</p>
              </div>
            ))}
      </div>

      {/* Needs attention */}
      <Reveal>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Needs attention</h2>
            <p className="text-xs text-gray-500">Items waiting on staff action — click to open</p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {isLoading
            ? Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)
            : attention.map((item) => {
                const tones = {
                  amber: 'border-amber-200 bg-amber-50 hover:bg-amber-100/80',
                  rose: 'border-rose-200 bg-rose-50 hover:bg-rose-100/80',
                  slate: 'border-slate-200 bg-slate-50 hover:bg-slate-100',
                };
                const iconTone = {
                  amber: 'bg-amber-500',
                  rose: 'bg-rose-500',
                  slate: 'bg-slate-600',
                };
                return (
                  <Link
                    key={item.label}
                    to={item.to}
                    className={`lms-card-lift rounded-2xl border p-4 flex items-start gap-3 ${tones[item.tone]}`}
                  >
                    <div className={`${iconTone[item.tone]} p-2 rounded-xl shrink-0`}>
                      <item.icon className="w-4 h-4 text-white" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-2xl font-bold text-gray-900 tabular-nums">
                        <AnimatedNumber value={item.value} />
                      </p>
                      <p className="text-sm font-medium text-gray-800">{item.label}</p>
                      <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
                        {item.hint} <ArrowRight className="w-3 h-3" />
                      </p>
                    </div>
                  </Link>
                );
              })}
        </div>
      </Reveal>

      {/* Quick links */}
      <Reveal delay={40}>
      <div className="flex flex-wrap gap-2">
        {quickLinks.map((q) => (
          <Link
            key={q.to}
            to={q.to}
            className="lms-press inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white border border-gray-200 text-sm font-medium text-gray-700 hover:border-cyan-300 hover:text-cyan-700 hover:bg-cyan-50/50 transition-colors duration-300 ease-out"
          >
            <q.icon className="w-4 h-4" />
            {q.label}
          </Link>
        ))}
      </div>
      </Reveal>

      {/* Session delivery */}
      <Reveal delay={80}>
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 sm:p-6 lms-card">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Session delivery</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              How much of each course syllabus is completed (Done) vs still locked
            </p>
          </div>
          {sess && (
            <div className="hidden sm:flex items-center gap-3 text-xs text-gray-500">
              <span className="flex items-center gap-1"><PlayCircle className="w-3.5 h-3.5 text-emerald-500" /> {sess.completed} done</span>
              <span className="flex items-center gap-1"><Lock className="w-3.5 h-3.5 text-slate-400" /> {sess.locked} locked</span>
            </div>
          )}
        </div>
        {isLoading ? (
          <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-xl" />)}</div>
        ) : !(stats?.sessionDelivery?.length) ? (
          <p className="text-sm text-gray-400 text-center py-8">No syllabus modules yet — upload a syllabus to track delivery.</p>
        ) : (
          <div className="space-y-3">
            {stats!.sessionDelivery.map((row) => {
              const pct = row.total > 0 ? Math.round((row.completed / row.total) * 100) : 0;
              const color = COLOR_MAP[row.colorToken] ?? '#06b6d4';
              return (
                <div key={row.id} className="flex items-center gap-3 sm:gap-4">
                  <div className="w-36 sm:w-48 shrink-0 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{row.title}</p>
                    <p className="text-[11px] text-gray-500">{row.completed}/{row.total} sessions · {row.released} unlocked</p>
                  </div>
                  <div className="flex-1 h-2.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
                  </div>
                  <span className="text-sm font-semibold text-gray-800 w-10 text-right shrink-0">{pct}%</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
      </Reveal>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 lms-stagger">
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm p-4 sm:p-6 min-w-0 lms-card">
          <div className="mb-6">
            <h2 className="text-base font-semibold text-gray-900">New enrollments by month</h2>
            <p className="text-xs text-gray-500 mt-0.5">How many students joined a batch each month</p>
          </div>
          {isLoading ? (
            <Skeleton className="h-52 w-full rounded-xl" />
          ) : (
            <div className="lms-chart-in">
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={stats?.enrollmentTrend ?? []} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorEnroll" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}
                  labelStyle={{ fontWeight: 600, color: '#0f172a' }}
                />
                <Area type="monotone" dataKey="count" name="Enrollments" stroke="#06b6d4" strokeWidth={2.5} fill="url(#colorEnroll)" dot={false} activeDot={{ r: 5, fill: '#06b6d4' }} />
              </AreaChart>
            </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 sm:p-6 min-w-0 lms-card">
          <div className="mb-6">
            <h2 className="text-base font-semibold text-gray-900">Courses by category</h2>
            <p className="text-xs text-gray-500 mt-0.5">Share of the course catalog</p>
          </div>
          {isLoading ? (
            <Skeleton className="h-52 w-full rounded-xl" />
          ) : (stats?.categoryDistribution ?? []).length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-16">No courses yet</p>
          ) : (
            <div className="lms-chart-in">
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={stats?.categoryDistribution ?? []}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={80}
                  paddingAngle={3}
                  dataKey="count"
                  nameKey="category"
                >
                  {(stats?.categoryDistribution ?? []).map((_, index) => (
                    <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '12px' }} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '11px' }} />
              </PieChart>
            </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* Top courses + trainers */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 sm:p-6 min-w-0">
          <div className="flex items-center justify-between gap-3 mb-5">
            <div>
              <h2 className="text-base font-semibold text-gray-900">Top courses</h2>
              <p className="text-xs text-gray-500 mt-0.5">By student count · avg progress shown</p>
            </div>
            <div className="flex items-center gap-1.5 text-xs font-medium text-cyan-600">
              <Award className="w-3.5 h-3.5" /> Top {stats?.topCourses?.length ?? 0}
            </div>
          </div>
          {isLoading ? (
            <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
          ) : !(stats?.topCourses?.length) ? (
            <div className="text-center py-8 text-gray-300 text-sm">No course data yet</div>
          ) : (
            <div className="space-y-3">
              {stats!.topCourses.map((course, idx) => (
                <div key={course.id} className="lms-card-lift flex items-center gap-4 p-3 rounded-xl hover:bg-gray-50 transition-colors duration-300 ease-out">
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
                    {idx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{course.title}</p>
                    <p className="text-xs text-gray-500">{course.category} · {course.studentCount} students</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold text-gray-900">{course.completionPct}%</p>
                    <p className="text-xs text-gray-500">avg progress</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 sm:p-6 min-w-0">
          <div className="flex items-center justify-between gap-3 mb-5">
            <div>
              <h2 className="text-base font-semibold text-gray-900">Top trainers</h2>
              <p className="text-xs text-gray-500 mt-0.5">By students across their courses</p>
            </div>
            <div className="flex items-center gap-1.5 text-xs font-medium text-teal-600">
              <GraduationCap className="w-3.5 h-3.5" /> Faculty
            </div>
          </div>
          {isLoading ? (
            <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
          ) : !(stats?.topTrainers?.length) ? (
            <div className="text-center py-8 text-gray-300 text-sm">No trainers added yet</div>
          ) : (
            <div className="space-y-3">
              {stats!.topTrainers.map((trainer) => (
                <div key={trainer.id} className="flex items-center gap-4 p-3 rounded-xl hover:bg-gray-50 transition-colors">
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-teal-400 to-emerald-500 flex items-center justify-center text-white text-sm font-bold shrink-0">
                    {trainer.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{trainer.name}</p>
                    <p className="text-xs text-gray-500">{trainer.courseCount} course{trainer.courseCount !== 1 ? 's' : ''}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold text-gray-900">{trainer.studentCount}</p>
                    <p className="text-xs text-gray-500">students</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {stats && (stats.batchDistribution ?? []).length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 sm:p-6 min-w-0">
          <div className="mb-5">
            <h2 className="text-base font-semibold text-gray-900">Batch pipeline</h2>
            <p className="text-xs text-gray-500 mt-0.5">How many batches are upcoming, ongoing, or finished</p>
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={stats.batchDistribution} margin={{ left: -20, right: 8 }}>
              <XAxis dataKey="status" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Bar dataKey="count" name="Batches" radius={[6, 6, 0, 0]}>
                {stats.batchDistribution.map((d, i) => (
                  <Cell key={i} fill={BATCH_COLORS[d.status] ?? '#94a3b8'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
