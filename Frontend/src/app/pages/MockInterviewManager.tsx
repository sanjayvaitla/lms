import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Plus, Search, Calendar, Clock, Loader2, Edit, Trash2,
  Video, CheckCircle2, User as UserIcon, GraduationCap, Link2, X, Sparkles
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { Skeleton } from '../components/ui/skeleton';
import api from '../../lib/axios';
import { fetchCourseList } from '../../lib/courseList';
import { useAuth } from '../../store/AuthContext';
import { INPUT_CLS, LABEL_CLS, ERROR_CLS } from '../../lib/constants';
import type { MockInterview, User } from '../../types/api';

const createInterviewSchema = z.object({
  student_id: z.string().min(1, 'Student is required'),
  trainer_id: z.string().min(1, 'Trainer is required'),
  course_id: z.string().optional(),
  start_time: z.string().min(1, 'Start time is required'),
  end_time: z.string().min(1, 'End time is required'),
  meeting_link: z.string().optional(),
  is_ai_driven: z.boolean().optional(),
  ai_topic: z.string().optional(),
  ai_context_file_url: z.string().optional(),
  ai_domain: z.string().optional(),
  ai_experience: z.string().optional(),
});

const gradeInterviewSchema = z.object({
  score_technical: z.coerce.number().min(0).max(25, 'Max 25'),
  score_problem_solving: z.coerce.number().min(0).max(20, 'Max 20'),
  score_coding: z.coerce.number().min(0).max(25, 'Max 25'),
  score_project: z.coerce.number().min(0).max(20, 'Max 20'),
  score_debugging: z.coerce.number().min(0).max(10, 'Max 10'),
  feedback: z.string().min(1, 'Feedback is required'),
  key_strengths: z.array(z.string()).optional(),
  areas_of_improvement: z.array(z.string()).optional(),
  status: z.enum(['SCHEDULED', 'COMPLETED', 'CANCELLED']).optional(),
});

const STRENGTH_OPTIONS = [
  'Strong Fundamentals', 'Conceptually Sound', 'In-depth Understanding', 'Technically Proficient', 'Subject Matter Expertise', 'Domain Knowledge', 'Comprehensive Understanding', 'Strong Technical Foundation',
  'Analytical Thinking', 'Logical Reasoning', 'Structured Approach', 'Solution-Oriented', 'Critical Thinking', 'Efficient Problem Solver', 'Strong Troubleshooting Skills', 'Good Root Cause Analysis',
  'Strong Coding Skills', 'Clean Coding Practices', 'Accurate Query Writing', 'Efficient Implementation', 'Optimized Solutions', 'Good Algorithmic Thinking', 'Strong Programming Skills', 'Practical Coding Ability',
  'Strong Project Ownership', 'Practical Exposure', 'Hands-on Experience', 'Real-world Application Understanding', 'Good Architectural Knowledge', 'Effective Technology Utilization', 'Strong Use Case Understanding',
  'Strong Debugging Skills', 'Error Identification Ability', 'Performance Optimization Skills', 'Best Practices Awareness', 'Code Quality Focus', 'Efficient Issue Resolution',
  'Excellent Technical Competency', 'Industry-Ready', 'Consistent Performer', 'Project-Oriented Learner', 'Job-Ready Candidate'
];

const IMPROVEMENT_OPTIONS = [
  'Fundamental Gaps', 'Limited Conceptual Understanding', 'Partial Subject Knowledge', 'Knowledge Inconsistency', 'Weak Core Concepts', 'Incomplete Understanding', 'Limited Domain Exposure', 'Requires Concept Reinforcement',
  'Limited Analytical Ability', 'Weak Problem Breakdown', 'Inadequate Logical Approach', 'Difficulty Handling Edge Cases', 'Requires Structured Thinking', 'Inconsistent Solution Design', 'Needs Better Requirement Analysis',
  'Syntax Errors', 'Coding Inaccuracies', 'Limited Coding Practice', 'Query Writing Errors', 'Inefficient Code Design', 'Poor Code Optimization', 'Incomplete Implementations', 'Limited Algorithmic Knowledge',
  'Limited Project Ownership', 'Shallow Project Understanding', 'Difficulty Explaining Implementation', 'Incomplete Architecture Knowledge', 'Weak Use Case Understanding', 'Insufficient Project Contributions',
  'Weak Debugging Skills', 'Difficulty Identifying Issues', 'Limited Troubleshooting Ability', 'Inefficient Error Resolution', 'Optimization Gaps', 'Limited Best Practice Awareness', 'Performance Tuning Knowledge Gap',
  'Requires Additional Practice', 'Needs Concept Strengthening', 'Requires More Hands-on Exposure', 'Needs Improvement in Problem Solving', 'Requires Better Implementation Skills', 'Not Yet Job-Ready'
];


type CreateForm = z.infer<typeof createInterviewSchema>;
type GradeForm = z.infer<typeof gradeInterviewSchema>;

async function fetchInterviews(): Promise<MockInterview[]> {
  const { data } = await api.get('/interviews');
  return data.data;
}

export default function MockInterviewManager() {
  const qc = useQueryClient();
  const { user } = useAuth();

  const [search, setSearch] = useState('');
  const [filterCourse, setFilterCourse] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [gradingInterview, setGradingInterview] = useState<MockInterview | null>(null);

  const { data: coursesData } = useQuery({
    queryKey: ['courses'],
    queryFn: () => fetchCourseList(),
  });
  const courses = coursesData ?? [];

  const { data: interviews = [], isLoading } = useQuery({
    queryKey: ['mock-interviews'],
    queryFn: fetchInterviews,
  });

  const { data: students = [] } = useQuery({
    queryKey: ['all-students'],
    queryFn: async () => {
      const { data } = await api.get('/learners?limit=1000');
      const raw = data.data;
      return Array.isArray(raw) ? raw : (raw?.learners ?? raw ?? []);
    },
  });

  const { data: trainers = [] } = useQuery({
    queryKey: ['all-trainers'],
    queryFn: async () => {
      const { data } = await api.get('/trainers');
      const raw = data.data;
      return Array.isArray(raw) ? raw : (raw?.trainers ?? raw ?? []);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/interviews/${id}`),
    onSuccess: () => {
      toast.success('Interview cancelled');
      qc.invalidateQueries({ queryKey: ['mock-interviews'] });
    },
    onError: () => toast.error('Failed to cancel interview'),
  });

  const publishMutation = useMutation({
    mutationFn: (id: string) => api.put(`/interviews/${id}/publish`, {}),
    onSuccess: () => {
      toast.success('AI Interview results published to student!');
      qc.invalidateQueries({ queryKey: ['mock-interviews'] });
    },
    onError: () => toast.error('Failed to publish interview results'),
  });

  const filtered = interviews.filter((i) => {
    const term = search.toLowerCase();
    const matchSearch = i.student?.name.toLowerCase().includes(term) || i.trainer?.name.toLowerCase().includes(term);
    const matchCourse = filterCourse ? i.course_id === filterCourse : true;
    return matchSearch && matchCourse;
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Virtual Mock Interviews</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            Schedule and grade 1-on-1 mock interviews.
          </p>
        </div>
        {user?.role !== 'OPERATIONAL_MANAGER' && (
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-gradient-to-r from-blue-500 to-cyan-500 rounded-xl hover:opacity-90 transition-opacity shadow-md"
          >
            <Plus className="w-4 h-4" /> Schedule Interview
          </button>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by student or trainer name..."
            className="w-full pl-9 pr-4 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 shadow-sm"
          />
        </div>
        <div className="sm:w-64">
          <select
            value={filterCourse}
            onChange={(e) => setFilterCourse(e.target.value)}
            className="w-full px-4 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 shadow-sm"
          >
            <option value="">All Courses</option>
            {courses.map((c: any) => (
              <option key={c.id} value={c.id}>{c.title}</option>
            ))}
          </select>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-2xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4 bg-white rounded-2xl border border-gray-100 shadow-sm">
          <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center">
            <Video className="w-8 h-8 text-blue-400" />
          </div>
          <p className="text-gray-500 font-medium">No mock interviews scheduled</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((interview) => (
            <InterviewCard
              key={interview.id}
              interview={interview}
              onGrade={() => setGradingInterview(interview)}
              onPublish={() => publishMutation.mutate(interview.id)}
              onDelete={() => {
                if (confirm('Cancel this mock interview?')) {
                  deleteMutation.mutate(interview.id);
                }
              }}
            />
          ))}
        </div>
      )}

      {showAddModal && (
        <ScheduleInterviewModal
          students={students}
          trainers={trainers}
          courses={courses}
          onClose={() => setShowAddModal(false)}
          onSuccess={() => {
            setShowAddModal(false);
            qc.invalidateQueries({ queryKey: ['mock-interviews'] });
          }}
        />
      )}

      {gradingInterview && (
        <GradeInterviewModal
          interview={gradingInterview}
          onClose={() => setGradingInterview(null)}
          onSuccess={() => {
            setGradingInterview(null);
            qc.invalidateQueries({ queryKey: ['mock-interviews'] });
          }}
        />
      )}
    </div>
  );
}

function InterviewCard({ interview, onGrade, onPublish, onDelete }: { interview: MockInterview; onGrade: () => void; onPublish: () => void; onDelete: () => void }) {
  const isCompleted = interview.status === 'COMPLETED';
  const statusColor = isCompleted ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700';

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all p-5 flex flex-col justify-between">
      <div>
        <div className="flex justify-between items-start mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center font-bold">
              {interview.student?.name?.charAt(0)}
            </div>
            <div>
              <h3 className="font-bold text-gray-900">{interview.student?.name}</h3>
              <div className="flex items-center gap-2 mt-1">
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide ${statusColor}`}>
                  {interview.status}
                </span>
                {interview.course && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide bg-blue-100 text-blue-700">
                    {interview.course.title}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        <p className="text-xs text-gray-500 flex items-center gap-1 mb-4">
          <GraduationCap className="w-3 h-3" /> {interview.trainer?.name}
        </p>

        <div className="grid grid-cols-2 gap-2 text-sm mb-4">
          <div className="flex flex-col text-gray-600 bg-gray-50 p-2 rounded-lg">
            <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wide">Date</span>
            <span className="font-medium flex items-center gap-1 mt-1"><Calendar className="w-3.5 h-3.5" /> {format(new Date(interview.start_time), 'MMM do, yyyy')}</span>
          </div>
          <div className="flex flex-col text-gray-600 bg-gray-50 p-2 rounded-lg">
            <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wide">Time</span>
            <span className="font-medium flex items-center gap-1 mt-1"><Clock className="w-3.5 h-3.5" /> {format(new Date(interview.start_time), 'h:mm a')}</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 pt-2 border-t border-gray-50">
        {!isCompleted ? (
          <>
            <a
              href={interview.meeting_link}
              target="_blank"
              rel="noreferrer"
              className="flex-1 py-2 text-sm font-semibold text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition flex items-center justify-center gap-2"
            >
              <Video className="w-4 h-4" /> Join
            </a>
            <button
              onClick={onGrade}
              className="px-4 py-2 text-sm font-semibold text-emerald-600 bg-emerald-50 rounded-xl hover:bg-emerald-100 transition"
            >
              Grade
            </button>
            <button
              onClick={onDelete}
              className="p-2 text-red-500 hover:bg-red-50 rounded-xl transition"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </>
        ) : (
          <div className="flex-1 flex flex-col gap-2 p-3 bg-gray-50 rounded-xl border border-gray-100 w-full text-left">
            <div className="flex justify-between items-center w-full mb-1">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Overall Score</span>
              <div className="flex items-center gap-3">
                <div className="text-xl font-black text-emerald-600">{interview.score}<span className="text-sm text-gray-400 font-medium">/100</span></div>
                <button onClick={onDelete} className="p-1 text-red-500 hover:bg-red-100 rounded-md transition" title="Delete Interview">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
            {interview.feedback && (
              <div className="text-xs text-gray-600">
                <span className="font-semibold block text-gray-700">Feedback:</span>
                <span className="block mt-1 text-gray-600" title={interview.feedback}>{interview.feedback}</span>
              </div>
            )}
            {interview.is_ai_driven && !interview.is_published && (
              <button
                onClick={onPublish}
                className="mt-2 w-full py-2 text-sm font-semibold text-purple-600 bg-purple-50 rounded-xl hover:bg-purple-100 transition border border-purple-200"
              >
                Publish AI Score to Student
              </button>
            )}

            {(interview.key_strengths || interview.areas_of_improvement) && (
              <div className="grid grid-cols-2 gap-2 mt-1">
                {interview.key_strengths && (
                  <div className="bg-emerald-50 p-2 rounded border border-emerald-100">
                    <span className="text-[10px] font-bold text-emerald-700 uppercase block mb-1">Strengths</span>
                    <p className="text-xs text-emerald-600 line-clamp-2" title={interview.key_strengths}>{interview.key_strengths}</p>
                  </div>
                )}
                {interview.areas_of_improvement && (
                  <div className="bg-amber-50 p-2 rounded border border-amber-100">
                    <span className="text-[10px] font-bold text-amber-700 uppercase block mb-1">Improvements</span>
                    <p className="text-xs text-amber-600 line-clamp-2" title={interview.areas_of_improvement}>{interview.areas_of_improvement}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ScheduleInterviewModal({ students, trainers, courses, onClose, onSuccess }: any) {
  const [isAiDriven, setIsAiDriven] = useState(false);
  const [aiTopic, setAiTopic] = useState('');
  const [aiDomain, setAiDomain] = useState('');
  const [aiExperience, setAiExperience] = useState('0-2');
  const [aiFile, setAiFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const { register, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm<CreateForm>({
    resolver: zodResolver(createInterviewSchema),
  });

  const studentId = watch('student_id');

  const { data: studentDetails } = useQuery({
    queryKey: ['learner-details', studentId],
    queryFn: async () => {
      if (!studentId) return null;
      const res = await api.get(`/learners/${studentId}`);
      return res.data.data;
    },
    enabled: !!studentId,
  });

  let availableCourses = courses;
  if (studentId && studentDetails) {
    if (studentDetails.assignedProgramId) {
      availableCourses = courses.filter((c: any) => c.programId === studentDetails.assignedProgramId);
    } else {
      // Fallback if no program is assigned
      availableCourses = courses;
    }
  }

  const createMutation = useMutation({
    mutationFn: async (data: CreateForm) => {
      let aiContextUrl = '';
      if (isAiDriven && aiFile) {
        const fd = new FormData();
        fd.append('file', aiFile);
        const res = await api.post('/interviews/ai/upload-context', fd);
        aiContextUrl = res.data.data.fileUrl;
      }
      return api.post('/interviews', {
        ...data,
        is_ai_driven: isAiDriven,
        ai_topic: isAiDriven ? aiTopic : undefined,
        ai_domain: isAiDriven ? aiDomain : undefined,
        ai_experience: isAiDriven ? aiExperience : undefined,
        ai_context_file_url: aiContextUrl || undefined,
        meeting_link: isAiDriven ? '' : data.meeting_link,
      });
    },
    onSuccess: () => {
      toast.success('Interview scheduled! Email sent to student.');
      onSuccess();
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to schedule'),
  });

  const submitHandler = async (d: CreateForm) => {
    if (!isAiDriven && !d.meeting_link) {
      toast.error('Meeting link is required for human interviews');
      return;
    }
    if (isAiDriven && !aiTopic) {
      toast.error('AI Topic is required for AI interviews');
      return;
    }
    setIsUploading(true);
    try {
      await createMutation.mutateAsync({ ...d, course_id: d.course_id || undefined });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <h2 className="text-lg font-bold">Schedule Mock Interview</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={handleSubmit(submitHandler)} className="p-6 space-y-4">
          <div className="flex items-center gap-2 mb-4 p-3 bg-purple-50 rounded-xl border border-purple-100">
            <input type="checkbox" id="ai-driven" checked={isAiDriven} onChange={e => setIsAiDriven(e.target.checked)} className="w-4 h-4 text-purple-600 rounded" />
            <label htmlFor="ai-driven" className="text-sm font-bold text-purple-900 cursor-pointer flex items-center gap-1">
              <Sparkles className="w-4 h-4 text-purple-600" /> AI-Driven Mock Interview
            </label>
          </div>

          <div>
            <label className={LABEL_CLS}>Student *</label>
            <select {...register('student_id')} className={INPUT_CLS}>
              <option value="">Select Student...</option>
              {students.map((s: any) => <option key={s.id} value={s.id}>{s.name} ({s.email})</option>)}
            </select>
            {errors.student_id && <p className={ERROR_CLS}>{errors.student_id.message}</p>}
          </div>
          <div>
            <label className={LABEL_CLS}>Interviewer (Trainer) *</label>
            <select {...register('trainer_id')} className={INPUT_CLS}>
              <option value="">Select Trainer...</option>
              {trainers.map((t: any) => <option key={t.id} value={t.id}>{t.name} ({t.email})</option>)}
            </select>
            {errors.trainer_id && <p className={ERROR_CLS}>{errors.trainer_id.message}</p>}
          </div>
          <div>
            <label className={LABEL_CLS}>Course (Optional)</label>
            <select {...register('course_id')} className={INPUT_CLS}>
              <option value="">-- No Course --</option>
              {availableCourses.map((c: any) => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select>
            {errors.course_id && <p className={ERROR_CLS}>{errors.course_id.message}</p>}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={LABEL_CLS}>Start Time *</label>
              <input type="datetime-local" {...register('start_time')} className={INPUT_CLS} />
              {errors.start_time && <p className={ERROR_CLS}>{errors.start_time.message}</p>}
            </div>
            <div>
              <label className={LABEL_CLS}>End Time *</label>
              <input type="datetime-local" {...register('end_time')} className={INPUT_CLS} />
              {errors.end_time && <p className={ERROR_CLS}>{errors.end_time.message}</p>}
            </div>
          </div>
          
          {!isAiDriven ? (
            <div>
              <label className={LABEL_CLS}>Meeting Link *</label>
              <div className="relative">
                <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input type="url" {...register('meeting_link')} placeholder="https://zoom.us/j/..." className={`${INPUT_CLS} pl-9`} />
              </div>
              {errors.meeting_link && <p className={ERROR_CLS}>{errors.meeting_link.message}</p>}
            </div>
          ) : (
            <div className="space-y-4 bg-purple-50/50 p-4 rounded-xl border border-purple-100">
              <div>
                <label className={LABEL_CLS}>AI Interview Topic *</label>
                <input type="text" value={aiTopic} onChange={e => setAiTopic(e.target.value)} placeholder="e.g. React.js and Frontend Architecture" className={INPUT_CLS} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={LABEL_CLS}>Domain</label>
                  <input type="text" value={aiDomain} onChange={e => setAiDomain(e.target.value)} placeholder="e.g. Frontend, Data Science" className={INPUT_CLS} />
                </div>
                <div>
                  <label className={LABEL_CLS}>Experience Level</label>
                  <select value={aiExperience} onChange={e => setAiExperience(e.target.value)} className={INPUT_CLS}>
                    <option value="0-2">0-2 Years</option>
                    <option value="3-5">3-5 Years</option>
                    <option value="5-7+">5-7+ Years</option>
                  </select>
                </div>
              </div>
              <div>
                <label className={LABEL_CLS}>Sample Q&A PDF (Optional context)</label>
                <input type="file" accept=".pdf" onChange={e => setAiFile(e.target.files?.[0] || null)} className="w-full text-sm mt-1 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-purple-50 file:text-purple-700 hover:file:bg-purple-100" />
                {aiFile && <p className="text-xs text-purple-600 mt-1">{aiFile.name}</p>}
              </div>
            </div>
          )}

          <button type="submit" disabled={isSubmitting || isUploading} className="w-full py-2.5 bg-blue-600 text-white rounded-xl font-bold mt-4 flex items-center justify-center">
            {isSubmitting || isUploading ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'Schedule Interview'}
          </button>
        </form>
      </div>
    </div>
  );
}

function GradeInterviewModal({ interview, onClose, onSuccess }: any) {
  const { register, handleSubmit, watch, setValue, formState: { errors, isSubmitting } } = useForm<GradeForm>({
    resolver: zodResolver(gradeInterviewSchema),
    defaultValues: { 
      status: 'COMPLETED',
      key_strengths: [],
      areas_of_improvement: []
    },
  });

  const gradeMutation = useMutation({
    mutationFn: (data: GradeForm) => api.put(`/interviews/${interview.id}/grade`, data),
    onSuccess: () => {
      toast.success('Interview graded!');
      onSuccess();
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to grade'),
  });

  const tScore = watch('score_technical') || 0;
  const pScore = watch('score_problem_solving') || 0;
  const cScore = watch('score_coding') || 0;
  const prScore = watch('score_project') || 0;
  const dScore = watch('score_debugging') || 0;
  
  const totalScore = Number(tScore) + Number(pScore) + Number(cScore) + Number(prScore) + Number(dScore);

  let rating = 'Beginner';
  let readiness = 'Additional Training Required';
  let badgeColor = 'bg-gray-100 text-gray-800';
  if (totalScore >= 85) { rating = 'Excellent'; readiness = 'Highly Ready'; badgeColor = 'bg-emerald-100 text-emerald-800'; }
  else if (totalScore >= 70) { rating = 'Good'; readiness = 'Ready'; badgeColor = 'bg-blue-100 text-blue-800'; }
  else if (totalScore >= 55) { rating = 'Average'; readiness = 'Needs Improvement'; badgeColor = 'bg-amber-100 text-amber-800'; }

  const strengths = watch('key_strengths') || [];
  const improvements = watch('areas_of_improvement') || [];

  const toggleStrength = (val: string) => {
    if (strengths.includes(val)) setValue('key_strengths', strengths.filter(s => s !== val));
    else setValue('key_strengths', [...strengths, val]);
  };

  const toggleImprovement = (val: string) => {
    if (improvements.includes(val)) setValue('areas_of_improvement', improvements.filter(s => s !== val));
    else setValue('areas_of_improvement', [...improvements, val]);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl my-8 overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50 flex-shrink-0">
          <div>
            <h2 className="text-lg font-bold">Grade Interview</h2>
            <p className="text-xs text-gray-500">Student: {interview.student?.name}</p>
          </div>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400 hover:text-gray-900" /></button>
        </div>
        <div className="overflow-y-auto p-6 flex-1">
          <form id="grade-form" onSubmit={handleSubmit((d) => gradeMutation.mutate(d))} className="space-y-6">
            
            <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
              <h3 className="font-bold text-gray-900 mb-3">Assessment Criteria</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">1. Technical (Max 25)</label>
                  <input type="number" {...register('score_technical')} className={INPUT_CLS} />
                  {errors.score_technical && <p className={ERROR_CLS}>{errors.score_technical.message}</p>}
                  <p className="text-[10px] text-gray-500 mt-1">Core concepts, architecture, depth.</p>
                </div>
                
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">2. Problem Solving (Max 20)</label>
                  <input type="number" {...register('score_problem_solving')} className={INPUT_CLS} />
                  {errors.score_problem_solving && <p className={ERROR_CLS}>{errors.score_problem_solving.message}</p>}
                  <p className="text-[10px] text-gray-500 mt-1">Logic, requirements, edge cases.</p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">3. Coding (Max 25)</label>
                  <input type="number" {...register('score_coding')} className={INPUT_CLS} />
                  {errors.score_coding && <p className={ERROR_CLS}>{errors.score_coding.message}</p>}
                  <p className="text-[10px] text-gray-500 mt-1">Syntax, correctness, DS/Algo.</p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">4. Project (Max 20)</label>
                  <input type="number" {...register('score_project')} className={INPUT_CLS} />
                  {errors.score_project && <p className={ERROR_CLS}>{errors.score_project.message}</p>}
                  <p className="text-[10px] text-gray-500 mt-1">Ownership, stack, real-world usage.</p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">5. Debugging (Max 10)</label>
                  <input type="number" {...register('score_debugging')} className={INPUT_CLS} />
                  {errors.score_debugging && <p className={ERROR_CLS}>{errors.score_debugging.message}</p>}
                  <p className="text-[10px] text-gray-500 mt-1">Error finding, best practices.</p>
                </div>

              </div>
              
              <div className="mt-4 flex items-center justify-between border-t border-gray-200 pt-4">
                <div className="flex items-center gap-4">
                  <div>
                    <span className="text-sm font-semibold text-gray-600">Total Score:</span>
                    <span className="text-2xl font-black ml-2">{totalScore}/100</span>
                  </div>
                  <div className={`px-3 py-1 rounded-full text-xs font-bold ${badgeColor}`}>
                    {rating} - {readiness}
                  </div>
                </div>
              </div>
            </div>

            <div>
              <label className={LABEL_CLS}>Overall Feedback / Remarks *</label>
              <textarea {...register('feedback')} className={INPUT_CLS} rows={2} placeholder="Detailed notes for the student..." />
              {errors.feedback && <p className={ERROR_CLS}>{errors.feedback.message}</p>}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className={LABEL_CLS}>Key Strengths</label>
                <div className="h-48 overflow-y-auto border border-gray-200 rounded-xl p-3 bg-white space-y-2">
                  {STRENGTH_OPTIONS.map(opt => (
                    <label key={opt} className="flex items-start gap-2 cursor-pointer hover:bg-gray-50 p-1 rounded">
                      <input type="checkbox" checked={strengths.includes(opt)} onChange={() => toggleStrength(opt)} className="mt-1" />
                      <span className="text-sm text-gray-700 leading-tight">{opt}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className={LABEL_CLS}>Areas for Improvement</label>
                <div className="h-48 overflow-y-auto border border-gray-200 rounded-xl p-3 bg-white space-y-2">
                  {IMPROVEMENT_OPTIONS.map(opt => (
                    <label key={opt} className="flex items-start gap-2 cursor-pointer hover:bg-gray-50 p-1 rounded">
                      <input type="checkbox" checked={improvements.includes(opt)} onChange={() => toggleImprovement(opt)} className="mt-1" />
                      <span className="text-sm text-gray-700 leading-tight">{opt}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

          </form>
        </div>
        <div className="p-6 border-t border-gray-100 flex-shrink-0 bg-white">
          <button form="grade-form" type="submit" disabled={isSubmitting} className="w-full py-3 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition">
            {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'Submit Final Grade'}
          </button>
        </div>
      </div>
    </div>
  );
}
