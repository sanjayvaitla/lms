import { useState, useMemo, useCallback, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams, useSearchParams, Link } from 'react-router';
import {
  BookOpen, ChevronLeft, Clock, CheckCircle2, PlayCircle,
  Lock, ChevronDown, ChevronRight, Users,
  ClipboardList, HelpCircle, BookMarked, ExternalLink,
  Award, Calendar, GraduationCap, Zap, Star,
  Upload, Eye, FileText, Archive, Sparkles, Loader2, Video,
} from 'lucide-react';
import api from '../../../lib/axios';
import { useAuth } from '../../../store/AuthContext';
import SubmitAssignmentModal from '../../components/SubmitAssignmentModal';
import { InlineSessionFeedback } from '../../components/InlineSessionFeedback';
import { CourseFeedbackForm } from '../../components/CourseFeedbackForm';
import { refreshStudentActivity } from '../../../lib/lmsCache';
import { useInAppViewer } from '../../components/ui/InAppDocumentViewer';

const COLOR_MAP: Record<string, string> = {
  cyan:   '#0ea5e9', purple:  '#8b5cf6', indigo: '#6366f1',
  amber:  '#f59e0b', sky:     '#0ea5e9', rose:   '#f43f5e',
  blue:   '#3b82f6', teal:    '#14b8a6', orange: '#f97316',
};

interface SessionItem {
  id: string; title: string; description: string | null;
  section: string | null; sessionNumber: string | null;
  topics: string[]; durationMinutes: number | null;
  sortOrder: number; status: 'LOCKED' | 'RELEASED' | 'COMPLETED';
  completedAt: string | null; meetLink: string | null;
  assignmentCount: number; quizCount: number;
  referenceCount: number; artifactCount: number;
}
interface SectionGroup { section: string; sessions: SessionItem[] }
interface Enrollment {
  id: string; batchId: string; batchName: string; batchStatus: string;
  startDate: string | null; endDate: string | null;
  courseTitle: string; category: string; colorToken: string; level: string;
  trainerName: string | null; completionPct: number;
}

function batchBadge(s: string) {
  return s === 'ONGOING'   ? 'bg-blue-100 text-blue-700 border-blue-200' :
         s === 'UPCOMING'  ? 'bg-orange-100 text-orange-700 border-orange-200' :
         'bg-slate-100 text-slate-600 border-slate-200';
}

const GRADIENT_MAP: Record<string, string> = {
  cyan:   'from-sky-50 to-blue-50',
  purple: 'from-violet-50 to-indigo-50',
  indigo: 'from-indigo-50 to-blue-50',
  amber:  'from-amber-50 to-orange-50',
  sky:    'from-sky-50 to-cyan-50',
  rose:   'from-rose-50 to-pink-50',
  blue:   'from-blue-50 to-indigo-50',
  teal:   'from-teal-50 to-cyan-50',
  orange: 'from-orange-50 to-amber-50',
};

export default function CourseDetailPage() {
  const { enrollmentId } = useParams<{ enrollmentId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [expanded,      setExpanded]      = useState<Set<string>>(new Set());
  const [mainTab,       setMainTab]       = useState<'sessions' | 'assignments' | 'quizzes'>('sessions');
  const [submitFor,     setSubmitFor]     = useState<any | null>(null);
  const qc = useQueryClient();

  const [searchParams] = useSearchParams();
  const courseId = searchParams.get('courseId') ?? '';

  const { data, isLoading } = useQuery({
    queryKey: ['enrollment-sessions', enrollmentId, courseId],
    queryFn: async () => {
      const qs = courseId ? `?courseId=${courseId}` : '';
      const { data } = await api.get(`/student/enrollments/${enrollmentId}/sessions${qs}`);
      return data.data as { enrollment: Enrollment; sections: SectionGroup[]; sessions: SessionItem[] };
    },
    enabled: !!enrollmentId && !!user,
  });

  const { data: assignments = [] } = useQuery({
    queryKey: ['enrollment-assignments', enrollmentId, courseId],
    queryFn: async () => {
      const qs = courseId ? `?courseId=${courseId}` : '';
      const { data } = await api.get(`/student/enrollments/${enrollmentId}/assignments${qs}`);
      return data.data as any[];
    },
    enabled: !!enrollmentId && !!user,
    // Poll every 4 s only while a RECENT submission is still awaiting AI grade
    refetchInterval: (query) => {
      const rows = query.state.data as any[] | undefined;
      const now  = Date.now();
      const hasFreshPending = rows?.some((a) => {
        if (!a.submission || a.submission.aiGradedAt) return false;
        const age = now - new Date(a.submission.submittedAt).getTime();
        return age < 3 * 60 * 1000; // only poll within 3 min of submission
      });
      return hasFreshPending ? 4000 : false;
    },
  });

  const { data: quizzes = [] } = useQuery({
    queryKey: ['enrollment-quizzes', enrollmentId, courseId],
    queryFn: async () => {
      const qs = courseId ? `?courseId=${courseId}` : '';
      const { data } = await api.get(`/student/enrollments/${enrollmentId}/quizzes${qs}`);
      return data.data as any[];
    },
    enabled: !!enrollmentId && !!user,
  });

  // Materials queries removed since Refs, SLM, and Artifacts tabs are moved to per-session details

  const { data: pendingFeedback } = useQuery({
    queryKey: ['pending-feedback'],
    queryFn: async () => {
      const { data } = await api.get('/feedback/pending');
      return data.data;
    },
    enabled: !!user,
  });

  const { data: courseFeedbackStatus } = useQuery({
    queryKey: ['course-feedback-status', enrollmentId, courseId],
    queryFn: async () => {
      const { data } = await api.get(`/feedback/course-status/${enrollmentId}/${courseId}`);
      return data.data;
    },
    enabled: !!enrollmentId && !!courseId && !!user,
  });

  const [activeFeedbackModule, setActiveFeedbackModule] = useState<string | null>(null);
  const { open: openDoc, viewer: docViewer } = useInAppViewer();

  // If there's pending feedback for this course, set it as the active module to provide feedback for
  const pendingModuleId = pendingFeedback && String(pendingFeedback.enrollmentId) === String(enrollmentId) 
    ? String(pendingFeedback.moduleId) 
    : null;

  const pendingModuleIndex = useMemo(() => {
    if (!pendingModuleId || !data?.sessions) return -1;
    return data.sessions.findIndex((s: any) => String(s.id) === pendingModuleId);
  }, [pendingModuleId, data?.sessions]);

  const enrollment = data?.enrollment;

  // Syllabus structured data — primary session source (same as BatchMaster)
  const { data: syllabi = [] } = useQuery<import('../../../types/api').SyllabusContent[]>({
    queryKey: ['syllabi', courseId],
    enabled: !!courseId,
    queryFn: async () => { const { data } = await api.get(`/courses/${courseId}/syllabus`); return data.data ?? []; },
  });
  const structured = syllabi[0]?.structuredData ?? null;

  // moduleMap: "section::sessionNumber" → SessionItem (for status, id, meetLink, counts)
  const moduleMap = useMemo(() => {
    const map = new Map<string, SessionItem>();
    for (const m of (data?.sessions ?? [])) {
      map.set(`${m.section ?? ''}::${m.sessionNumber ?? ''}`, m);
    }
    return map;
  }, [data]);

  const color    = COLOR_MAP[enrollment?.colorToken ?? '']    ?? '#06b6d4';
  const gradCls  = GRADIENT_MAP[enrollment?.colorToken ?? ''] ?? 'from-cyan-500/15 to-sky-500/5';

  // Syllabus sheets drive sections
  const sheetSections = structured?.sheets ?? [];

  // Seed active section from first sheet on first load
  const [seeded, setSeeded] = useState(false);
  useEffect(() => {
    if (!seeded && sheetSections.length > 0) {
      setSeeded(true);
      setActiveSection(sheetSections[0].name);
    }
  }, [seeded, sheetSections]);

  const currentSheet = sheetSections.find(s => s.name === activeSection) ?? sheetSections[0] ?? null;
  const sessions     = currentSheet?.sessions ?? [];

  /** Direct children of a parent session # within the active sheet section (1 → 1.1, 1.2) */
  const getChildSubs = useCallback((parentNum: string): SessionItem[] => {
    const prefix = `${parentNum}.`;
    const section = activeSection ?? '';
    return (data?.sessions ?? [])
      .filter((m) => {
        if ((m.section ?? '') !== section) return false;
        const sn = m.sessionNumber ?? '';
        if (!sn.startsWith(prefix)) return false;
        const rest = sn.slice(prefix.length);
        return rest.length > 0 && !rest.includes('.');
      })
      .sort((a, b) =>
        String(a.sessionNumber).localeCompare(String(b.sessionNumber), undefined, { numeric: true }),
      );
  }, [data?.sessions, activeSection]);

  const allSubSessions = useMemo(() => {
    const syllabusKeys = new Set(sessions.map((s) => String(s.session)));
    const section = activeSection ?? '';
    return (data?.sessions ?? []).filter(
      (m) =>
        (m.section ?? '') === section &&
        m.sessionNumber &&
        m.sessionNumber.includes('.') &&
        !syllabusKeys.has(m.sessionNumber),
    );
  }, [data?.sessions, sessions, activeSection]);

  const nestedSubIds = useMemo(() => {
    const ids = new Set<string>();
    for (const s of sessions) {
      for (const child of getChildSubs(String(s.session))) ids.add(child.id);
    }
    return ids;
  }, [sessions, getChildSubs]);

  /** Sub-sessions with no matching parent in this sheet (edge case) */
  const unparentedSubs = useMemo(
    () => allSubSessions.filter((m) => !nestedSubIds.has(m.id)),
    [allSubSessions, nestedSubIds],
  );

  // Stats for current sheet (syllabus + nested sub-sessions)
  const childCount = nestedSubIds.size + unparentedSubs.length;
  const totalSessions = sessions.length + childCount;
  const totalDone =
    sessions.filter((s) => {
      const mod = moduleMap.get(`${currentSheet?.name ?? ''}::${String(s.session)}`);
      return mod?.status === 'COMPLETED';
    }).length +
    [...allSubSessions.filter((m) => nestedSubIds.has(m.id) || unparentedSubs.some((u) => u.id === m.id))]
      .filter((m) => m.status === 'COMPLETED').length;
  const totalHours =
    Math.round(
      (sessions.reduce((a, s) => a + (s.duration ?? 0), 0) +
        allSubSessions.reduce((a, m) => a + (m.durationMinutes ?? 0), 0)) /
        60 *
        10,
    ) / 10;
  const totalTopics =
    sessions.reduce((a, s) => a + (Array.isArray(s.topics) ? s.topics.length : 0), 0) +
    allSubSessions.reduce((a, m) => a + (Array.isArray(m.topics) ? m.topics.length : 0), 0);

  function toggleSession(key: string) {
    setExpanded((prev) => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  }
  function collapseAll() { setExpanded(new Set()); }

  if (isLoading) return (
    <div className="space-y-3 p-6">
      <div className="h-32 rounded-2xl bg-slate-200 animate-pulse" />
      <div className="h-10 rounded-xl bg-slate-200 animate-pulse" />
      {[1,2,3,4,5].map((i) => <div key={i} className="h-16 rounded-xl bg-slate-200 animate-pulse" />)}
    </div>
  );

  if (!enrollment) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <p className="text-gray-400">Enrollment not found.</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">

      {/* ── Back ─────────────────────────────────────────────────────────────── */}
      <div className="px-5 pt-5 pb-2 flex-shrink-0">
        <Link to="/my-courses" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900 transition-colors">
          <ChevronLeft className="w-4 h-4" /> Back to My Courses
        </Link>
      </div>

      {/* ── Course banner ─────────────────────────────────────────────────────── */}
      <div
        className={`mx-5 mt-1 rounded-2xl overflow-hidden flex-shrink-0 bg-gradient-to-br ${gradCls} relative`}
        style={{ border: `1px solid ${color}28`, boxShadow: `0 8px 32px ${color}12` }}
      >
        {/* Background glow */}
        <div
          className="absolute top-0 right-0 w-64 h-64 rounded-full opacity-10 blur-3xl pointer-events-none"
          style={{ background: color, transform: 'translate(40%, -40%)' }}
        />

        <div className="px-5 py-5 relative">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-4">
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0"
                style={{ background: color+'22', border:`1.5px solid ${color}44`, boxShadow: `0 4px 16px ${color}20` }}
              >
                <BookOpen className="w-7 h-7" style={{ color }} />
              </div>
              <div>
                <h1 className="text-lg font-bold text-slate-900 leading-tight">{enrollment.courseTitle}</h1>
                <p className="text-xs text-slate-500 mt-0.5">{enrollment.category} · {enrollment.level}</p>
                <div className="flex flex-wrap gap-2 mt-2">
                  <span className="flex items-center gap-1 text-xs text-slate-600 bg-white/70 border border-slate-200 px-2 py-0.5 rounded-full">
                    <Users className="w-3 h-3" /> {enrollment.batchName}
                  </span>
                  {enrollment.trainerName && (
                    <span className="flex items-center gap-1 text-xs text-slate-600 bg-white/70 border border-slate-200 px-2 py-0.5 rounded-full">
                      <GraduationCap className="w-3 h-3" /> {enrollment.trainerName}
                    </span>
                  )}
                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold border ${batchBadge(enrollment.batchStatus)}`}>
                    {enrollment.batchStatus}
                  </span>
                </div>
              </div>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-3xl font-black" style={{ color }}>{enrollment.completionPct}%</p>
              <p className="text-xs text-gray-500">Progress</p>
            </div>
          </div>

          {/* Progress bar */}
          <div className="mt-4">
            <div className="flex justify-between text-xs text-gray-500 mb-1.5">
              <span>{totalDone} / {totalSessions} sessions completed</span>
              <span style={{ color }}>{enrollment.completionPct}%</span>
            </div>
            <div className="h-2 bg-black/10 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{ width:`${enrollment.completionPct}%`, backgroundColor: color, boxShadow: `0 0 10px ${color}60` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── No sessions state ─────────────────────────────────────────────────── */}
      {sheetSections.length === 0 && mainTab === 'sessions' && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 py-20">
          <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center">
            <BookMarked className="w-8 h-8 text-slate-500" />
          </div>
          <p className="text-slate-900 font-semibold">No sessions yet</p>
          <p className="text-gray-500 text-sm text-center max-w-xs">
            Sessions appear automatically once a syllabus Excel is uploaded in the Curriculum Master.
          </p>
        </div>
      )}

      {/* ── Main Tab Switcher ─── */}
      <div className="mx-5 mt-6 flex-shrink-0">
        <div className="grid grid-cols-3 gap-2 p-1.5 bg-slate-100 rounded-2xl border border-slate-200">
          {([
            { key: 'sessions',    label: 'Sessions',    icon: BookOpen,      count: totalSessions,   activeColor: color },
            { key: 'assignments', label: 'Tasks',       icon: ClipboardList, count: assignments.length || null, activeColor: '#f59e0b' },
            { key: 'quizzes',     label: 'Quizzes',     icon: HelpCircle,    count: quizzes.length || null,     activeColor: '#8b5cf6' },
          ] as const).map(({ key, label, icon: Icon, count, activeColor }) => {
            const isActive = mainTab === key;
            return (
              <button
                key={key}
                onClick={() => setMainTab(key)}
                className={`flex items-center justify-center gap-2.5 py-3 px-3 rounded-xl text-sm font-medium transition-all duration-300 relative overflow-hidden select-none ${
                  isActive
                    ? 'text-slate-900 font-bold shadow-inner'
                    : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                }`}
                style={
                  isActive
                    ? {
                        backgroundColor: activeColor + '18',
                        border: `1.5px solid ${activeColor}35`,
                        boxShadow: `inset 0 1px 1px rgba(255, 255, 255, 0.1), 0 4px 20px ${activeColor}15`,
                      }
                    : { border: '1.5px solid transparent' }
                }
              >
                {/* Subtle glow behind active icon */}
                {isActive && (
                  <span
                    className="absolute inset-0 opacity-10 pointer-events-none blur-xl transition-opacity duration-300"
                    style={{
                      background: `radial-gradient(circle at center, ${activeColor} 0%, transparent 70%)`,
                    }}
                  />
                )}
                
                <Icon
                  className="w-4 h-4 transition-transform duration-300 group-hover:scale-110"
                  style={isActive ? { color: activeColor } : {}}
                />
                <span className="relative z-10">{label}</span>
                {count !== null && (
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ml-1 transition-colors ${
                      isActive
                        ? 'bg-white/30 text-slate-900'
                        : 'bg-slate-200 text-slate-500'
                    }`}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Assignments Tab ───────────────────────────────────────────────────── */}
      {mainTab === 'assignments' && (
        <div className="mx-5 mt-5 space-y-3 pb-16">
          {assignments.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center">
                <ClipboardList className="w-7 h-7 text-slate-500" />
              </div>
              <p className="text-slate-900 font-semibold">No assignments yet</p>
              <p className="text-gray-500 text-sm">Assignments will appear here once your trainer publishes them.</p>
            </div>
          ) : (
            assignments.map((a: any) => {
              const submitted   = !!a.submission;
              const graded      = a.submission?.status === 'GRADED';
              const dueDate     = a.dueDate ? new Date(a.dueDate) : null;
              const isOverdue   = dueDate && dueDate < new Date() && !submitted;
              const aiGraded    = !!a.submission?.aiGradedAt;
              const aiAge       = a.submission?.submittedAt
                ? Date.now() - new Date(a.submission.submittedAt).getTime() : 0;
              const aiTimedOut  = submitted && !aiGraded && aiAge > 3 * 60 * 1000;
              const aiPending   = submitted && !aiGraded && !aiTimedOut;
              const aiScore     = a.submission?.aiScore  as number | null;
              const aiFeedback  = a.submission?.aiFeedback as string | null;
              const aiBreakdown = a.submission?.aiBreakdown as Record<string, string> | null;

              return (
                <div key={a.id} className={`rounded-2xl border p-5 transition-all ${
                  graded     ? 'border-blue-200 bg-blue-50' :
                  submitted  ? 'border-cyan-200 bg-cyan-50' :
                  isOverdue  ? 'border-red-200 bg-red-50' :
                  'border-slate-200 bg-white hover:border-slate-300'
                }`}>
                  {/* ── Card row: info | view | submit ── */}
                  <div className="flex items-center gap-3">

                    {/* Info — takes all space */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-sm font-bold text-slate-900">{a.title}</h3>
                        {graded && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-200">
                            Graded: {a.submission.score}/{a.maxScore}
                          </span>
                        )}
                        {submitted && !graded && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-cyan-100 text-cyan-700 border border-cyan-200">
                            Submitted
                          </span>
                        )}
                        {isOverdue && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200">
                            Overdue
                          </span>
                        )}
                      </div>
                      {a.description && <p className="text-xs text-slate-500 mt-1 line-clamp-1">{a.description}</p>}
                      <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                        {a.moduleTitle && (
                          <span className="text-xs text-slate-500 flex items-center gap-1">
                            <BookOpen className="w-3 h-3" />{a.sessionNumber ? `S${a.sessionNumber}: ` : ''}{a.moduleTitle}
                          </span>
                        )}
                        {dueDate && (
                          <span className={`text-xs flex items-center gap-1 ${isOverdue ? 'text-red-600' : 'text-slate-500'}`}>
                            <Calendar className="w-3 h-3" />Due: {dueDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                          </span>
                        )}
                        <span className="text-xs text-slate-500 flex items-center gap-1">
                          <Award className="w-3 h-3" />Max: {a.maxScore}
                        </span>
                        {/* Submitted file links */}
                        {a.submission?.pdfUrl && (
                          <button
                            type="button"
                            onClick={() => openDoc({ url: a.submission.pdfUrl, title: `${a.title} — My PDF` })}
                            className="text-xs flex items-center gap-1 text-red-600 hover:text-red-700 transition-colors"
                          >
                            <FileText className="w-3 h-3" />My PDF
                          </button>
                        )}
                        {a.submission?.zipUrl && (
                          <a href={a.submission.zipUrl} download
                            className="text-xs flex items-center gap-1 text-blue-600 hover:text-blue-700 transition-colors">
                            <Archive className="w-3 h-3" />My ZIP
                          </a>
                        )}
                      </div>
                    </div>

                    {/* View Assignment — middle */}
                    {a.pdfUrl && (
                      <button
                        type="button"
                        onClick={() => openDoc({ url: a.pdfUrl, title: a.title })}
                        className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border transition-all text-slate-600 border-slate-200 bg-slate-50 hover:bg-slate-100 hover:text-slate-900"
                      >
                        <Eye className="w-3.5 h-3.5" />View
                      </button>
                    )}

                    {/* Submit Task — right */}
                    <button
                      onClick={() => setSubmitFor(a)}
                      className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border transition-all ${
                        submitted
                          ? 'text-blue-600 border-blue-200 bg-blue-50 hover:bg-blue-100'
                          : 'text-white border-blue-600 bg-blue-600 hover:bg-blue-700'
                      }`}
                    >
                      <Upload className="w-3.5 h-3.5" />{submitted ? 'Re-submit' : 'Submit Task'}
                    </button>
                  </div>

                  {/* Trainer feedback */}
                  {graded && a.submission?.feedback && (
                    <div className="mt-3 p-3 rounded-xl bg-slate-50 border border-slate-200">
                      <p className="text-xs text-slate-500 font-medium mb-1">Trainer Feedback:</p>
                      <p className="text-sm text-slate-700">{a.submission.feedback}</p>
                    </div>
                  )}

                  {/* AI Grade panel */}
                  {submitted && (
                    <div className={`mt-3 rounded-xl border p-3 ${
                      aiGraded
                        ? 'border-orange-200 bg-orange-50'
                        : 'border-slate-200 bg-slate-50'
                    }`}>
                      {aiPending ? (
                        <div className="flex items-center gap-2 text-xs text-slate-500">
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-orange-500" />
                          AI grading in progress…
                        </div>
                      ) : aiTimedOut ? (
                        <p className="text-xs text-slate-500 flex items-center gap-1.5">
                          <Sparkles className="w-3 h-3 text-slate-400" />
                          AI grade pending — re-submit to retry
                        </p>
                      ) : aiGraded && (
                        <>
                          <div className="flex items-center justify-between mb-2">
                            <span className="flex items-center gap-1.5 text-xs font-semibold text-blue-600">
                              <Sparkles className="w-3.5 h-3.5" /> AI Grade
                            </span>
                            <span className="text-base font-black text-orange-700">
                              {aiScore}
                              <span className="text-xs text-orange-500 font-normal">/{a.maxScore}</span>
                            </span>
                          </div>
                          {aiFeedback && (
                            <p className="text-xs text-slate-600 leading-relaxed">{aiFeedback}</p>
                          )}
                          {aiBreakdown && Object.keys(aiBreakdown).length > 0 && (
                            <div className="mt-2 space-y-1">
                              {Object.entries(aiBreakdown)
                                .filter(([k]) => !['pass1_score','final_score','needs_human_review','verification','score_calculation'].includes(k))
                                .map(([k, v]) => (
                                  <div key={k} className="flex gap-2 text-[11px]">
                                    <span className="text-blue-600 capitalize font-medium w-20 flex-shrink-0">
                                      {k.replace(/_/g, ' ')}:
                                    </span>
                                    <span className="text-slate-500">{String(v)}</span>
                                  </div>
                                ))}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ── Quizzes Tab ───────────────────────────────────────────────────────── */}
      {mainTab === 'quizzes' && (
        <div className="mx-5 mt-5 space-y-3 pb-16">
          {quizzes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center">
                <HelpCircle className="w-7 h-7 text-slate-500" />
              </div>
              <p className="text-slate-900 font-semibold">No quizzes available</p>
              <p className="text-gray-500 text-sm">Quizzes will appear here once sessions are marked as completed.</p>
            </div>
          ) : (
            quizzes.map((q: any) => {
              const attempted = q.attemptsUsed > 0;
              const passed = q.bestAttempt?.passed;
              const canRetry = q.attemptsUsed < q.maxAttempts;

              return (
                <div key={q.id} className={`rounded-2xl border p-5 transition-all ${
                  passed ? 'border-blue-200 bg-blue-50' :
                  attempted && !passed ? 'border-amber-200 bg-amber-50' :
                  'border-slate-200 bg-white hover:border-slate-300'
                }`}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-sm font-bold text-slate-900">{q.title}</h3>
                        {passed && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-200">
                            ✓ Passed ({q.bestAttempt.score}%)
                          </span>
                        )}
                        {attempted && !passed && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">
                            Failed ({q.bestAttempt?.score ?? 0}%)
                          </span>
                        )}
                        {!attempted && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200">
                            Not attempted
                          </span>
                        )}
                      </div>
                      {q.description && <p className="text-xs text-slate-500 mt-1 line-clamp-2">{q.description}</p>}
                      <div className="flex items-center gap-3 mt-2 flex-wrap">
                        {q.moduleTitle && (
                          <span className="text-xs text-slate-500 flex items-center gap-1">
                            <BookOpen className="w-3 h-3" /> {q.sessionNumber ? `S${q.sessionNumber}: ` : ''}{q.moduleTitle}
                          </span>
                        )}
                        <span className="text-xs text-slate-500 flex items-center gap-1">
                          <HelpCircle className="w-3 h-3" /> {q.questionsPerAttempt} questions
                        </span>
                        {q.timeLimitMinutes && (
                          <span className="text-xs text-slate-500 flex items-center gap-1">
                            <Clock className="w-3 h-3" /> {q.timeLimitMinutes} min
                          </span>
                        )}
                        <span className="text-xs text-slate-500">
                          Pass: {q.passingScore}%
                        </span>
                        <span className="text-xs text-slate-500">
                          Attempts: {q.attemptsUsed}/{q.maxAttempts}
                        </span>
                      </div>
                    </div>
                    <div className="shrink-0">
                      {!attempted ? (
                        <Link
                          to={`/my-courses/${enrollmentId}/quiz/${q.id}${courseId ? `?courseId=${courseId}` : ''}`}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border text-white border-blue-600 bg-blue-600 hover:bg-blue-700 transition-colors">
                          <PlayCircle className="w-3.5 h-3.5" /> Start
                        </Link>
                      ) : canRetry && !passed ? (
                        <Link
                          to={`/my-courses/${enrollmentId}/quiz/${q.id}${courseId ? `?courseId=${courseId}` : ''}`}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border text-amber-700 border-amber-200 bg-amber-100 hover:bg-amber-200 transition-colors">
                          <PlayCircle className="w-3.5 h-3.5" /> Retry
                        </Link>
                      ) : passed ? (
                        <span className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border text-blue-700 border-blue-200 bg-blue-100">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Passed
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}



      {mainTab === 'sessions' && sheetSections.length > 0 && (
        <>
          {/* ── Sheet tabs (from syllabus Excel sheets) ───────────────────────── */}
          {sheetSections.length > 1 && (
            <div className="mx-5 mt-5 flex-shrink-0">
              <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
                {sheetSections.map((sheet) => {
                  const isActive      = sheet.name === activeSection;
                  const completedInSec = sheet.sessions.filter(s => {
                    const mod = moduleMap.get(`${sheet.name}::${String(s.session)}`);
                    return mod?.status === 'COMPLETED';
                  }).length;
                  return (
                    <button key={sheet.name} onClick={() => { setActiveSection(sheet.name); collapseAll(); }}
                      className={`flex-shrink-0 flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border transition-all ${
                        isActive
                          ? 'text-slate-900 shadow-lg'
                          : 'bg-white border-slate-200 text-slate-500 hover:text-slate-900 hover:border-slate-300 hover:bg-slate-50'
                      }`}
                      style={isActive ? { backgroundColor: color+'dd', borderColor: color, boxShadow: `0 4px 16px ${color}40` } : {}}>
                      {sheet.name}
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${isActive ? 'bg-white/30 text-slate-900' : 'bg-slate-200 text-slate-500'}`}>
                        {completedInSec}/{sheet.sessions.length}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}


          {/* Course Completion Feedback (100% complete or batch completed, and not yet submitted) */}
          {(enrollment.completionPct === 100 || enrollment.batchStatus === 'COMPLETED') && !courseFeedbackStatus?.submitted && (
            <div className="mx-5">
              <CourseFeedbackForm
                enrollmentId={enrollmentId!}
                courseId={courseId}
                courseTitle={enrollment.courseTitle}
                color={color}
                onSuccess={() => {
                  qc.invalidateQueries({ queryKey: ['course-feedback-status', enrollmentId, courseId] });
                }}
              />
            </div>
          )}

          {/* ── Stats row ─────────────────────────────────────────────────────── */}
          <div className="mx-5 mt-4 grid grid-cols-3 gap-3 flex-shrink-0">
            {[
              { label: 'Sessions', value: totalSessions, icon: BookOpen },
              { label: 'Hours',    value: totalHours + 'h', icon: Clock },
              { label: 'Topics',   value: totalTopics, icon: Zap },
            ].map(({ label, value, icon: Icon }) => (
              <div key={label}
                className="rounded-2xl border border-slate-200 bg-white px-3 py-3.5 text-center hover:bg-slate-50 transition-colors"
                style={{ boxShadow: `0 2px 12px ${color}08` }}>
                <Icon className="w-4 h-4 mx-auto mb-1.5" style={{ color }} />
                <p className="text-xl font-black" style={{ color }}>{value}</p>
                <p className="text-[10px] text-gray-500 mt-0.5">{label}</p>
              </div>
            ))}
          </div>

          {/* ── Section heading + expand controls ─────────────────────────────── */}
          <div className="mx-5 mt-5 flex-shrink-0">
            <p className="text-base font-bold text-slate-900">{activeSection ?? currentSheet?.name}</p>
            <p className="text-xs text-gray-500 mt-0.5">
              {sessions.length} sessions{childCount > 0 ? ` · ${childCount} sub` : ''}
            </p>
          </div>

          {/* ── Sessions list — sourced from syllabus, status from moduleMap ──── */}
          <div className="mx-5 mt-3 space-y-2 pb-16 flex-shrink-0">
            {sessions.map((sess, idx) => {
              const key       = String(sess.session);
              const childSubs = getChildSubs(key);
              const isOpen    = expanded.has(key);
              const topics    = sess.topics ?? [];
              const num       = key.length <= 3 ? key : String(idx + 1);

              // Cross-reference course_modules for status / id / meetLink / counts
              const mod         = moduleMap.get(`${currentSheet?.name ?? ''}::${key}`);
              
              const modIndex = mod && data?.sessions ? data.sessions.findIndex((s: any) => String(s.id) === String(mod.id)) : -1;
              const isLockedByFeedback = pendingModuleIndex !== -1 && modIndex > pendingModuleIndex;

              const isCompleted = mod?.status === 'COMPLETED';
              const isReleased  = !isLockedByFeedback && mod?.status === 'RELEASED';
              const isLocked    = isLockedByFeedback || !mod || mod.status === 'LOCKED';
              const meetLink    = mod?.meetLink ?? null;

              return (
                <div key={`parent-${key}`} className="space-y-2">
                <div
                  className={`rounded-2xl border transition-all duration-200 overflow-hidden ${
                    isLocked
                      ? 'border-slate-100 bg-slate-50/50'
                      : isCompleted
                        ? 'border-blue-200 bg-blue-50'
                        : isOpen
                          ? 'border-slate-300 bg-white'
                          : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                  style={isReleased && !isLocked ? { borderColor: color+'30', boxShadow: `0 2px 16px ${color}10` } : {}}
                >
                  {/* Row */}
                  <div className={`flex items-center gap-3.5 px-4 py-3.5 ${isLocked ? 'opacity-40' : ''}`}>
                    {/* Number / status circle */}
                    <div
                      className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold border ${
                        isCompleted ? 'bg-blue-100 text-blue-600 border-blue-200' :
                        isLocked    ? 'bg-slate-100 text-slate-400 border-slate-200' :
                        'border-transparent'
                      }`}
                      style={isReleased && !isLocked ? { backgroundColor: color+'22', color, border: `1.5px solid ${color}40` } : {}}
                    >
                      {isCompleted
                        ? <CheckCircle2 className="w-5 h-5" />
                        : isLocked
                          ? <Lock className="w-4 h-4" />
                          : isReleased
                            ? <PlayCircle className="w-5 h-5" />
                            : num}
                    </div>

                    {/* Title + meta */}
                    <div className="flex-1 min-w-0">
                      <p className={`font-semibold text-sm leading-tight ${isLocked ? 'text-slate-400' : isCompleted ? 'text-blue-800' : 'text-slate-900'}`}>
                        {sess.module}
                      </p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        {topics.length > 0 && (
                          <span className="text-xs text-gray-500">
                            {topics.length} topic{topics.length !== 1 ? 's' : ''}
                          </span>
                        )}
                        {childSubs.length > 0 && (
                          <button
                            type="button"
                            onClick={() => toggleSession(key)}
                            className="text-[11px] text-violet-700 bg-violet-100 hover:bg-violet-200 px-1.5 py-0.5 rounded-full font-semibold transition-colors"
                          >
                            {childSubs.length} sub-session{childSubs.length !== 1 ? 's' : ''}
                            <ChevronDown className={`inline w-3 h-3 ml-0.5 align-middle transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
                          </button>
                        )}
                        {(mod?.assignmentCount ?? 0) > 0 && (
                          <span className="flex items-center gap-1 text-[11px] text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded-full">
                            <ClipboardList className="w-3 h-3" /> {mod!.assignmentCount}
                          </span>
                        )}
                        {(mod?.quizCount ?? 0) > 0 && (
                          <span className="flex items-center gap-1 text-[11px] text-violet-700 bg-violet-100 px-1.5 py-0.5 rounded-full">
                            <HelpCircle className="w-3 h-3" /> {mod!.quizCount}
                          </span>
                        )}
                        {isCompleted && (
                          <span className="flex items-center gap-1 text-[11px] text-blue-600">
                            <Star className="w-3 h-3 fill-current" /> Done
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Duration badge */}
                    {sess.duration != null && !isLocked && (
                      <span className="flex-shrink-0 flex items-center gap-1 text-[11px] text-slate-500 bg-slate-100 px-2 py-1 rounded-full border border-slate-200">
                        <Clock className="w-3 h-3" /> {sess.duration}m
                      </span>
                    )}

                    {/* Actions — only when module exists (session is in course_modules) */}
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {!isLocked && mod && (
                        <div className="flex items-center gap-1.5">
                          {meetLink && (
                            <a href={meetLink} target="_blank" rel="noopener noreferrer"
                              className="lms-press flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors duration-300 ease-out bg-blue-500/15 border border-blue-500/30 text-blue-400 hover:bg-blue-500/25">
                              <Video className="w-3.5 h-3.5" /> Join
                            </a>
                          )}
                          <button
                            onClick={() => navigate(`/my-courses/${enrollmentId}/session/${mod.id}?courseId=${courseId}`)}
                            className="lms-press flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors duration-300 ease-out"
                            style={{ background: color+'25', color, border: `1px solid ${color}40`, boxShadow: `0 2px 8px ${color}20` }}>
                            Open <ChevronRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                      {(topics.length > 0 || childSubs.length > 0) && !isLocked && (
                        <button onClick={() => toggleSession(key)}
                          className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-colors shrink-0"
                          aria-expanded={isOpen}
                          aria-label={isOpen ? 'Collapse session' : 'Expand session'}
                        >
                          <ChevronDown className={`w-4 h-4 text-slate-700 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Topics expanded */}
                  {isOpen && topics.length > 0 && (
                    <div className="px-4 pb-4 border-t border-slate-100">
                      <div className="pt-3 grid grid-cols-1 gap-1.5">
                        {topics.map((topic, ti) => (
                          <div key={ti} className="flex items-start gap-3 p-2 rounded-xl hover:bg-slate-50 transition-colors">
                            <div
                              className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5"
                              style={{ backgroundColor: color+'22', color }}
                            >
                              {ti + 1}
                            </div>
                            <p className="text-sm text-slate-600 leading-relaxed">{topic}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {/* Inline Session Feedback Form */}
                  {mod && (String(pendingModuleId) === String(mod.id) || String(activeFeedbackModule) === String(mod.id)) && (
                    <div className="px-4 pb-4 border-t border-slate-100 pt-4">
                      <InlineSessionFeedback
                        enrollmentId={enrollmentId!}
                        moduleId={mod.id}
                        batchId={pendingFeedback?.batchId || enrollment?.batchId || ''}
                        sessionTitle={sess.module}
                        color={color}
                        onSuccess={() => {
                          setActiveFeedbackModule(null);
                          qc.invalidateQueries({ queryKey: ['pending-feedback'] });
                          qc.invalidateQueries({ queryKey: ['enrollment-sessions'] });
                          qc.invalidateQueries({ queryKey: ['session-feedback-status'] });
                          qc.invalidateQueries({ queryKey: ['student-dashboard'] });
                        }}
                        onCancel={() => {
                          setActiveFeedbackModule(null);
                        }}
                      />
                    </div>
                  )}

                  {/* Feedback required button */}
                  {mod && String(pendingModuleId) === String(mod.id) && String(activeFeedbackModule) !== String(mod.id) && (
                    <div className="px-4 pb-4 border-t border-slate-100 pt-4 flex justify-end">
                      <button
                        onClick={() => setActiveFeedbackModule(mod.id)}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold animate-pulse text-slate-900 shadow-lg"
                        style={{ background: color, boxShadow: `0 4px 15px ${color}40` }}
                      >
                        <Star className="w-4 h-4 fill-white" />
                        Feedback Required to Unlock Next Session
                      </button>
                    </div>
                  )}

                  {/* Sub-sessions dropdown panel */}
                  {isOpen && childSubs.length > 0 && (
                    <div className="border-t border-violet-100 bg-violet-50/30 px-3 sm:px-4 pb-4 pt-3">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-violet-600 mb-2">
                        Sub-sessions ({childSubs.length})
                      </p>
                      <div className="space-y-2">
                        {childSubs.map((sub) => {
                          const subKey = sub.sessionNumber!;
                          const subOpen = expanded.has(subKey);
                          const subTopics = Array.isArray(sub.topics) ? sub.topics : [];
                          const subIndex = data?.sessions
                            ? data.sessions.findIndex((s: SessionItem) => String(s.id) === String(sub.id))
                            : -1;
                          const subLockedByFeedback = pendingModuleIndex !== -1 && subIndex > pendingModuleIndex;
                          const subCompleted = sub.status === 'COMPLETED';
                          const subReleased  = !subLockedByFeedback && sub.status === 'RELEASED';
                          const subLocked    = subLockedByFeedback || sub.status === 'LOCKED';
                          const subMeet      = sub.meetLink ?? null;

                          return (
                            <div key={sub.id}
                              className={`rounded-xl border transition-all duration-200 overflow-hidden ${
                                subLocked
                                  ? 'border-slate-100 bg-slate-50/80'
                                  : subCompleted
                                    ? 'border-blue-200 bg-blue-50'
                                    : subOpen
                                      ? 'border-violet-300 bg-white'
                                      : 'border-violet-200 bg-white hover:border-violet-300'
                              }`}
                              style={subReleased && !subLocked ? { borderColor: color+'30' } : {}}
                            >
                              {/* Collapsed header — always visible */}
                              <div className={`flex items-center gap-2.5 px-3 py-2.5 ${subLocked ? 'opacity-40' : ''}`}>
                                <div
                                  className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold border ${
                                    subCompleted ? 'bg-blue-100 text-blue-600 border-blue-200' :
                                    subLocked    ? 'bg-slate-100 text-slate-400 border-slate-200' :
                                    'border-transparent'
                                  }`}
                                  style={subReleased && !subLocked ? { backgroundColor: color+'22', color, border: `1.5px solid ${color}40` } : {}}
                                >
                                  {subCompleted
                                    ? <CheckCircle2 className="w-4 h-4" />
                                    : subLocked
                                      ? <Lock className="w-3.5 h-3.5" />
                                      : subReleased
                                        ? <PlayCircle className="w-4 h-4" />
                                        : subKey}
                                </div>
                                <button
                                  type="button"
                                  onClick={() => toggleSession(subKey)}
                                  className="flex-1 min-w-0 text-left"
                                >
                                  <p className={`font-semibold text-sm leading-tight truncate ${subLocked ? 'text-slate-400' : subCompleted ? 'text-blue-800' : 'text-slate-900'}`}>
                                    {sub.title}
                                  </p>
                                  <span className="text-[10px] text-violet-700 bg-violet-100 px-1.5 py-0.5 rounded-full font-semibold mt-0.5 inline-block">
                                    Sub-session {subKey}
                                  </span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => toggleSession(subKey)}
                                  className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center shrink-0 transition-colors"
                                  aria-expanded={subOpen}
                                  aria-label={subOpen ? 'Collapse sub-session' : 'Expand sub-session'}
                                >
                                  <ChevronDown className={`w-4 h-4 text-slate-700 transition-transform duration-200 ${subOpen ? 'rotate-180' : ''}`} />
                                </button>
                              </div>

                              {/* Expanded body — per sub-session */}
                              {subOpen && (
                                <div className="border-t border-violet-100 px-3 pb-3 pt-2 space-y-2.5">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    {subTopics.length > 0 && (
                                      <span className="text-xs text-gray-500">{subTopics.length} topic{subTopics.length !== 1 ? 's' : ''}</span>
                                    )}
                                    {(sub.assignmentCount ?? 0) > 0 && (
                                      <span className="flex items-center gap-1 text-[10px] text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded-full">
                                        <ClipboardList className="w-3 h-3" /> {sub.assignmentCount} assignment{(sub.assignmentCount ?? 0) !== 1 ? 's' : ''}
                                      </span>
                                    )}
                                    {(sub.quizCount ?? 0) > 0 && (
                                      <span className="flex items-center gap-1 text-[10px] text-violet-700 bg-violet-100 px-1.5 py-0.5 rounded-full">
                                        <HelpCircle className="w-3 h-3" /> {sub.quizCount} quiz{(sub.quizCount ?? 0) !== 1 ? 'zes' : ''}
                                      </span>
                                    )}
                                    {subCompleted && (
                                      <span className="flex items-center gap-1 text-[10px] text-blue-600">
                                        <Star className="w-3 h-3 fill-current" /> Done
                                      </span>
                                    )}
                                    {sub.durationMinutes != null && !subLocked && (
                                      <span className="flex items-center gap-1 text-[10px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">
                                        <Clock className="w-3 h-3" /> {sub.durationMinutes}m
                                      </span>
                                    )}
                                  </div>

                                  {!subLocked && (
                                    <div className="flex items-center gap-2 flex-wrap">
                                      {subMeet && (
                                        <a href={subMeet} target="_blank" rel="noopener noreferrer"
                                          className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold bg-blue-500/15 border border-blue-500/30 text-blue-500 hover:bg-blue-500/25">
                                          <Video className="w-3.5 h-3.5" /> Join
                                        </a>
                                      )}
                                      <button
                                        onClick={() => navigate(`/my-courses/${enrollmentId}/session/${sub.id}?courseId=${courseId}`)}
                                        className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold"
                                        style={{ background: color+'25', color, border: `1px solid ${color}40` }}>
                                        Open <ChevronRight className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  )}

                                  {subTopics.length > 0 && (
                                    <div className="grid grid-cols-1 gap-1 pt-1">
                                      {subTopics.map((topic, ti) => (
                                        <p key={ti} className="text-xs text-slate-600 pl-2 border-l-2 border-violet-200">{topic}</p>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
                </div>
              );
            })}

            {/* Edge-case orphans: sub-sessions whose parent # is not on this sheet */}
            {unparentedSubs.map((mod) => {
              const key = mod.sessionNumber!;
              const isOpen = expanded.has(key);
              const topics = Array.isArray(mod.topics) ? mod.topics : [];
              const modIndex = data?.sessions
                ? data.sessions.findIndex((s: SessionItem) => String(s.id) === String(mod.id))
                : -1;
              const isLockedByFeedback = pendingModuleIndex !== -1 && modIndex > pendingModuleIndex;
              const isCompleted = mod.status === 'COMPLETED';
              const isReleased  = !isLockedByFeedback && mod.status === 'RELEASED';
              const isLocked    = isLockedByFeedback || mod.status === 'LOCKED';
              const meetLink    = mod.meetLink ?? null;

              return (
                <div key={mod.id}
                  className={`rounded-2xl border transition-all duration-200 overflow-hidden ${
                    isLocked
                      ? 'border-slate-100 bg-slate-50/50'
                      : isCompleted
                        ? 'border-blue-200 bg-blue-50'
                        : isOpen
                          ? 'border-violet-300 bg-white'
                          : 'border-violet-200 bg-violet-50/30 hover:border-violet-300'
                  }`}
                  style={isReleased && !isLocked ? { borderColor: color+'30', boxShadow: `0 2px 16px ${color}10` } : {}}
                >
                  <div className={`flex items-center gap-2.5 px-4 py-3 ${isLocked ? 'opacity-40' : ''}`}>
                    <div
                      className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold border ${
                        isCompleted ? 'bg-blue-100 text-blue-600 border-blue-200' :
                        isLocked    ? 'bg-slate-100 text-slate-400 border-slate-200' :
                        'border-transparent'
                      }`}
                      style={isReleased && !isLocked ? { backgroundColor: color+'22', color, border: `1.5px solid ${color}40` } : {}}
                    >
                      {isCompleted
                        ? <CheckCircle2 className="w-5 h-5" />
                        : isLocked
                          ? <Lock className="w-4 h-4" />
                          : isReleased
                            ? <PlayCircle className="w-5 h-5" />
                            : key}
                    </div>
                    <button type="button" onClick={() => toggleSession(key)} className="flex-1 min-w-0 text-left">
                      <p className={`font-semibold text-sm leading-tight ${isLocked ? 'text-slate-400' : isCompleted ? 'text-blue-800' : 'text-slate-900'}`}>
                        {mod.title}
                      </p>
                      <span className="text-[11px] text-violet-700 bg-violet-100 px-1.5 py-0.5 rounded-full font-semibold mt-0.5 inline-block">
                        Sub-session {key}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleSession(key)}
                      className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center shrink-0 transition-colors"
                      aria-expanded={isOpen}
                    >
                      <ChevronDown className={`w-4 h-4 text-slate-700 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
                    </button>
                  </div>
                  {isOpen && (
                    <div className="border-t border-violet-100 px-4 pb-4 pt-3 space-y-2.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        {topics.length > 0 && (
                          <span className="text-xs text-gray-500">{topics.length} topic{topics.length !== 1 ? 's' : ''}</span>
                        )}
                        {(mod.assignmentCount ?? 0) > 0 && (
                          <span className="flex items-center gap-1 text-[11px] text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded-full">
                            <ClipboardList className="w-3 h-3" /> {mod.assignmentCount}
                          </span>
                        )}
                        {(mod.quizCount ?? 0) > 0 && (
                          <span className="flex items-center gap-1 text-[11px] text-violet-700 bg-violet-100 px-1.5 py-0.5 rounded-full">
                            <HelpCircle className="w-3 h-3" /> {mod.quizCount}
                          </span>
                        )}
                        {isCompleted && (
                          <span className="flex items-center gap-1 text-[11px] text-blue-600">
                            <Star className="w-3 h-3 fill-current" /> Done
                          </span>
                        )}
                        {mod.durationMinutes != null && !isLocked && (
                          <span className="flex items-center gap-1 text-[11px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">
                            <Clock className="w-3 h-3" /> {mod.durationMinutes}m
                          </span>
                        )}
                      </div>
                      {!isLocked && (
                        <div className="flex items-center gap-2">
                          {meetLink && (
                            <a href={meetLink} target="_blank" rel="noopener noreferrer"
                              className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold bg-blue-500/15 border border-blue-500/30 text-blue-400">
                              <Video className="w-3.5 h-3.5" /> Join
                            </a>
                          )}
                          <button
                            onClick={() => navigate(`/my-courses/${enrollmentId}/session/${mod.id}?courseId=${courseId}`)}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold"
                            style={{ background: color+'25', color, border: `1px solid ${color}40` }}>
                            Open <ChevronRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                      {topics.length > 0 && (
                        <div className="grid grid-cols-1 gap-1.5">
                          {topics.map((topic, ti) => (
                            <p key={ti} className="text-sm text-slate-600 pl-2 border-l-2 border-violet-200">{topic}</p>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Fallback when no Excel syllabus — nest sub-sessions under parents by # */}
      {mainTab === 'sessions' && sheetSections.length === 0 && (
        <div className="mx-5 mt-3 space-y-2 pb-16">
          {(data?.sessions ?? []).length === 0 ? (
            <div className="text-center py-12 text-gray-400 text-sm">No sessions yet</div>
          ) : (() => {
            const all = data?.sessions ?? [];
            const roots = all.filter((m) => !(m.sessionNumber ?? '').includes('.'));
            const nestedIds = new Set<string>();
            for (const r of roots) {
              for (const c of getChildSubs(String(r.sessionNumber ?? ''))) nestedIds.add(c.id);
            }
            const orphans = all.filter(
              (m) => (m.sessionNumber ?? '').includes('.') && !nestedIds.has(m.id),
            );

            const renderFlatRow = (
              mod: SessionItem,
              opts: { indented?: boolean; embedded?: boolean } = {},
            ) => {
              const { indented = false, embedded = false } = opts;
              const isCompleted = mod.status === 'COMPLETED';
              const isReleased  = mod.status === 'RELEASED';
              const isLocked    = mod.status === 'LOCKED';
              const isSub = (mod.sessionNumber ?? '').includes('.');
              return (
                <div key={mod.id} className={`${embedded ? '' : 'rounded-2xl border '}${indented ? 'ml-3 sm:ml-5 ' : ''}${
                  isLocked ? 'opacity-40 border-slate-100 bg-slate-50' :
                  isCompleted ? 'border-blue-200 bg-blue-50' :
                  isSub ? 'border-violet-200 bg-violet-50/30' : 'border-slate-200 bg-white'
                } px-4 py-3.5 flex items-center gap-3`}>
                  <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold bg-slate-100 text-slate-600">
                    {mod.sessionNumber ?? '•'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-slate-900 truncate">{mod.title}</p>
                    {isSub && (
                      <span className="text-[11px] text-violet-700">Sub-session {mod.sessionNumber}</span>
                    )}
                  </div>
                  {!isLocked && (
                    <button
                      onClick={() => navigate(`/my-courses/${enrollmentId}/session/${mod.id}?courseId=${courseId}`)}
                      className="px-3 py-1.5 rounded-xl text-xs font-bold"
                      style={{ background: color+'25', color }}>
                      Open
                    </button>
                  )}
                  {isReleased && <PlayCircle className="w-4 h-4" style={{ color }} />}
                  {isCompleted && <CheckCircle2 className="w-4 h-4 text-blue-600" />}
                  {isLocked && <Lock className="w-4 h-4 text-slate-400" />}
                </div>
              );
            };

            const renderSubAccordion = (mod: SessionItem) => {
              const key = mod.sessionNumber!;
              const isSubOpen = expanded.has(key);
              const isCompleted = mod.status === 'COMPLETED';
              const isReleased  = mod.status === 'RELEASED';
              const isLocked    = mod.status === 'LOCKED';
              return (
                <div key={mod.id} className={`ml-3 sm:ml-5 rounded-xl border overflow-hidden ${
                  isLocked ? 'border-slate-100 bg-slate-50' :
                  isCompleted ? 'border-blue-200 bg-blue-50' :
                  'border-violet-200 bg-white'
                }`}>
                  <div className={`flex items-center gap-2 px-3 py-2.5 ${isLocked ? 'opacity-40' : ''}`}>
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold bg-violet-100 text-violet-700 shrink-0">
                      {key}
                    </div>
                    <button type="button" onClick={() => toggleSession(key)} className="flex-1 min-w-0 text-left">
                      <p className="font-semibold text-sm text-slate-900 truncate">{mod.title}</p>
                      <span className="text-[10px] text-violet-700">Sub-session {key}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleSession(key)}
                      className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center shrink-0"
                    >
                      <ChevronDown className={`w-4 h-4 text-slate-700 transition-transform duration-200 ${isSubOpen ? 'rotate-180' : ''}`} />
                    </button>
                  </div>
                  {isSubOpen && !isLocked && (
                    <div className="border-t border-violet-100 px-3 pb-3 pt-2">
                      <button
                        onClick={() => navigate(`/my-courses/${enrollmentId}/session/${mod.id}?courseId=${courseId}`)}
                        className="px-3 py-1.5 rounded-xl text-xs font-bold"
                        style={{ background: color+'25', color }}>
                        Open session
                      </button>
                    </div>
                  )}
                </div>
              );
            };

            return (
              <>
                {roots.map((mod) => {
                  const parentKey = String(mod.sessionNumber ?? mod.id);
                  const childSubs = getChildSubs(String(mod.sessionNumber ?? ''));
                  const isOpen = expanded.has(parentKey);
                  return (
                    <div key={`parent-${mod.id}`} className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 min-w-0">{renderFlatRow(mod, { embedded: true })}</div>
                        {childSubs.length > 0 && (
                          <button
                            type="button"
                            onClick={() => toggleSession(parentKey)}
                            className="mr-3 w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center shrink-0"
                            title={`${childSubs.length} sub-session(s)`}
                          >
                            <ChevronDown className={`w-4 h-4 text-slate-700 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
                          </button>
                        )}
                      </div>
                      {isOpen && childSubs.length > 0 && (
                        <div className="border-t border-violet-100 bg-violet-50/30 px-3 pb-3 pt-2 space-y-2">
                          <p className="text-[10px] font-bold uppercase tracking-wide text-violet-600">
                            Sub-sessions ({childSubs.length})
                          </p>
                          {childSubs.map((sub) => renderSubAccordion(sub))}
                        </div>
                      )}
                    </div>
                  );
                })}
                {orphans.map((mod) => renderSubAccordion(mod))}
              </>
            );
          })()}
        </div>
      )}

      {docViewer}

      {/* ── Submit Assignment Modal ── */}
      {submitFor && (
        <SubmitAssignmentModal
          assignmentId={submitFor.id}
          assignmentTitle={submitFor.title}
          courseTitle={enrollment?.courseTitle}
          batchName={enrollment?.batchName}
          dueDate={submitFor.dueDate}
          pdfUrl={submitFor.pdfUrl}
          onClose={() => setSubmitFor(null)}
          onSuccess={() => {
            setSubmitFor(null);
            void refreshStudentActivity(qc, {
              kind: 'assignment',
              enrollmentId,
              courseId: courseId || undefined,
            });
          }}
          onOpenPdf={(url, title) => openDoc({ url, title })}
        />
      )}
    </div>
  );
}

