import React from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../../../lib/axios';
import { Briefcase, Users, Building2, TrendingUp, BarChart3, Award, ClipboardList, DollarSign, FileText } from 'lucide-react';
import { statusBadge, TabError } from '../shared';

export function DashboardTab() {
  const { data, isLoading, isError } = useQuery<any>({
    queryKey: ['admin-intern-dashboard'],
    queryFn: async () => (await api.get('/intern/admin/dashboard')).data.data,
    retry: 2,
  });

  if (isLoading) return <div className="grid gap-3">{[1,2,3,4].map(i => <div key={i} className="bg-gray-100 rounded-2xl h-24 animate-pulse" />)}</div>;
  if (isError || !data) return <TabError />;


  const kpis = [
    { label: 'Active Programs', value: data.activePrograms, sub: `${data.totalPrograms} total programs`, color: 'from-blue-500 to-cyan-500', icon: Briefcase },
    { label: 'Active Interns', value: data.activeInterns, sub: `${data.totalAllocations} allocated`, color: 'from-emerald-500 to-teal-500', icon: Users },
    { label: 'Partner Companies', value: data.partnerCompanies, sub: 'from internship programs', color: 'from-purple-500 to-pink-500', icon: Building2 },
    { label: 'PPO Conversion', value: `${data.ppoConversionRate}%`, sub: `${data.ppoOffered}/${data.ppoTotal} offered`, color: 'from-orange-500 to-amber-500', icon: TrendingUp },
    { label: 'Avg. Progress', value: `${data.avgProgress}%`, sub: 'across active interns', color: 'from-indigo-500 to-blue-500', icon: BarChart3 },
    { label: 'Completion Rate', value: `${data.completionRate}%`, sub: 'internships completed', color: 'from-pink-500 to-rose-500', icon: Award },
  ];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpis.map(k => (
          <div key={k.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${k.color} flex items-center justify-center mb-3`}>
              <k.icon className="w-4 h-4 text-white" />
            </div>
            <p className="text-2xl font-bold text-gray-900">{k.value}</p>
            <p className="text-xs font-semibold text-gray-700 mt-0.5">{k.label}</p>
            <p className="text-[10px] text-gray-400 mt-0.5">{k.sub}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h3 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-blue-500" /> Intern Progress Overview
          </h3>
          <div className="space-y-4">
            {(data.allocations ?? []).length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-6">No enrolled interns yet. Create a batch and assign students.</p>
            ) : (data.allocations ?? []).map((a: any) => (
              <div key={a.id}>
                <div className="flex items-center justify-between mb-1.5">
                  <div>
                    <span className="text-xs font-semibold text-gray-800">{a.studentName}</span>
                    <span className="text-[10px] text-gray-400 ml-2">{a.company}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {statusBadge(a.status)}
                    <span className="text-xs font-bold text-gray-700 w-8 text-right">{a.progress}%</span>
                  </div>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className={`h-2 rounded-full transition-all ${a.progress >= 70 ? 'bg-emerald-500' : a.progress >= 40 ? 'bg-blue-500' : 'bg-amber-500'}`}
                    style={{ width: `${a.progress}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <p className="text-xs font-bold text-gray-700 mb-3 flex items-center gap-1.5">
              <ClipboardList className="w-3.5 h-3.5 text-amber-500" /> Pending Actions
            </p>
            <div className="space-y-2">
              {[
                { label: 'Work Logs to Review', value: data.pendingWorklogs, color: 'text-blue-600' },
                { label: 'Certs Pending', value: data.pendingCertificates, color: 'text-purple-600' },
              ].map(item => (
                <div key={item.label} className="flex items-center justify-between py-0.5">
                  <span className="text-xs text-gray-600">{item.label}</span>
                  <span className={`text-sm font-bold ${item.color}`}>{item.value}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <p className="text-xs font-bold text-gray-700 mb-3 flex items-center gap-1.5">
              <DollarSign className="w-3.5 h-3.5 text-emerald-500" /> Stipend Summary
            </p>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-600">Total Paid</span>
                <span className="text-sm font-bold text-emerald-600">₹{Number(data.paidStipends).toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-600">Pending</span>
                <span className="text-sm font-bold text-amber-600">₹{Number(data.pendingStipends).toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h3 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
          <FileText className="w-4 h-4 text-blue-500" /> Recent Work Logs
        </h3>
        <div className="space-y-2">
          {(data.recentWorkLogs ?? []).length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-4">No work logs yet.</p>
          ) : (data.recentWorkLogs ?? []).map((log: any) => (
            <div key={log.id} className="flex items-start gap-3 p-3 bg-gray-50 rounded-xl">
              <div className="w-7 h-7 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                <FileText className="w-3.5 h-3.5 text-blue-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-gray-800">{log.studentName}</span>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <span className="text-[10px] text-gray-400">{log.date}</span>
                    {statusBadge(log.status)}
                  </div>
                </div>
                <p className="text-[11px] text-gray-500 mt-0.5 truncate">{log.workDone}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
