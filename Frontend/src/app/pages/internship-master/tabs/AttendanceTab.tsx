import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Activity, X } from 'lucide-react';
import api from '../../../../lib/axios';
import { statusBadge, AttendanceStatus, AttendanceRecord } from '../shared';

interface ProgramStudent { studentId: string; name: string; }

const INPUT_CLS = "w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all";
const LABEL_CLS = "text-xs font-semibold text-gray-600 mb-1.5 block";

export function AttendanceTab() {
  const qc = useQueryClient();
  const [selectedProgramId, setSelectedProgramId] = useState('');
  const [selectedBatchId, setSelectedBatchId] = useState('');
  const [showMarkModal, setShowMarkModal] = useState(false);
  const [markForm, setMarkForm] = useState<{ studentId: string; date: string; status: AttendanceStatus; remarks: string }>({
    studentId: '', date: new Date().toISOString().split('T')[0], status: 'PRESENT', remarks: '',
  });
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);

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

  const { data: enrolledStudents = [] } = useQuery<ProgramStudent[]>({
    queryKey: ['admin-intern-program-students', selectedProgramId],
    queryFn: async () => (await api.get(`/intern/admin/programs/${selectedProgramId}/students`)).data.data,
    enabled: !!selectedProgramId,
  });

  const { data: records = [], isLoading } = useQuery<Array<AttendanceRecord & { studentId: string }>>({
    queryKey: ['admin-intern-attendance', selectedProgramId, selectedBatchId],
    queryFn: async () => {
      const params = new URLSearchParams({ programId: selectedProgramId });
      if (selectedBatchId) params.set('batchId', selectedBatchId);
      return (await api.get(`/intern/admin/attendance?${params}`)).data.data;
    },
    enabled: !!selectedProgramId,
  });

  const markMut = useMutation({
    mutationFn: (body: { studentId: string; programId: string; batchId?: string; date: string; status: AttendanceStatus; notes: string }) =>
      api.post('/intern/admin/attendance', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-intern-attendance', selectedProgramId, selectedBatchId] });
      setShowMarkModal(false);
      toast.success('Attendance saved');
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Failed to save attendance'),
  });

  const datedRecords = records.filter(r => r.date);
  const students = [...new Set(datedRecords.map(r => r.studentName))];
  const dates = [...new Set([selectedDate, ...datedRecords.map(r => r.date)])].sort().reverse();
  const dayRecords = datedRecords.filter(r => r.date === selectedDate);

  const studentStats = students.map(s => {
    const sr = datedRecords.filter(r => r.studentName === s);
    const total = sr.length;
    const present = sr.filter(r => r.status === 'PRESENT').length;
    const halfDay = sr.filter(r => r.status === 'HALF_DAY').length;
    const absent = sr.filter(r => r.status === 'ABSENT').length;
    const leave = sr.filter(r => r.status === 'LEAVE').length;
    const pct = total > 0 ? Math.round(((present + halfDay * 0.5) / total) * 100) : 0;
    return { name: s, total, present, halfDay, absent, leave, pct };
  });

  const defaulters = studentStats.filter(s => s.pct < 80 && s.total > 0);

  function openMark(existing?: { studentId: string; date: string; status: AttendanceStatus; remarks: string }) {
    setMarkForm(existing ?? { studentId: '', date: selectedDate, status: 'PRESENT', remarks: '' });
    setShowMarkModal(true);
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-3 flex-wrap">
        <Activity className="w-4 h-4 text-blue-500 shrink-0" />
        <select value={selectedProgramId} onChange={e => { setSelectedProgramId(e.target.value); setSelectedBatchId(''); }} className={INPUT_CLS + ' flex-1 min-w-48'}>
          {programs.map(p => <option key={p.id} value={p.id}>{p.title} — {p.company}</option>)}
        </select>
        <select value={selectedBatchId} onChange={e => setSelectedBatchId(e.target.value)} className={INPUT_CLS + ' min-w-40'}>
          <option value="">All batches</option>
          {programBatches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-gray-400 text-xs">Loading attendance…</div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {studentStats.map(s => (
              <div key={s.name} className={`bg-white rounded-2xl border shadow-sm p-4 ${s.pct < 80 ? 'border-red-200 bg-red-50/30' : 'border-gray-100'}`}>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-bold text-gray-800">{s.name}</p>
                  {s.pct < 80 && <span className="text-[9px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full font-bold border border-red-200">DEFAULTER</span>}
                </div>
                <div className="flex items-end justify-between mb-2">
                  <p className={`text-3xl font-bold ${s.pct >= 80 ? 'text-emerald-600' : 'text-red-600'}`}>{s.pct}%</p>
                  <p className="text-[10px] text-gray-400">{s.total} days tracked</p>
                </div>
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden mb-2">
                  <div className={`h-1.5 rounded-full ${s.pct >= 80 ? 'bg-emerald-500' : 'bg-red-500'}`} style={{ width: `${s.pct}%` }} />
                </div>
                <div className="flex gap-3 text-[10px] font-semibold">
                  <span className="text-emerald-600">P: {s.present}</span>
                  <span className="text-amber-600">H: {s.halfDay}</span>
                  <span className="text-red-500">A: {s.absent}</span>
                  <span className="text-purple-600">L: {s.leave}</span>
                </div>
              </div>
            ))}
          </div>

          {defaulters.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
              <p className="text-xs font-bold text-red-800 mb-2">Students below 80% Attendance Requirement</p>
              <div className="flex gap-2 flex-wrap">
                {defaulters.map(d => (
                  <span key={d.name} className="px-2 py-1 bg-white border border-red-100 rounded-lg text-xs font-semibold text-red-700">
                    {d.name} ({d.pct}%)
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-sm font-semibold text-gray-700" />
                <p className="text-xs text-gray-500">Showing records for {selectedDate}</p>
              </div>
              <button onClick={() => openMark()} className="text-xs font-semibold px-3 py-1.5 bg-blue-600 text-white rounded-lg shadow-sm hover:bg-blue-700">Mark Attendance</button>
            </div>
            <div className="p-4 grid gap-2">
              {dayRecords.length === 0 ? (
                <div className="text-center py-8 text-gray-400 text-xs">No records for this date.</div>
              ) : dayRecords.map(r => (
                <div key={r.id} className="flex items-center justify-between p-3 rounded-xl border border-gray-100 bg-gray-50/50">
                  <div>
                    <p className="text-sm font-bold text-gray-900">{r.studentName}</p>
                    {r.remarks && <p className="text-xs text-gray-500 mt-0.5">{r.remarks}</p>}
                  </div>
                  <div className="flex items-center gap-3">
                    {statusBadge(r.status)}
                    <button onClick={() => openMark({ studentId: r.studentId, date: r.date, status: r.status, remarks: r.remarks })} className="text-xs font-semibold text-blue-600 hover:underline">Edit</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {showMarkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="text-base font-bold text-gray-900">Mark Attendance</h3>
              <button onClick={() => setShowMarkModal(false)} className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-lg"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className={LABEL_CLS}>Student *</label>
                <select value={markForm.studentId} onChange={e => setMarkForm(p => ({ ...p, studentId: e.target.value }))} className={INPUT_CLS}>
                  <option value="">Select student…</option>
                  {enrolledStudents.map(s => <option key={s.studentId} value={s.studentId}>{s.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={LABEL_CLS}>Date</label>
                  <input type="date" value={markForm.date} onChange={e => setMarkForm(p => ({ ...p, date: e.target.value }))} className={INPUT_CLS} />
                </div>
                <div>
                  <label className={LABEL_CLS}>Status</label>
                  <select value={markForm.status} onChange={e => setMarkForm(p => ({ ...p, status: e.target.value as AttendanceStatus }))} className={INPUT_CLS}>
                    <option value="PRESENT">Present</option>
                    <option value="ABSENT">Absent</option>
                    <option value="HALF_DAY">Half Day</option>
                    <option value="LEAVE">Leave</option>
                  </select>
                </div>
              </div>
              <div>
                <label className={LABEL_CLS}>Remarks</label>
                <input value={markForm.remarks} onChange={e => setMarkForm(p => ({ ...p, remarks: e.target.value }))} className={INPUT_CLS} placeholder="Optional notes…" />
              </div>
            </div>
            <div className="flex gap-3 px-6 pb-6">
              <button onClick={() => setShowMarkModal(false)} className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 font-medium">Cancel</button>
              <button onClick={() => markMut.mutate({ ...markForm, programId: selectedProgramId, batchId: selectedBatchId, notes: markForm.remarks })} disabled={!markForm.studentId || markMut.isPending}
                className="flex-1 py-2 text-sm font-bold text-white bg-gradient-to-r from-blue-600 to-cyan-600 rounded-xl disabled:opacity-50">
                Save Record
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
