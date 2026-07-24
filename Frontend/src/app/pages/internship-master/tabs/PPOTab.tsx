import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { TrendingUp, Plus, X, CheckCircle2 } from 'lucide-react';
import api from '../../../../lib/axios';
import { statusBadge, PPO, PPOStatus } from '../shared';

interface ProgramStudent { studentId: string; name: string; }

const INPUT_CLS = "w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all";
const LABEL_CLS = "text-xs font-semibold text-gray-600 mb-1.5 block";

function calcRating(total: number) {
  if (total >= 90) return 'Excellent';
  if (total >= 75) return 'Very Good';
  if (total >= 60) return 'Good';
  if (total >= 40) return 'Average';
  return 'Needs Improvement';
}

function ratingColor(rating: string) {
  switch (rating) {
    case 'Excellent': return 'text-purple-600';
    case 'Very Good': return 'text-blue-600';
    case 'Good': return 'text-emerald-600';
    case 'Average': return 'text-amber-600';
    default: return 'text-red-600';
  }
}

export function PPOTab() {
  const qc = useQueryClient();
  const [selectedProgramId, setSelectedProgramId] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({
    studentId: '', company: '', internshipRating: 0, ppoOffered: false,
    ppoDate: '', packageOffered: '', status: 'PENDING' as PPOStatus,
  });

  const { data: programs = [] } = useQuery<{ id: string; title: string; company: string }[]>({
    queryKey: ['admin-intern-programs'],
    queryFn: async () => (await api.get('/intern/admin/programs')).data.data,
  });

  useEffect(() => {
    if (!selectedProgramId && programs.length > 0) setSelectedProgramId(programs[0].id);
  }, [programs, selectedProgramId]);

  const selectedProgram = programs.find(p => p.id === selectedProgramId);

  const { data: enrolledStudents = [] } = useQuery<ProgramStudent[]>({
    queryKey: ['admin-intern-program-students', selectedProgramId],
    queryFn: async () => (await api.get(`/intern/admin/programs/${selectedProgramId}/students`)).data.data,
    enabled: !!selectedProgramId,
  });

  const { data: ppos = [], isLoading } = useQuery<PPO[]>({
    queryKey: ['admin-intern-ppo', selectedProgramId],
    queryFn: async () => (await api.get(`/intern/admin/ppo?programId=${selectedProgramId}`)).data.data,
    enabled: !!selectedProgramId,
  });

  const saveMut = useMutation({
    mutationFn: (body: any) => api.post('/intern/admin/ppo', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-intern-ppo', selectedProgramId] });
      setShowModal(false);
      toast.success('PPO record saved');
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Failed to save PPO'),
  });

  const offered = ppos.filter(p => p.ppoOffered).length;
  const accepted = ppos.filter(p => p.status === 'ACCEPTED').length;
  const conversionRate = ppos.length ? Math.round((offered / ppos.length) * 100) : 0;

  function openCreate() {
    setForm({
      studentId: '', company: selectedProgram?.company || '', internshipRating: 0, ppoOffered: false,
      ppoDate: '', packageOffered: '', status: 'PENDING',
    });
    setShowModal(true);
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-3 flex-wrap">
        <TrendingUp className="w-4 h-4 text-blue-500 shrink-0" />
        <select value={selectedProgramId} onChange={e => setSelectedProgramId(e.target.value)} className={INPUT_CLS + ' flex-1 min-w-48'}>
          {programs.map(p => <option key={p.id} value={p.id}>{p.title} — {p.company}</option>)}
        </select>
        <button onClick={openCreate} disabled={!selectedProgramId}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-cyan-600 text-white text-sm font-semibold rounded-xl shadow-md disabled:opacity-50">
          <Plus className="w-4 h-4" /> Add PPO
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Records', value: ppos.length, color: 'from-blue-500 to-cyan-500' },
          { label: 'PPO Offered', value: offered, color: 'from-purple-500 to-pink-500' },
          { label: 'PPO Accepted', value: accepted, color: 'from-emerald-500 to-teal-500' },
          { label: 'Conversion Rate', value: `${conversionRate}%`, color: 'from-orange-500 to-amber-500' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <div className={`w-8 h-8 rounded-xl bg-gradient-to-br ${s.color} flex items-center justify-center mb-2`}>
              <TrendingUp className="w-4 h-4 text-white" />
            </div>
            <p className="text-2xl font-bold text-gray-900">{s.value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-4 py-3 bg-gradient-to-r from-blue-50 to-cyan-50 border-b border-blue-100">
          <h3 className="text-sm font-bold text-blue-800">PPO Tracker</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left px-4 py-3 text-xs font-bold text-gray-600">Student</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-gray-600">Company</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-gray-600">Rating</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-gray-600">PPO Offered</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-gray-600">Package</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-gray-600">PPO Date</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-gray-600">Status</th>
                <th className="px-4 py-3 text-xs font-bold text-gray-600">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {isLoading ? (
                <tr><td colSpan={8} className="py-8 text-center text-gray-400 text-xs">Loading…</td></tr>
              ) : ppos.length === 0 ? (
                <tr><td colSpan={8} className="py-8 text-center text-gray-400 text-xs">No PPO records yet.</td></tr>
              ) : ppos.map(p => (
                <tr key={p.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-4 py-3 font-semibold text-gray-900 text-xs">{p.studentName}</td>
                  <td className="px-4 py-3 text-xs text-gray-600">{p.company}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-bold ${ratingColor(calcRating(p.internshipRating))}`}>{p.internshipRating}/100</span>
                  </td>
                  <td className="px-4 py-3">
                    {p.ppoOffered
                      ? <span className="text-xs font-semibold text-emerald-600 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Yes</span>
                      : <span className="text-xs text-gray-400">No</span>}
                  </td>
                  <td className="px-4 py-3 text-xs font-bold text-blue-700">{p.packageOffered || '—'}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{p.ppoDate || '—'}</td>
                  <td className="px-4 py-3">{statusBadge(p.status)}</td>
                  <td className="px-4 py-3 text-center">
                    {p.status === 'OFFERED' && (
                      <div className="flex gap-1 justify-center">
                        <button onClick={() => saveMut.mutate({ studentId: p.studentId, programId: selectedProgramId, status: 'ACCEPTED' })}
                          className="text-xs px-2 py-1 bg-emerald-50 text-emerald-600 rounded-lg hover:bg-emerald-100 font-semibold">Accept</button>
                        <button onClick={() => saveMut.mutate({ studentId: p.studentId, programId: selectedProgramId, status: 'DECLINED' })}
                          className="text-xs px-2 py-1 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 font-semibold">Decline</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white">
              <h3 className="text-base font-bold text-gray-900">PPO Record</h3>
              <button onClick={() => setShowModal(false)} className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-lg"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-6 space-y-3">
              <div>
                <label className={LABEL_CLS}>Student *</label>
                <select value={form.studentId} onChange={e => setForm(p => ({ ...p, studentId: e.target.value }))} className={INPUT_CLS}>
                  <option value="">Select student…</option>
                  {enrolledStudents.map(s => <option key={s.studentId} value={s.studentId}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className={LABEL_CLS}>Company</label>
                <input value={form.company} onChange={e => setForm(p => ({ ...p, company: e.target.value }))} className={INPUT_CLS} />
              </div>
              <div>
                <label className={LABEL_CLS}>Internship Rating (0-100)</label>
                <input type="number" min={0} max={100} value={form.internshipRating || ''} onChange={e => setForm(p => ({ ...p, internshipRating: +e.target.value }))} className={INPUT_CLS} />
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.ppoOffered} onChange={e => setForm(p => ({ ...p, ppoOffered: e.target.checked, status: e.target.checked ? 'OFFERED' : 'PENDING' }))} className="w-4 h-4 accent-blue-600" />
                <span className="text-sm text-gray-700">PPO Offered</span>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={LABEL_CLS}>PPO Date</label>
                  <input type="date" value={form.ppoDate} onChange={e => setForm(p => ({ ...p, ppoDate: e.target.value }))} className={INPUT_CLS} />
                </div>
                <div>
                  <label className={LABEL_CLS}>Package Offered</label>
                  <input value={form.packageOffered} onChange={e => setForm(p => ({ ...p, packageOffered: e.target.value }))} className={INPUT_CLS} placeholder="e.g. 6 LPA" />
                </div>
              </div>
            </div>
            <div className="flex gap-3 px-6 pb-6">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 font-medium">Cancel</button>
              <button onClick={() => saveMut.mutate({ ...form, programId: selectedProgramId })} disabled={!form.studentId || saveMut.isPending}
                className="flex-1 py-2 text-sm font-bold text-white bg-gradient-to-r from-blue-600 to-cyan-600 rounded-xl disabled:opacity-50">
                Save PPO
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
