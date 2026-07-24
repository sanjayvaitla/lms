import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { FileText, Search, AlertCircle, CheckCircle2 } from 'lucide-react';
import api from '../../../../lib/axios';
import { statusBadge, WorkLog } from '../shared';

const INPUT_CLS = "w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all";

export function WorkLogsTab() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [selectedProgramId, setSelectedProgramId] = useState('');
  const [selectedBatchId, setSelectedBatchId] = useState('');

  const { data: programs = [] } = useQuery<{ id: string; title: string; company: string }[]>({
    queryKey: ['admin-intern-programs'],
    queryFn: async () => (await api.get('/intern/admin/programs')).data.data,
  });

  useEffect(() => {
    if (!selectedProgramId && programs.length > 0) setSelectedProgramId(programs[0].id);
  }, [programs, selectedProgramId]);

  const { data: programBatches = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ['admin-intern-program-batches', selectedProgramId],
    queryFn: async () => {
      const all = (await api.get('/intern/admin/batches')).data.data;
      return all.filter((b: any) => b.programId === selectedProgramId);
    },
    enabled: !!selectedProgramId,
  });

  const { data: logs = [], isLoading } = useQuery<WorkLog[]>({
    queryKey: ['admin-intern-worklogs', selectedProgramId, selectedBatchId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedProgramId) params.set('programId', selectedProgramId);
      if (selectedBatchId) params.set('batchId', selectedBatchId);
      return (await api.get(`/intern/admin/work-logs?${params}`)).data.data;
    },
    enabled: !!selectedProgramId,
  });

  const updateMut = useMutation({
    mutationFn: ({ id, status, mentorComment }: { id: string; status: WorkLog['status']; mentorComment: string }) =>
      api.put(`/intern/admin/work-logs/${id}`, { status, mentorComment }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-intern-worklogs', selectedProgramId, selectedBatchId] });
      toast.success('Work log updated');
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Failed to update work log'),
  });

  const filtered = logs.filter(l => (l.studentName ?? '').toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-3 flex-wrap">
        <FileText className="w-4 h-4 text-blue-500 shrink-0" />
        <select value={selectedProgramId} onChange={e => { setSelectedProgramId(e.target.value); setSelectedBatchId(''); }} className={INPUT_CLS + ' flex-1 min-w-48'}>
          {programs.map(p => <option key={p.id} value={p.id}>{p.title} — {p.company}</option>)}
        </select>
        <select value={selectedBatchId} onChange={e => setSelectedBatchId(e.target.value)} className={INPUT_CLS + ' min-w-40'}>
          <option value="">All batches</option>
          {programBatches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search work logs…"
            className="w-full bg-white border border-gray-200 rounded-xl pl-9 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
        </div>
        <p className="text-xs text-gray-500 shrink-0">Students submit logs from their portal</p>
      </div>

      <div className="grid gap-3">
        {isLoading ? (
          <div className="text-center py-8 text-gray-400 text-xs">Loading work logs…</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-gray-400 text-xs">No work logs found for this filter.</div>
        ) : filtered.map(l => (
          <div key={l.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-bold text-gray-900 text-sm">{l.studentName}</span>
                  <span className="text-xs text-gray-400">{l.date}</span>
                  <span className="text-xs font-semibold text-blue-600">{l.hoursWorked}h</span>
                </div>
                <p className="text-xs text-gray-700">{l.workDone}</p>
                {l.challenges && <p className="text-xs text-amber-700 mt-1 flex gap-1"><AlertCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />{l.challenges}</p>}
                {l.mentorComments && <p className="text-xs text-emerald-700 mt-1 flex gap-1"><CheckCircle2 className="w-3 h-3 mt-0.5 flex-shrink-0" />{l.mentorComments}</p>}
              </div>
              {statusBadge(l.status)}
            </div>
            {l.status === 'PENDING' && (
              <div className="mt-3 flex gap-2">
                <button onClick={() => updateMut.mutate({ id: l.id, status: 'APPROVED', mentorComment: 'Looks good!' })}
                  disabled={updateMut.isPending}
                  className="text-xs px-2.5 py-1 bg-emerald-50 text-emerald-600 rounded-lg hover:bg-emerald-100 font-semibold">Approve</button>
                <button onClick={() => updateMut.mutate({ id: l.id, status: 'REJECTED', mentorComment: 'Please resubmit with more details.' })}
                  disabled={updateMut.isPending}
                  className="text-xs px-2.5 py-1 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 font-semibold">Reject</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
