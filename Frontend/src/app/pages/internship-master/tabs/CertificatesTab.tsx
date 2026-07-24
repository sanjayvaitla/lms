import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Award, Shield, CheckCircle2, AlertCircle, X } from 'lucide-react';
import api from '../../../../lib/axios';
import { statusBadge, Certificate } from '../shared';

const INPUT_CLS = "w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all";

export function CertificatesTab() {
  const qc = useQueryClient();
  const [selectedProgramId, setSelectedProgramId] = useState('');

  const { data: programs = [] } = useQuery<{ id: string; title: string; company: string }[]>({
    queryKey: ['admin-intern-programs'],
    queryFn: async () => (await api.get('/intern/admin/programs')).data.data,
  });

  useEffect(() => {
    if (!selectedProgramId && programs.length > 0) setSelectedProgramId(programs[0].id);
  }, [programs, selectedProgramId]);

  const { data: certs = [], isLoading } = useQuery<Array<Certificate & { studentId: string; eligible: boolean }>>({
    queryKey: ['admin-intern-certificates', selectedProgramId],
    queryFn: async () => (await api.get(`/intern/admin/certificates?programId=${selectedProgramId}`)).data.data,
    enabled: !!selectedProgramId,
  });

  const issueMut = useMutation({
    mutationFn: ({ studentId, grade, action }: { studentId: string; grade?: string; action: 'GENERATE' | 'ISSUE' }) =>
      api.post('/intern/admin/certificates/issue', { studentId, programId: selectedProgramId, grade, action }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-intern-certificates', selectedProgramId] });
      toast.success('Certificate updated');
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Failed to update certificate'),
  });

  const eligible = certs.filter(c => c.eligible).length;

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-3 flex-wrap">
        <Award className="w-4 h-4 text-blue-500 shrink-0" />
        <select value={selectedProgramId} onChange={e => setSelectedProgramId(e.target.value)} className={INPUT_CLS + ' flex-1 min-w-48'}>
          {programs.map(p => <option key={p.id} value={p.id}>{p.title} — {p.company}</option>)}
        </select>
      </div>

      <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4">
        <p className="text-xs font-bold text-blue-800 mb-2 flex items-center gap-1.5">
          <Shield className="w-3.5 h-3.5" /> Certificate Eligibility Rules
        </p>
        <div className="flex gap-6 flex-wrap text-xs text-blue-700">
          <span className="flex items-center gap-1.5"><CheckCircle2 className="w-3 h-3 text-emerald-500" /> Attendance ≥ 80%</span>
          <span className="flex items-center gap-1.5"><CheckCircle2 className="w-3 h-3 text-emerald-500" /> Project Submitted</span>
          <span className="flex items-center gap-1.5"><CheckCircle2 className="w-3 h-3 text-emerald-500" /> Final Evaluation Completed</span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Eligible', value: eligible, color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-100' },
          { label: 'Generated', value: certs.filter(c => c.status === 'GENERATED').length, color: 'text-blue-600', bg: 'bg-blue-50 border-blue-100' },
          { label: 'Issued', value: certs.filter(c => c.status === 'ISSUED').length, color: 'text-purple-600', bg: 'bg-purple-50 border-purple-100' },
        ].map(s => (
          <div key={s.label} className={`${s.bg} rounded-2xl border shadow-sm p-4 text-center`}>
            <p className={`text-3xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-gray-600 mt-0.5 font-semibold">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-4 py-3 bg-gradient-to-r from-blue-50 to-cyan-50 border-b border-blue-100">
          <h3 className="text-sm font-bold text-blue-800">Certificate Tracker</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left px-4 py-3 text-xs font-bold text-gray-600">Student</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-gray-600">Internship</th>
                <th className="text-center px-4 py-3 text-xs font-bold text-gray-600">Attendance</th>
                <th className="text-center px-4 py-3 text-xs font-bold text-gray-600">Project</th>
                <th className="text-center px-4 py-3 text-xs font-bold text-gray-600">Evaluation</th>
                <th className="text-center px-4 py-3 text-xs font-bold text-gray-600">Eligible</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-gray-600">Grade</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-gray-600">Cert ID</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-gray-600">Status</th>
                <th className="px-4 py-3 text-xs font-bold text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {isLoading ? (
                <tr><td colSpan={10} className="py-8 text-center text-gray-400 text-xs">Loading…</td></tr>
              ) : certs.map(c => (
                <tr key={c.id} className="hover:bg-blue-50/20 transition-colors">
                  <td className="px-4 py-3 font-semibold text-gray-900 text-xs">{c.studentName}</td>
                  <td className="px-4 py-3 text-xs text-gray-600 max-w-[180px] truncate">{c.internshipTitle}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-xs font-bold ${c.attendancePct >= 80 ? 'text-emerald-600' : 'text-red-500'}`}>{c.attendancePct}%</span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {c.projectSubmitted ? <CheckCircle2 className="w-4 h-4 text-emerald-500 mx-auto" /> : <AlertCircle className="w-4 h-4 text-gray-300 mx-auto" />}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {c.evaluationDone ? <CheckCircle2 className="w-4 h-4 text-emerald-500 mx-auto" /> : <AlertCircle className="w-4 h-4 text-gray-300 mx-auto" />}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {c.eligible ? <CheckCircle2 className="w-4 h-4 text-emerald-500 mx-auto" /> : <X className="w-4 h-4 text-red-400 mx-auto" />}
                  </td>
                  <td className="px-4 py-3 text-xs font-bold text-blue-600">{c.grade || '—'}</td>
                  <td className="px-4 py-3 text-[10px] font-mono text-gray-400">{c.certificateId || '—'}</td>
                  <td className="px-4 py-3">{statusBadge(c.status)}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1.5 justify-center">
                      {c.status === 'PENDING' && c.eligible && (
                        <button onClick={() => issueMut.mutate({ studentId: c.studentId, grade: c.grade || 'A', action: 'GENERATE' })}
                          disabled={issueMut.isPending}
                          className="text-[10px] px-2.5 py-1 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 font-semibold whitespace-nowrap">
                          Generate
                        </button>
                      )}
                      {c.status === 'PENDING' && !c.eligible && (
                        <span className="text-[10px] text-gray-400 italic">Not eligible</span>
                      )}
                      {c.status === 'GENERATED' && (
                        <button onClick={() => issueMut.mutate({ studentId: c.studentId, grade: c.grade, action: 'ISSUE' })}
                          disabled={issueMut.isPending}
                          className="text-[10px] px-2.5 py-1 bg-emerald-50 text-emerald-600 rounded-lg hover:bg-emerald-100 font-semibold">
                          Issue
                        </button>
                      )}
                      {c.status === 'ISSUED' && (
                        <span className="text-[10px] text-emerald-600 font-semibold">Issued</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
