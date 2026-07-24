import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Save, Lock, LayoutList, FileBarChart, Star } from 'lucide-react';
import api from '../../lib/axios';
import { Skeleton } from '../components/ui/skeleton';
import { INPUT_CLS } from '../../lib/constants';

interface SessionItem {
  id: string;
  title: string;
  section: string | null;
  sessionNumber: string | null;
  durationMinutes: number | null;
  meetLink: string | null;
}

interface FeedbackResponse {
  id: string;
  studentName: string;
  studentEmail: string;
  sessionTitle: string;
  conceptualUnderstanding: number;
  problemSolving: number;
  handsOnExperience: number;
  classParticipation: number;
  punctuality: number;
  additionalComments: string;
  createdAt: string;
}

interface CourseFeedbackResponse {
  id: string;
  studentName: string;
  studentEmail: string;
  courseTitle: string;
  courseContentQuality: number;
  conceptClarity: number;
  practicalExercises: number;
  courseAssessmentStructure: number;
  overallCourseSatisfaction: number;
  additionalComments: string | null;
  mostUsefulTopic: string | null;
  additionalTopics: string | null;
  createdAt: string;
}

interface ProgramFeedbackResponse {
  id: string;
  studentName: string;
  studentEmail: string;
  programCurriculumRelevance: number;
  learningOutcomeAchievement: number;
  practicalLearningExperience: number;
  placementCareerReadinessSupport: number;
  overallProgramSatisfaction: number;
  mostLiked: string | null;
  improvementsSuggested: string | null;
  additionalComments: string | null;
  createdAt: string;
}

export default function FeedbackMaster() {
  const qc = useQueryClient();

  const [activeTab, setActiveTab] = useState<'configure' | 'responses' | 'course-responses' | 'program-responses'>('configure');

  const [selectedProgramId, setSelectedProgramId] = useState<string>('');
  const [selectedCourseId, setSelectedCourseId] = useState<string>('');
  const [selectedBatchId, setSelectedBatchId] = useState<string>('');

  const [localConfig, setLocalConfig] = useState<Set<string>>(new Set());

  // Queries for dropdowns
  const { data: programs = [] } = useQuery({
    queryKey: ['programs'],
    queryFn: async () => {
      const { data } = await api.get('/programs', { params: { limit: 1000 } });
      return data.data ?? [];
    }
  });

  const selectedProgram = programs.find((p: any) => p.id === selectedProgramId);
  const courses = selectedProgram?.courses || [];

  const { data: batches = [] } = useQuery({
    queryKey: ['batches', selectedProgramId],
    queryFn: async () => {
      const { data } = await api.get('/batches', { params: { programId: selectedProgramId, limit: 100 } });
      return data.data?.batches ?? data.data ?? [];
    },
    enabled: !!selectedProgramId,
  });

  // Fetch syllabus to filter out database garbage (mimicking student portal)
  const { data: validSessionKeys } = useQuery({
    queryKey: ['course-syllabus', selectedCourseId],
    queryFn: async () => {
      if (!selectedCourseId) return null;
      const { data } = await api.get(`/courses/${selectedCourseId}/syllabus`);
      const structured = data.data?.[0]?.structuredData;
      if (!structured?.sheets) return null;
      
      const validSessionKeys = new Set<string>();
      structured.sheets.forEach((sheet: any) => {
        const sectionName = sheet.name ?? '';
        sheet.sessions?.forEach((sess: any) => {
          if (sess.session) validSessionKeys.add(`${sectionName}::${sess.session}`);
        });
      });
      return validSessionKeys;
    },
    enabled: !!selectedCourseId && activeTab === 'configure',
  });

  const { data: sessions = [], isLoading: loadingSessions } = useQuery({
    queryKey: ['batch-sessions', selectedBatchId, selectedCourseId, validSessionKeys],
    queryFn: async () => {
      const { data } = await api.get(`/student/content-master/batches/${selectedBatchId}/sessions`);
      if (data.data?.sections) {
        const allSessions = data.data.sections.flatMap((sec: any) => sec.sessions || []);
        let filtered = selectedCourseId 
          ? allSessions.filter((s: any) => s.courseId === selectedCourseId)
          : allSessions;
          
        if (validSessionKeys && validSessionKeys.size > 0) {
          filtered = filtered.filter((s: any) => {
            const sectionName = s.section ?? '';
            return validSessionKeys.has(`${sectionName}::${s.sessionNumber}`);
          });
        }
        return filtered;
      }
      return [];
    },
    enabled: !!selectedBatchId && activeTab === 'configure',
  });

  // Query for feedback config
  const { data: config } = useQuery({
    queryKey: ['feedback-config', selectedBatchId],
    queryFn: async () => {
      const { data } = await api.get(`/feedback/config/${selectedBatchId}`);
      return data.data;
    },
    enabled: !!selectedBatchId,
  });

  // Query for feedback responses
  const { data: responses = [], isLoading: loadingResponses } = useQuery({
    queryKey: ['feedback-responses', selectedBatchId, selectedCourseId],
    queryFn: async () => {
      const { data } = await api.get(`/feedback/responses/${selectedBatchId}`);
      const allResponses = data.data as FeedbackResponse[];
      return selectedCourseId 
        ? allResponses.filter((r: any) => r.courseId === selectedCourseId)
        : allResponses;
    },
    enabled: !!selectedBatchId && activeTab === 'responses',
  });

  // Query for course feedback responses
  const { data: courseResponses = [], isLoading: loadingCourseResponses } = useQuery({
    queryKey: ['course-feedback-responses', selectedBatchId],
    queryFn: async () => {
      const { data } = await api.get(`/feedback/course-responses/${selectedBatchId}`);
      return data.data as CourseFeedbackResponse[];
    },
    enabled: !!selectedBatchId && activeTab === 'course-responses',
  });

  // Query for program feedback responses
  const { data: programResponses = [], isLoading: loadingProgramResponses } = useQuery({
    queryKey: ['program-feedback-responses', selectedProgramId],
    queryFn: async () => {
      const { data } = await api.get(`/feedback/program-responses/${selectedProgramId}`);
      return data.data as ProgramFeedbackResponse[];
    },
    enabled: !!selectedProgramId && activeTab === 'program-responses',
  });

  const savedModuleIds = new Set(config?.map((c: any) => c.moduleId) || []);

  // Handled in useEffect below
  useEffect(() => {
    if (config && Array.isArray(config)) {
      setLocalConfig(new Set(config.map((c: any) => c.moduleId)));
    } else {
      setLocalConfig(new Set());
    }
  }, [config, selectedBatchId]);

  const toggleSession = (moduleId: string) => {
    if (savedModuleIds.has(moduleId)) return; // Prevent untoggling saved ones
    const next = new Set(localConfig);
    if (next.has(moduleId)) next.delete(moduleId);
    else next.add(moduleId);
    setLocalConfig(next);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      await api.put(`/feedback/config/${selectedBatchId}`, {
        moduleIds: Array.from(localConfig)
      });
    },
    onSuccess: () => {
      toast.success('Feedback configuration saved successfully!');
      qc.invalidateQueries({ queryKey: ['feedback-config', selectedBatchId] });
    },
    onError: () => {
      toast.error('Failed to save feedback configuration.');
    }
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Feedback Master</h1>
          <p className="text-gray-500 text-sm mt-1">Configure and view student feedback for sessions.</p>
        </div>
      </div>

      <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex flex-col md:flex-row gap-4">
        <div className="flex-1">
          <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide mb-1">Program</label>
          <select value={selectedProgramId} onChange={(e) => { setSelectedProgramId(e.target.value); setSelectedCourseId(''); setSelectedBatchId(''); }} className={INPUT_CLS}>
            <option value="">Select Program...</option>
            {programs.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div className="flex-1">
          <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide mb-1">Course</label>
          <select value={selectedCourseId} onChange={(e) => { setSelectedCourseId(e.target.value); setSelectedBatchId(''); }} className={INPUT_CLS} disabled={!selectedProgramId}>
            <option value="">Select Course...</option>
            {courses.map((c: any) => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
        </div>
        <div className="flex-1">
          <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide mb-1">Batch</label>
          <select value={selectedBatchId} onChange={(e) => setSelectedBatchId(e.target.value)} className={INPUT_CLS} disabled={!selectedProgramId}>
            <option value="">Select Batch...</option>
            {batches.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
      </div>

      {selectedProgramId && activeTab === 'program-responses' && !selectedBatchId && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col min-h-[500px]">
          <div className="flex border-b border-gray-100">
            <button
              onClick={() => setActiveTab('program-responses')}
              className={`flex-1 flex items-center justify-center gap-2 py-4 font-semibold text-sm transition-colors border-b-2 border-blue-600 text-blue-600 bg-blue-50/50`}
            >
              <LayoutList className="w-4 h-4" />
              Program Responses
            </button>
            <button
              onClick={() => setActiveTab('configure')}
              className={`flex-1 flex items-center justify-center gap-2 py-4 font-semibold text-sm transition-colors border-b-2 border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50`}
            >
              Select a batch to configure
            </button>
          </div>
          <div className="flex flex-col flex-1 bg-gray-50/30">
            {loadingProgramResponses ? (
              <div className="p-6 space-y-4">
                <Skeleton className="h-16 w-full rounded-xl" />
                <Skeleton className="h-16 w-full rounded-xl" />
              </div>
            ) : programResponses.length === 0 ? (
              <div className="p-12 text-center flex flex-col items-center justify-center">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                  <LayoutList className="w-8 h-8 text-gray-400" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900">No program feedback yet</h3>
                <p className="text-gray-500 mt-1 max-w-sm">Students in this program have not submitted any program feedback yet.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Student</th>
                      <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Ratings (Avg)</th>
                      <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Comments & Suggestions</th>
                      <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 bg-white">
                    {programResponses.map((r) => {
                      const avgRating = ((r.programCurriculumRelevance + r.learningOutcomeAchievement + r.practicalLearningExperience + r.placementCareerReadinessSupport + r.overallProgramSatisfaction) / 5).toFixed(1);
                      return (
                        <tr key={r.id} className="hover:bg-gray-50/50 transition-colors">
                          <td className="px-6 py-4">
                            <p className="font-semibold text-gray-900">{r.studentName}</p>
                            <p className="text-xs text-gray-500">{r.studentEmail}</p>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-1.5">
                              <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
                              <span className="font-bold text-gray-900">{avgRating}</span>
                            </div>
                            <div className="text-[10px] text-gray-500 mt-1 grid grid-cols-2 gap-x-2 gap-y-0.5">
                              <span>Curriculum: {r.programCurriculumRelevance}</span>
                              <span>Outcomes: {r.learningOutcomeAchievement}</span>
                              <span>Practical: {r.practicalLearningExperience}</span>
                              <span>Placement: {r.placementCareerReadinessSupport}</span>
                              <span>Overall: {r.overallProgramSatisfaction}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 max-w-xs space-y-1.5">
                            {r.additionalComments && (
                              <div>
                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Comments:</span>
                                <p className="text-xs text-gray-600 line-clamp-2" title={r.additionalComments}>"{r.additionalComments}"</p>
                              </div>
                            )}
                            {r.mostLiked && (
                              <div>
                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Liked:</span>
                                <p className="text-xs text-gray-600 truncate" title={r.mostLiked}>{r.mostLiked}</p>
                              </div>
                            )}
                            {r.improvementsSuggested && (
                              <div>
                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Improvements:</span>
                                <p className="text-xs text-gray-600 truncate" title={r.improvementsSuggested}>{r.improvementsSuggested}</p>
                              </div>
                            )}
                            {!r.additionalComments && !r.mostLiked && !r.improvementsSuggested && (
                              <span className="text-xs text-gray-400 italic">No additional feedback</span>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            <span className="text-xs text-gray-500">
                              {new Date(r.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {selectedBatchId && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col min-h-[500px]">
          {/* Tabs */}
          <div className="flex border-b border-gray-100">
            <button
              onClick={() => setActiveTab('configure')}
              className={`flex-1 flex items-center justify-center gap-2 py-4 font-semibold text-sm transition-colors border-b-2 ${
                activeTab === 'configure' ? 'border-blue-600 text-blue-600 bg-blue-50/50' : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              <LayoutList className="w-4 h-4" />
              Configure Feedback
            </button>
            <button
              onClick={() => setActiveTab('responses')}
              className={`flex-1 flex items-center justify-center gap-2 py-4 font-semibold text-sm transition-colors border-b-2 ${
                activeTab === 'responses' ? 'border-blue-600 text-blue-600 bg-blue-50/50' : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              <FileBarChart className="w-4 h-4" />
              Session Responses
            </button>
            <button
              onClick={() => setActiveTab('course-responses')}
              className={`flex-1 flex items-center justify-center gap-2 py-4 font-semibold text-sm transition-colors border-b-2 ${
                activeTab === 'course-responses' ? 'border-blue-600 text-blue-600 bg-blue-50/50' : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              <Star className="w-4 h-4" />
              Course Responses
            </button>
            <button
              onClick={() => setActiveTab('program-responses')}
              className={`flex-1 flex items-center justify-center gap-2 py-4 font-semibold text-sm transition-colors border-b-2 ${
                activeTab === 'program-responses' ? 'border-blue-600 text-blue-600 bg-blue-50/50' : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              <LayoutList className="w-4 h-4" />
              Program Responses
            </button>
          </div>

          {activeTab === 'configure' ? (
            <div className="flex flex-col flex-1">
              <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                <div>
                  <h2 className="font-bold text-gray-900 text-lg">Sessions</h2>
                  <p className="text-sm text-gray-500 mt-1">Select the sessions that require student feedback.</p>
                </div>
                <button
                  onClick={() => saveMutation.mutate()}
                  disabled={saveMutation.isPending}
                  className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-medium transition-all disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  {saveMutation.isPending ? 'Saving...' : 'Save Configuration'}
                </button>
              </div>
              
              <div className="p-0 flex-1 overflow-auto">
                {loadingSessions ? (
                  <div className="p-6 space-y-4">
                    <Skeleton className="h-12 w-full rounded-xl" />
                    <Skeleton className="h-12 w-full rounded-xl" />
                    <Skeleton className="h-12 w-full rounded-xl" />
                  </div>
                ) : sessions.length === 0 ? (
                  <div className="p-12 text-center">
                    <p className="text-gray-500">No sessions found for this batch.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {sessions.map((s: SessionItem) => {
                      const isSaved = savedModuleIds.has(s.id);
                      const isChecked = localConfig.has(s.id);
                      return (
                        <label key={s.id} className={`flex items-center gap-4 p-4 transition-colors group ${isSaved ? 'bg-gray-50/80 cursor-default' : 'hover:bg-gray-50 cursor-pointer'}`}>
                          <div className="flex-shrink-0">
                            {isSaved ? (
                              <div className="w-5 h-5 rounded bg-blue-100 text-blue-600 flex items-center justify-center">
                                <Lock className="w-3 h-3" />
                              </div>
                            ) : (
                              <input
                                type="checkbox"
                                className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-600 cursor-pointer transition-all"
                                checked={isChecked}
                                onChange={() => toggleSession(s.id)}
                              />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={`font-semibold transition-colors ${isSaved ? 'text-gray-700' : 'text-gray-900 group-hover:text-blue-600'}`}>
                              {s.section && <span className="text-gray-400 font-normal mr-2">[{s.section}]</span>}
                              {s.sessionNumber && <span className="font-mono text-gray-500 mr-2">S{s.sessionNumber}</span>}
                              {s.title}
                            </p>
                            {isSaved && <p className="text-xs text-blue-600 mt-0.5 font-medium">Saved (Required)</p>}
                          </div>
                          {s.durationMinutes && (
                            <div className="text-sm text-gray-500 whitespace-nowrap">
                              {s.durationMinutes} mins
                            </div>
                          )}
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          ) : activeTab === 'responses' ? (
            <div className="flex flex-col flex-1 bg-gray-50/30">
              {loadingResponses ? (
                <div className="p-6 space-y-4">
                  <Skeleton className="h-16 w-full rounded-xl" />
                  <Skeleton className="h-16 w-full rounded-xl" />
                </div>
              ) : responses.length === 0 ? (
                <div className="p-12 text-center flex flex-col items-center justify-center">
                  <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                    <FileBarChart className="w-8 h-8 text-gray-400" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900">No responses yet</h3>
                  <p className="text-gray-500 mt-1 max-w-sm">Students in this batch have not submitted any feedback yet.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-100">
                        <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Student</th>
                        <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Session</th>
                        <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Ratings (Avg)</th>
                        <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Comments</th>
                        <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 bg-white">
                      {responses.map((r) => {
                        const avgRating = ((r.conceptualUnderstanding + r.problemSolving + r.handsOnExperience + r.classParticipation + r.punctuality) / 5).toFixed(1);
                        return (
                          <tr key={r.id} className="hover:bg-gray-50/50 transition-colors">
                            <td className="px-6 py-4">
                              <p className="font-semibold text-gray-900">{r.studentName}</p>
                              <p className="text-xs text-gray-500">{r.studentEmail}</p>
                            </td>
                            <td className="px-6 py-4">
                              <p className="text-sm font-medium text-gray-800">{r.sessionTitle}</p>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-1.5">
                                <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
                                <span className="font-bold text-gray-900">{avgRating}</span>
                              </div>
                              <div className="text-[10px] text-gray-500 mt-1 grid grid-cols-2 gap-x-2 gap-y-0.5">
                                <span>Concept: {r.conceptualUnderstanding}</span>
                                <span>Problem: {r.problemSolving}</span>
                                <span>Hands-on: {r.handsOnExperience}</span>
                                <span>Class: {r.classParticipation}</span>
                                <span>Time: {r.punctuality}</span>
                              </div>
                            </td>
                            <td className="px-6 py-4 max-w-xs">
                              {r.additionalComments ? (
                                <p className="text-xs text-gray-600 line-clamp-2" title={r.additionalComments}>
                                  "{r.additionalComments}"
                                </p>
                              ) : (
                                <span className="text-xs text-gray-400 italic">No comments</span>
                              )}
                            </td>
                            <td className="px-6 py-4">
                              <span className="text-xs text-gray-500">
                                {new Date(r.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : activeTab === 'course-responses' ? (
            <div className="flex flex-col flex-1 bg-gray-50/30">
              {loadingCourseResponses ? (
                <div className="p-6 space-y-4">
                  <Skeleton className="h-16 w-full rounded-xl" />
                  <Skeleton className="h-16 w-full rounded-xl" />
                </div>
              ) : courseResponses.length === 0 ? (
                <div className="p-12 text-center flex flex-col items-center justify-center">
                  <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                    <Star className="w-8 h-8 text-gray-400" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900">No course feedback yet</h3>
                  <p className="text-gray-500 mt-1 max-w-sm">Students in this batch have not submitted any course feedback yet.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-100">
                        <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Student</th>
                        <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Course</th>
                        <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Ratings (Avg)</th>
                        <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Comments & Topics</th>
                        <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 bg-white">
                      {courseResponses.map((r) => {
                        const avgRating = ((r.courseContentQuality + r.conceptClarity + r.practicalExercises + r.courseAssessmentStructure + r.overallCourseSatisfaction) / 5).toFixed(1);
                        return (
                          <tr key={r.id} className="hover:bg-gray-50/50 transition-colors">
                            <td className="px-6 py-4">
                              <p className="font-semibold text-gray-900">{r.studentName}</p>
                              <p className="text-xs text-gray-500">{r.studentEmail}</p>
                            </td>
                            <td className="px-6 py-4">
                              <p className="text-sm font-medium text-gray-800">{r.courseTitle}</p>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-1.5">
                                <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
                                <span className="font-bold text-gray-900">{avgRating}</span>
                              </div>
                              <div className="text-[10px] text-gray-500 mt-1 grid grid-cols-2 gap-x-2 gap-y-0.5">
                                <span>Content: {r.courseContentQuality}</span>
                                <span>Clarity: {r.conceptClarity}</span>
                                <span>Exercises: {r.practicalExercises}</span>
                                <span>Assessments: {r.courseAssessmentStructure}</span>
                                <span>Overall: {r.overallCourseSatisfaction}</span>
                              </div>
                            </td>
                            <td className="px-6 py-4 max-w-xs space-y-1.5">
                              {r.additionalComments && (
                                <div>
                                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Comments:</span>
                                  <p className="text-xs text-gray-600 line-clamp-2" title={r.additionalComments}>"{r.additionalComments}"</p>
                                </div>
                              )}
                              {r.mostUsefulTopic && (
                                <div>
                                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Useful:</span>
                                  <p className="text-xs text-gray-600 truncate" title={r.mostUsefulTopic}>{r.mostUsefulTopic}</p>
                                </div>
                              )}
                              {r.additionalTopics && (
                                <div>
                                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">More Topics:</span>
                                  <p className="text-xs text-gray-600 truncate" title={r.additionalTopics}>{r.additionalTopics}</p>
                                </div>
                              )}
                              {!r.additionalComments && !r.mostUsefulTopic && !r.additionalTopics && (
                                <span className="text-xs text-gray-400 italic">No additional feedback</span>
                              )}
                            </td>
                            <td className="px-6 py-4">
                              <span className="text-xs text-gray-500">
                                {new Date(r.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : activeTab === 'program-responses' ? (
            <div className="flex flex-col flex-1 bg-gray-50/30">
              {loadingProgramResponses ? (
                <div className="p-6 space-y-4">
                  <Skeleton className="h-16 w-full rounded-xl" />
                  <Skeleton className="h-16 w-full rounded-xl" />
                </div>
              ) : programResponses.length === 0 ? (
                <div className="p-12 text-center flex flex-col items-center justify-center">
                  <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                    <LayoutList className="w-8 h-8 text-gray-400" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900">No program feedback yet</h3>
                  <p className="text-gray-500 mt-1 max-w-sm">Students in this program have not submitted any program feedback yet.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-100">
                        <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Student</th>
                        <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Ratings (Avg)</th>
                        <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Comments & Suggestions</th>
                        <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 bg-white">
                      {programResponses.map((r) => {
                        const avgRating = ((r.programCurriculumRelevance + r.learningOutcomeAchievement + r.practicalLearningExperience + r.placementCareerReadinessSupport + r.overallProgramSatisfaction) / 5).toFixed(1);
                        return (
                          <tr key={r.id} className="hover:bg-gray-50/50 transition-colors">
                            <td className="px-6 py-4">
                              <p className="font-semibold text-gray-900">{r.studentName}</p>
                              <p className="text-xs text-gray-500">{r.studentEmail}</p>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-1.5">
                                <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
                                <span className="font-bold text-gray-900">{avgRating}</span>
                              </div>
                              <div className="text-[10px] text-gray-500 mt-1 grid grid-cols-2 gap-x-2 gap-y-0.5">
                                <span>Curriculum: {r.programCurriculumRelevance}</span>
                                <span>Outcomes: {r.learningOutcomeAchievement}</span>
                                <span>Practical: {r.practicalLearningExperience}</span>
                                <span>Placement: {r.placementCareerReadinessSupport}</span>
                                <span>Overall: {r.overallProgramSatisfaction}</span>
                              </div>
                            </td>
                            <td className="px-6 py-4 max-w-xs space-y-1.5">
                              {r.additionalComments && (
                                <div>
                                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Comments:</span>
                                  <p className="text-xs text-gray-600 line-clamp-2" title={r.additionalComments}>"{r.additionalComments}"</p>
                                </div>
                              )}
                              {r.mostLiked && (
                                <div>
                                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Liked:</span>
                                  <p className="text-xs text-gray-600 truncate" title={r.mostLiked}>{r.mostLiked}</p>
                                </div>
                              )}
                              {r.improvementsSuggested && (
                                <div>
                                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Improvements:</span>
                                  <p className="text-xs text-gray-600 truncate" title={r.improvementsSuggested}>{r.improvementsSuggested}</p>
                                </div>
                              )}
                              {!r.additionalComments && !r.mostLiked && !r.improvementsSuggested && (
                                <span className="text-xs text-gray-400 italic">No additional feedback</span>
                              )}
                            </td>
                            <td className="px-6 py-4">
                              <span className="text-xs text-gray-500">
                                {new Date(r.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
