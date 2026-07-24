import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Briefcase, Lock, FileText, Upload, CheckCircle2, FileDown, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import api from '../../../lib/axios';
import { Skeleton } from '../../components/ui/skeleton';

export default function PlacementPortal() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<'jobs' | 'materials'>('jobs');
  const [resumeFile, setResumeFile] = useState<File | null>(null);

  const { data: eligibility, isLoading: checking } = useQuery({
    queryKey: ['placement-eligibility'],
    queryFn: async () => (await api.get('/placements/eligibility')).data.data
  });

  const { data: resume, isLoading: resumeLoading } = useQuery({
    queryKey: ['student-resume'],
    queryFn: async () => (await api.get('/placements/resume')).data.data,
    enabled: !!eligibility?.isEligible
  });

  const { data: jobs = [], isLoading: jobsLoading } = useQuery({
    queryKey: ['placement-jobs-student'],
    queryFn: async () => (await api.get('/placements/jobs')).data.data,
    enabled: !!eligibility?.isEligible
  });

  const { data: materials = [], isLoading: matLoading } = useQuery({
    queryKey: ['placement-materials-student'],
    queryFn: async () => (await api.get('/placements/materials')).data.data,
    enabled: !!eligibility?.isEligible
  });

  const { data: applications = [], isLoading: appLoading } = useQuery({
    queryKey: ['student-applications'],
    queryFn: async () => (await api.get('/placements/applications')).data.data,
    enabled: !!eligibility?.isEligible
  });

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!resumeFile) return;
      const fd = new FormData();
      fd.append('file', resumeFile);
      return api.post('/placements/resume', fd);
    },
    onSuccess: () => {
      toast.success('Resume uploaded successfully!');
      setResumeFile(null);
      qc.invalidateQueries({ queryKey: ['student-resume'] });
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to upload resume')
  });

  const applyMutation = useMutation({
    mutationFn: async (jobId: string) => api.post(`/placements/jobs/${jobId}/apply`),
    onSuccess: () => {
      toast.success('Applied successfully!');
      qc.invalidateQueries({ queryKey: ['student-applications'] });
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to apply')
  });

  if (checking) {
    return <div className="p-6"><Skeleton className="h-40" /></div>;
  }

  if (!eligibility?.isEligible) {
    return (
      <div className="flex flex-col items-center justify-center h-[70vh]">
        <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-6">
          <Lock className="w-10 h-10 text-gray-400" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Portal Locked</h2>
        <p className="text-gray-500 text-center max-w-md mb-6">
          You must clear at least one mock interview to gain access to the Placement Portal. Keep practicing!
        </p>
        <button 
          onClick={() => qc.invalidateQueries({ queryKey: ['placement-eligibility'] })}
          className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-semibold transition"
        >
          Check Again
        </button>
      </div>
    );
  }

  const hasApplied = (jobId: string) => applications.some((a: any) => a.job_id === jobId);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-12 h-12 bg-blue-500 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20">
          <Briefcase className="w-6 h-6 text-slate-900" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Placement Master</h1>
          <p className="text-blue-600 text-sm">Find your dream job and prepare with our materials.</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl p-6 border border-slate-200">
        <h2 className="text-lg font-bold text-slate-900 mb-4">My Resume</h2>
        <div className="flex items-center gap-4">
          {resumeLoading ? <Skeleton className="w-32 h-10" /> : resume?.resume_url ? (
            <a href={resume.resume_url} target="_blank" rel="noreferrer" className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-700 rounded-xl font-medium border border-blue-200 hover:bg-blue-100 transition">
              <FileText className="w-4 h-4" /> View Current Resume
            </a>
          ) : (
            <div className="px-4 py-2 bg-rose-500/10 text-rose-400 rounded-xl font-medium border border-rose-500/20 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" /> No Resume Uploaded
            </div>
          )}

          <div className="flex items-center gap-2 border-l border-slate-200 pl-4">
            <input type="file" id="resume-upload" className="hidden" accept=".pdf,.doc,.docx" onChange={(e) => setResumeFile(e.target.files?.[0] || null)} />
            <label htmlFor="resume-upload" className="cursor-pointer px-4 py-2 bg-white shadow-sm text-slate-900 rounded-xl text-sm font-medium hover:bg-slate-50 transition flex items-center gap-2">
              <Upload className="w-4 h-4" /> {resumeFile ? resumeFile.name : 'Select New Resume'}
            </label>
            {resumeFile && (
              <button onClick={() => uploadMutation.mutate()} disabled={uploadMutation.isPending} className="px-4 py-2 bg-blue-500 text-white rounded-xl text-sm font-bold shadow-lg shadow-blue-500/20">
                {uploadMutation.isPending ? 'Uploading...' : 'Upload'}
              </button>
            )}
          </div>
        </div>
        {!resume?.resume_url && <p className="text-xs text-rose-400 mt-2">You must upload a resume before you can apply for jobs.</p>}
      </div>

      <div className="flex gap-4 border-b border-slate-200">
        <button className={`px-4 py-3 font-medium border-b-2 transition-colors ${tab === 'jobs' ? 'border-blue-500 text-blue-400' : 'border-transparent text-slate-500 hover:text-blue-600'}`} onClick={() => setTab('jobs')}>
          Job Board ({jobs.length})
        </button>
        <button className={`px-4 py-3 font-medium border-b-2 transition-colors ${tab === 'materials' ? 'border-blue-500 text-blue-400' : 'border-transparent text-slate-500 hover:text-blue-600'}`} onClick={() => setTab('materials')}>
          Placement Materials ({materials.length})
        </button>
      </div>

      {tab === 'jobs' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {jobsLoading || appLoading ? <Skeleton className="h-40" /> : jobs.map((job: any) => (
            <div key={job.id} className="bg-white p-5 rounded-2xl border border-slate-200 flex flex-col hover:bg-slate-50 transition">
              <div className="flex justify-between items-start mb-3">
                <h3 className="font-bold text-lg text-slate-900">{job.company_name}</h3>
                <div className="flex items-center gap-2">
                  {job.match_percentage !== undefined && (
                    <span className={`px-2 py-1 rounded-md text-xs font-bold ${job.match_percentage >= 70 ? 'bg-green-100 text-green-700' : job.match_percentage >= 40 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>
                      {job.match_percentage}% Match
                    </span>
                  )}
                  {hasApplied(job.id) ? (
                    <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded-md text-xs font-bold flex items-center gap-1"><CheckCircle2 className="w-3 h-3"/> Applied</span>
                  ) : (
                    <span className="bg-orange-100 text-orange-700 px-2 py-1 rounded-md text-xs font-bold">New</span>
                  )}
                </div>
              </div>
              <p className="text-sm text-slate-700 line-clamp-3 mb-4">{job.job_description}</p>
              <div className="grid grid-cols-2 gap-3 mb-5 text-sm text-slate-500 bg-white shadow-sm p-3 rounded-xl">
                <div><span className="block text-[10px] uppercase text-slate-500">CTC</span><span className="font-medium text-slate-900">{job.ctc}</span></div>
                <div><span className="block text-[10px] uppercase text-slate-500">Experience</span><span className="font-medium text-slate-900">{job.experience}</span></div>
                <div className="col-span-2"><span className="block text-[10px] uppercase text-slate-500">Qualification</span><span className="font-medium text-slate-900">{job.qualification}</span></div>
              </div>
              
              <div className="mt-auto flex gap-3">
                {job.attachment_url && (
                  <a href={job.attachment_url} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-900 rounded-xl text-sm font-medium transition">
                    <FileDown className="w-4 h-4" /> JD Doc
                  </a>
                )}
                {!hasApplied(job.id) ? (
                  <button 
                    onClick={() => applyMutation.mutate(job.id)} 
                    disabled={applyMutation.isPending || !resume?.resume_url}
                    className="flex-1 py-2 bg-blue-500 text-white rounded-xl text-sm font-bold shadow-lg shadow-blue-500/20 hover:bg-blue-400 transition disabled:opacity-50 disabled:cursor-not-allowed"
                    title={!resume?.resume_url ? "Upload resume first" : "Apply now"}
                  >
                    {applyMutation.isPending ? 'Applying...' : 'Apply Now'}
                  </button>
                ) : (
                  <div className="flex-1 py-2 bg-slate-100 text-slate-500 rounded-xl text-sm font-bold flex items-center justify-center">
                    Application Submitted
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'materials' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {matLoading ? <Skeleton className="h-40" /> : materials.map((m: any) => (
            <a href={m.file_url} target="_blank" rel="noreferrer" key={m.id} className="bg-white p-5 rounded-2xl border border-slate-200 flex flex-col hover:bg-slate-50 transition group">
              <div className="w-12 h-12 bg-blue-500/10 rounded-xl flex items-center justify-center mb-4 group-hover:bg-blue-500/20 transition">
                <FileText className="w-6 h-6 text-blue-400" />
              </div>
              <h3 className="font-bold text-slate-900 text-lg mb-2">{m.title}</h3>
              <p className="text-sm text-slate-500 line-clamp-2">{m.description}</p>
              <div className="mt-4 flex items-center text-xs text-blue-400 font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                View Document <ExternalLink className="w-3 h-3 ml-1" />
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
