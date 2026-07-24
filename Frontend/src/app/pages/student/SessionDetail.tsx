import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams, Link, useNavigate, useSearchParams } from 'react-router';
import {
  ChevronLeft, BookOpen, Clock, CheckCircle2, PlayCircle, Lock,
  Target, Tv2, Wifi, Radio, Layers, FileText, BookMarked, Package,
  ExternalLink, Video, AlertCircle, Calendar, Eye, Maximize, Bot, Presentation
} from 'lucide-react';
import api from '../../../lib/axios';
import { useAuth } from '../../../store/AuthContext';
import { InlineSessionFeedback } from '../../components/InlineSessionFeedback';
import { ChatbotWidget } from '../../components/ChatbotWidget';
import { InAppDocumentViewer } from '../../components/ui/InAppDocumentViewer';
import {
  isExternalMeetingUrl,
  isYoutubeUrl,
  youtubeEmbedUrl,
} from '../../../lib/inAppMedia';

const COLOR_MAP: Record<string, string> = {
  cyan:   '#06b6d4', purple: '#8b5cf6', indigo: '#6366f1',
  amber:  '#f59e0b', sky:    '#0ea5e9', rose:   '#f43f5e',
  teal:   '#14b8a6', blue:   '#3b82f6', orange: '#f97316',
};

interface SessionData {
  id: string; title: string; description: string | null;
  section: string | null; sessionNumber: string | null;
  topics: string[]; durationMinutes: number | null;
  sortOrder: number; status: string;
  courseId: string; courseTitle: string; colorToken: string;
  meetLink?: string | null;
}

interface ContentItem {
  id: string;
  title: string;
  type: string;
  url: string | null;
  filePath: string | null;
  fileUrl: string | null;
  description: string | null;
  createdAt: string;
}

interface RecordingData {
  id: string;
  youtubeUrl: string | null;
  title: string;
  durationSec: number | null;
  status: 'PENDING' | 'PROCESSING' | 'READY' | 'FAILED';
  thumbnailUrl: string | null;
  recordedDate: string | null;
  availableFrom: string | null;
  isAvailable: boolean;
}

type ContentTab = 'slm' | 'ppt' | 'references' | 'artifacts' | 'recording';

const TAB_CONFIG: Record<ContentTab, {
  label: string;
  icon: typeof FileText;
  accent: string;
  emptyMsg: string;
}> = {
  slm: {
    label: 'SLM',
    icon: BookMarked,
    accent: '#10b981',
    emptyMsg: 'No student learning materials shared for this session yet.',
  },
  ppt: {
    label: 'PPT',
    icon: Presentation,
    accent: '#a855f7',
    emptyMsg: 'No presentations available for this session yet.',
  },
  references: {
    label: 'References',
    icon: FileText,
    accent: '#0ea5e9',
    emptyMsg: 'No reference materials uploaded for this session yet.',
  },
  artifacts: {
    label: 'Artifacts',
    icon: Package,
    accent: '#f43f5e',
    emptyMsg: 'No artifacts uploaded for this session yet.',
  },
  recording: {
    label: 'Recording',
    icon: Video,
    accent: '#8b5cf6',
    emptyMsg: 'No recording available for this session yet.',
  },
};

export default function SessionDetailPage() {
  const { enrollmentId, moduleId } = useParams<{ enrollmentId: string; moduleId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [searchParams] = useSearchParams();
  const courseId = searchParams.get('courseId') ?? '';
  const [contentTab, setContentTab] = useState<ContentTab>('slm');
  const [viewer, setViewer] = useState<{ url: string; title: string; filePath?: string | null } | null>(null);
  const [isPdfFullScreen, setIsPdfFullScreen] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['session-detail', moduleId],
    queryFn: async () => {
      const { data } = await api.get(`/student/sessions/${moduleId}`, {
        params: enrollmentId ? { enrollmentId } : undefined,
      });
      return data.data as {
        session: SessionData;
        references: ContentItem[];
        slm: ContentItem[];
        ppt: ContentItem[];
        artifacts: ContentItem[];
        recording: RecordingData | null;
      };
    },
    enabled: !!moduleId && !!user,
    retry: false,
    // Keep Meet / content fresh while viewing a live session — no hard refresh needed
    refetchInterval: (q) => {
      const status = (q.state.data as { session?: SessionData } | undefined)?.session?.status;
      return status === 'RELEASED' ? 30_000 : false;
    },
    staleTime: 15_000,
  });

  const { data: sessionFeedbackStatus } = useQuery({
    queryKey: ['session-feedback-status', enrollmentId, moduleId],
    queryFn: async () => {
      const { data } = await api.get(`/feedback/status/${enrollmentId}/${moduleId}`);
      return data.data;
    },
    enabled: !!enrollmentId && !!moduleId && !!user,
  });


  const session = data?.session;
  const references = data?.references ?? [];
  const slm = data?.slm ?? [];
  const ppt = data?.ppt ?? [];
  const artifacts = data?.artifacts ?? [];
  const recordingData = data?.recording ?? null;
  const color = COLOR_MAP[session?.colorToken ?? ''] ?? '#06b6d4';
  const topics: string[] = Array.isArray(session?.topics) ? session!.topics : [];
  const cleanLink = session?.meetLink?.match(/https?:\/\/[^\s]+/)?.[0] || session?.meetLink;

  const currentItems: ContentItem[] =
    contentTab === 'slm' ? slm :
    contentTab === 'ppt' ? ppt :
    contentTab === 'references' ? references :
    artifacts;

  if (isLoading) {
    return (
      <div className="space-y-4 p-6">
        <div className="h-6 w-32 rounded-lg bg-slate-200 animate-pulse" />
        <div className="h-32 rounded-2xl bg-slate-200 animate-pulse" />
        <div className="h-48 rounded-2xl bg-slate-200 animate-pulse" />
        {[1, 2, 3].map((i) => <div key={i} className="h-14 rounded-xl bg-slate-200 animate-pulse" />)}
      </div>
    );
  }

  if (!session || isError) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-4">
        <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center">
          <AlertCircle className="w-8 h-8 text-slate-500" />
        </div>
        <p className="text-slate-900 font-semibold">Session not found</p>
        <p className="text-slate-500 text-sm">This session may have been removed or you may not have access.</p>
        <button
          onClick={() => navigate(enrollmentId ? `/my-courses/${enrollmentId}${courseId ? `?courseId=${courseId}` : ''}` : '/my-courses')}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-blue-600 border border-blue-200 rounded-xl hover:bg-blue-50 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" /> Back to Course
        </button>
      </div>
    );
  }

  const statusMap = {
    COMPLETED: { label: 'Completed', cls: 'text-blue-700 border-blue-200 bg-blue-100',     icon: <CheckCircle2 className="w-3 h-3" /> },
    RELEASED:  { label: 'Live Now',  cls: 'text-orange-700 border-orange-200 bg-orange-100', icon: <PlayCircle   className="w-3 h-3" /> },
    LOCKED:    { label: 'Locked',    cls: 'text-slate-500 border-slate-200 bg-slate-100',    icon: <Lock         className="w-3 h-3" /> },
  };
  const statusCfg = statusMap[session.status as keyof typeof statusMap] ?? statusMap.LOCKED;

  return (
    <div className="min-h-screen bg-slate-50">

      {/* Back nav */}
      <div className="px-5 pt-5 pb-2">
        <Link
          to={`/my-courses/${enrollmentId}?courseId=${session.courseId}`}
          className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900 transition-colors group"
        >
          <ChevronLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
          Back to {session.courseTitle}
        </Link>
      </div>

      {/* Session hero header */}
      <div className="mx-5 mt-2">
        <div
          className="rounded-2xl px-6 py-5 relative overflow-hidden border"
          style={{
            background: `linear-gradient(135deg, ${color}16, ${color}06, transparent)`,
            borderColor: color + '28',
            boxShadow: `0 8px 32px ${color}10`,
          }}
        >
          {/* Glow orb */}
          <div
            className="absolute top-0 right-0 w-48 h-48 rounded-full opacity-10 blur-3xl pointer-events-none"
            style={{ background: color, transform: 'translate(30%, -30%)' }}
          />

          {/* Section badge */}
          {session.section && (
            <div className="flex items-center gap-2 mb-3">
              <div
                className="flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full"
                style={{ backgroundColor: color + '20', color, border: `1px solid ${color}40` }}
              >
                <Layers className="w-3 h-3" />
                {session.section}
              </div>
            </div>
          )}

          <h1 className="text-xl font-bold text-slate-900 leading-snug">
            {session.sessionNumber && (
              <span className="text-slate-500 font-mono text-base mr-2.5">S{session.sessionNumber}</span>
            )}
            {session.title}
          </h1>

          {session.description && (
            <p className="text-slate-500 text-sm mt-2 leading-relaxed line-clamp-2">{session.description}</p>
          )}

          {/* Meta chips */}
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            {session.durationMinutes && (
              <span className="flex items-center gap-1 text-xs text-slate-600 bg-white/70 border border-slate-200 px-2.5 py-1 rounded-full">
                <Clock className="w-3 h-3" /> {session.durationMinutes} min
              </span>
            )}
            {topics.length > 0 && (
              <span className="flex items-center gap-1 text-xs text-slate-600 bg-white/70 border border-slate-200 px-2.5 py-1 rounded-full">
                <Target className="w-3 h-3" /> {topics.length} topics
              </span>
            )}
            <span className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border ${statusCfg.cls}`}>
              {statusCfg.icon}
              {statusCfg.label}
            </span>
          </div>
        </div>
      </div>

      {/* Session Feedback */}
      {sessionFeedbackStatus?.requiresFeedback && !sessionFeedbackStatus?.submitted && (
        <div className="mx-5 mt-4">
          <InlineSessionFeedback
            enrollmentId={enrollmentId!}
            moduleId={moduleId!}
            batchId={sessionFeedbackStatus.batchId}
            sessionTitle={session?.title || 'Session'}
            color={color}
            onSuccess={() => {
              qc.invalidateQueries({ queryKey: ['session-feedback-status', enrollmentId, moduleId] });
              qc.invalidateQueries({ queryKey: ['pending-feedback'] });
              qc.invalidateQueries({ queryKey: ['enrollment-sessions'] });
              qc.invalidateQueries({ queryKey: ['student-dashboard'] });
            }}
            onCancel={() => {}}
          />
        </div>
      )}

      {/* Content */}
      <div className="mx-5 mt-4 pb-16 space-y-4">

        {/* ── Live class card ── */}
        <div
          className="rounded-2xl border overflow-hidden relative"
          style={{
            background: cleanLink
              ? `linear-gradient(135deg, ${color}14, ${color}06)`
              : 'rgba(255,255,255,0.02)',
            borderColor: cleanLink ? color + '30' : '#e2e8f0',
          }}
        >
          {cleanLink && (
            <div
              className="absolute inset-0 opacity-5 pointer-events-none"
              style={{ background: `radial-gradient(ellipse at top right, ${color}, transparent 70%)` }}
            />
          )}

          <div className="p-5 flex flex-col items-center gap-4 text-center relative">
            {/* Icon */}
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center relative"
              style={{
                background: cleanLink ? `${color}20` : '#f1f5f9',
                border: `1.5px solid ${cleanLink ? color + '40' : '#e2e8f0'}`,
                boxShadow: cleanLink ? `0 0 24px ${color}20` : 'none',
              }}
            >
              {cleanLink
                ? <Tv2  className="w-7 h-7" style={{ color }} />
                : <Tv2  className="w-7 h-7 text-slate-400" />}
              {cleanLink && (
                <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-60" style={{ backgroundColor: color }} />
                  <span className="relative inline-flex rounded-full h-3.5 w-3.5" style={{ backgroundColor: color }} />
                </span>
              )}
            </div>

            <div>
              <p className="text-slate-900 font-bold text-base">
                {cleanLink ? 'Live Class Ready' : 'Live Class'}
              </p>
              <p className="text-slate-500 text-xs mt-1">
                {cleanLink
                  ? 'Your Google Meet session is ready. Click below to join.'
                  : 'Google Meet link will appear here once your trainer sets it.'}
              </p>
            </div>

            {/* Join / Waiting button */}
            {cleanLink ? (
              <a
                href={cleanLink}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 px-7 py-3 rounded-xl text-sm font-bold text-slate-900 transition-all hover:scale-105 active:scale-95"
                style={{
                  background: `linear-gradient(135deg, ${color}, ${color}cc)`,
                  boxShadow: `0 4px 20px ${color}40`,
                }}
              >
                <Wifi className="w-4 h-4" /> Join Session
              </a>
            ) : (
              <button
                disabled
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-semibold bg-slate-100 text-slate-500 border border-slate-200 cursor-not-allowed"
              >
                <Radio className="w-3.5 h-3.5" /> Waiting for link…
              </button>
            )}
          </div>
        </div>

        {/* ── Topics card ── */}
        {topics.length > 0 && (
          <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-slate-900">Topics Covered</p>
                <p className="text-xs text-slate-500 mt-0.5">{topics.length} topic{topics.length !== 1 ? 's' : ''} in this session</p>
              </div>
              <div
                className="w-8 h-8 rounded-xl flex items-center justify-center"
                style={{ backgroundColor: color + '18', border: `1px solid ${color}30` }}
              >
                <BookOpen className="w-4 h-4" style={{ color }} />
              </div>
            </div>

            <div className="p-4 space-y-1.5">
              {topics.map((topic, i) => (
                <div
                  key={i}
                  className="flex items-start gap-3 p-3 rounded-xl hover:bg-slate-50 transition-colors group"
                >
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 text-[10px] font-bold transition-all group-hover:scale-110"
                    style={{ backgroundColor: color + '22', color }}
                  >
                    {i + 1}
                  </div>
                  <p className="text-sm text-slate-600 leading-relaxed">{topic}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Materials Section: SLM | References | Artifacts ── */}
        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
          {/* Tab switcher */}
          <div className="px-4 pt-4 pb-2">
            <div className="flex gap-1.5 p-1 bg-slate-100 rounded-xl border border-slate-200">
              {(Object.keys(TAB_CONFIG) as ContentTab[]).map((tab) => {
                const cfg = TAB_CONFIG[tab];
                const Icon = cfg.icon;
                const count = tab === 'slm' ? slm.length
                  : tab === 'ppt' ? ppt.length
                  : tab === 'references' ? references.length
                  : tab === 'artifacts' ? artifacts.length
                  : (recordingData ? 1 : 0);
                const isActive = contentTab === tab;
                return (
                  <button
                    key={tab}
                    onClick={() => setContentTab(tab)}
                    className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg text-xs font-semibold transition-all ${
                      isActive ? 'text-slate-900' : 'text-slate-500 hover:text-slate-700'
                    }`}
                    style={isActive ? {
                      backgroundColor: cfg.accent + '22',
                      border: `1px solid ${cfg.accent}30`,
                      color: cfg.accent,
                    } : { border: '1px solid transparent' }}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {cfg.label}
                    {count > 0 && (
                      <span
                        className="text-[9px] px-1.5 py-0.5 rounded-full font-bold"
                        style={isActive
                          ? { backgroundColor: cfg.accent + '30', color: cfg.accent }
                          : { backgroundColor: '#e2e8f0', color: '#64748b' }
                        }
                      >
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Content items */}
          <div className="px-4 pb-4">
            {/* ── Recording Player ── */}
            {contentTab === 'recording' && (
              <RecordingPlayer recording={recordingData ?? null} color="#8b5cf6" />
            )}

            {contentTab !== 'recording' && (currentItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-3">
                <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center">
                  {(() => { const Icon = TAB_CONFIG[contentTab].icon; return <Icon className="w-7 h-7 text-slate-400" />; })()}
                </div>
                <p className="text-slate-500 text-sm font-medium text-center max-w-xs">
                  {TAB_CONFIG[contentTab].emptyMsg}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {currentItems.map((item) => {
                  const cfg = TAB_CONFIG[contentTab];
                  const Icon = cfg.icon;
                  const link = item.fileUrl ?? item.url;
                  return (
                    <div key={item.id}
                      className="flex items-start gap-3 p-3.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 transition-colors group"
                    >
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: cfg.accent + '18', border: `1px solid ${cfg.accent}30` }}>
                        <Icon className="w-4 h-4" style={{ color: cfg.accent }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-900 truncate">{item.title}</p>
                        {item.description && <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{item.description}</p>}
                        <div className="flex items-center gap-2 mt-1.5">
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold"
                            style={{ backgroundColor: cfg.accent + '18', color: cfg.accent }}>{item.type}</span>
                          {item.createdAt && (
                            <span className="text-[10px] text-slate-500">
                              {new Date(item.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                            </span>
                          )}
                        </div>
                      </div>
                      {link && (
                        isExternalMeetingUrl(link) ? (
                          <a href={link} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border transition-all shrink-0 opacity-80 group-hover:opacity-100"
                            style={{ color: cfg.accent, borderColor: cfg.accent + '40', backgroundColor: cfg.accent + '10' }}>
                            <ExternalLink className="w-3.5 h-3.5" /> Join
                          </a>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setViewer({
                              url: link,
                              title: item.title || TAB_CONFIG[contentTab].label,
                              filePath: item.filePath,
                            })}
                            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border transition-all shrink-0 opacity-80 group-hover:opacity-100"
                            style={{ color: cfg.accent, borderColor: cfg.accent + '40', backgroundColor: cfg.accent + '10' }}
                          >
                            <Eye className="w-3.5 h-3.5" /> View
                          </button>
                        )
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* In-LMS document / media viewer */}
      <InAppDocumentViewer
        open={!!viewer}
        url={viewer?.url ?? null}
        title={viewer?.title}
        filePath={viewer?.filePath}
        onClose={() => {
          setViewer(null);
          setIsPdfFullScreen(false);
        }}
        sidePanel={
          viewer && !isYoutubeUrl(viewer.url) ? (
            isPdfFullScreen ? undefined : (
              <div className="relative h-full flex flex-col">
                <button
                  type="button"
                  onClick={() => setIsPdfFullScreen(true)}
                  className="absolute top-3 right-3 z-10 p-2 bg-white rounded-xl shadow border border-slate-200 text-slate-600 hover:text-blue-600"
                  title="Hide assistant"
                >
                  <Maximize className="w-4 h-4" />
                </button>
                <ChatbotWidget inline={true} moduleIdProp={moduleId} />
              </div>
            )
          ) : undefined
        }
      />
      {viewer && !isYoutubeUrl(viewer.url) && isPdfFullScreen && (
        <button
          type="button"
          onClick={() => setIsPdfFullScreen(false)}
          className="fixed bottom-6 right-6 z-[90] lms-press flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl shadow-lg"
        >
          <Bot className="w-4 h-4" /> AI Assistant
        </button>
      )}

    </div>
  );
}

// ── Recording Player Component ────────────────────────────────────────────────
function RecordingPlayer({ recording, color }: { recording: RecordingData | null; color: string }) {
  if (!recording) {
    return (
      <div className="flex flex-col items-center justify-center py-10 gap-3">
        <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center">
          <Video className="w-7 h-7 text-slate-400" />
        </div>
        <p className="text-slate-500 text-sm font-medium text-center max-w-xs">
          No recording available for this session yet.
        </p>
      </div>
    );
  }

  if (recording.status === 'PROCESSING' || recording.status === 'PENDING') {
    return (
      <div className="flex flex-col items-center justify-center py-10 gap-3">
        <div className="w-14 h-14 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
          <Video className="w-7 h-7 text-purple-400 animate-pulse" />
        </div>
        <p className="text-slate-900 font-semibold text-sm">Recording is being processed</p>
        <p className="text-slate-500 text-xs text-center max-w-xs">
          Your class recording is being encoded. It will be available shortly.
        </p>
      </div>
    );
  }

  if (recording.status === 'FAILED') {
    return (
      <div className="flex flex-col items-center justify-center py-10 gap-3">
        <AlertCircle className="w-10 h-10 text-red-500" />
        <p className="text-slate-500 text-sm">Recording processing failed. Contact your trainer.</p>
      </div>
    );
  }

  // Check availability
  const now = new Date();
  const availableFrom = recording.availableFrom ? new Date(recording.availableFrom) : null;
  const isAvailable = !availableFrom || now >= availableFrom;

  if (!isAvailable) {
    const hoursLeft = availableFrom
      ? Math.ceil((availableFrom.getTime() - now.getTime()) / 3600000)
      : 0;
    return (
      <div className="flex flex-col items-center justify-center py-10 gap-3">
        <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
          <Clock className="w-7 h-7 text-amber-400" />
        </div>
        <p className="text-slate-900 font-semibold text-sm">Recording not available yet</p>
        <p className="text-slate-500 text-xs text-center max-w-xs">
          Available in ~{hoursLeft}h · {availableFrom?.toLocaleString('en-IN', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })}
        </p>
      </div>
    );
  }

  // Ready + available — embed via youtube-nocookie (stay inside LMS)
  const embedUrl = youtubeEmbedUrl(recording.youtubeUrl);

  if (!embedUrl) {
    return (
      <div className="flex flex-col items-center justify-center py-10 gap-3">
        <AlertCircle className="w-10 h-10 text-amber-500" />
        <p className="text-slate-500 text-sm">Invalid recording URL. Contact your trainer.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-xl overflow-hidden border border-purple-500/20 bg-black"
        style={{ boxShadow: `0 4px 32px ${color}20` }}>
        <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
          <iframe
            src={embedUrl}
            loading="lazy"
            className="absolute inset-0 w-full h-full"
            style={{ border: 'none' }}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
          {/* Block YouTube title / logo chrome without blocking play controls */}
          <div className="absolute inset-x-0 top-0 h-10 pointer-events-auto z-10" />
          <div className="absolute bottom-0 right-0 w-28 h-10 pointer-events-auto z-10" />
        </div>
      </div>
      <div className="flex items-center justify-between px-1">
        <p className="text-sm font-semibold text-slate-900">{recording.title}</p>
        <p className="text-[10px] text-slate-400">Plays inside LMS</p>
      </div>
      <div className="flex items-center gap-3 text-xs text-slate-500 px-1">
          {recording.durationSec && (
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {Math.floor(recording.durationSec / 60)}m {recording.durationSec % 60}s
            </span>
          )}
          {recording.recordedDate && (
            <span className="flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {new Date(recording.recordedDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
          )}
      </div>
    </div>
  );
}

// ── Feedback Modal ────────────────────────────────────────────────────────────
// Unused mock interview feedback modal removed.
