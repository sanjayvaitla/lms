import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { Plus, Building, FileText, Search, Loader2, Users, FileDown, Briefcase, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import api from '../../lib/axios';
import { fetchCourseList } from '../../lib/courseList';
import { Skeleton } from '../components/ui/skeleton';
import { INPUT_CLS, LABEL_CLS, ERROR_CLS } from '../../lib/constants';

import { useAuth } from '../../store/AuthContext';

function Modal({ children, onClose, title }: { children: React.ReactNode, onClose: () => void, title: string }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50 shrink-0">
          <h2 className="text-lg font-bold">{title}</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-200 rounded">X</button>
        </div>
        <div className="p-4 overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  );
}

export default function PlacementMaster() {
  const [tab, setTab] = useState<'jobs' | 'materials'>('jobs');
  const [showAddJob, setShowAddJob] = useState(false);
  const [showAddMaterial, setShowAddMaterial] = useState(false);
  const [viewingJob, setViewingJob] = useState<string | null>(null);

  const qc = useQueryClient();
  const { user } = useAuth();

  const { data: jobs = [], isLoading: jobsLoading } = useQuery({
    queryKey: ['placement-jobs'],
    queryFn: async () => (await api.get('/placements/jobs')).data.data
  });

  const { data: materials = [], isLoading: matLoading } = useQuery({
    queryKey: ['placement-materials'],
    queryFn: async () => (await api.get('/placements/materials')).data.data
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => api.delete(`/placements/jobs/${id}`),
    onSuccess: () => {
      toast.success('Job deleted successfully');
      qc.invalidateQueries({ queryKey: ['placement-jobs'] });
    },
    onError: (err: any) => {
      console.error(err);
      toast.error(err.response?.data?.message || 'Failed to delete job');
    }
  });

  const deleteMaterialMut = useMutation({
    mutationFn: async (id: string) => api.delete(`/placements/materials/${id}`),
    onSuccess: () => {
      toast.success('Material deleted successfully');
      qc.invalidateQueries({ queryKey: ['placement-materials'] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Failed to delete material');
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Briefcase className="w-6 h-6 text-blue-500" /> Placement Master
          </h1>
          <p className="text-gray-500 text-sm mt-1">Manage job postings and placement materials.</p>
        </div>
        <div className="flex gap-2">
          {user?.role !== 'OPERATIONAL_MANAGER' && (
            tab === 'jobs' ? (
              <button onClick={() => setShowAddJob(true)} className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold flex items-center gap-2">
                <Plus className="w-4 h-4" /> Add Job
              </button>
            ) : (
              <button onClick={() => setShowAddMaterial(true)} className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-semibold flex items-center gap-2">
                <Plus className="w-4 h-4" /> Add Material
              </button>
            )
          )}
        </div>
      </div>

      <div className="flex gap-4 border-b border-gray-200">
        <button
          className={`px-4 py-2 font-medium border-b-2 transition-colors ${tab === 'jobs' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          onClick={() => setTab('jobs')}
        >
          Jobs ({jobs.length})
        </button>
        <button
          className={`px-4 py-2 font-medium border-b-2 transition-colors ${tab === 'materials' ? 'border-emerald-600 text-emerald-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          onClick={() => setTab('materials')}
        >
          Materials ({materials.length})
        </button>
      </div>

      {tab === 'jobs' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {jobsLoading ? <Skeleton className="h-40" /> : jobs.map((job: any) => (
            <div key={job.id} className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex flex-col">
              <div className="flex justify-between items-start mb-2">
                <h3 className="font-bold text-lg text-gray-900">{job.company_name}</h3>
                <span className={`text-[10px] font-bold px-2 py-1 rounded-md ${job.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>{job.status}</span>
              </div>
              <p className="text-sm text-gray-600 line-clamp-2 mb-4">{job.job_description}</p>
              <div className="text-xs text-gray-500 mb-4 grid grid-cols-2 gap-2">
                <div><span className="font-medium text-gray-700">CTC:</span> {job.ctc}</div>
                <div><span className="font-medium text-gray-700">Exp:</span> {job.experience}</div>
              </div>
              <div className="mt-auto flex gap-2">
                <button
                  onClick={() => setViewingJob(job.id)}
                  className="flex-1 px-3 py-2 bg-blue-50 text-blue-600 font-semibold rounded-lg text-sm hover:bg-blue-100 flex items-center justify-center gap-2"
                >
                  <Users className="w-4 h-4"/> Applications
                </button>
                {job.attachment_url && (
                  <a href={job.attachment_url} target="_blank" rel="noreferrer" className="p-2 bg-gray-50 text-gray-600 rounded-lg hover:bg-gray-100">
                    <FileDown className="w-4 h-4" />
                  </a>
                )}
                {user?.role !== 'OPERATIONAL_MANAGER' && (
                  <button 
                    onClick={() => { if(confirm('Are you sure you want to delete this job?')) deleteMut.mutate(job.id); }}
                    className="p-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100"
                    title="Delete Job"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'materials' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {matLoading ? <Skeleton className="h-40" /> : materials.map((m: any) => (
            <div key={m.id} className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex flex-col">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-emerald-50 rounded-lg flex items-center justify-center text-emerald-600">
                  <FileText className="w-5 h-5"/>
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-gray-900">{m.title}</h3>
                  <p className="text-xs text-gray-500 mt-1">{format(new Date(m.created_at), 'MMM do, yyyy')}</p>
                </div>
                {user?.role !== 'OPERATIONAL_MANAGER' && (
                  <button
                    onClick={() => { if (confirm('Delete this material?')) deleteMaterialMut.mutate(m.id); }}
                    className="p-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 shrink-0"
                    title="Delete Material"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
              <p className="text-sm text-gray-600 mt-3 line-clamp-2 flex-1">{m.description}</p>
              <a href={m.file_url} target="_blank" rel="noreferrer" className="mt-4 block text-center px-4 py-2 bg-emerald-50 text-emerald-600 font-semibold rounded-lg text-sm hover:bg-emerald-100">
                View Material
              </a>
            </div>
          ))}
        </div>
      )}

      {showAddJob && <AddJobModal onClose={() => setShowAddJob(false)} onSuccess={() => { setShowAddJob(false); qc.invalidateQueries({ queryKey: ['placement-jobs']}); }} />}
      {showAddMaterial && <AddMaterialModal onClose={() => setShowAddMaterial(false)} onSuccess={() => { setShowAddMaterial(false); qc.invalidateQueries({ queryKey: ['placement-materials']}); }} />}
      {viewingJob && <JobApplicationsModal jobId={viewingJob} onClose={() => setViewingJob(null)} />}
    </div>
  );
}

function AddJobModal({ onClose, onSuccess }: any) {
  const { register, handleSubmit } = useForm();
  const mut = useMutation({
    mutationFn: async (data: any) => {
      const fd = new FormData();
      Object.keys(data).forEach(k => {
        if (k === 'file') {
          if (data[k] && data[k].length > 0) fd.append('file', data[k][0]);
        } else {
          fd.append(k, data[k]);
        }
      });
      return api.post('/placements/jobs', fd);
    },
    onSuccess: () => { toast.success('Job added'); onSuccess(); },
    onError: (err: any) => {
      console.error(err);
      toast.error(err.response?.data?.message || 'Failed to add job');
    }
  });

  return (
    <Modal title="Add Placement Job" onClose={onClose}>
      <form onSubmit={handleSubmit((d) => mut.mutate(d))} className="space-y-4">
        <div><label className={LABEL_CLS}>Company Name</label><input required {...register('company_name')} className={INPUT_CLS} /></div>
        <div><label className={LABEL_CLS}>Job Description</label><textarea required {...register('job_description')} className={INPUT_CLS} rows={3} /></div>
        <div className="grid grid-cols-2 gap-4">
          <div><label className={LABEL_CLS}>CTC</label><input required {...register('ctc')} className={INPUT_CLS} placeholder="e.g. 5-7 LPA" /></div>
          <div><label className={LABEL_CLS}>Experience</label><input required {...register('experience')} className={INPUT_CLS} placeholder="e.g. 0-2 years" /></div>
        </div>
        <div><label className={LABEL_CLS}>Qualification</label><input required {...register('qualification')} className={INPUT_CLS} placeholder="e.g. B.Tech / MCA" /></div>
        <div><label className={LABEL_CLS}>Company Details PDF (Optional)</label><input type="file" {...register('file')} className={INPUT_CLS} accept=".pdf" /></div>
        <button disabled={mut.isPending} className="w-full py-2 bg-blue-600 text-white rounded-xl font-bold">{mut.isPending ? 'Saving...' : 'Add Job'}</button>
      </form>
    </Modal>
  );
}

function AddMaterialModal({ onClose, onSuccess }: any) {
  const { register, handleSubmit } = useForm();
  const mut = useMutation({
    mutationFn: async (data: any) => {
      const fd = new FormData();
      Object.keys(data).forEach(k => {
        if (k === 'file') {
          if (data[k] && data[k].length > 0) fd.append('file', data[k][0]);
        } else {
          fd.append(k, data[k]);
        }
      });
      return api.post('/placements/materials', fd);
    },
    onSuccess: () => { toast.success('Material added'); onSuccess(); },
    onError: (err: any) => {
      console.error(err);
      toast.error(err.response?.data?.message || 'Failed to add material');
    }
  });

  return (
    <Modal title="Add Placement Material" onClose={onClose}>
      <form onSubmit={handleSubmit((d) => mut.mutate(d))} className="space-y-4">
        <div><label className={LABEL_CLS}>Title</label><input required {...register('title')} className={INPUT_CLS} /></div>
        <div><label className={LABEL_CLS}>Description</label><textarea {...register('description')} className={INPUT_CLS} rows={3} /></div>
        <div><label className={LABEL_CLS}>File (PDF/Docs) *</label><input required type="file" {...register('file')} className={INPUT_CLS} /></div>
        <button disabled={mut.isPending} className="w-full py-2 bg-emerald-600 text-white rounded-xl font-bold">{mut.isPending ? 'Saving...' : 'Add Material'}</button>
      </form>
    </Modal>
  );
}

function JobApplicationsModal({ jobId, onClose }: { jobId: string, onClose: () => void }) {
  const [courseId, setCourseId] = useState<string>('');

  const { data: coursesData } = useQuery({
    queryKey: ['courses'],
    queryFn: () => fetchCourseList(),
  });
  const courses = coursesData ?? [];

  const { data: apps = [], isLoading } = useQuery({
    queryKey: ['job-apps', jobId, courseId],
    queryFn: async () => {
      if (courseId) {
        return (await api.get(`/placements/jobs/${jobId}/course/${courseId}/applications`)).data.data;
      }
      return (await api.get(`/placements/jobs/${jobId}/applications`)).data.data;
    }
  });

  return (
    <Modal title="Job Applications" onClose={onClose}>
      <div className="mb-4">
        <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide mb-1">Filter by Course</label>
        <select
          value={courseId}
          onChange={(e) => setCourseId(e.target.value)}
          className={INPUT_CLS}
        >
          <option value="">-- All Applications --</option>
          {courses.map((c: any) => (
            <option key={c.id} value={c.id}>{c.title}</option>
          ))}
        </select>
        {courseId && <p className="text-xs text-gray-500 mt-1">Showing all students enrolled in this course.</p>}
      </div>

      {isLoading ? <div className="p-4 text-center">Loading...</div> : apps.length === 0 ? <p className="text-gray-500 text-center py-4">No applications found.</p> : (
        <div className="space-y-3">
          {apps.map((app: any) => {
            const student = courseId ? app : app.student;
            const applied = courseId ? app.applied : true;
            const resumeUrl = courseId ? app.resumeUrl : app.resume_url;
            const appliedAt = courseId ? app.appliedAt : app.applied_at;

            return (
              <div key={courseId ? app.studentId : app.id} className="p-4 bg-gray-50 rounded-xl border border-gray-100 flex justify-between items-center">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-gray-900">{student?.name || 'Unknown'}</p>
                    {courseId && (
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${applied ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                        {applied ? 'APPLIED' : 'NOT APPLIED'}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500">{student?.email || 'No email'} • {student?.phone_number || student?.phoneNumber || 'No phone'}</p>
                  {applied && appliedAt && <p className="text-xs text-gray-400 mt-1">Applied: {format(new Date(appliedAt), 'MMM do, yyyy')}</p>}
                </div>
                {resumeUrl ? (
                  <a href={resumeUrl} target="_blank" rel="noreferrer" className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-sm font-medium text-blue-600 hover:bg-gray-50">
                    View Resume
                  </a>
                ) : (
                  <span className="text-xs text-red-500">{applied ? 'No Resume' : ''}</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
}
