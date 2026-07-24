import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  LayoutDashboard, BookOpen, ClipboardList, FileText,
  Calendar, Star, DollarSign, Award, ExternalLink,
  GitFork, GitPullRequest, CheckCircle2, Clock, AlertCircle,
  PlayCircle, Globe, Monitor, Download, Briefcase,
  Code2, Activity, ChevronDown, Plus, X, Send,
  Shield, Zap, TrendingUp,
} from 'lucide-react';
import { toast } from 'sonner';
import api from '../../../lib/axios';
import { Skeleton } from '../../components/ui/skeleton';
import { DashStatCard } from '../../components/ui/DashStatCard';
import { AnimatedNumber } from '../../components/ui/AnimatedNumber';
import { useInAppViewer } from '../../components/ui/InAppDocumentViewer';

// ─── Types ────────────────────────────────────────────────────────────────────

type RefType = 'pdf' | 'video' | 'website' | 'ppt';
type TaskPipeline = 'NOT_STARTED' | 'FORKED' | 'CODING' | 'SUBMITTED' | 'AI_GRADED';
type ArtifactType = 'Python' | 'SQL' | 'HTML/CSS' | 'JavaScript' | 'Node.js' | 'React' | 'Other';

interface InternProfile {
  name: string; email: string; githubUsername: string | null;
  internshipTitle: string; company: string;
  mentor: string; batch: string;
  startDate: string; endDate: string;
  progress: number; stipendPerMonth: number;
  programId: string;
}

interface RefItem {
  type: RefType; url: string; label: string;
}

interface InternRef {
  id: string; refNo: number; title: string;
  items: RefItem[];
  description: string;
}

interface AIBreak { label: string; score: number; max: number; }

interface InternTask {
  id: string; sprintNo: number; title: string; description: string;
  artifactType: ArtifactType;
  projectPdfUrl: string; projectPdfName: string;
  templateRepoUrl: string; dueDate: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  linkedRefIds: string[];
  status: TaskPipeline;
  forkUrl: string; prUrl: string;
  commitCount: number; lastPushAt: string;
  aiScore: number | null;
  aiBreakdown: AIBreak[];
  aiFeedback: string;
}

interface WorkLog {
  id: string; date: string; hoursWorked: number;
  workDone: string; challenges: string;
  mentorComment: string; status: 'PENDING' | 'APPROVED' | 'REJECTED';
}

interface AttendanceDay { date: string; day: string; status: string; }

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  PRESENT: 'bg-emerald-100 text-emerald-700',
  ABSENT: 'bg-red-100 text-red-700',
  HALF_DAY: 'bg-amber-100 text-amber-700',
  LEAVE: 'bg-purple-100 text-purple-700',
  APPROVED: 'bg-emerald-100 text-emerald-700',
  PENDING: 'bg-amber-100 text-amber-700',
  REJECTED: 'bg-red-100 text-red-700',
  PAID: 'bg-emerald-100 text-emerald-700',
};

function SBadge({ s }: { s: string }) {
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${STATUS_COLORS[s] ?? 'bg-gray-100 text-gray-500'}`}>
      {s.replace(/_/g, ' ')}
    </span>
  );
}

const ARTIFACT_CLS: Record<string, string> = {
  Python: 'bg-blue-100 text-blue-700 border-blue-200',
  SQL: 'bg-orange-100 text-orange-700 border-orange-200',
  'HTML/CSS': 'bg-red-100 text-red-700 border-red-200',
  JavaScript: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  'Node.js': 'bg-green-100 text-green-700 border-green-200',
  React: 'bg-cyan-100 text-cyan-700 border-cyan-200',
  Other: 'bg-gray-100 text-gray-600 border-gray-200',
};

function ATag({ type }: { type: ArtifactType }) {
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${ARTIFACT_CLS[type] ?? ARTIFACT_CLS['Other']}`}>
      {type}
    </span>
  );
}

function StarRating({ score }: { score: number | string | null }) {
  if (score == null) return null;
  const s = typeof score === 'string' ? parseFloat(score) : score;
  if (isNaN(s)) return null;
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <Star key={i} className={`w-4 h-4 ${i <= Math.floor(s) ? 'text-amber-400 fill-amber-400' : i - 0.5 <= s ? 'text-amber-300 fill-amber-200' : 'text-gray-200 fill-gray-100'}`} />
      ))}
      <span className="ml-1.5 text-sm font-bold text-gray-800">{s.toFixed(1)}</span>
      <span className="text-xs text-gray-400">/5</span>
    </div>
  );
}

const INPUT_CLS = 'w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400';

// ─── Nav Config ───────────────────────────────────────────────────────────────

const SECTIONS = [
  { key: 'dashboard',   label: 'My Dashboard', icon: LayoutDashboard },
  { key: 'references',  label: 'References',   icon: BookOpen },
  { key: 'tasks',       label: 'My Tasks',     icon: ClipboardList },
  { key: 'worklogs',    label: 'Work Logs',    icon: FileText },
  { key: 'attendance',  label: 'Attendance',   icon: Calendar },
  { key: 'evaluation',  label: 'Evaluation',   icon: Star },
  { key: 'stipend',     label: 'Stipend',      icon: DollarSign },
  { key: 'certificate', label: 'Certificate',  icon: Award },
] as const;

type SectionKey = typeof SECTIONS[number]['key'];

// ─── Dashboard ────────────────────────────────────────────────────────────────

function DashboardSection({ profile, tasks, logs, attendance }: {
  profile: InternProfile;
  tasks: InternTask[];
  logs: WorkLog[];
  attendance: AttendanceDay[];
}) {
  const completedTasks = tasks.filter(t => t.status === 'AI_GRADED').length;
  const activeTasks = tasks.filter(t => t.status !== 'AI_GRADED').length;
  const scoredTasks = tasks.filter(t => t.aiScore != null);
  const avgAI = scoredTasks.length
    ? +(scoredTasks.reduce((a, t) => a + Number(t.aiScore ?? 0), 0) / scoredTasks.length).toFixed(1)
    : 0;
  const presentDays = attendance.filter(a => a.status === 'PRESENT').length;
  const halfDays    = attendance.filter(a => a.status === 'HALF_DAY').length;
  const attPct = attendance.length ? Math.round(((presentDays + halfDays * 0.5) / attendance.length) * 100) : 0;

  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-blue-600 via-blue-700 to-blue-900 p-5 sm:p-7 text-white">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(255,255,255,0.12)_0%,_transparent_70%)]" />
        <div className="relative">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-blue-100/90 mb-2">Internship</p>
          <h2 className="text-2xl font-bold leading-tight">{profile.name}</h2>
          <p className="text-sm font-medium text-blue-50 mt-1">{profile.internshipTitle}</p>
          <p className="text-xs text-blue-100/90 mt-1">
            {profile.company} · Mentor: {profile.mentor}
          </p>
          <div className="mt-5">
            <div className="flex justify-between text-xs mb-2">
              <span className="font-medium text-blue-100">Overall progress</span>
              <span className="font-bold tabular-nums"><AnimatedNumber value={profile.progress} suffix="%" /></span>
            </div>
            <div className="h-2 bg-white/20 rounded-full overflow-hidden">
              <div className="h-full bg-white rounded-full transition-all duration-500" style={{ width: `${profile.progress}%` }} />
            </div>
            <div className="flex justify-between text-[10px] text-blue-200/90 mt-2">
              <span>{profile.startDate}</span>
              <span>{profile.endDate}</span>
            </div>
          </div>
        </div>
      </div>

      <div>
        <div className="mb-3 px-0.5">
          <h3 className="text-sm font-semibold text-slate-900">At a glance</h3>
          <p className="text-xs text-slate-500 mt-0.5">Your internship activity summary</p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 lms-stagger">
          <DashStatCard
            label="Tasks done"
            hint="Completed and AI-graded"
            value={<AnimatedNumber value={completedTasks} />}
            footer={`of ${tasks.length} total tasks`}
            icon={CheckCircle2}
            iconClass="text-emerald-600"
            accent="emerald"
          />
          <DashStatCard
            label="In progress"
            hint="Tasks still open or under review"
            value={<AnimatedNumber value={activeTasks} />}
            footer="Fork, code, or submit PR"
            icon={Clock}
            iconClass="text-amber-600"
            accent="orange"
          />
          <DashStatCard
            label="AI rating"
            hint="Average score across graded tasks"
            value={avgAI > 0 ? `${avgAI}★` : '—'}
            footer={`Based on ${scoredTasks.length} graded task${scoredTasks.length !== 1 ? 's' : ''}`}
            icon={Star}
            iconClass="text-purple-500"
            accent="purple"
          />
          <DashStatCard
            label="Attendance"
            hint="Days marked present"
            value={<AnimatedNumber value={attPct} suffix="%" />}
            footer={`${presentDays} of ${attendance.length} days present`}
            icon={Activity}
            iconClass="text-blue-500"
            accent="blue"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5 lms-card">
          <p className="text-sm font-semibold text-slate-900 mb-1">Internship details</p>
          <p className="text-xs text-slate-500 mb-4">Your placement and stipend information</p>
          {[
            { label: 'Company',  value: profile.company },
            { label: 'Mentor',   value: profile.mentor },
            { label: 'Batch',    value: profile.batch },
            { label: 'Period',   value: `${profile.startDate} → ${profile.endDate}` },
            { label: 'Stipend',  value: `₹${profile.stipendPerMonth.toLocaleString()}/month` },
          ].map(d => (
            <div key={d.label} className="flex justify-between py-1.5 border-b border-gray-50 last:border-0">
              <span className="text-xs text-gray-500">{d.label}</span>
              <span className="text-xs font-semibold text-gray-800 text-right max-w-[60%]">{d.value}</span>
            </div>
          ))}
          <div className="flex justify-between py-1.5 mt-1 rounded-lg bg-gray-50 px-2">
            <span className="text-xs text-gray-500 flex items-center gap-1">
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.87 8.17 6.84 9.5.5.08.66-.23.66-.5v-1.69c-2.77.6-3.36-1.34-3.36-1.34-.46-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.87 1.52 2.34 1.07 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.92 0-1.11.38-2 1.03-2.71-.1-.25-.45-1.29.1-2.64 0 0 .84-.27 2.75 1.02.79-.22 1.65-.33 2.5-.33.85 0 1.71.11 2.5.33 1.91-1.29 2.75-1.02 2.75-1.02.55 1.35.2 2.39.1 2.64.65.71 1.03 1.6 1.03 2.71 0 3.82-2.34 4.66-4.57 4.91.36.31.69.92.69 1.85V21c0 .27.16.59.67.5C19.14 20.16 22 16.42 22 12A10 10 0 0 0 12 2z"/></svg>
              GitHub Auto-Eval
            </span>
            {profile.githubUsername ? (
              <span className="text-xs font-semibold text-emerald-600 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                @{profile.githubUsername}
              </span>
            ) : (
              <span className="text-xs text-red-500 font-semibold">Not linked — contact admin</span>
            )}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5 lms-card">
          <p className="text-sm font-semibold text-slate-900 mb-1">Upcoming deadlines</p>
          <p className="text-xs text-slate-500 mb-4">Tasks due soon — open My Tasks for full list</p>
          <div className="space-y-2">
            {tasks.filter(t => t.status !== 'AI_GRADED').slice(0, 3).map(t => (
              <div key={t.id} className="flex items-center justify-between p-2.5 bg-gray-50 rounded-xl">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-gray-800 truncate">{t.title}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <ATag type={t.artifactType} />
                    <span className="text-[10px] text-gray-400">Sprint {t.sprintNo}</span>
                  </div>
                </div>
                <div className="text-right shrink-0 ml-2">
                  <p className="text-[10px] font-bold text-amber-600">{t.dueDate}</p>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold ${t.priority === 'HIGH' ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-600'}`}>{t.priority}</span>
                </div>
              </div>
            ))}
            {tasks.filter(t => t.status !== 'AI_GRADED').length === 0 && (
              <p className="text-xs text-gray-400 text-center py-4">All tasks completed! 🎉</p>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5 lms-card">
        <p className="text-sm font-semibold text-slate-900 mb-1">Recent work logs</p>
        <p className="text-xs text-slate-500 mb-4">Latest daily updates submitted for mentor review</p>
        <div className="space-y-2">
          {logs.slice(0, 3).map(l => (
            <div key={l.id} className="flex items-start gap-3 p-3 bg-gray-50 rounded-xl">
              <div className="w-7 h-7 rounded-lg bg-blue-100 flex items-center justify-center shrink-0 mt-0.5">
                <FileText className="w-3.5 h-3.5 text-blue-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 mb-0.5">
                  <span className="text-xs font-semibold text-gray-800">{l.date}</span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-[10px] text-gray-400">{l.hoursWorked}h</span>
                    <SBadge s={l.status} />
                  </div>
                </div>
                <p className="text-[11px] text-gray-500 truncate">{l.workDone}</p>
              </div>
            </div>
          ))}
          {logs.length === 0 && (
            <p className="text-xs text-gray-400 text-center py-4">No work logs yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── References ───────────────────────────────────────────────────────────────

const REF_ITEM_META: Record<RefType, { icon: JSX.Element; color: string; gradient: string; label: string; action: string }> = {
  pdf:     { icon: <FileText className="w-4 h-4" />,   color: 'text-red-700',    gradient: 'from-red-500 to-rose-500',      label: 'PDF',     action: 'Open PDF' },
  video:   { icon: <PlayCircle className="w-4 h-4" />, color: 'text-purple-700', gradient: 'from-purple-500 to-violet-500', label: 'Video',   action: 'Watch Video' },
  website: { icon: <Globe className="w-4 h-4" />,      color: 'text-blue-700',   gradient: 'from-blue-500 to-cyan-500',     label: 'Website', action: 'Open Website' },
  ppt:     { icon: <Monitor className="w-4 h-4" />,    color: 'text-amber-700',  gradient: 'from-amber-500 to-orange-500',  label: 'PPT',     action: 'Open PPT' },
};

const TYPE_CHIP_CLS: Record<RefType, string> = {
  pdf:     'bg-red-100 text-red-700 border-red-200',
  video:   'bg-purple-100 text-purple-700 border-purple-200',
  website: 'bg-blue-100 text-blue-700 border-blue-200',
  ppt:     'bg-amber-100 text-amber-700 border-amber-200',
};

function ReferencesSection({ refs }: { refs: InternRef[] }) {
  const [activeRef, setActiveRef] = useState<InternRef | null>(null);
  const { open: openDoc, viewer: docViewer } = useInAppViewer();

  if (activeRef) {
    return (
      <div className="space-y-4">
        {docViewer}
        {/* Back header */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setActiveRef(null)}
            className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-xl transition-colors">
            ← Back to References
          </button>
        </div>

        {/* Ref group header */}
        <div className="bg-gradient-to-br from-blue-600 to-cyan-500 rounded-2xl p-5 text-white">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] font-bold bg-white/20 px-2 py-0.5 rounded-full">REF {activeRef.refNo}</span>
            <span className="text-[10px] font-semibold text-blue-100">{activeRef.items.length} resource{activeRef.items.length !== 1 ? 's' : ''}</span>
          </div>
          <h2 className="text-lg font-bold">{activeRef.title}</h2>
          {activeRef.description && <p className="text-sm text-blue-100 mt-1">{activeRef.description}</p>}
        </div>

        {/* Resource items */}
        <div className="space-y-3">
          {activeRef.items.map((item, i) => {
            const m = REF_ITEM_META[item.type];
            const isGithub = /github\.com/i.test(item.url);
            const openCls = `inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r ${m.gradient} shadow-sm hover:shadow-md transition-all`;
            return (
              <div key={i} className="bg-white rounded-2xl border border-slate-200/80 shadow-sm lms-card p-4">
                <div className="flex items-start gap-3">
                  <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${m.gradient} flex items-center justify-center text-white shrink-0`}>
                    {m.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${TYPE_CHIP_CLS[item.type]}`}>{item.type.toUpperCase()}</span>
                    </div>
                    <p className="text-sm font-bold text-gray-900">{item.label}</p>
                    <p className="text-xs text-gray-400 mt-0.5 truncate">{item.url}</p>
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t border-gray-50">
                  {isGithub ? (
                    <a href={item.url} target="_blank" rel="noopener noreferrer" className={openCls}>
                      <ExternalLink className="w-3.5 h-3.5" />
                      {m.action}
                    </a>
                  ) : (
                    <button
                      type="button"
                      onClick={() => openDoc({ url: item.url, title: item.label })}
                      className={openCls}
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      {m.action}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {docViewer}
      <div>
        <h2 className="text-base font-bold text-gray-900">Study References</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          {refs.length} reference groups assigned — click any group to view resources
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {refs.map(ref => (
          <button
            key={ref.id}
            onClick={() => setActiveRef(ref)}
            className="bg-white rounded-2xl border border-slate-200/80 shadow-sm lms-card p-4 hover:shadow-md hover:border-blue-200 transition-all text-left w-full">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] font-bold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">REF {ref.refNo}</span>
              <span className="text-[10px] text-gray-400">{ref.items.length} resource{ref.items.length !== 1 ? 's' : ''}</span>
            </div>
            <p className="text-sm font-bold text-gray-900 mb-1">{ref.title}</p>
            {ref.description && <p className="text-xs text-gray-500 mb-3 line-clamp-2">{ref.description}</p>}

            {/* Type chips showing what's included */}
            <div className="flex flex-wrap gap-1.5 mb-3">
              {ref.items.map((item, i) => (
                <span key={i} className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${TYPE_CHIP_CLS[item.type]}`}>
                  {item.type.toUpperCase()}
                </span>
              ))}
            </div>

            <div className="flex items-center gap-1 text-xs font-semibold text-blue-600">
              <ExternalLink className="w-3 h-3" /> View Resources →
            </div>
          </button>
        ))}
        {refs.length === 0 && (
          <div className="col-span-2 text-center py-12 text-gray-400">
            <BookOpen className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No references assigned yet</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Tasks ────────────────────────────────────────────────────────────────────

const PIPE_STEPS: { key: TaskPipeline; label: string }[] = [
  { key: 'NOT_STARTED', label: '① Fork Repo' },
  { key: 'FORKED',      label: '② Detecting…' },
  { key: 'CODING',      label: '③ Push & Auto-Eval' },
  { key: 'SUBMITTED',   label: '④ AI Review' },
  { key: 'AI_GRADED',   label: '⑤ Graded' },
];

const PIPE_IDX: Record<TaskPipeline, number> = {
  NOT_STARTED: 0, FORKED: 1, CODING: 2, SUBMITTED: 3, AI_GRADED: 4,
};

function TasksSection({ refs, profile }: { refs: InternRef[]; profile: InternProfile }) {
  const qc = useQueryClient();
  const { open: openDoc, viewer: docViewer } = useInAppViewer();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showInstructions, setShowInstructions] = useState(true);
  const [detectingFork, setDetectingFork] = useState<Record<string, boolean>>({});
  // reason why detection is stuck: 'no_github_username' | 'no_template_url' | 'github_api_error' | null
  const [detectReason, setDetectReason] = useState<Record<string, string | null>>({});
  // manual fallback: show URL input after 15s of failed detection
  const [showManualInput, setShowManualInput] = useState<Record<string, boolean>>({});
  const [manualForkInputs, setManualForkInputs] = useState<Record<string, string>>({});
  const [prInputs, setPrInputs] = useState<Record<string, string>>({});

  const { data: tasks = [], isLoading } = useQuery<InternTask[]>({
    queryKey: ['intern-tasks'],
    queryFn: async () => (await api.get('/intern/tasks')).data.data,
    refetchInterval: (query) => {
      if (query.state.status === 'error') return false;
      const data = query.state.data as InternTask[] | undefined;
      const hasActive = data?.some(t => t.status === 'SUBMITTED' || t.status === 'CODING' || t.status === 'FORKED');
      return hasActive ? 4000 : false;
    },
  });

  const confirmForkMut = useMutation({
    mutationFn: async ({ taskId, forkUrl }: { taskId: string; forkUrl: string }) =>
      api.post(`/intern/tasks/${taskId}/confirm-fork`, { forkUrl }),
    onSuccess: (_, { taskId }) => {
      setDetectingFork(p => ({ ...p, [taskId]: false }));
      toast.success('Fork detected! Start coding — AI evaluates every push automatically.');
      qc.invalidateQueries({ queryKey: ['intern-tasks'] });
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to confirm fork'),
  });

  // Called when student clicks "Fork on GitHub" — marks as FORKED and starts auto-detection
  const forkMut = useMutation({
    mutationFn: async (taskId: string) => api.post(`/intern/tasks/${taskId}/fork`),
    onSuccess: (_, taskId) => {
      setDetectingFork(p => ({ ...p, [taskId]: true }));
      qc.invalidateQueries({ queryKey: ['intern-tasks'] });
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to record fork'),
  });

  // When tasks load, auto-start detection for any task already in FORKED state
  useEffect(() => {
    const forkedTasks = tasks.filter(t => t.status === 'FORKED');
    if (forkedTasks.length === 0) return;
    setDetectingFork(prev => {
      const next = { ...prev };
      forkedTasks.forEach(t => { if (!next[t.id]) next[t.id] = true; });
      return next;
    });
  }, [tasks.map(t => t.id + t.status).join(',')]);

  // Poll detect-fork endpoint while detectingFork[taskId] = true
  // Use a ref to avoid stale closure over confirmForkMut while keeping
  // the effect re-creation driven only by detectingFork changes.
  const confirmForkRef = useRef(confirmForkMut.mutate);
  confirmForkRef.current = confirmForkMut.mutate;

  useEffect(() => {
    const activeTaskIds = Object.entries(detectingFork)
      .filter(([, v]) => v)
      .map(([k]) => k);
    if (activeTaskIds.length === 0) return;

    // Show manual fallback after 15 seconds
    const fallbackTimers: ReturnType<typeof setTimeout>[] = activeTaskIds.map(taskId =>
      setTimeout(() => {
        setShowManualInput(p => ({ ...p, [taskId]: true }));
      }, 15000)
    );

    const interval = setInterval(async () => {
      for (const taskId of activeTaskIds) {
        try {
          const res = await api.get(`/intern/tasks/${taskId}/detect-fork`);
          const { found, forkUrl, reason } = res.data?.data ?? {};
          if (found && forkUrl) {
            clearInterval(interval);
            fallbackTimers.forEach(clearTimeout);
            confirmForkRef.current({ taskId, forkUrl });
          } else if (reason) {
            setDetectReason(p => ({ ...p, [taskId]: reason }));
            // If no github_username or no template url — show manual immediately
            if (reason === 'no_github_username' || reason === 'no_template_url') {
              setShowManualInput(p => ({ ...p, [taskId]: true }));
            }
          }
        } catch { /* ignore transient errors */ }
      }
    }, 3000);

    return () => {
      clearInterval(interval);
      fallbackTimers.forEach(clearTimeout);
    };
  }, [detectingFork]);

  const submitPRMut = useMutation({
    mutationFn: async ({ taskId, prUrl }: { taskId: string; prUrl: string }) =>
      (await api.post(`/intern/tasks/${taskId}/submit-pr`, { prUrl })).data.data,
    onSuccess: (_, { taskId }) => {
      setPrInputs(p => ({ ...p, [taskId]: '' }));
      toast.success('PR submitted! AI is reviewing your code — results appear shortly.');
      qc.invalidateQueries({ queryKey: ['intern-tasks'] });
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to submit PR'),
  });

  if (isLoading) return <Skeleton className="h-64 rounded-2xl" />;

  const completedCount = tasks.filter(t => t.status === 'AI_GRADED').length;

  return (
    <div className="space-y-5">
      {docViewer}
      {/* Student Instruction Panel */}
      <div className="bg-gradient-to-r from-blue-500/10 via-indigo-500/10 to-purple-500/10 border border-blue-100 rounded-2xl p-5 shadow-sm">
        <div className="flex items-center justify-between cursor-pointer select-none" onClick={() => setShowInstructions(!showInstructions)}>
          <div className="flex items-center gap-2.5">
            <Zap className="w-5 h-5 text-indigo-600 animate-pulse" />
            <div>
              <h3 className="text-sm font-bold text-gray-900">How to Complete &amp; Submit Tasks</h3>
              <p className="text-xs text-gray-500 mt-0.5">Follow these 6 steps to fork, clone, write code, push, and get graded automatically.</p>
            </div>
          </div>
          <button className="text-xs text-indigo-600 font-semibold hover:underline flex items-center gap-1">
            {showInstructions ? 'Hide Guide' : 'Show Guide'}
            <ChevronDown className={`w-4 h-4 transition-transform ${showInstructions ? 'rotate-180' : ''}`} />
          </button>
        </div>

        {showInstructions && (
          <div className="mt-5 border-t border-slate-100 pt-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white rounded-xl p-3.5 border border-slate-200/80 shadow-sm lms-card relative">
                <div className="absolute top-3 right-3 text-[10px] font-bold text-gray-300">STEP 1</div>
                <h4 className="text-xs font-bold text-gray-900 flex items-center gap-1.5"><GitFork className="w-3.5 h-3.5 text-blue-500" /> 1. Fork Repository</h4>
                <p className="text-[11px] text-gray-500 mt-1 leading-relaxed">
                  Accept the template repo invitation in your email (if private). Open a task below and click <strong>"Fork Template Repo on GitHub"</strong>. Create the fork in your personal GitHub account.
                </p>
              </div>

              <div className="bg-white rounded-xl p-3.5 border border-slate-200/80 shadow-sm lms-card relative">
                <div className="absolute top-3 right-3 text-[10px] font-bold text-gray-300">STEP 2</div>
                <h4 className="text-xs font-bold text-gray-900 flex items-center gap-1.5"><Clock className="w-3.5 h-3.5 text-amber-500" /> 2. Auto-Detection</h4>
                <p className="text-[11px] text-gray-500 mt-1 leading-relaxed">
                  Return to this portal. The system automatically detects your new fork and transitions the task status to <strong>"Push &amp; Auto-Eval" (Coding)</strong>.
                </p>
              </div>

              <div className="bg-white rounded-xl p-3.5 border border-slate-200/80 shadow-sm lms-card relative">
                <div className="absolute top-3 right-3 text-[10px] font-bold text-gray-300">STEP 3</div>
                <h4 className="text-xs font-bold text-gray-900 flex items-center gap-1.5"><Code2 className="w-3.5 h-3.5 text-purple-500" /> 3. Clone Locally</h4>
                <p className="text-[11px] text-gray-500 mt-1 leading-relaxed">
                  Copy your fork's URL from GitHub and clone it locally using your terminal:
                  <code className="block bg-slate-50 border border-slate-100 p-1.5 rounded text-[10px] font-mono mt-1.5 text-gray-600">
                    git clone &lt;your-fork-url&gt;<br />
                    cd &lt;repo-name&gt;
                  </code>
                </p>
              </div>

              <div className="bg-white rounded-xl p-3.5 border border-slate-200/80 shadow-sm lms-card relative">
                <div className="absolute top-3 right-3 text-[10px] font-bold text-gray-300">STEP 4</div>
                <h4 className="text-xs font-bold text-gray-900 flex items-center gap-1.5"><Activity className="w-3.5 h-3.5 text-emerald-500" /> 4. Write Code &amp; Push</h4>
                <p className="text-[11px] text-gray-500 mt-1 leading-relaxed">
                  Write the required code locally. When ready, commit and push your changes to your fork:
                  <code className="block bg-slate-50 border border-slate-100 p-1.5 rounded text-[10px] font-mono mt-1.5 text-gray-600">
                    git add .<br />
                    git commit -m "Complete task"<br />
                    git push origin main
                  </code>
                </p>
              </div>

              <div className="bg-white rounded-xl p-3.5 border border-slate-200/80 shadow-sm lms-card relative">
                <div className="absolute top-3 right-3 text-[10px] font-bold text-gray-300">STEP 5</div>
                <h4 className="text-xs font-bold text-gray-900 flex items-center gap-1.5"><Award className="w-3.5 h-3.5 text-cyan-500" /> 5. Auto Attendance</h4>
                <p className="text-[11px] text-gray-500 mt-1 leading-relaxed">
                  Upon pushing, GitHub sends a webhook event. The LMS automatically marks your attendance for today as <strong>"PRESENT"</strong> with notes <em>"Auto-marked via GitHub push"</em>.
                </p>
              </div>

              <div className="bg-white rounded-xl p-3.5 border border-slate-200/80 shadow-sm lms-card relative">
                <div className="absolute top-3 right-3 text-[10px] font-bold text-gray-300">STEP 6</div>
                <h4 className="text-xs font-bold text-gray-900 flex items-center gap-1.5"><Star className="w-3.5 h-3.5 text-amber-500 fill-amber-400" /> 6. Instant AI Grading</h4>
                <p className="text-[11px] text-gray-500 mt-1 leading-relaxed">
                  The AI Agent automatically evaluates your code, updates the push commit count, issues a score /5, and provides detailed feedback directly on this portal within seconds!
                </p>
              </div>
            </div>
            
            <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-3.5 text-xs text-indigo-800 flex items-start gap-2">
              <Shield className="w-4 h-4 mt-0.5 shrink-0" />
              <div>
                <p className="font-bold">⚠️ CRITICAL REQUIREMENT:</p>
                <p className="mt-0.5 leading-relaxed">
                  Your LMS GitHub username must <strong>exactly match</strong> the GitHub login you use to fork and push — it does <strong>not</strong> need to match your real name or email.
                  Currently registered: <strong className="underline">{profile.githubUsername ? `@${profile.githubUsername}` : 'NOT REGISTERED'}</strong>.
                  Set or fix it on <strong>My Profile</strong>. Contact L&amp;D only for email/phone login issues.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* GitHub Username Alert Warning */}
      {!profile.githubUsername && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-start gap-3 text-red-800">
          <AlertCircle className="w-5 h-5 mt-0.5 text-red-500 shrink-0" />
          <div>
            <p className="font-bold text-sm">GitHub Username Not Registered</p>
            <p className="text-xs mt-0.5 leading-relaxed font-medium">
              Add your GitHub login on{' '}
              <a href="/my-profile" className="underline font-semibold">My Profile</a>
              {' '}so the LMS can detect forks and grade pushes.
              It must be unique (one learner per username) and need not match your real name or email.
            </p>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex-1">
          <h2 className="text-base font-bold text-gray-900">My Tasks</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {completedCount}/{tasks.length} tasks completed · Push code to your fork — AI evaluates automatically on every push
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {([['NOT_STARTED', 'Not Started', 'bg-gray-100 text-gray-600'], ['CODING', 'In Progress', 'bg-amber-100 text-amber-700'], ['SUBMITTED', 'Under Review', 'bg-purple-100 text-purple-700'], ['AI_GRADED', 'Graded', 'bg-emerald-100 text-emerald-700']] as const).map(([s, label, cls]) => {
            const cnt = tasks.filter(t => t.status === s || (s === 'CODING' && t.status === 'FORKED')).length;
            return <span key={s} className={`text-[10px] font-bold px-2 py-1 rounded-lg ${cls}`}>{cnt} {label}</span>;
          })}
        </div>
      </div>

      <div className="space-y-3">
        {tasks.map(task => {
          const isOpen = expanded === task.id;
          const pipeIdx = PIPE_IDX[task.status];
          const linkedRefs = refs.filter(r => (task.linkedRefIds ?? []).includes(r.id));
          const isSubmitting = submitPRMut.isPending && submitPRMut.variables?.taskId === task.id;

          return (
            <div key={task.id} className={`bg-white rounded-2xl border shadow-sm transition-all ${isOpen ? 'border-blue-200 shadow-md' : 'border-gray-100 hover:border-gray-200'}`}>
              <button className="w-full flex items-center gap-3 p-4 text-left" onClick={() => setExpanded(isOpen ? null : task.id)}>
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${task.status === 'AI_GRADED' ? 'bg-emerald-100 text-emerald-700' : task.status === 'SUBMITTED' ? 'bg-purple-100 text-purple-700' : (task.status === 'CODING' || task.status === 'FORKED') ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'}`}>
                  {task.status === 'AI_GRADED' ? <CheckCircle2 className="w-5 h-5" /> : <span className="text-sm font-bold">S{task.sprintNo}</span>}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                    <span className="text-sm font-bold text-gray-900">{task.title}</span>
                    <ATag type={task.artifactType} />
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold ${task.priority === 'HIGH' ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-600'}`}>{task.priority}</span>
                  </div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-[10px] text-gray-400">Due: {task.dueDate}</span>
                    {task.aiScore !== null && <StarRating score={task.aiScore} />}
                    {task.status === 'SUBMITTED' && (
                      <span className="text-[10px] text-purple-600 font-semibold flex items-center gap-1"><Zap className="w-3 h-3 animate-pulse" />AI grading in progress...</span>
                    )}
                  </div>
                </div>
                <div className="hidden sm:flex items-center gap-1 shrink-0">
                  {PIPE_STEPS.map((s, i) => (
                    <div key={s.key} className={`w-2 h-2 rounded-full ${i < pipeIdx ? 'bg-emerald-400' : i === pipeIdx ? 'bg-blue-500' : 'bg-gray-200'}`} />
                  ))}
                </div>
                <ChevronDown className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
              </button>

              {isOpen && (
                <div className="border-t border-gray-100 p-5 space-y-5">
                  <p className="text-sm text-gray-600 leading-relaxed">{task.description}</p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="bg-red-50 border border-red-100 rounded-xl p-3">
                      <p className="text-[10px] font-bold text-red-600 uppercase tracking-wide mb-2 flex items-center gap-1">
                        <FileText className="w-3 h-3" /> Project Guide PDF
                      </p>
                      <p className="text-xs font-semibold text-gray-800 mb-1">{task.projectPdfName || 'Guide PDF'}</p>
                      <p className="text-[10px] text-gray-500 mb-3">Read this guide before starting. It explains requirements, expected output, and evaluation criteria.</p>
                      {task.projectPdfUrl ? (
                        <button
                          type="button"
                          onClick={() => openDoc({ url: task.projectPdfUrl, title: task.projectPdfName || 'Guide PDF' })}
                          className="flex items-center gap-1.5 text-xs font-semibold text-red-600 hover:text-red-700"
                        >
                          <Download className="w-3.5 h-3.5" /> Open PDF
                        </button>
                      ) : (
                        <span className="text-[10px] text-gray-400">PDF will be uploaded by admin</span>
                      )}
                    </div>

                    <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3">
                      <p className="text-[10px] font-bold text-indigo-600 uppercase tracking-wide mb-2 flex items-center gap-1">
                        <BookOpen className="w-3 h-3" /> Study First — References
                      </p>
                      <div className="space-y-1.5">
                        {linkedRefs.map(r => (
                          <div key={r.id} className="flex items-center gap-2">
                            <span className="text-[9px] font-bold bg-white border border-indigo-200 text-indigo-500 px-1.5 py-0.5 rounded-full whitespace-nowrap">REF {r.refNo}</span>
                            <span className="text-xs text-gray-700 truncate">{r.title}</span>
                          </div>
                        ))}
                        {linkedRefs.length === 0 && <span className="text-xs text-gray-400">No linked references</span>}
                      </div>
                    </div>
                  </div>

                  {/* Pipeline */}
                  <div>
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                      <GitPullRequest className="w-3.5 h-3.5 text-blue-500" /> GitHub Workflow Pipeline
                    </p>

                    <div className="flex items-center mb-5 overflow-x-auto pb-1 gap-0">
                      {PIPE_STEPS.map((step, i) => (
                        <div key={step.key} className="flex items-center">
                          <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[11px] font-bold whitespace-nowrap transition-all ${i < pipeIdx ? 'bg-emerald-100 text-emerald-700' : i === pipeIdx ? 'bg-blue-600 text-white shadow-sm' : 'bg-gray-100 text-gray-400'}`}>
                            {i < pipeIdx && <CheckCircle2 className="w-3 h-3" />}
                            {i === pipeIdx && <span className="w-2 h-2 rounded-full bg-white inline-block animate-pulse" />}
                            {step.label}
                          </div>
                          {i < PIPE_STEPS.length - 1 && (
                            <div className={`w-4 h-0.5 mx-0.5 ${i < pipeIdx ? 'bg-emerald-400' : 'bg-gray-200'}`} />
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Step 1: Fork — one click, auto-detection starts */}
                    {task.status === 'NOT_STARTED' && (
                      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 space-y-3">
                        <div>
                          <p className="text-sm font-bold text-gray-900 mb-1">Step 1: Fork the Template Repository</p>
                          <p className="text-xs text-gray-500">
                            Click the button below. GitHub opens — click <strong>Fork</strong> there.
                            Come back here — we'll detect your fork automatically. No URL pasting needed.
                          </p>
                        </div>
                        <div className="bg-white border border-gray-200 rounded-lg px-3 py-2 font-mono text-xs text-gray-600 flex items-center gap-2">
                          <GitFork className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                          <span className="truncate">{task.templateRepoUrl?.replace('https://', '') || 'Repository URL not set'}</span>
                        </div>
                        <button
                          onClick={() => {
                            if (!task.templateRepoUrl) {
                              toast.error('Template repository URL not set yet. Contact your admin.');
                              return;
                            }
                            window.open(task.templateRepoUrl, '_blank', 'noopener,noreferrer');
                            forkMut.mutate(task.id);
                          }}
                          disabled={forkMut.isPending || !task.templateRepoUrl}
                          className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-blue-600 to-cyan-600 text-white text-sm font-bold rounded-xl shadow-md hover:shadow-lg transition-all disabled:opacity-50">
                          <GitFork className="w-4 h-4" />
                          {forkMut.isPending ? 'Opening GitHub…' : 'Fork Template Repo on GitHub'}
                          <ExternalLink className="w-3.5 h-3.5 opacity-70" />
                        </button>
                      </div>
                    )}

                    {/* Step 2: Auto-detecting fork */}
                    {task.status === 'FORKED' && (() => {
                      const reason = detectReason[task.id];
                      const showManual = showManualInput[task.id];
                      return (
                        <div className="bg-amber-50 border border-amber-100 rounded-xl p-5 space-y-4">
                          {/* Status header */}
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-2xl bg-amber-100 flex items-center justify-center shrink-0">
                              <GitFork className={`w-6 h-6 text-amber-600 ${!showManual ? 'animate-pulse' : ''}`} />
                            </div>
                            <div className="flex-1">
                              {!showManual ? (
                                <>
                                  <p className="text-sm font-bold text-gray-900">Detecting your fork on GitHub…</p>
                                  <p className="text-xs text-gray-500 mt-0.5">Checking GitHub every 3 seconds automatically.</p>
                                  <div className="flex items-center gap-1.5 mt-2">
                                    {[0, 150, 300].map(d => (
                                      <div key={d} className="w-2 h-2 rounded-full bg-amber-400 animate-bounce" style={{ animationDelay: `${d}ms` }} />
                                    ))}
                                    <span className="text-[10px] text-amber-600 font-semibold ml-1">Scanning GitHub…</span>
                                  </div>
                                </>
                              ) : (
                                <>
                                  <p className="text-sm font-bold text-gray-900">Paste your fork URL manually</p>
                                  <p className="text-xs text-gray-500 mt-0.5">
                                    {reason === 'no_github_username' && '⚠️ Your GitHub username is not set — add it on My Profile.'}
                                    {reason === 'no_template_url' && '⚠️ Task has no template repo URL — ask admin to set it.'}
                                    {reason === 'github_api_error' && "GitHub API couldn't be reached. Paste your fork URL below."}
                                    {reason === 'github_token_invalid' && "Server GitHub token invalid. Paste your fork URL below — poller still works after confirm."}
                                    {(!reason || reason === 'fork_not_found_yet') && "Auto-detection timed out. Paste your fork URL below."}
                                  </p>
                                </>
                              )}
                            </div>
                          </div>

                          {/* Manual fallback input — shown after 15s or on blocking errors */}
                          {showManual && (
                            <div className="space-y-2">
                              <input
                                value={manualForkInputs[task.id] ?? ''}
                                onChange={e => setManualForkInputs(p => ({ ...p, [task.id]: e.target.value }))}
                                placeholder="https://github.com/lmsvtricks-max/amstrong-1"
                                className={INPUT_CLS + ' w-full'}
                                autoFocus
                              />
                              <button
                                onClick={() => confirmForkMut.mutate({ taskId: task.id, forkUrl: manualForkInputs[task.id] ?? '' })}
                                disabled={!(manualForkInputs[task.id] ?? '').trim() || confirmForkMut.isPending}
                                className="w-full py-2.5 bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold rounded-xl disabled:opacity-50 transition-colors">
                                {confirmForkMut.isPending ? 'Confirming…' : 'Confirm Fork →'}
                              </button>
                            </div>
                          )}

                          {/* Open on GitHub link */}
                          <div className="pt-1 border-t border-amber-100 flex items-center justify-between">
                            <a href={task.templateRepoUrl ?? '#'} target="_blank" rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:underline">
                              <ExternalLink className="w-3 h-3" /> Open template repo on GitHub
                            </a>
                            {!showManual && (
                              <button onClick={() => setShowManualInput(p => ({ ...p, [task.id]: true }))}
                                className="text-[10px] text-gray-400 hover:text-gray-600 underline">
                                Paste URL manually
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })()}

                    {/* Step 3: Code, push — auto AI evaluation */}
                    {task.status === 'CODING' && (
                      <div className="space-y-3">
                        {/* Auto-eval banner */}
                        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl p-4 text-white">
                          <div className="flex items-start gap-3">
                            <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
                              <Zap className="w-5 h-5 text-white" />
                            </div>
                            <div>
                              <p className="text-sm font-bold">Auto-Evaluation Active</p>
                              <p className="text-xs text-blue-100 mt-0.5 leading-relaxed">
                                Every time you <code className="bg-white/20 px-1 py-0.5 rounded text-[10px]">git push</code> to your fork,
                                our AI automatically fetches your latest code and generates a score. No manual submission needed.
                              </p>
                            </div>
                          </div>
                          {task.commitCount > 0 && (
                            <div className="flex items-center gap-2 mt-3 bg-white/10 rounded-lg px-3 py-2">
                              <Code2 className="w-3.5 h-3.5 text-blue-200 shrink-0" />
                              <span className="text-xs text-blue-100">
                                <strong className="text-white">{task.commitCount} push{task.commitCount !== 1 ? 'es' : ''} detected</strong>
                                {task.lastPushAt && <> · Last: {task.lastPushAt}</>}
                              </span>
                              {task.aiScore !== null && (
                                <span className="ml-auto text-xs font-bold text-emerald-300">
                                  Latest score: {task.aiScore}/5
                                </span>
                              )}
                            </div>
                          )}
                          {task.commitCount === 0 && (
                            <div className="mt-3 bg-white/10 rounded-lg px-3 py-2 text-xs text-blue-100">
                              Waiting for your first push… push some code and the AI will evaluate it instantly.
                            </div>
                          )}
                        </div>

                        {/* Fork URL chip */}
                        {task.forkUrl && (
                          <div className="flex items-center gap-2 bg-white rounded-xl px-3 py-2 border border-gray-200">
                            <GitFork className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                            <a href={task.forkUrl} target="_blank" rel="noopener noreferrer"
                              className="text-xs font-mono text-blue-600 hover:underline truncate flex-1">
                              {task.forkUrl.replace('https://', '')}
                            </a>
                            <ExternalLink className="w-3 h-3 text-gray-400 shrink-0" />
                          </div>
                        )}

                        {/* Optional PR for final graded submission */}
                        <details className="group">
                          <summary className="text-xs font-semibold text-gray-500 cursor-pointer select-none list-none flex items-center gap-1.5 hover:text-gray-700">
                            <GitPullRequest className="w-3.5 h-3.5" />
                            Optional: Submit a Pull Request for final grading
                            <ChevronDown className="w-3.5 h-3.5 group-open:rotate-180 transition-transform ml-auto" />
                          </summary>
                          <div className="mt-2 bg-gray-50 border border-gray-200 rounded-xl p-3 space-y-2">
                            <p className="text-xs text-gray-500">
                              Create a PR from your fork to the original repo and paste the URL here. This triggers a deep PR-diff grading pass (better than push-based grading).
                            </p>
                            <div className="flex gap-2">
                              <input
                                value={prInputs[task.id] ?? ''}
                                onChange={e => setPrInputs(p => ({ ...p, [task.id]: e.target.value }))}
                                placeholder="https://github.com/org/repo/pull/123"
                                className={INPUT_CLS + ' flex-1'}
                              />
                              <button
                                onClick={() => submitPRMut.mutate({ taskId: task.id, prUrl: prInputs[task.id] ?? '' })}
                                disabled={!(prInputs[task.id] ?? '').trim() || isSubmitting}
                                className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white text-sm font-bold rounded-xl disabled:opacity-50 shrink-0">
                                {isSubmitting ? <Zap className="w-3.5 h-3.5 animate-pulse" /> : <Send className="w-3.5 h-3.5" />}
                                {isSubmitting ? 'Grading...' : 'Submit PR'}
                              </button>
                            </div>
                          </div>
                        </details>
                      </div>
                    )}

                    {/* Step 4: AI reviewing */}
                    {(task.status === 'SUBMITTED' || isSubmitting) && (
                      <div className="bg-purple-50 border border-purple-100 rounded-xl p-5 text-center">
                        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-500 to-indigo-500 flex items-center justify-center mx-auto mb-3 shadow-md">
                          <Zap className="w-7 h-7 text-white animate-pulse" />
                        </div>
                        <p className="text-sm font-bold text-gray-900">AI is Reviewing Your Code</p>
                        <p className="text-xs text-gray-500 mt-1 max-w-xs mx-auto">
                          Our AI model is analysing your pull request — code quality, functionality, documentation, and test coverage.
                        </p>
                        <div className="mt-3 flex items-center justify-center gap-1.5">
                          {[0, 150, 300].map(d => (
                            <div key={d} className="w-2 h-2 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: `${d}ms` }} />
                          ))}
                        </div>
                        {task.prUrl && (
                          <a href={task.prUrl} target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 mt-3 text-xs text-purple-600 font-semibold hover:underline">
                            <ExternalLink className="w-3 h-3" /> View Pull Request
                          </a>
                        )}
                      </div>
                    )}

                    {/* Step 5: AI graded */}
                    {task.status === 'AI_GRADED' && !isSubmitting && (
                      <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-5">
                        <div className="flex items-start justify-between mb-4">
                          <div>
                            <p className="text-sm font-bold text-gray-900 flex items-center gap-2">
                              <CheckCircle2 className="w-4 h-4 text-emerald-500" /> AI Review Complete
                              {task.commitCount > 0 && !task.prUrl && (
                                <span className="text-[9px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full font-bold">Auto-evaluated on push</span>
                              )}
                            </p>
                            <p className="text-xs text-gray-500 mt-0.5">Sprint {task.sprintNo} · {task.artifactType}{task.commitCount > 0 && ` · ${task.commitCount} commits`}</p>
                          </div>
                          <div className="text-right">
                            {task.aiScore !== null && <StarRating score={task.aiScore} />}
                          </div>
                        </div>
                        <div className="space-y-2 mb-4">
                          {(task.aiBreakdown ?? []).map((b: AIBreak) => {
                            const bs = Number(b.score); const bm = Number(b.max) || 5;
                            return (
                              <div key={b.label} className="flex items-center gap-3 bg-white rounded-xl px-3 py-2.5 border border-emerald-100">
                                <span className="text-xs font-semibold text-gray-700 w-32 shrink-0">{b.label}</span>
                                <div className="flex items-center gap-0.5 flex-1">
                                  {[1, 2, 3, 4, 5].map(i => (
                                    <Star key={i} className={`w-4 h-4 ${i <= Math.floor(bs) ? 'text-amber-400 fill-amber-400' : i - 0.5 <= bs ? 'text-amber-300 fill-amber-200' : 'text-gray-200 fill-gray-100'}`} />
                                  ))}
                                </div>
                                <span className="text-xs font-bold text-gray-800 shrink-0">{bs}<span className="text-gray-400 font-normal">/{bm}</span></span>
                              </div>
                            );
                          })}
                        </div>
                        <div className="bg-white border border-emerald-100 rounded-xl p-3 mb-3">
                          <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wide mb-1.5">AI Feedback</p>
                          <p className="text-xs text-gray-600 leading-relaxed">{task.aiFeedback}</p>
                        </div>
                        {task.prUrl && (
                          <a href={task.prUrl} target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-xs text-blue-600 font-semibold hover:underline">
                            <ExternalLink className="w-3 h-3" /> View Submitted Pull Request
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Work Logs ────────────────────────────────────────────────────────────────

function WorkLogsSection() {
  const qc = useQueryClient();
  const [form, setForm] = useState({ date: '', hoursWorked: 4, workDone: '', challenges: '' });
  const [showForm, setShowForm] = useState(false);

  const { data: logs = [], isLoading } = useQuery<WorkLog[]>({
    queryKey: ['intern-work-logs'],
    queryFn: async () => (await api.get('/intern/work-logs')).data.data,
  });

  const addMut = useMutation({
    mutationFn: async () => api.post('/intern/work-logs', {
      date: form.date,
      hoursWorked: form.hoursWorked,
      workDone: form.workDone,
      challenges: form.challenges,
    }),
    onSuccess: () => {
      toast.success('Work log submitted!');
      setForm({ date: '', hoursWorked: 4, workDone: '', challenges: '' });
      setShowForm(false);
      qc.invalidateQueries({ queryKey: ['intern-work-logs'] });
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to submit log'),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-gray-900">Daily Work Logs</h2>
          <p className="text-xs text-gray-500 mt-0.5">Submit your daily progress for mentor review</p>
        </div>
        <button onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 px-3 py-2 bg-gradient-to-r from-blue-600 to-cyan-600 text-white text-xs font-bold rounded-xl shadow-sm">
          <Plus className="w-3.5 h-3.5" /> Add Log
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-2xl border border-blue-200 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-bold text-gray-900">New Work Log</p>
            <button onClick={() => setShowForm(false)} className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-lg"><X className="w-4 h-4" /></button>
          </div>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Date *</label>
              <input type="date" value={form.date} max={new Date().toISOString().split('T')[0]} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} className={INPUT_CLS} />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Hours Worked</label>
              <input type="number" min={1} max={12} value={form.hoursWorked}
                onChange={e => setForm(p => ({ ...p, hoursWorked: +e.target.value }))} className={INPUT_CLS} />
            </div>
          </div>
          <div className="mb-3">
            <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Work Done *</label>
            <textarea rows={3} value={form.workDone}
              onChange={e => setForm(p => ({ ...p, workDone: e.target.value }))}
              placeholder="Describe what you accomplished today..."
              className={INPUT_CLS + ' resize-none'} />
          </div>
          <div className="mb-4">
            <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Challenges Faced</label>
            <textarea rows={2} value={form.challenges}
              onChange={e => setForm(p => ({ ...p, challenges: e.target.value }))}
              placeholder="Any blockers or difficulties? Your mentor can help."
              className={INPUT_CLS + ' resize-none'} />
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200">Cancel</button>
            <button onClick={() => addMut.mutate()} disabled={!form.date || !form.workDone.trim() || addMut.isPending}
              className="flex-1 py-2 text-sm font-bold text-white bg-gradient-to-r from-blue-600 to-cyan-600 rounded-xl disabled:opacity-50">
              {addMut.isPending ? 'Submitting...' : 'Submit Log'}
            </button>
          </div>
        </div>
      )}

      {isLoading ? <Skeleton className="h-40 rounded-2xl" /> : (
        <div className="space-y-3">
          {logs.map((l: WorkLog) => (
            <div key={l.id} className="bg-white rounded-2xl border border-slate-200/80 shadow-sm lms-card p-4">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                  <p className="text-xs font-bold text-gray-900">{l.date}</p>
                  <span className="text-[10px] text-gray-400">{l.hoursWorked}h worked</span>
                </div>
                <SBadge s={l.status} />
              </div>
              <p className="text-xs font-semibold text-gray-700 mb-0.5">Work Done</p>
              <p className="text-xs text-gray-600 leading-relaxed mb-2">{l.workDone}</p>
              {l.challenges && (
                <>
                  <p className="text-xs font-semibold text-gray-700 mb-0.5">Challenges</p>
                  <p className="text-xs text-gray-600 leading-relaxed mb-2">{l.challenges}</p>
                </>
              )}
              {l.mentorComment && (
                <div className="mt-2 pt-2 border-t border-gray-100 flex items-start gap-2">
                  <div className="w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-[8px] font-bold text-blue-600">M</span>
                  </div>
                  <p className="text-xs text-blue-700 italic">{l.mentorComment}</p>
                </div>
              )}
            </div>
          ))}
          {logs.length === 0 && <p className="text-xs text-gray-400 text-center py-8">No work logs yet. Add your first log!</p>}
        </div>
      )}
    </div>
  );
}

// ─── Attendance ───────────────────────────────────────────────────────────────

function AttendanceSection() {
  const { data: attendance = [], isLoading } = useQuery<AttendanceDay[]>({
    queryKey: ['intern-attendance'],
    queryFn: async () => (await api.get('/intern/attendance')).data.data,
  });

  const presentDays = attendance.filter(a => a.status === 'PRESENT').length;
  const halfDays    = attendance.filter(a => a.status === 'HALF_DAY').length;
  const absentDays  = attendance.filter(a => a.status === 'ABSENT').length;
  const leaveDays   = attendance.filter(a => a.status === 'LEAVE').length;
  const pct = attendance.length ? Math.round(((presentDays + halfDays * 0.5) / attendance.length) * 100) : 0;

  const ATT_BG: Record<string, string> = {
    PRESENT:  'bg-emerald-50 border-emerald-200 text-emerald-700',
    HALF_DAY: 'bg-amber-50 border-amber-200 text-amber-700',
    ABSENT:   'bg-red-50 border-red-200 text-red-700',
    LEAVE:    'bg-purple-50 border-purple-200 text-purple-700',
  };
  const ATT_DOT: Record<string, string> = {
    PRESENT: 'bg-emerald-500', HALF_DAY: 'bg-amber-400', ABSENT: 'bg-red-400', LEAVE: 'bg-purple-400',
  };

  if (isLoading) return <Skeleton className="h-64 rounded-2xl" />;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Present',  value: presentDays, color: 'from-emerald-500 to-teal-500' },
          { label: 'Half Day', value: halfDays,    color: 'from-amber-500 to-orange-400' },
          { label: 'Absent',   value: absentDays,  color: 'from-red-500 to-rose-400' },
          { label: 'Leave',    value: leaveDays,   color: 'from-purple-500 to-violet-400' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-2xl border border-slate-200/80 shadow-sm lms-card p-4 text-center">
            <div className={`w-8 h-8 rounded-xl bg-gradient-to-br ${s.color} mx-auto mb-2`} />
            <p className="text-2xl font-bold text-gray-900">{s.value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm lms-card p-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-bold text-gray-900">Overall Attendance</p>
          <span className={`text-sm font-bold ${pct >= 80 ? 'text-emerald-600' : pct >= 60 ? 'text-amber-600' : 'text-red-600'}`}>{pct}%</span>
        </div>
        <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
          <div className={`h-3 rounded-full transition-all ${pct >= 80 ? 'bg-emerald-500' : pct >= 60 ? 'bg-amber-500' : 'bg-red-500'}`}
            style={{ width: `${pct}%` }} />
        </div>
        <p className="text-[10px] text-gray-400 mt-1.5">
          {pct >= 80 ? '✅ Above 80% minimum — eligible for certificate' : '⚠️ Below 80% — improve attendance for certificate eligibility'}
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm lms-card p-4">
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Attendance Log</p>
        <div className="grid grid-cols-7 gap-1.5">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
            <div key={d} className="text-center text-[9px] font-bold text-gray-400 pb-1">{d}</div>
          ))}
          {(() => {
            // Calculate weekday offset so first date lands in correct column
            // JS getDay(): 0=Sun,1=Mon,...,6=Sat → convert to Mon-based index (Mon=0)
            const firstDate = attendance[0]?.date;
            const offset = firstDate
              ? (new Date(firstDate).getDay() + 6) % 7
              : 0;
            return (
              <>
                {Array.from({ length: offset }).map((_, i) => (
                  <div key={`gap-${i}`} />
                ))}
                {attendance.map((a: AttendanceDay) => (
                  <div key={a.date} className={`rounded-lg border p-1.5 text-center ${ATT_BG[a.status] ?? 'bg-gray-50 border-gray-100 text-gray-500'}`}>
                    <p className="text-[9px] font-bold">{a.date?.slice(8) ?? ''}</p>
                    <div className={`w-2 h-2 rounded-full mx-auto mt-1 ${ATT_DOT[a.status] ?? 'bg-gray-300'}`} />
                  </div>
                ))}
              </>
            );
          })()}
        </div>
        <div className="flex gap-4 mt-3 flex-wrap">
          {[['bg-emerald-500', 'Present'], ['bg-amber-400', 'Half Day'], ['bg-red-400', 'Absent'], ['bg-purple-400', 'Leave']].map(([cls, label]) => (
            <div key={label} className="flex items-center gap-1.5">
              <div className={`w-2.5 h-2.5 rounded-full ${cls}`} />
              <span className="text-[10px] text-gray-500">{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Evaluation ───────────────────────────────────────────────────────────────

function EvaluationSection() {
  const { data: evalData, isLoading } = useQuery({
    queryKey: ['intern-evaluation'],
    queryFn: async () => (await api.get('/intern/evaluation')).data.data,
  });

  if (isLoading) return <Skeleton className="h-64 rounded-2xl" />;
  if (!evalData) return (
    <div className="text-center py-16 text-gray-400">
      <Star className="w-12 h-12 mx-auto mb-3 opacity-30" />
      <p className="text-sm font-semibold">Evaluation not yet completed</p>
      <p className="text-xs mt-1">Your mentor will evaluate you at the end of the internship.</p>
    </div>
  );

  const ratingColor = evalData.pct >= 90 ? 'text-purple-600' : evalData.pct >= 75 ? 'text-blue-600' : evalData.pct >= 60 ? 'text-emerald-600' : evalData.pct >= 40 ? 'text-amber-600' : 'text-red-600';

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm lms-card p-6">
        <div className="flex items-start justify-between mb-5">
          <div>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Final Evaluation Score</p>
            <div className="flex items-baseline gap-2">
              <span className="text-5xl font-bold text-gray-900">{evalData.total}</span>
              <span className="text-xl text-gray-300">/{evalData.maxTotal}</span>
            </div>
            <p className={`text-sm font-bold mt-1 ${ratingColor}`}>{evalData.rating}</p>
          </div>
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
            <Star className="w-8 h-8 text-white fill-white" />
          </div>
        </div>
        <div className="space-y-3">
          {evalData.params.map((p: any) => {
            const pct = Math.round((p.score / p.maxScore) * 100);
            return (
              <div key={p.category}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="font-semibold text-gray-700">{p.category}</span>
                  <span className="font-bold text-gray-900">{p.score}<span className="text-gray-400">/{p.maxScore}</span></span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className={`h-2 rounded-full ${pct >= 80 ? 'bg-emerald-500' : pct >= 60 ? 'bg-blue-500' : pct >= 40 ? 'bg-amber-500' : 'bg-red-400'}`}
                    style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-5 gap-2">
        {[['90–100', 'Excellent', 'bg-purple-100 text-purple-700'], ['75–89', 'Very Good', 'bg-blue-100 text-blue-700'], ['60–74', 'Good', 'bg-emerald-100 text-emerald-700'], ['40–59', 'Average', 'bg-amber-100 text-amber-700'], ['<40', 'Needs Impr.', 'bg-red-100 text-red-700']].map(([range, label, cls]) => (
          <div key={range} className={`${cls} rounded-xl px-2 py-2 text-center`}>
            <p className="text-xs font-bold">{range}</p>
            <p className="text-[9px] font-semibold mt-0.5 leading-tight">{label}</p>
          </div>
        ))}
      </div>

      {evalData.params.some((p: any) => p.feedback) && (
        <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4">
          <p className="text-xs font-bold text-blue-700 mb-2">Mentor Feedback</p>
          {evalData.params.filter((p: any) => p.feedback).slice(0, 3).map((p: any) => (
            <p key={p.category} className="text-xs text-gray-700 mb-1.5">
              <span className="font-semibold">{p.category}:</span> {p.feedback}
            </p>
          ))}
          <p className="text-[10px] text-gray-400 mt-2">— {evalData.mentorName}</p>
        </div>
      )}
    </div>
  );
}

// ─── Stipend ──────────────────────────────────────────────────────────────────

function StipendSection({ profile }: { profile: InternProfile }) {
  const { data: stipends = [], isLoading } = useQuery({
    queryKey: ['intern-stipend'],
    queryFn: async () => (await api.get('/intern/stipend')).data.data,
  });

  if (isLoading) return <Skeleton className="h-40 rounded-2xl" />;

  const totalPaid    = stipends.filter((s: any) => s.status === 'PAID').reduce((a: number, s: any) => a + s.amount, 0);
  const totalPending = stipends.filter((s: any) => s.status === 'PENDING').reduce((a: number, s: any) => a + s.amount, 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Total Paid',  value: `₹${totalPaid.toLocaleString()}`,    color: 'from-emerald-500 to-teal-500',  icon: CheckCircle2 },
          { label: 'Pending',     value: `₹${totalPending.toLocaleString()}`,  color: 'from-amber-500 to-orange-500',  icon: Clock },
          { label: 'Per Month',   value: `₹${profile.stipendPerMonth.toLocaleString()}`, color: 'from-blue-500 to-cyan-500', icon: TrendingUp },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-2xl border border-slate-200/80 shadow-sm lms-card p-4">
            <div className={`w-8 h-8 rounded-xl bg-gradient-to-br ${s.color} flex items-center justify-center mb-2`}>
              <s.icon className="w-4 h-4 text-white" />
            </div>
            <p className="text-xl font-bold text-gray-900">{s.value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm lms-card overflow-hidden">
        <div className="px-4 py-3 bg-gradient-to-r from-blue-50 to-cyan-50 border-b border-blue-100">
          <h3 className="text-sm font-bold text-blue-800">Payment History</h3>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              {['Month', 'Amount', 'Payment Date', 'Status'].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs font-bold text-gray-600">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {stipends.map((s: any) => (
              <tr key={s.id} className="hover:bg-gray-50/50">
                <td className="px-4 py-3 text-xs font-semibold text-gray-800">{s.month}</td>
                <td className="px-4 py-3 text-xs font-bold text-emerald-700">₹{s.amount.toLocaleString()}</td>
                <td className="px-4 py-3 text-xs text-gray-500">{s.paymentDate || '—'}</td>
                <td className="px-4 py-3"><SBadge s={s.status} /></td>
              </tr>
            ))}
            {stipends.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-6 text-center text-xs text-gray-400">No stipend records yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Certificate ──────────────────────────────────────────────────────────────

function CertificateSection() {
  const { open: openDoc, viewer: docViewer } = useInAppViewer();
  const { data: cert, isLoading } = useQuery({
    queryKey: ['intern-certificate'],
    queryFn: async () => (await api.get('/intern/certificate')).data.data,
  });

  if (isLoading) return <Skeleton className="h-64 rounded-2xl" />;
  if (!cert) return (
    <div className="text-center py-16 text-gray-400">
      <Award className="w-12 h-12 mx-auto mb-3 opacity-30" />
      <p className="text-sm font-semibold">Certificate status not available</p>
      <p className="text-xs mt-1">Complete your internship tasks to unlock certificate eligibility.</p>
    </div>
  );

  const isEligible = cert.attendancePct >= 80 && cert.projectSubmitted && cert.evaluationDone;

  const checks = [
    { label: 'Attendance ≥ 80%',    done: cert.attendancePct >= 80, detail: `${cert.attendancePct}%` },
    { label: 'Project Submitted',   done: cert.projectSubmitted,    detail: cert.projectSubmitted ? 'Submitted' : 'Pending' },
    { label: 'Evaluation Completed', done: cert.evaluationDone,     detail: cert.evaluationDone ? 'Done' : 'Pending' },
  ];

  return (
    <div className="space-y-4">
      {docViewer}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm lms-card p-5">
        <div className="flex items-start justify-between mb-4">
          <div>
            <p className="text-sm font-bold text-gray-900">Certificate Eligibility</p>
            <p className="text-xs text-gray-500 mt-0.5">All 3 criteria must be met</p>
          </div>
          <div className={`px-3 py-1.5 rounded-xl text-xs font-bold ${isEligible ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
            {isEligible ? '✅ Eligible' : '⏳ Not Yet Eligible'}
          </div>
        </div>
        <div className="space-y-2">
          {checks.map(c => (
            <div key={c.label} className={`flex items-center justify-between p-3 rounded-xl border ${c.done ? 'bg-emerald-50 border-emerald-100' : 'bg-gray-50 border-gray-100'}`}>
              <div className="flex items-center gap-2.5">
                {c.done
                  ? <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                  : <AlertCircle className="w-4 h-4 text-gray-300 shrink-0" />}
                <span className="text-xs font-semibold text-gray-800">{c.label}</span>
              </div>
              <span className={`text-xs font-bold ${c.done ? 'text-emerald-600' : 'text-gray-400'}`}>{c.detail}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm lms-card p-5">
        <p className="text-sm font-bold text-gray-900 mb-4">Certificate Status</p>
        {cert.status === 'PENDING' && (
          <div className="text-center py-6">
            <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-3">
              <Award className="w-8 h-8 text-gray-300" />
            </div>
            <p className="text-sm font-semibold text-gray-600">Certificate Pending</p>
            <p className="text-xs text-gray-400 mt-1 max-w-xs mx-auto">
              {isEligible
                ? 'You are eligible! Your certificate will be generated by the admin shortly.'
                : 'Complete all eligibility criteria to unlock your certificate.'}
            </p>
          </div>
        )}
        {cert.status === 'GENERATED' && (
          <div className="text-center py-6">
            <div className="w-16 h-16 rounded-2xl bg-blue-100 flex items-center justify-center mx-auto mb-3">
              <Award className="w-8 h-8 text-blue-500" />
            </div>
            <p className="text-sm font-bold text-blue-700">Certificate Generated!</p>
            <p className="text-[10px] font-mono text-gray-400 mt-1">{cert.certificateId}</p>
            <p className="text-xs text-gray-500 mt-1">Issued: {cert.issueDate} · Grade: <span className="font-bold text-blue-600">{cert.grade}</span></p>
          </div>
        )}
        {cert.status === 'ISSUED' && (
          <div className="text-center py-6">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center mx-auto mb-3 shadow-lg">
              <Award className="w-8 h-8 text-white" />
            </div>
            <p className="text-sm font-bold text-gray-900">Certificate Issued! 🎉</p>
            <p className="text-[10px] font-mono text-gray-400 mt-1">{cert.certificateId}</p>
            <p className="text-xs text-gray-500 mt-1">Issued: {cert.issueDate} · Grade: <span className="font-bold text-purple-600">{cert.grade}</span></p>
            {cert.certificateUrl && (
              <button
                type="button"
                onClick={() => openDoc({ url: cert.certificateUrl, title: 'Certificate' })}
                className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-purple-600 to-pink-600 text-white text-sm font-bold rounded-xl shadow-md hover:shadow-lg transition-all"
              >
                <Download className="w-4 h-4" /> Open Certificate
              </button>
            )}
          </div>
        )}
      </div>

      <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4">
        <p className="text-xs font-bold text-blue-700 mb-2 flex items-center gap-1.5">
          <Shield className="w-3.5 h-3.5" /> Eligibility Rules
        </p>
        {[
          'Maintain ≥ 80% attendance throughout the internship period',
          'Submit the final project deliverable before the internship end date',
          'Complete the mentor evaluation process with your assigned mentor',
        ].map((r, i) => (
          <div key={i} className="flex items-start gap-2 text-xs text-blue-700 mb-1.5 last:mb-0">
            <CheckCircle2 className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" />
            <span>{r}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Portal ──────────────────────────────────────────────────────────────

export default function InternPortal() {
  const [activeSection, setActiveSection] = useState<SectionKey>('dashboard');

  const { data: profile, isLoading: profileLoading } = useQuery<InternProfile | null>({
    queryKey: ['intern-profile'],
    queryFn: async () => (await api.get('/intern/profile')).data.data,
  });

  const { data: refs = [], isLoading: refsLoading } = useQuery<InternRef[]>({
    queryKey: ['intern-references'],
    queryFn: async () => (await api.get('/intern/references')).data.data,
    enabled: !!profile,
  });

  const { data: tasks = [] } = useQuery<InternTask[]>({
    queryKey: ['intern-tasks'],
    queryFn: async () => (await api.get('/intern/tasks')).data.data,
    enabled: !!profile,
  });

  const { data: logs = [] } = useQuery<WorkLog[]>({
    queryKey: ['intern-work-logs'],
    queryFn: async () => (await api.get('/intern/work-logs')).data.data,
    enabled: !!profile,
  });

  const { data: attendance = [] } = useQuery<AttendanceDay[]>({
    queryKey: ['intern-attendance'],
    queryFn: async () => (await api.get('/intern/attendance')).data.data,
    enabled: !!profile,
  });

  if (profileLoading) {
    return (
      <div className="flex flex-col lg:flex-row gap-5 min-h-[calc(100vh-7rem)]">
        <Skeleton className="w-full lg:w-52 shrink-0 h-96 rounded-2xl" />
        <div className="flex-1 space-y-5 sm:space-y-6">
          <Skeleton className="h-44 rounded-2xl" />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Skeleton className="h-48 rounded-2xl" />
            <Skeleton className="h-48 rounded-2xl" />
          </div>
        </div>
      </div>
    );
  }

  // Not enrolled in any internship
  if (!profile) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] gap-5 px-4">
        <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-lg text-white">
          <Briefcase className="w-10 h-10" />
        </div>
        <div className="text-center max-w-sm">
          <h2 className="text-xl font-bold text-slate-900">No active internship</h2>
          <p className="text-slate-500 text-sm mt-2 leading-relaxed">
            You are not enrolled in an internship program yet. Contact your coordinator to get allocated.
          </p>
        </div>
      </div>
    );
  }

  const completedTasks = tasks.filter(t => t.status === 'AI_GRADED').length;

  function renderSection() {
    switch (activeSection) {
      case 'dashboard':   return <DashboardSection profile={profile!} tasks={tasks} logs={logs} attendance={attendance} />;
      case 'references':  return refsLoading ? <Skeleton className="h-64 rounded-2xl" /> : <ReferencesSection refs={refs} />;
      case 'tasks':       return <TasksSection refs={refs} profile={profile!} />;
      case 'worklogs':    return <WorkLogsSection />;
      case 'attendance':  return <AttendanceSection />;
      case 'evaluation':  return <EvaluationSection />;
      case 'stipend':     return <StipendSection profile={profile!} />;
      case 'certificate': return <CertificateSection />;
    }
  }

  return (
    <div className="flex flex-col lg:flex-row gap-5 min-h-[calc(100vh-7rem)]">
      {/* Vertical sidebar nav (horizontal on mobile) */}
      <div className="w-full lg:w-52 shrink-0">
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden sticky top-4 lms-card">
          <div className="p-4 bg-gradient-to-br from-blue-600 to-cyan-500">
            <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center mb-2">
              <Briefcase className="w-5 h-5 text-white" />
            </div>
            <p className="text-xs font-bold text-white">Intern Portal</p>
            <p className="text-[10px] text-blue-100 mt-0.5 truncate">{profile.name}</p>
          </div>

          <div className="px-4 py-3 border-b border-gray-100 hidden lg:block">
            <div className="flex justify-between text-[10px] mb-1">
              <span className="text-gray-500 font-medium">Progress</span>
              <span className="font-bold text-blue-600">{profile.progress}%</span>
            </div>
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-1.5 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-full" style={{ width: `${profile.progress}%` }} />
            </div>
            <p className="text-[10px] text-gray-400 mt-1">{completedTasks}/{tasks.length} tasks done</p>
          </div>

          <nav className="p-2 flex lg:flex-col overflow-x-auto whitespace-nowrap [&::-webkit-scrollbar]:hidden gap-2">
            {SECTIONS.map(s => {
              const Icon = s.icon;
              const active = activeSection === s.key;
              return (
                <button
                  key={s.key}
                  onClick={() => setActiveSection(s.key)}
                  className={`lms-nav-link lms-press flex-shrink-0 lg:w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left transition-all duration-300 ease-out ${active ? 'is-active bg-blue-600 text-white font-semibold shadow-md shadow-blue-500/25' : 'text-slate-600 hover:bg-blue-50 hover:text-blue-700'}`}>
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="text-xs font-medium">{s.label}</span>
                </button>
              );
            })}
          </nav>

          <div className="px-4 py-3 border-t border-gray-100 hidden lg:block">
            <p className="text-[10px] font-semibold text-gray-500 truncate">{profile.company}</p>
            <p className="text-[10px] text-gray-400">Mentor: <span className="font-semibold">{profile.mentor}</span></p>
          </div>
        </div>
      </div>

      {/* Section content */}
      <div className="flex-1 min-w-0">
        {renderSection()}
      </div>
    </div>
  );
}
