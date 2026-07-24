import React, { useState, useEffect } from 'react';
import { useQueryClient, useQuery, useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Users, Plus, Search, ExternalLink, Star, Key, Trash2, X } from 'lucide-react';
import api from '../../../../lib/axios';
import { INPUT_CLS, LABEL_CLS, statusBadge, validateGithubUsername } from '../shared';
import { InternLoginCredentials, InternLoginCreds } from '../InternLoginCredentials';

interface ProgramStudent {
  allocationId: string;
  studentId: string;
  batchId?: string;
  batchName?: string;
  mentorName?: string;
  name: string;
  email: string;
  githubUsername: string;
  phone: string;
  allocationStatus: string;
  enrolledAt: string;
  tasksTotal: number;
  tasksGraded: number;
  avgScore: number | null;
}

export function StudentsTab() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [selectedProgramId, setSelectedProgramId] = useState('');
  const [showAssign, setShowAssign] = useState(false);
  const [assignStudentId, setAssignStudentId] = useState('');
  const [assignBatchId, setAssignBatchId] = useState('');
  const [showCredModal, setShowCredModal] = useState<ProgramStudent | null>(null);
  const [credData, setCredData] = useState<InternLoginCreds | null>(null);
  const [loadingCred, setLoadingCred] = useState(false);
  const [editStudent, setEditStudent] = useState<ProgramStudent | null>(null);
  const [editGithub, setEditGithub] = useState('');
  const [newIntern, setNewIntern] = useState({ name: '', email: '', phone: '', githubUsername: '', password: '' });
  const [createdIntern, setCreatedIntern] = useState<any>(null);

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

  useEffect(() => {
    if (!assignBatchId && programBatches.length > 0) setAssignBatchId(programBatches[0].id);
  }, [programBatches, assignBatchId]);

  const { data: students = [], isLoading } = useQuery<ProgramStudent[]>({
    queryKey: ['admin-intern-program-students', selectedProgramId],
    queryFn: async () => (await api.get(`/intern/admin/programs/${selectedProgramId}/students`)).data.data,
    enabled: !!selectedProgramId,
  });

  const { data: internPool = [] } = useQuery<{ id: string; name: string; email: string; githubUsername: string }[]>({
    queryKey: ['admin-intern-lookup-interns'],
    queryFn: async () => (await api.get('/intern/admin/lookup/intern-students')).data.data,
  });

  const createInternMut = useMutation({
    mutationFn: async () => (await api.post('/intern/admin/intern-students', newIntern)).data.data,
    onSuccess: (data: any) => {
      setCreatedIntern(data);
      setAssignStudentId(data.id);
      setNewIntern({ name: '', email: '', phone: '', githubUsername: '', password: '' });
      qc.invalidateQueries({ queryKey: ['admin-intern-lookup-interns'] });
      toast.success('Intern created — copy password from green box');
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Failed to create intern'),
  });

  const addMut = useMutation({
    mutationFn: ({ studentId, batchId }: { studentId: string; batchId: string }) =>
      api.post(`/intern/admin/programs/${selectedProgramId}/students`, { studentId, batchId }),
    onSuccess: () => {
      toast.success('Student enrolled in program!');
      setShowAssign(false);
      setAssignStudentId('');
      qc.invalidateQueries({ queryKey: ['admin-intern-program-students', selectedProgramId] });
      qc.invalidateQueries({ queryKey: ['admin-intern-dashboard'] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Failed to add student'),
  });

  const resetPwdMut = useMutation({
    mutationFn: (studentId: string) => api.post(`/intern/admin/intern-students/${studentId}/reset-password`),
    onSuccess: (res) => {
      const data = res.data.data;
      setCredData((prev: InternLoginCreds | null) => ({
        ...(prev ?? { email: '' }),
        email: data.email ?? prev?.email ?? '',
        password: data.password,
        portalUrl: data.portalUrl ?? prev?.portalUrl,
        loginNote: 'New password generated. Student must use this exact password at login.',
      }));
      toast.success('Password reset — copy new password from green box');
    },
    onError: () => toast.error('Failed to reset password'),
  });

  const updateStudentMut = useMutation({
    mutationFn: ({ id, githubUsername }: { id: string; githubUsername: string }) =>
      api.patch(`/intern/admin/intern-students/${id}`, { githubUsername }),
    onSuccess: () => {
      toast.success('GitHub username updated');
      setEditStudent(null);
      qc.invalidateQueries({ queryKey: ['admin-intern-program-students', selectedProgramId] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Failed to update'),
  });

  const removeMut = useMutation({
    mutationFn: (studentId: string) => api.delete(`/intern/admin/programs/${selectedProgramId}/students/${studentId}`),
    onSuccess: () => {
      toast.success('Student removed from program');
      qc.invalidateQueries({ queryKey: ['admin-intern-program-students', selectedProgramId] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Failed to remove student'),
  });

  async function viewCredentials(student: ProgramStudent) {
    setShowCredModal(student);
    setCredData(null);
    setLoadingCred(true);
    try {
      const res = await api.get(`/intern/admin/programs/${selectedProgramId}/students/${student.studentId}/credentials`);
      setCredData(res.data.data);
    } catch {
      toast.error('Failed to load credentials');
    } finally {
      setLoadingCred(false);
    }
  }

  const filtered = students.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.email.toLowerCase().includes(search.toLowerCase()) ||
    (s.githubUsername ?? '').toLowerCase().includes(search.toLowerCase())
  );

  // Already enrolled IDs to exclude from assignment dropdown
  const enrolledIds = new Set(students.map(s => s.studentId));
  const availablePool = internPool.filter(u => !enrolledIds.has(u.id));

  return (
    <div className="space-y-4">
      {/* Program Selector */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-3 flex-wrap">
        <Users className="w-4 h-4 text-blue-500 shrink-0" />
        <span className="text-xs font-semibold text-gray-600">Managing students for:</span>
        <select
          value={selectedProgramId}
          onChange={e => setSelectedProgramId(e.target.value)}
          className="flex-1 border border-gray-200 rounded-xl px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
          {programs.map(p => (
            <option key={p.id} value={p.id}>{p.title} — {p.company}</option>
          ))}
        </select>
        <div className="text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-1 rounded-lg">
          {students.length} students enrolled
        </div>
      </div>

      {/* Actions Row */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-48 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, email, GitHub…"
            className="w-full bg-white border border-gray-200 rounded-xl pl-9 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
        </div>
        <button onClick={() => setShowAssign(true)} disabled={!selectedProgramId}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-cyan-600 text-white text-sm font-semibold rounded-xl shadow-md disabled:opacity-50">
          <Plus className="w-4 h-4" /> Add Student
        </button>
      </div>

      {/* Students Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gradient-to-r from-blue-50 to-cyan-50 border-b border-blue-100">
                <th className="text-left px-4 py-3 text-xs font-bold text-blue-800">Student</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-blue-800">Batch / Mentor</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-blue-800">GitHub</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-blue-800">Enrolled</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-blue-800">Tasks</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-blue-800">Avg Score</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-blue-800">Status</th>
                <th className="px-4 py-3 text-xs font-bold text-blue-800">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {isLoading ? (
                <tr><td colSpan={8} className="text-center py-8 text-gray-400 text-xs">Loading students…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-12 text-gray-400 text-xs">
                  <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  {selectedProgramId ? 'No students enrolled. Click "Add Student" to assign one.' : 'Select a program first.'}
                </td></tr>
              ) : filtered.map(s => (
                <tr key={s.allocationId} className="hover:bg-blue-50/20 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center text-white font-bold text-[10px] shrink-0">
                        {s.name.split(' ').map(n => n[0]).join('').slice(0,2)}
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900 text-xs">{s.name}</p>
                        <p className="text-[10px] text-gray-400">{s.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-xs font-semibold text-gray-800">{s.batchName || '—'}</p>
                    <p className="text-[10px] text-gray-400">{s.mentorName || 'No mentor'}</p>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      {s.githubUsername ? (
                        <a href={`https://github.com/${s.githubUsername}`} target="_blank" rel="noopener noreferrer"
                          className="text-xs text-blue-600 hover:underline font-mono flex items-center gap-1">
                          @{s.githubUsername} <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      ) : (
                        <span className="text-[10px] text-red-400 italic font-semibold">Not set</span>
                      )}
                      <button onClick={() => { setEditStudent(s); setEditGithub(s.githubUsername ?? ''); }}
                        className="p-0.5 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded" title="Edit GitHub username">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">{s.enrolledAt}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <div className="h-1.5 w-16 bg-gray-100 rounded-full">
                        <div className="h-1.5 bg-blue-500 rounded-full" style={{ width: `${s.tasksTotal > 0 ? Math.round((s.tasksGraded / s.tasksTotal) * 100) : 0}%` }} />
                      </div>
                      <span className="text-[10px] text-gray-500">{s.tasksGraded}/{s.tasksTotal}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {s.avgScore != null ? (
                      <span className="text-xs font-bold text-amber-600 flex items-center gap-0.5">
                        <Star className="w-3 h-3 fill-amber-500 text-amber-500" />{s.avgScore}/5
                      </span>
                    ) : <span className="text-[10px] text-gray-400">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${
                      s.allocationStatus === 'ACTIVE' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' :
                      s.allocationStatus === 'COMPLETED' ? 'bg-blue-100 text-blue-700 border-blue-200' :
                      'bg-gray-100 text-gray-500 border-gray-200'
                    }`}>{s.allocationStatus}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1 justify-center">
                      <button onClick={() => viewCredentials(s)}
                        className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg" title="View login credentials">
                        <Key className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => { if (confirm(`Remove ${s.name} from this program?`)) removeMut.mutate(s.studentId); }}
                        className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg" title="Remove from program">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Student Modal */}
      {showAssign && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="text-base font-bold text-gray-900">Add Student to Program</h3>
              <button onClick={() => { setShowAssign(false); setCreatedIntern(null); }} className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-lg"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-6 space-y-4">
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
                <label className={LABEL_CLS}>Batch *</label>
                <select value={assignBatchId} onChange={e => setAssignBatchId(e.target.value)} className={INPUT_CLS}>
                  <option value="">— Choose batch —</option>
                  {programBatches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
                {programBatches.length === 0 && (
                  <p className="text-[10px] text-amber-600 mt-1">No batches for this program. Create one in the Batches tab first.</p>
                )}
              </div>
              <div>
                <label className={LABEL_CLS}>Select Intern Student *</label>
                <select value={assignStudentId} onChange={e => setAssignStudentId(e.target.value)} className={INPUT_CLS}>
                  <option value="">— Choose a student —</option>
                  {availablePool.map(u => (
                    <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
                  ))}
                </select>
                {availablePool.length === 0 && !createdIntern && (
                  <p className="text-[10px] text-amber-600 mt-1">Create an intern account above or use Batches → Assign Students.</p>
                )}
              </div>
            </div>
            <div className="flex gap-3 px-6 pb-6">
              <button onClick={() => { setShowAssign(false); setCreatedIntern(null); }} className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 font-medium">Cancel</button>
              <button onClick={() => assignStudentId && assignBatchId && addMut.mutate({ studentId: assignStudentId, batchId: assignBatchId })}
                disabled={!assignStudentId || !assignBatchId || addMut.isPending}
                className="flex-1 py-2 text-sm font-bold text-white bg-gradient-to-r from-blue-600 to-cyan-600 rounded-xl disabled:opacity-50 flex items-center justify-center gap-2">
                {addMut.isPending ? <><span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin inline-block" /> Adding…</> : 'Add to Program'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Credentials Modal */}
      {showCredModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <Key className="w-4 h-4 text-blue-600" /> Student Login Info
              </h3>
              <button onClick={() => setShowCredModal(null)} className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-lg"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-6">
              {loadingCred ? (
                <div className="text-center py-6 text-gray-400 text-sm">Loading…</div>
              ) : credData ? (
                <div className="space-y-3">
                  <div className="bg-gray-50 rounded-xl p-3 space-y-2">
                    <p className="text-xs text-gray-500">Name</p>
                    <p className="font-bold text-gray-900 text-sm">{showCredModal.name}</p>
                  </div>
                  <InternLoginCredentials creds={{
                    email: credData.email,
                    password: credData.password,
                    portalUrl: credData.portalUrl,
                    loginNote: credData.loginNote,
                  }} />
                  <button onClick={() => showCredModal && resetPwdMut.mutate(showCredModal.studentId)}
                    disabled={resetPwdMut.isPending}
                    className="w-full py-2 text-xs font-bold text-white bg-blue-600 rounded-xl disabled:opacity-50 hover:bg-blue-700">
                    {resetPwdMut.isPending ? 'Resetting…' : 'Generate New Password'}
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {/* Edit GitHub Username Modal */}
      {editStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="text-base font-bold text-gray-900">Edit GitHub Username</h3>
              <button onClick={() => setEditStudent(null)} className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-lg">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <p className="text-xs text-gray-500 mb-1">Student: <strong>{editStudent.name}</strong></p>
                <p className="text-xs text-gray-400 mb-3">This username is used to match GitHub push events for auto-evaluation.</p>
                <label className="text-xs font-semibold text-gray-700 block mb-1.5">GitHub Username</label>
                <input
                  value={editGithub}
                  onChange={e => setEditGithub(e.target.value.trim())}
                  placeholder="e.g. lmsvtricks-max"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                  autoFocus
                />
              </div>
              <button
                onClick={() => {
                  const error = validateGithubUsername(editGithub);
                  if (error) {
                    toast.error(error);
                    return;
                  }
                  updateStudentMut.mutate({ id: editStudent.studentId, githubUsername: editGithub });
                }}
                disabled={!editGithub.trim() || updateStudentMut.isPending}
                className="w-full py-2.5 bg-gradient-to-r from-blue-600 to-cyan-600 text-white text-sm font-bold rounded-xl disabled:opacity-50">
                {updateStudentMut.isPending ? 'Saving…' : 'Save GitHub Username'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
