import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { DollarSign, Plus, X, Clock, CheckCircle2, Users } from 'lucide-react';
import api from '../../../../lib/axios';
import { statusBadge, Stipend } from '../shared';

interface ProgramStudent { studentId: string; name: string; }

const INPUT_CLS = "w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all";
const LABEL_CLS = "text-xs font-semibold text-gray-600 mb-1.5 block";

export function StipendTab() {
  const qc = useQueryClient();
  const [selectedProgramId, setSelectedProgramId] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ studentId: '', month: '', amount: 0 });

  const { data: programs = [] } = useQuery<{ id: string; title: string; company: string }[]>({
    queryKey: ['admin-intern-programs'],
    queryFn: async () => (await api.get('/intern/admin/programs')).data.data,
  });

  useEffect(() => {
    if (!selectedProgramId && programs.length > 0) setSelectedProgramId(programs[0].id);
  }, [programs, selectedProgramId]);

  const { data: enrolledStudents = [] } = useQuery<ProgramStudent[]>({
    queryKey: ['admin-intern-program-students', selectedProgramId],
    queryFn: async () => (await api.get(`/intern/admin/programs/${selectedProgramId}/students`)).data.data,
    enabled: !!selectedProgramId,
  });

  const { data: stipends = [], isLoading } = useQuery<Stipend[]>({
    queryKey: ['admin-intern-stipends', selectedProgramId],
    queryFn: async () => (await api.get(`/intern/admin/stipends?programId=${selectedProgramId}`)).data.data,
    enabled: !!selectedProgramId,
  });

  const createMut = useMutation({
    mutationFn: () => api.post('/intern/admin/stipends', { studentId: form.studentId, programId: selectedProgramId, month: form.month, amount: form.amount }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-intern-stipends', selectedProgramId] });
      setShowModal(false);
      setForm({ studentId: '', month: '', amount: 0 });
      toast.success('Stipend created');
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Failed to create stipend'),
  });

  const paidMut = useMutation({
    mutationFn: (id: string) => api.put(`/intern/admin/stipends/${id}`, { status: 'PAID' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-intern-stipends', selectedProgramId] });
      toast.success('Marked as paid');
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Failed to update stipend'),
  });

  const totalPaid = stipends.filter(s => s.status === 'PAID').reduce((a, s) => a + s.amount, 0);
  const totalPending = stipends.filter(s => s.status === 'PENDING').reduce((a, s) => a + s.amount, 0);

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-3 flex-wrap">
        <DollarSign className="w-4 h-4 text-blue-500 shrink-0" />
        <select value={selectedProgramId} onChange={e => setSelectedProgramId(e.target.value)} className={INPUT_CLS + ' flex-1 min-w-48'}>
          {programs.map(p => <option key={p.id} value={p.id}>{p.title} — {p.company}</option>)}
        </select>
        <button onClick={() => setShowModal(true)} disabled={!selectedProgramId}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-cyan-600 text-white text-sm font-semibold rounded-xl shadow-md disabled:opacity-50">
          <Plus className="w-4 h-4" /> Add Stipend
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[
          { label: 'Total Paid', value: `₹${totalPaid.toLocaleString()}`, color: 'from-emerald-500 to-teal-500', icon: CheckCircle2 },
          { label: 'Pending Payment', value: `₹${totalPending.toLocaleString()}`, color: 'from-amber-500 to-orange-500', icon: Clock },
          { label: 'Total Records', value: stipends.length, color: 'from-blue-500 to-cyan-500', icon: Users },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <div className={`w-8 h-8 rounded-xl bg-gradient-to-br ${s.color} flex items-center justify-center mb-2`}>
              <s.icon className="w-4 h-4 text-white" />
            </div>
            <p className="text-xl font-bold text-gray-900">{s.value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-4 py-3 bg-gradient-to-r from-blue-50 to-cyan-50 border-b border-blue-100 flex items-center justify-between">
          <h3 className="text-sm font-bold text-blue-800">Stipend Tracker</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left px-4 py-3 text-xs font-bold text-gray-600">Student</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-gray-600">Company</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-gray-600">Month</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-gray-600">Amount</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-gray-600">Payment Date</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-gray-600">Status</th>
                <th className="px-4 py-3 text-xs font-bold text-gray-600">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {isLoading ? (
                <tr><td colSpan={7} className="py-8 text-center text-gray-400 text-xs">Loading…</td></tr>
              ) : stipends.length === 0 ? (
                <tr><td colSpan={7} className="py-8 text-center text-gray-400 text-xs">No stipend records yet.</td></tr>
              ) : stipends.map(s => (
                <tr key={s.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-4 py-3 font-semibold text-gray-900 text-xs">{s.studentName}</td>
                  <td className="px-4 py-3 text-xs text-gray-600">{s.company}</td>
                  <td className="px-4 py-3 text-xs text-gray-600">{s.month || '—'}</td>
                  <td className="px-4 py-3 text-xs font-bold text-emerald-700">₹{s.amount.toLocaleString()}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{s.paymentDate || '—'}</td>
                  <td className="px-4 py-3">{statusBadge(s.status)}</td>
                  <td className="px-4 py-3 text-center">
                    {s.status === 'PENDING' && (
                      <button onClick={() => paidMut.mutate(s.id)} disabled={paidMut.isPending}
                        className="text-xs px-2.5 py-1 bg-emerald-50 text-emerald-600 rounded-lg hover:bg-emerald-100 font-semibold">Mark Paid</button>
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
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="text-base font-bold text-gray-900">Add Stipend</h3>
              <button onClick={() => setShowModal(false)} className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-lg"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className={LABEL_CLS}>Student *</label>
                <select value={form.studentId} onChange={e => setForm(p => ({ ...p, studentId: e.target.value }))} className={INPUT_CLS}>
                  <option value="">Select student…</option>
                  {enrolledStudents.map(s => <option key={s.studentId} value={s.studentId}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className={LABEL_CLS}>Month *</label>
                <input value={form.month} onChange={e => setForm(p => ({ ...p, month: e.target.value }))} className={INPUT_CLS} placeholder="e.g. August 2026" />
              </div>
              <div>
                <label className={LABEL_CLS}>Amount (₹) *</label>
                <input type="number" min={0} value={form.amount || ''} onChange={e => setForm(p => ({ ...p, amount: +e.target.value }))} className={INPUT_CLS} />
              </div>
            </div>
            <div className="flex gap-3 px-6 pb-6">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 font-medium">Cancel</button>
              <button onClick={() => createMut.mutate()} disabled={!form.studentId || !form.month.trim() || !form.amount || createMut.isPending}
                className="flex-1 py-2 text-sm font-bold text-white bg-gradient-to-r from-blue-600 to-cyan-600 rounded-xl disabled:opacity-50">
                Create Stipend
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
