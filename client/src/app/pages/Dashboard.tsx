import { useQuery } from '@tanstack/react-query';
import { BookOpen, Users, Layers, TrendingUp, Sparkles, ArrowRight, Award, GraduationCap } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, BarChart, Bar } from 'recharts';
import { Skeleton } from '../components/ui/skeleton';
import api from '../../lib/axios';
import type { DashboardStats } from '../../types/api';

const PIE_COLORS = ['#06b6d4', '#8b5cf6', '#f59e0b', '#10b981', '#f43f5e', '#3b82f6'];
const BATCH_COLORS: Record<string, string> = {
  ONGOING:   '#10b981',
  UPCOMING:  '#3b82f6',
  COMPLETED: '#9ca3af',
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

  const kpiCards = stats
    ? [
        { label: 'Total Courses',  value: stats.totalCourses,  icon: BookOpen,      bg: 'bg-cyan-50',    iconBg: 'bg-cyan-500',    change: '+2 this month' },
        { label: 'Total Students', value: stats.totalStudents, icon: Users,         bg: 'bg-purple-50',  iconBg: 'bg-purple-500',  change: '+14 this week' },
        { label: 'Active Batches', value: stats.activeBatches, icon: Layers,        bg: 'bg-emerald-50', iconBg: 'bg-emerald-500', change: 'Ongoing now' },
        { label: 'Trainers',       value: stats.totalTrainers, icon: GraduationCap, bg: 'bg-teal-50',    iconBg: 'bg-teal-500',    change: 'Total faculty' },
      ]
    : [];

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 text-sm mt-0.5">Welcome back! Here's what's happening with your platform.</p>
      </div>

      {/* AI Insight Banner */}
      <div className="bg-gradient-to-r from-purple-50 via-blue-50 to-cyan-50 border border-purple-100 rounded-2xl p-4">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 bg-gradient-to-br from-purple-500 to-blue-600 rounded-xl flex items-center justify-center shrink-0 shadow-lg shadow-purple-500/20">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-gray-900">
              <span className="text-purple-600">AI insight:</span> Data Science batch has highest completion (88%). Recommend expanding batch size by 30%.
            </p>
            <p className="text-xs text-gray-500 mt-0.5">Based on learning analytics, enrollment patterns and student career goals</p>
          </div>
          <button className="flex items-center gap-1.5 text-xs font-medium text-purple-600 hover:text-purple-700 whitespace-nowrap bg-white border border-purple-200 px-3 py-1.5 rounded-lg hover:bg-purple-50 transition-colors">
            View details <ArrowRight className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {isLoading
          ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)
          : kpiCards.map((card) => (
              <div key={card.label} className={`${card.bg} rounded-2xl p-5 border border-white shadow-sm hover:shadow-md transition-shadow`}>
                <div className="flex items-start justify-between mb-3">
                  <div className={`${card.iconBg} p-2.5 rounded-xl shadow-sm`}>
                    <card.icon className="w-5 h-5 text-white" />
                  </div>
                  <span className="text-xs text-gray-500 bg-white px-2 py-1 rounded-full border border-gray-100">{card.change}</span>
                </div>
                <p className="text-3xl font-bold text-gray-900">{card.value}</p>
                <p className="text-sm text-gray-600 mt-0.5">{card.label}</p>
              </div>
            ))}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Enrollment Trend */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-base font-semibold text-gray-900">Enrollment Trend</h2>
              <p className="text-xs text-gray-500 mt-0.5">Monthly student enrollments</p>
            </div>
          </div>
          {isLoading ? (
            <Skeleton className="h-52 w-full rounded-xl" />
          ) : (
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
                <Area type="monotone" dataKey="count" stroke="#06b6d4" strokeWidth={2.5} fill="url(#colorEnroll)" dot={false} activeDot={{ r: 5, fill: '#06b6d4' }} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Category Distribution */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <div className="mb-6">
            <h2 className="text-base font-semibold text-gray-900">Course Categories</h2>
            <p className="text-xs text-gray-500 mt-0.5">Distribution by category</p>
          </div>
          {isLoading ? (
            <Skeleton className="h-52 w-full rounded-xl" />
          ) : (
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
                <Tooltip
                  contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '12px' }}
                  formatter={(value, name) => [value, name]}
                />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '11px' }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Bottom row: Top Courses + Top Trainers */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* Top Courses */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-base font-semibold text-gray-900">Top Performing Courses</h2>
              <p className="text-xs text-gray-500 mt-0.5">By student enrollment and completion</p>
            </div>
            <div className="flex items-center gap-1.5 text-xs font-medium text-cyan-600">
              <Award className="w-3.5 h-3.5" /> Top {stats?.topCourses?.length ?? 0}
            </div>
          </div>
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}
            </div>
          ) : (stats?.topCourses ?? []).length === 0 ? (
            <div className="text-center py-8 text-gray-300 text-sm">No course data yet</div>
          ) : (
            <div className="space-y-3">
              {(stats?.topCourses ?? []).map((course, idx) => (
                <div key={course.id} className="flex items-center gap-4 p-3 rounded-xl hover:bg-gray-50 transition-colors">
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
                    {idx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{course.title}</p>
                    <p className="text-xs text-gray-500">{course.category} · {course.studentCount} students</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold text-gray-900">{course.completionPct}%</p>
                    <p className="text-xs text-gray-500">completion</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top Trainers */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-base font-semibold text-gray-900">Top Trainers</h2>
              <p className="text-xs text-gray-500 mt-0.5">By student count across all courses</p>
            </div>
            <div className="flex items-center gap-1.5 text-xs font-medium text-teal-600">
              <GraduationCap className="w-3.5 h-3.5" /> Faculty
            </div>
          </div>
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}
            </div>
          ) : (stats?.topTrainers ?? []).length === 0 ? (
            <div className="text-center py-8 text-gray-300 text-sm">No trainers added yet</div>
          ) : (
            <div className="space-y-3">
              {(stats?.topTrainers ?? []).map((trainer, idx) => (
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

      {/* Batch Status Distribution */}
      {stats && (stats.batchDistribution ?? []).length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <div className="mb-5">
            <h2 className="text-base font-semibold text-gray-900">Batch Status Overview</h2>
            <p className="text-xs text-gray-500 mt-0.5">Current batch pipeline across all courses</p>
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={stats.batchDistribution} margin={{ left: -20, right: 8 }}>
              <XAxis dataKey="status" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Bar dataKey="count" radius={[6, 6, 0, 0]}>
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
