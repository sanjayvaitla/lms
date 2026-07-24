import { useQuery } from '@tanstack/react-query';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts';
import { Calendar, CheckCircle, XCircle, Clock, AlertCircle } from 'lucide-react';
import api from '../../../lib/axios';
import { useAuth } from '../../../store/AuthContext';
import { Skeleton } from '../../components/ui/skeleton';

export default function MyAttendancePage() {
  const { user } = useAuth();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['student-dashboard'],
    queryFn: async () => {
      const { data } = await api.get('/dashboard/student');
      return data.data;
    },
    enabled: !!user,
  });

  const att = data?.attendance ?? { overall: 0, total: 0, present: 0, absent: 0, late: 0, monthly: [] };
  const overall = att.overall ?? (att.total > 0 ? Math.round((att.present / att.total) * 100) : 0);

  function colorForPct(pct: number) {
    if (pct >= 75) return '#3b82f6';
    if (pct >= 50) return '#f97316';
    return '#f43f5e';
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 rounded-2xl" />
        <div className="grid grid-cols-3 gap-3">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
        </div>
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] gap-3">
        <AlertCircle className="w-10 h-10 text-rose-400" />
        <p className="text-sm font-semibold text-slate-900">Couldn’t load attendance</p>
        <p className="text-xs text-slate-500">Check your connection and try again.</p>
        <button
          type="button"
          onClick={() => refetch()}
          className="lms-press mt-1 px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-xl"
        >
          Retry
        </button>
      </div>
    );
  }

  const color = colorForPct(overall);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Attendance</h1>
        <p className="text-slate-500 text-sm mt-1">Your presence across sessions</p>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex items-center gap-5">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ backgroundColor: color + '18' }}>
          <Calendar className="w-8 h-8" style={{ color }} />
        </div>
        <div>
          <p className="text-3xl font-bold tabular-nums text-slate-900">{overall}%</p>
          <p className="text-xs text-slate-500 mt-0.5">Overall attendance · {att.total} sessions</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Present', value: att.present, icon: CheckCircle, color: '#10b981' },
          { label: 'Late', value: att.late, icon: Clock, color: '#f59e0b' },
          { label: 'Absent', value: att.absent, icon: XCircle, color: '#f43f5e' },
        ].map(({ label, value, icon: Icon, color: c }) => (
          <div key={label} className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <Icon className="w-4 h-4" style={{ color: c }} />
              <span className="text-xs font-medium text-slate-500">{label}</span>
            </div>
            <p className="text-2xl font-bold text-slate-900 tabular-nums">{value}</p>
          </div>
        ))}
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900 mb-4">Monthly breakdown</h2>
        {(att.monthly?.length ?? 0) === 0 ? (
          <p className="text-sm text-slate-400 text-center py-10">No attendance records yet.</p>
        ) : (
          <div className="h-64 lms-chart-in">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={att.monthly} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#64748b' }} />
                <YAxis tick={{ fontSize: 11, fill: '#64748b' }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="present" name="Present" fill="#10b981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="late" name="Late" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                <Bar dataKey="absent" name="Absent" fill="#f43f5e" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}
