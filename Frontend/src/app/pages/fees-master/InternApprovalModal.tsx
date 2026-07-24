import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { X, Loader2, CheckCircle2, Briefcase, DollarSign, User, Phone } from 'lucide-react';
import api from '../../../lib/axios';

export function InternApprovalModal({ intern, onClose, onSuccess }: { intern: any, onClose: () => void, onSuccess: () => void }) {
  const [selectedProgram, setSelectedProgram] = useState('');
  const [selectedBatch, setSelectedBatch] = useState('');
  const [stipendPerMonth, setStipendPerMonth] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const { data: programs = [], isLoading: programsLoading } = useQuery<any[]>({
    queryKey: ['intern-programs'],
    queryFn: async () => { const { data } = await api.get('/intern/admin/programs'); return data.data ?? []; },
  });

  const { data: batches = [], isLoading: batchesLoading } = useQuery<any[]>({
    queryKey: ['intern-batches'],
    queryFn: async () => { const { data } = await api.get('/intern/admin/batches'); return data.data ?? []; },
  });

  const activeProgram = programs.find((p: any) => p.id === selectedProgram);
  const programBatches = batches.filter((b: any) => b.program_id === selectedProgram);

  function handleProgramChange(progId: string) {
    setSelectedProgram(progId);
    setSelectedBatch('');
    const prog = programs.find((p: any) => p.id === progId);
    if (prog) setStipendPerMonth(String(prog.stipend_per_month || 0));
  }

  async function handleAssign() {
    if (!selectedProgram) { toast.error('Please select an internship program'); return; }
    setSubmitting(true);
    try {
      await api.post(`/fees-v2/signups/${intern.id}/accept-intern`, {
        program_id: selectedProgram,
        batch_id: selectedBatch || undefined,
        stipend_per_month: Number(stipendPerMonth) || 0,
      });

      toast.success('Intern approved — welcome email sent');
      onSuccess();
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? 'Setup failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b bg-gradient-to-r from-purple-50 to-fuchsia-50">
          <div>
            <h2 className="font-bold text-gray-900 text-base">Complete Intern Setup</h2>
            <p className="text-xs text-gray-500 mt-0.5">{intern.name} · {intern.email}</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-white/60 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-5">
          {/* Intern info strip */}
          <div className="bg-purple-50 border border-purple-100 rounded-xl p-3 flex flex-wrap gap-4 text-xs text-gray-600">
            <span className="flex items-center gap-1.5"><User className="w-3.5 h-3.5 text-purple-500" />{intern.email}</span>
            {intern.phone_number && <span className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5 text-purple-500" />{intern.phone_number}</span>}
          </div>

          {/* Step 1 — Program */}
          <div>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Step 1 · Select Internship Program *</p>
            {programsLoading ? (
              <div className="h-20 bg-gray-100 animate-pulse rounded-xl" />
            ) : programs.length === 0 ? (
              <p className="text-sm text-gray-500">No internship programs available.</p>
            ) : (
              <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                {programs.map((p: any) => {
                  const isSel = selectedProgram === p.id;
                  return (
                    <button key={p.id} onClick={() => handleProgramChange(p.id)}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${
                        isSel ? 'border-purple-400 bg-purple-50 shadow-sm' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                      }`}>
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-purple-100 border border-purple-200">
                        <Briefcase className="w-4 h-4 text-purple-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900">{p.title}</p>
                        <p className="text-xs text-gray-400">{p.company} · {p.duration}</p>
                      </div>
                      {isSel && <CheckCircle2 className="w-5 h-5 text-purple-600" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Step 2 — Batch & Stipend */}
          {selectedProgram && (
            <div className="space-y-4 animate-in fade-in slide-in-from-top-4 duration-300">
              <div>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Step 2 · Batch Assignment</p>
                <div className="bg-gray-50 border border-gray-100 rounded-2xl p-4">
                  {batchesLoading ? (
                    <div className="h-10 bg-gray-200 animate-pulse rounded-xl" />
                  ) : programBatches.length > 0 ? (
                    <select
                      value={selectedBatch}
                      onChange={e => setSelectedBatch(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-400"
                    >
                      <option value="">-- No Batch Assigned --</option>
                      {programBatches.map((b: any) => (
                        <option key={b.id} value={b.id}>{b.name} ({new Date(b.start_date).toLocaleDateString()} - {new Date(b.end_date).toLocaleDateString()})</option>
                      ))}
                    </select>
                  ) : (
                    <p className="text-xs text-gray-400">No batches created for this internship program. You can assign one later.</p>
                  )}
                </div>
              </div>

              <div>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Step 3 · Stipend per Month (₹)</p>
                <div className="bg-purple-50 border border-purple-100 rounded-2xl p-4 flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-purple-600" />
                  <input
                    type="number"
                    value={stipendPerMonth}
                    onChange={e => setStipendPerMonth(e.target.value)}
                    placeholder="e.g. 5000"
                    className="flex-1 bg-transparent text-sm font-semibold text-purple-900 border-none focus:outline-none focus:ring-0 p-0"
                  />
                </div>
                <p className="text-[10px] text-gray-400 mt-1.5 ml-1">Pre-filled from internship program defaults.</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t bg-gray-50 flex items-center justify-end gap-3">
          <button onClick={onClose} className="px-5 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-200 rounded-xl transition-colors">
            Cancel
          </button>
          <button onClick={handleAssign} disabled={!selectedProgram || submitting}
            className="flex items-center gap-2 px-6 py-2.5 text-sm font-bold text-white bg-gradient-to-r from-purple-600 to-fuchsia-600 rounded-xl hover:shadow-lg hover:shadow-purple-500/30 transition-all disabled:opacity-50">
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            {submitting ? 'Approving...' : 'Approve Intern'}
          </button>
        </div>
      </div>
    </div>
  );
}
