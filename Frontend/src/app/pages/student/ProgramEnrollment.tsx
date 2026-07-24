import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  BookOpen, CheckCircle2, Circle, ChevronLeft, Loader2,
  Users, Clock, Award, Layers, ChevronDown, ChevronUp,
} from 'lucide-react';
import { useNavigate } from 'react-router';
import api from '../../../lib/axios';
import { useAuth } from '../../../store/AuthContext';
import { ProgramFeedbackForm } from '../../components/ProgramFeedbackForm';

function InlineProgramFeedback({ programId, programTitle }: { programId: string, programTitle: string }) {
  const { data, refetch, isLoading } = useQuery({
    queryKey: ['program-feedback-status', programId],
    queryFn: async () => {
      const res = await api.get(`/feedback/program-status/${programId}`);
      return res.data.data;
    }
  });

  if (isLoading || data?.submitted || !data?.canSubmit) return null;

  return (
    <div className="mt-6 border-t border-slate-200 pt-6">
      <ProgramFeedbackForm 
        programId={programId}
        programTitle={programTitle}
        onSuccess={refetch}
      />
    </div>
  );
}

interface ProgramCourse {
  id: string; title: string; category: string;
  level: string; color_token: string; duration_months: number; description?: string;
}
interface Program {
  id: string; name: string; color_token: string; sort_order: number;
  courses: ProgramCourse[];
}

const COLOR_MAP: Record<string, string> = {
  cyan: '#06b6d4', purple: '#8b5cf6', amber: '#f59e0b',
  blue: '#10b981', rose: '#f43f5e', indigo: '#6366f1',
  sky: '#0ea5e9', orange: '#f97316',
};

const LEVEL_BADGE: Record<string, string> = {
  BEGINNER:     'bg-blue-500/20 text-blue-400',
  INTERMEDIATE: 'bg-amber-500/20 text-amber-400',
  ADVANCED:     'bg-rose-500/20 text-rose-400',
};

export default function ProgramEnrollmentPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [selectedCourses, setSelectedCourses] = useState<Record<string, Set<string>>>({});
  const [expandedPrograms, setExpandedPrograms] = useState<Set<string>>(new Set());
  const [enrollingProgram, setEnrollingProgram] = useState<string | null>(null);

  // Fetch assigned program — structured return avoids setState inside queryFn (React anti-pattern)
  const { data: assignedData, isLoading } = useQuery<{ programs: Program[]; accountStatus: string | null }>({
    queryKey: ['programs-browse'],
    queryFn: async () => {
      const { data } = await api.get('/fees-v2/my-program');
      const raw = data.data;
      if (!raw || !raw.program_id) {
        return { programs: [], accountStatus: raw?.account_status ?? null };
      }
      return {
        programs: [{ ...raw, id: raw.program_id, name: raw.program_name }],
        accountStatus: raw.account_status ?? null,
      };
    },
    enabled: !!user,
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchInterval: 30_000,   // portal auto-updates ≤30 s after admin assigns
  });

  const programs: Program[]        = assignedData?.programs     ?? [];
  const accountStatus: string|null = assignedData?.accountStatus ?? null;

  const { data: myPrograms = [] } = useQuery<any[]>({
    queryKey: ['my-programs'],
    queryFn: async () => { const { data } = await api.get('/programs/student/my-programs'); return data.data ?? []; },
    enabled: !!user,
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchInterval: 30_000,   // must match programs-browse so isEnrolled badge syncs
  });

  const enrolledProgramIds = new Set(myPrograms.map((p: any) => p.program_id));

  useEffect(() => {
    if (myPrograms.length > 0) {
      setSelectedCourses(prev => {
        const next = { ...prev };
        for (const mp of myPrograms) {
          if (!next[mp.program_id]) {
            next[mp.program_id] = new Set();
          }
          // API returns selected_courses (not courses) from program_course_selections
          const enrolledCourses = mp.selected_courses ?? mp.courses ?? [];
          for (const c of enrolledCourses) {
            next[mp.program_id].add(c.id);
          }
        }
        return next;
      });
      
      setExpandedPrograms(prev => {
        const next = new Set(prev);
        for (const mp of myPrograms) {
          next.add(mp.program_id);
        }
        return next;
      });
    }
  }, [myPrograms]);

  function toggleProgram(id: string) {
    setExpandedPrograms(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  }

  function toggleCourse(programId: string, courseId: string) {
    setSelectedCourses(prev => {
      const programSet = new Set(prev[programId] ?? []);
      programSet.has(courseId) ? programSet.delete(courseId) : programSet.add(courseId);
      return { ...prev, [programId]: programSet };
    });
  }

  function selectAll(programId: string, courses: ProgramCourse[]) {
    setSelectedCourses(prev => ({ ...prev, [programId]: new Set(courses.map(c => c.id)) }));
  }

  function clearAll(programId: string) {
    setSelectedCourses(prev => ({ ...prev, [programId]: new Set() }));
  }

  const enrollMutation = useMutation({
    mutationFn: async ({ programId, courseIds }: { programId: string; courseIds: string[] }) => {
      await api.post('/programs/student/enroll', { program_id: programId, course_ids: courseIds });
    },
    onSuccess: (_, { programId }) => {
      toast.success('Enrolled successfully!');
      qc.invalidateQueries({ queryKey: ['my-programs'] });
      qc.invalidateQueries({ queryKey: ['student-dashboard'] });
      setEnrollingProgram(null);
    },
    onError: (err: any) => toast.error(err?.response?.data?.message ?? 'Enrollment failed'),
  });

  function handleEnroll(program: Program) {
    const selected = selectedCourses[program.id];
    if (!selected || selected.size === 0) {
      toast.error('Select at least one course');
      return;
    }
    setEnrollingProgram(program.id);
    enrollMutation.mutate({ programId: program.id, courseIds: Array.from(selected) });
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={() => navigate('/my-courses')}
          className="flex items-center gap-2 text-slate-500 hover:text-slate-900 text-sm transition-colors">
          <ChevronLeft className="w-4 h-4" /> My Courses
        </button>
      </div>

      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Layers className="w-6 h-6 text-purple-400" /> Programs
        </h1>
        <p className="text-slate-500 text-sm mt-1">
          Choose a program and select the courses you want to learn
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-4">{[1,2,3].map(i => <div key={i} className="h-32 bg-slate-200 rounded-2xl animate-pulse" />)}</div>
      ) : programs.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-slate-200">
          <Layers className="w-10 h-10 text-slate-400 mx-auto mb-3" />
          <p className="text-slate-900 font-semibold">No program assigned yet</p>
          {accountStatus === 'PENDING' ? (
            <>
              <p className="text-slate-500 text-sm mt-1">Your registration is under review.</p>
              <p className="text-slate-500 text-xs mt-2">Our team will assign your program after verifying your details.</p>
            </>
          ) : accountStatus === 'ACTIVE' ? (
            <>
              <p className="text-slate-500 text-sm mt-1">Your account is active — a program will be assigned to you shortly.</p>
              <p className="text-slate-500 text-xs mt-2">This page auto-updates. No need to refresh.</p>
            </>
          ) : (
            <p className="text-slate-500 text-sm mt-1">Please contact the admin to get a program assigned.</p>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {programs.map((program, idx) => {
            const color = COLOR_MAP[program.color_token] ?? '#06b6d4';
            const isExpanded = expandedPrograms.has(program.id);
            const isEnrolled = enrolledProgramIds.has(program.id);
            const selected = selectedCourses[program.id] ?? new Set<string>();
            const allSelected = program.courses.length > 0 && selected.size === program.courses.length;

            return (
              <div key={program.id} className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                {/* Program header */}
                <div className="flex items-center gap-4 px-5 py-4" style={{ borderLeft: `4px solid ${color}` }}>
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center text-slate-900 font-bold text-lg flex-shrink-0"
                    style={{ backgroundColor: color + '30', border: `1.5px solid ${color}60` }}>
                    <span style={{ color }}>{idx + 1}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-base font-bold text-slate-900">{program.name}</h2>
                      {isEnrolled && (
                        <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-200">
                          <CheckCircle2 className="w-3 h-3" /> Enrolled
                        </span>
                      )}
                    </div>
                    {program.courses.length > 0 ? (
                      <p className="text-sm text-slate-500 mt-0.5 line-clamp-1">
                        {program.courses.map(c => c.title).join(' · ')}
                      </p>
                    ) : (
                      <p className="text-sm text-slate-400 mt-0.5 italic">No courses yet</p>
                    )}
                    <p className="text-xs text-slate-500 mt-1">
                      {program.courses.length} course{program.courses.length !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <button onClick={() => toggleProgram(program.id)}
                    className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors flex-shrink-0">
                    {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                  </button>
                </div>

                {/* Courses selection */}
                {isExpanded && program.courses.length > 0 && (
                  <div className="border-t border-slate-200 p-5 space-y-4">
                    {/* Select all / Clear */}
                    {!isEnrolled ? (
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-slate-900">Select courses to enroll</p>
                        <div className="flex gap-2">
                          <button onClick={() => selectAll(program.id, program.courses)}
                            className="text-xs text-cyan-400 hover:text-cyan-300 font-medium transition-colors">
                            Select All
                          </button>
                          <span className="text-gray-600">·</span>
                          <button onClick={() => clearAll(program.id)}
                            className="text-xs text-slate-500 hover:text-slate-700 font-medium transition-colors">
                            Clear
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm font-semibold text-blue-700">Your Enrolled Courses</p>
                    )}

                    {/* Course checkboxes */}
                    <div className="grid grid-cols-1 gap-2">
                      {program.courses.map(course => {
                        const isSelected = selected.has(course.id);
                        const courseColor = COLOR_MAP[course.color_token] ?? color;
                        return (
                          <button key={course.id} 
                            onClick={() => {
                              if (!isEnrolled) toggleCourse(program.id, course.id);
                            }}
                            className={`flex items-center gap-4 p-4 rounded-xl border text-left transition-all ${
                              isSelected
                                ? 'border-orange-300 bg-orange-50'
                                : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                            } ${isEnrolled ? 'cursor-default border-blue-200 bg-blue-50 hover:bg-blue-50 hover:border-blue-200' : ''}`}>
                            {/* Checkbox */}
                            {!isEnrolled && (
                              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                                isSelected ? 'border-transparent' : 'border-gray-600'
                              }`} style={isSelected ? { backgroundColor: courseColor } : { borderColor: '#94a3b8' }}>
                                {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
                              </div>
                            )}
                            {/* Course info */}
                            <div className="flex-1 min-w-0">
                              <p className={`font-semibold text-sm ${isSelected ? 'text-slate-900' : 'text-slate-700'}`}>
                                {course.title}
                              </p>
                              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                <span className="text-xs text-slate-500">{course.category}</span>
                                <span className="text-xs text-slate-400">·</span>
                                <span className="text-xs text-slate-500 flex items-center gap-1">
                                  <Clock className="w-3 h-3" />{course.duration_months} months
                                </span>
                                <span className={`text-xs px-1.5 py-0.5 rounded-full ${LEVEL_BADGE[course.level] ?? ''}`}>
                                  {course.level.charAt(0) + course.level.slice(1).toLowerCase()}
                                </span>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    {/* Enroll button */}
                    {!isEnrolled && (
                      <div className="flex items-center justify-between pt-2 border-t border-slate-200">
                        <p className="text-sm text-slate-500">
                          {selected.size > 0
                            ? <><span className="text-slate-900 font-semibold">{selected.size}</span> course{selected.size !== 1 ? 's' : ''} selected</>
                            : 'Select courses above'}
                        </p>
                        <button
                          onClick={() => handleEnroll(program)}
                          disabled={selected.size === 0 || enrollMutation.isPending}
                          className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-slate-900 rounded-xl disabled:opacity-50 transition-all shadow-lg"
                          style={{ background: selected.size > 0 ? `linear-gradient(135deg, ${color}, ${color}cc)` : undefined, backgroundColor: selected.size === 0 ? '#e2e8f0' : undefined, color: selected.size === 0 ? '#94a3b8' : undefined }}>
                          {enrollMutation.isPending && enrollingProgram === program.id
                            ? <><Loader2 className="w-4 h-4 animate-spin" /> Enrolling…</>
                            : <><BookOpen className="w-4 h-4" /> Enroll Now</>}
                        </button>
                      </div>
                    )}
                    {isEnrolled && (
                      <InlineProgramFeedback programId={program.id} programTitle={program.name} />
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
