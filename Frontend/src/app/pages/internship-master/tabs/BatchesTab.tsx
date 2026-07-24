import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Search, Plus, UserCheck, Users, AlertCircle, X } from 'lucide-react';
import api from '../../../../lib/axios';
import { TabError, INPUT_CLS, LABEL_CLS, statusBadge, validateGithubUsername } from '../shared';
import { InternLoginCredentials } from '../InternLoginCredentials';
import { ProgramRow } from './ProgramsTab';

type BatchRow = {
  id: string; programId: string; programTitle: string; company: string;
  name: string; mentorId: string; mentorName: string; mentorEmail?: string;
  startDate: string; endDate: string; studentCount: number;
  status: 'ACTIVE' | 'COMPLETED' | 'UPCOMING';
};
type MentorOption = { id: string; name: string; email: string };
type InternStudentOption = { id: string; name: string; email: string; phone?: string; githubUsername?: string };
type BatchStudentRow = {
  allocationId: string; studentId: string; name: string; email: string;
  githubUsername: string; allocationStatus: 'ACTIVE' | 'COMPLETED' | 'DROPPED';
  progress: number; tasksAssigned: number; tasksGraded: number; avgScore: number | null;
};
type CreatedIntern = InternStudentOption & { password: string; portalUrl: string };
type CreatedTrainer = MentorOption & { phone?: string; githubUsername?: string; password: string; loginNote?: string };

export function BatchesTab() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showTrainerModal, setShowTrainerModal] = useState(false);
  const [editingBatch, setEditingBatch] = useState<BatchRow | null>(null);
  const [assignBatch, setAssignBatch] = useState<BatchRow | null>(null);
  const [progressBatch, setProgressBatch] = useState<BatchRow | null>(null);
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
  const [newTrainer, setNewTrainer] = useState({ name: '', email: '', phone: '', githubUsername: '' });
  const [createdTrainer, setCreatedTrainer] = useState<CreatedTrainer | null>(null);
  const [newIntern, setNewIntern] = useState({ name: '', email: '', phone: '', githubUsername: '', password: '' });
  const [createdIntern, setCreatedIntern] = useState<CreatedIntern | null>(null);

  const blankForm = { name: '', programId: '', startDate: '', endDate: '', mentorId: '', status: 'UPCOMING' as BatchRow['status'] };
  const [form, setForm] = useState(blankForm);

  const { data: batches = [], isLoading, isError: batchesError } = useQuery<BatchRow[]>({
    queryKey: ['admin-intern-batches'],
    queryFn: async () => (await api.get('/intern/admin/batches')).data.data,
    retry: 2,
  });
  const { data: programs = [] } = useQuery<ProgramRow[]>({
    queryKey: ['admin-intern-programs'],
    queryFn: async () => (await api.get('/intern/admin/programs')).data.data,
  });
  const { data: mentors = [] } = useQuery<MentorOption[]>({
    queryKey: ['admin-intern-mentors'],
    queryFn: async () => (await api.get('/intern/admin/lookup/trainers')).data.data,
  });
  const { data: internStudents = [] } = useQuery<InternStudentOption[]>({
    queryKey: ['admin-intern-student-pool'],
    queryFn: async () => (await api.get('/intern/admin/lookup/intern-students')).data.data,
  });
  const { data: batchStudents = [], isLoading: progressLoading } = useQuery<BatchStudentRow[]>({
    queryKey: ['admin-intern-batch-students', progressBatch?.id],
    enabled: !!progressBatch,
    queryFn: async () => (await api.get(`/intern/admin/batches/${progressBatch!.id}/students`)).data.data,
  });

  const createMut = useMutation({
    mutationFn: (body: typeof blankForm) => api.post('/intern/admin/batches', body),
    onSuccess: () => {
      toast.success('Batch created');
      qc.invalidateQueries({ queryKey: ['admin-intern-batches'] });
      qc.invalidateQueries({ queryKey: ['admin-intern-lookup-batches'] });
      setShowModal(false);
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Failed to create batch'),
  });
  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: typeof blankForm }) => api.put(`/intern/admin/batches/${id}`, body),
    onSuccess: () => {
      toast.success('Batch updated');
      qc.invalidateQueries({ queryKey: ['admin-intern-batches'] });
      qc.invalidateQueries({ queryKey: ['admin-intern-lookup-batches'] });
      setShowModal(false);
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Failed to update batch'),
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/intern/admin/batches/${id}`),
    onSuccess: () => {
      toast.success('Batch deleted');
      qc.invalidateQueries({ queryKey: ['admin-intern-batches'] });
      qc.invalidateQueries({ queryKey: ['admin-intern-lookup-batches'] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Failed to delete batch'),
  });
  const assignMut = useMutation({
    mutationFn: async ({ batch, studentIds }: { batch: BatchRow; studentIds: string[] }) => {
      // Use allSettled so one failing assignment doesn't discard the successful ones.
      const results = await Promise.allSettled(
        studentIds.map(studentId =>
          api.post(`/intern/admin/programs/${batch.programId}/students`, { studentId, batchId: batch.id })
        )
      );
      const failed = results.filter(r => r.status === 'rejected').length;
      const succeeded = results.length - failed;
      if (failed > 0 && succeeded === 0) {
        // All failed — surface the first rejection so onError runs.
        const firstErr = (results.find(r => r.status === 'rejected') as PromiseRejectedResult).reason;
        throw firstErr;
      }
      return { succeeded, failed };
    },
    onSuccess: ({ succeeded, failed }) => {
      if (failed > 0) {
        toast.error(`${succeeded} assigned, ${failed} failed — check the list and retry the failed ones.`);
      } else {
        toast.success('Students assigned to batch');
      }
      qc.invalidateQueries({ queryKey: ['admin-intern-batches'] });
      qc.invalidateQueries({ queryKey: ['admin-intern-batch-students'] });
      qc.invalidateQueries({ queryKey: ['admin-intern-program-students'] });
      qc.invalidateQueries({ queryKey: ['admin-intern-dashboard'] });
      setAssignBatch(null);
      setSelectedStudents([]);
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Failed to assign students'),
  });
  const createInternMut = useMutation({
    mutationFn: async () => (await api.post('/intern/admin/intern-students', newIntern)).data.data,
    onSuccess: (data: CreatedIntern) => {
      setCreatedIntern(data);
      setSelectedStudents(prev => prev.includes(data.id) ? prev : [...prev, data.id]);
      setNewIntern({ name: '', email: '', phone: '', githubUsername: '', password: '' });
      qc.invalidateQueries({ queryKey: ['admin-intern-student-pool'] });
      toast.success('Intern created — copy password from green box');
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Failed to create intern account'),
  });
  const createTrainerMut = useMutation({
    mutationFn: async () => (await api.post('/intern/admin/trainers', newTrainer)).data.data,
    onSuccess: (data: CreatedTrainer) => {
      setCreatedTrainer(data);
      setNewTrainer({ name: '', email: '', phone: '', githubUsername: '' });
      qc.invalidateQueries({ queryKey: ['admin-intern-mentors'] });
      toast.success('Trainer created');
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Failed to create trainer'),
  });

  const filtered = batches.filter(b =>
    b.name.toLowerCase().includes(search.toLowerCase()) ||
    b.programTitle.toLowerCase().includes(search.toLowerCase()) ||
    (b.mentorName ?? '').toLowerCase().includes(search.toLowerCase())
  );

  function openCreate() { setForm(blankForm); setEditingBatch(null); setShowModal(true); }
  function openEdit(b: BatchRow) {
    setForm({ name: b.name, programId: b.programId, startDate: b.startDate, endDate: b.endDate, mentorId: b.mentorId, status: b.status });
    setEditingBatch(b); setShowModal(true);
  }
  function save() {
    if (!form.name.trim() || !form.programId || !form.mentorId || !form.startDate || !form.endDate) return;
    if (editingBatch) updateMut.mutate({ id: editingBatch.id, body: form });
    else createMut.mutate(form);
  }

  const saving = createMut.isPending || updateMut.isPending;
  const assigning = assignMut.isPending;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search batches…"
            className="w-full bg-white border border-gray-200 rounded-xl pl-9 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
        </div>
        <button onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-cyan-600 text-white text-sm font-semibold rounded-xl shadow-md">
          <Plus className="w-4 h-4" /> New Batch
        </button>
        <button onClick={() => { setCreatedTrainer(null); setShowTrainerModal(true); }}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-blue-200 text-blue-700 text-sm font-semibold rounded-xl shadow-sm hover:bg-blue-50">
          <UserCheck className="w-4 h-4" /> New Trainer
        </button>
      </div>

      {isLoading ? (
        <div className="grid gap-3">{[1,2,3].map(i => <div key={i} className="bg-gray-100 rounded-2xl h-32 animate-pulse" />)}</div>
      ) : batchesError ? (
        <TabError />
      ) : (
      <div className="grid gap-3">
        {filtered.length === 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center text-gray-400">
            <Users className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm font-semibold">No batches yet</p>
            <p className="text-xs mt-1">Create a program first, then create a batch with a mentor assigned.</p>
          </div>
        )}
        {filtered.map(b => (
          <div key={b.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 hover:border-blue-200 transition-colors">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center flex-shrink-0">
                  <Users className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="font-bold text-gray-900 text-sm">{b.name}</p>
                  <p className="text-xs text-gray-500">{b.programTitle} · {b.company}</p>
                </div>
              </div>
              {statusBadge(b.status)}
            </div>
            <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Start', value: b.startDate },
                { label: 'End', value: b.endDate },
                { label: 'Mentor', value: b.mentorName || 'Not assigned' },
                { label: 'Students', value: `${b.studentCount} enrolled` },
              ].map(f => (
                <div key={f.label} className="bg-gray-50 rounded-xl p-3">
                  <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">{f.label}</p>
                  <p className="text-xs font-semibold text-gray-700 mt-0.5">{f.value}</p>
                </div>
              ))}
            </div>
            <div className="mt-3 flex gap-2">
              <button onClick={() => { setAssignBatch(b); setSelectedStudents([]); }}
                className="text-xs px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 font-semibold">Assign Students</button>
              <button onClick={() => setProgressBatch(b)}
                className="text-xs px-3 py-1.5 bg-emerald-50 text-emerald-600 rounded-lg hover:bg-emerald-100 font-semibold">View Progress</button>
              <button onClick={() => openEdit(b)}
                className="text-xs px-3 py-1.5 bg-purple-50 text-purple-600 rounded-lg hover:bg-purple-100 font-semibold">Edit</button>
              <button onClick={() => { if (confirm(`Delete batch "${b.name}"?`)) deleteMut.mutate(b.id); }}
                className="text-xs px-3 py-1.5 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 font-semibold">Delete</button>
            </div>
          </div>
        ))}
      </div>
      )}

      {/* Create / Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="text-base font-bold text-gray-900">{editingBatch ? 'Edit Batch' : 'Create Internship Batch'}</h3>
              <button onClick={() => setShowModal(false)} className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-lg"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-6 space-y-3">
              {programs.length === 0 && (
                <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-500" />
                  <span>No internship programs found. Go to the <strong>Programs</strong> tab and create a program first before creating a batch.</span>
                </div>
              )}
              {mentors.length === 0 && (
                <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-500" />
                  <span>No trainers found. Click <strong>New Trainer</strong> to create a trainer account first, then come back to create the batch.</span>
                </div>
              )}
              <div>
                <label className={LABEL_CLS}>Batch Name *</label>
                <input value={form.name} onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))} className={INPUT_CLS} placeholder="Full Stack July 2026 - Batch A" />
              </div>
              <div>
                <label className={LABEL_CLS}>Program *</label>
                <select value={form.programId} onChange={e => setForm(prev => ({ ...prev, programId: e.target.value }))} className={INPUT_CLS}>
                  <option value="">Choose program</option>
                  {programs.map(p => <option key={p.id} value={p.id}>{p.title} ({p.company})</option>)}
                </select>
              </div>
              <div>
                <label className={LABEL_CLS}>Batch Mentor *</label>
                <select value={form.mentorId} onChange={e => setForm(prev => ({ ...prev, mentorId: e.target.value }))} className={INPUT_CLS}>
                  <option value="">Choose mentor</option>
                  {mentors.map(m => <option key={m.id} value={m.id}>{m.name} ({m.email})</option>)}
                </select>
                {mentors.length === 0 && (
                  <p className="text-[10px] text-amber-600 mt-1">Create a trainer first using the <strong>New Trainer</strong> button.</p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={LABEL_CLS}>Start Date *</label>
                  <input type="date" value={form.startDate} onChange={e => setForm(prev => ({ ...prev, startDate: e.target.value }))} className={INPUT_CLS} />
                </div>
                <div>
                  <label className={LABEL_CLS}>End Date *</label>
                  <input type="date" value={form.endDate} onChange={e => setForm(prev => ({ ...prev, endDate: e.target.value }))} className={INPUT_CLS} />
                </div>
              </div>
              <div>
                <label className={LABEL_CLS}>Status</label>
                <select value={form.status} onChange={e => setForm(prev => ({ ...prev, status: e.target.value as BatchRow['status'] }))} className={INPUT_CLS}>
                  {['UPCOMING', 'ACTIVE', 'COMPLETED'].map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-3 px-6 pb-6">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 font-medium">Cancel</button>
              <button onClick={save} disabled={!form.name.trim() || !form.programId || !form.mentorId || !form.startDate || !form.endDate || saving}
                className="flex-1 py-2 text-sm font-bold text-white bg-gradient-to-r from-blue-600 to-cyan-600 rounded-xl disabled:opacity-50 flex items-center justify-center gap-2">
                {saving ? <><span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin inline-block" /> Saving…</> : (editingBatch ? 'Save Changes' : 'Create Batch')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Trainer Modal */}
      {showTrainerModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="text-base font-bold text-gray-900">Create Trainer</h3>
              <button onClick={() => setShowTrainerModal(false)} className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-lg"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={LABEL_CLS}>Trainer Name *</label>
                  <input value={newTrainer.name} onChange={e => setNewTrainer(p => ({ ...p, name: e.target.value }))} className={INPUT_CLS} placeholder="Mentor full name" />
                </div>
                <div>
                  <label className={LABEL_CLS}>Email / Login ID *</label>
                  <input type="email" value={newTrainer.email} onChange={e => setNewTrainer(p => ({ ...p, email: e.target.value }))} className={INPUT_CLS} placeholder="trainer@example.com" />
                </div>
                <div>
                  <label className={LABEL_CLS}>Phone</label>
                  <div className="flex">
                    <span className="inline-flex items-center px-3 rounded-l-xl border border-r-0 border-gray-200 bg-gray-50 text-gray-500 text-sm font-medium select-none">+91</span>
                    <input
                      type="tel"
                      inputMode="numeric"
                      maxLength={10}
                      value={newTrainer.phone}
                      onChange={e => setNewTrainer(p => ({ ...p, phone: e.target.value.replace(/\D/g, '').slice(0, 10) }))}
                      className={INPUT_CLS + ' rounded-l-none border-l-0 flex-1'}
                      placeholder="9876543210"
                    />
                  </div>
                </div>
                <div>
                  <label className={LABEL_CLS}>GitHub Username</label>
                  <input value={newTrainer.githubUsername} onChange={e => setNewTrainer(p => ({ ...p, githubUsername: e.target.value }))} className={INPUT_CLS} placeholder="github-handle" />
                </div>
              </div>
              {createdTrainer && (
                <div className="rounded-xl bg-blue-50 border border-blue-100 p-4 text-xs text-blue-800 space-y-1">
                  <p><strong>Trainer ID:</strong> {createdTrainer.email}</p>
                  <p><strong>Password:</strong> {createdTrainer.password}</p>
                  <p>{createdTrainer.loginNote || 'Use this trainer in the batch mentor dropdown.'}</p>
                </div>
              )}
            </div>
            <div className="flex gap-3 px-6 py-4 border-t border-gray-100">
              <button onClick={() => setShowTrainerModal(false)} className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 font-medium">Close</button>
              <button onClick={() => {
                if (newTrainer.githubUsername.trim()) {
                  const error = validateGithubUsername(newTrainer.githubUsername.trim());
                  if (error) {
                    toast.error(error);
                    return;
                  }
                }
                createTrainerMut.mutate();
              }} disabled={!newTrainer.name.trim() || !newTrainer.email.trim() || createTrainerMut.isPending}
                className="flex-1 py-2 text-sm font-bold text-white bg-gradient-to-r from-blue-600 to-cyan-600 rounded-xl disabled:opacity-50">
                {createTrainerMut.isPending ? 'Creating…' : 'Create Trainer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Assign Students Modal */}
      {assignBatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="text-base font-bold text-gray-900">Assign Students</h3>
              <button onClick={() => { setAssignBatch(null); setCreatedIntern(null); }} className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-lg"><X className="w-4 h-4" /></button>
            </div>
            <div className="px-6 py-4 overflow-y-auto space-y-4">
              <p className="text-xs text-gray-500">Batch: <span className="font-semibold text-gray-700">{assignBatch.name}</span> · Program: <span className="font-semibold text-gray-700">{assignBatch.programTitle}</span></p>
              <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 space-y-3">
                <p className="text-xs font-bold text-blue-700">Create intern login</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input value={newIntern.name} onChange={e => setNewIntern(p => ({ ...p, name: e.target.value }))} className={INPUT_CLS} placeholder="Student name" />
                  <input value={newIntern.email} onChange={e => setNewIntern(p => ({ ...p, email: e.target.value }))} className={INPUT_CLS} placeholder="Email / login ID" />
                  <div className="flex">
                    <span className="inline-flex items-center px-3 rounded-l-xl border border-r-0 border-gray-200 bg-gray-50 text-gray-500 text-sm font-medium select-none">+91</span>
                    <input type="tel" inputMode="numeric" maxLength={10} value={newIntern.phone}
                      onChange={e => setNewIntern(p => ({ ...p, phone: e.target.value.replace(/\D/g, '').slice(0, 10) }))}
                      className={INPUT_CLS + ' rounded-l-none border-l-0 flex-1'} placeholder="9876543210" />
                  </div>
                  <input value={newIntern.githubUsername} onChange={e => setNewIntern(p => ({ ...p, githubUsername: e.target.value }))} className={INPUT_CLS} placeholder="GitHub username" />
                  <input value={newIntern.password} onChange={e => setNewIntern(p => ({ ...p, password: e.target.value }))} className={INPUT_CLS + ' sm:col-span-2'} placeholder="Password (optional — auto-generated if blank)" />
                </div>
                <button onClick={() => {
                  if (newIntern.githubUsername.trim()) {
                    const error = validateGithubUsername(newIntern.githubUsername.trim());
                    if (error) {
                      toast.error(error);
                      return;
                    }
                  }
                  createInternMut.mutate();
                }} disabled={!newIntern.name.trim() || !newIntern.email.trim() || createInternMut.isPending}
                  className="px-3 py-2 text-xs font-bold text-white bg-blue-600 rounded-lg disabled:opacity-50">
                  {createInternMut.isPending ? 'Creating…' : 'Generate Student ID & Password'}
                </button>
                {createdIntern && (
                  <InternLoginCredentials creds={{
                    email: createdIntern.email,
                    password: createdIntern.password,
                    portalUrl: createdIntern.portalUrl,
                    loginNote: 'Student logs in at main login page with this email and exact password.',
                  }} />
                )}
              </div>
              <div>
                <p className="text-xs font-bold text-gray-700 mb-2">Select existing intern accounts</p>
                <div className="space-y-1 max-h-64 overflow-y-auto border border-gray-100 rounded-xl p-1">
                  {internStudents.length === 0 && <p className="text-xs text-gray-400 text-center py-4">No intern accounts found. Create one above.</p>}
                  {internStudents.map(s => (
                    <label key={s.id} className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-gray-50 cursor-pointer">
                      <input type="checkbox" checked={selectedStudents.includes(s.id)}
                        onChange={e => setSelectedStudents(prev => e.target.checked ? [...prev, s.id] : prev.filter(x => x !== s.id))}
                        className="w-4 h-4 accent-blue-600" />
                      <span className="text-sm text-gray-700 font-medium">{s.name}</span>
                      <span className="text-xs text-gray-400">{s.email}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex gap-3 px-6 py-4 border-t border-gray-100">
              <button onClick={() => { setAssignBatch(null); setCreatedIntern(null); }} className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 font-medium">Cancel</button>
              <button
                onClick={() => assignMut.mutate({ batch: assignBatch, studentIds: selectedStudents })}
                disabled={selectedStudents.length === 0 || assigning}
                className="flex-1 py-2 text-sm font-bold text-white bg-gradient-to-r from-blue-600 to-cyan-600 rounded-xl disabled:opacity-50">
                {assigning ? 'Assigning…' : `Assign ${selectedStudents.length > 0 ? `(${selectedStudents.length})` : ''} Students`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View Progress Modal */}
      {progressBatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white">
              <h3 className="text-base font-bold text-gray-900">Batch Progress</h3>
              <button onClick={() => setProgressBatch(null)} className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-lg"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-gradient-to-r from-blue-50 to-cyan-50 rounded-xl p-4">
                <p className="font-bold text-gray-900 text-sm">{progressBatch.name}</p>
                <p className="text-xs text-gray-500 mt-0.5">Mentor: {progressBatch.mentorName} · {progressBatch.studentCount} students enrolled</p>
              </div>
              {progressLoading ? (
                <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="bg-gray-100 rounded-xl h-16 animate-pulse" />)}</div>
              ) : batchStudents.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-4">No student allocations for this batch yet.</p>
              ) : (
                <div className="space-y-3">
                  {batchStudents.map(a => (
                    <div key={a.allocationId} className="bg-gray-50 rounded-xl p-3">
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <span className="text-sm font-semibold text-gray-900">{a.name}</span>
                          <p className="text-xs text-gray-400">{a.email}{a.githubUsername ? ` · @${a.githubUsername}` : ''}</p>
                        </div>
                        {statusBadge(a.allocationStatus)}
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-gray-200 rounded-full">
                          <div className={`h-2 rounded-full ${a.progress >= 70 ? 'bg-emerald-500' : a.progress >= 40 ? 'bg-blue-500' : 'bg-amber-500'}`}
                            style={{ width: `${a.progress}%` }} />
                        </div>
                        <span className="text-xs font-bold text-gray-700">{a.progress}%</span>
                      </div>
                      <p className="text-xs text-gray-400 mt-1">{a.tasksGraded}/{a.tasksAssigned} tasks graded · Avg score {a.avgScore ?? 'N/A'}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
