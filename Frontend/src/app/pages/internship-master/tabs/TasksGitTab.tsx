import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Building2, GitBranch, GitPullRequest, Cpu, Zap, Code2, Radio, Send,
  Calendar, Trash2, ExternalLink, FileText, Download, BookOpen, Users,
  CheckCircle2, Star, Eye, X, Lock, Upload, Plus
} from 'lucide-react';
import api from '../../../../lib/axios';
import { AIGradeModal } from '../AIGradeModal';
import {
  getWebhookStatusBadge, statusBadge, SprintTask, StudentGitHubProgress,
  WebhookEvent, GitHubPipelineStatus, GHResource, GHTaskFile
} from '../shared';

const PIPELINE_STEPS: { status: GitHubPipelineStatus; label: string; activeCls: string }[] = [
  { status: 'NOT_STARTED', label: 'Not Started',  activeCls: 'bg-gray-100 text-gray-500' },
  { status: 'FORKED',      label: 'Forked',       activeCls: 'bg-blue-100 text-blue-700' },
  { status: 'CODING',      label: 'Coding',       activeCls: 'bg-amber-100 text-amber-700' },
  { status: 'SUBMITTED',   label: 'Submitted',    activeCls: 'bg-purple-100 text-purple-700' },
  { status: 'AI_GRADED',   label: 'AI Graded',    activeCls: 'bg-emerald-100 text-emerald-700' },
];

export function TasksGitTab() {
  const qc = useQueryClient();
  const [selectedProgramId, setSelectedProgramId] = useState<string>('');
  const [selectedTaskId, setSelectedTaskId] = useState<string>('');
  const [activeView, setActiveView] = useState<'pipeline' | 'webhooks'>('pipeline');
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [showAIPanel, setShowAIPanel] = useState<string | null>(null);
  const [taskForm, setTaskForm] = useState({ sprintNo: 1, title: '', description: '', templateRepoUrl: '', dueDate: '', artifactType: 'Node.js', projectPdfName: '' });

  const { data: programs = [] } = useQuery<any[]>({
    queryKey: ['admin-programs'],
    queryFn: async () => (await api.get('/intern/admin/programs')).data.data,
  });

  useEffect(() => {
    if (!selectedProgramId && programs.length > 0) {
      setSelectedProgramId(programs[0].id);
    }
  }, [programs, selectedProgramId]);

  const { data: tasks = [] } = useQuery<SprintTask[]>({
    queryKey: ['admin-tasks', selectedProgramId],
    queryFn: async () => (await api.get(`/intern/admin/programs/${selectedProgramId}/tasks`)).data.data,
    enabled: !!selectedProgramId,
  });

  const { data: progress = [] } = useQuery<StudentGitHubProgress[]>({
    queryKey: ['admin-pipeline', selectedProgramId],
    queryFn: async () => (await api.get(`/intern/admin/programs/${selectedProgramId}/pipeline`)).data.data,
    enabled: !!selectedProgramId,
    refetchInterval: 5000,
  });

  const { data: webhookEvents = [] } = useQuery<WebhookEvent[]>({
    queryKey: ['admin-webhooks'],
    queryFn: async () => (await api.get('/intern/admin/webhooks')).data.data,
    refetchInterval: 5000,
  });

  const selectedTask = tasks.find(t => t.id === selectedTaskId) || tasks[0];
  useEffect(() => {
    if (!selectedTaskId && tasks.length > 0) {
      setSelectedTaskId(tasks[0].id);
    }
  }, [tasks, selectedTaskId]);

  const [solutionFile, setSolutionFile] = useState<File | null>(null);
  const [uploadingSolution, setUploadingSolution] = useState(false);
  const solutionFileRef = useRef<HTMLInputElement | null>(null);

  const createTaskMut = useMutation({
    mutationFn: async (data: any) => {
      const res = await api.post(`/intern/admin/programs/${selectedProgramId}/tasks`, data);
      const newTaskId = res.data.data?.id;
      if (newTaskId && solutionFile) {
        setUploadingSolution(true);
        try {
          const fd = new FormData();
          fd.append('file', solutionFile);
          await api.post(`/intern/admin/tasks/${newTaskId}/solution`, fd, {
            headers: { 'Content-Type': 'multipart/form-data' },
          });
          toast.success('Solution file uploaded (private)!');
        } catch {
          toast.error('Task created but solution upload failed');
        } finally {
          setUploadingSolution(false);
        }
      }
      return res;
    },
    onSuccess: () => {
      toast.success('Task created successfully');
      setShowCreateTask(false);
      setTaskForm({ sprintNo: 1, title: '', description: '', templateRepoUrl: '', dueDate: '', artifactType: 'Node.js', projectPdfName: '' });
      setSolutionFile(null);
      qc.invalidateQueries({ queryKey: ['admin-tasks', selectedProgramId] });
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to create task')
  });

  const deleteTaskMut = useMutation({
    mutationFn: async (taskId: string) => {
      return await api.delete(`/intern/admin/tasks/${taskId}`);
    },
    onSuccess: () => {
      toast.success('Task deleted successfully');
      setSelectedTaskId('');
      qc.invalidateQueries({ queryKey: ['admin-tasks', selectedProgramId] });
      qc.invalidateQueries({ queryKey: ['admin-pipeline', selectedProgramId] });
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to delete task')
  });

  const taskProgress = selectedTask ? progress.filter(p => p.taskId === selectedTask.id) : [];
  const sprintGroups = [...new Set(tasks.map(t => t.sprintNo))].sort((a, b) => a - b);
  const stepIdx = (s: GitHubPipelineStatus) => PIPELINE_STEPS.findIndex(x => x.status === s);

  const totalForked = progress.filter(p => p.status !== 'NOT_STARTED').length;
  const totalGraded = progress.filter(p => p.status === 'AI_GRADED').length;
  const gradedList  = progress.filter(p => p.aiScore !== null);
  const avgScore    = gradedList.length > 0 ? parseFloat((gradedList.reduce((a, p) => a + (p.aiScore ?? 0), 0) / gradedList.length).toFixed(1)) : 0;

  const RES_STYLE: Record<GHResource['type'], string> = {
    pdf:   'bg-red-50 text-red-600 border-red-200',
    video: 'bg-purple-50 text-purple-600 border-purple-200',
    docs:  'bg-blue-50 text-blue-600 border-blue-200',
    other: 'bg-gray-50 text-gray-600 border-gray-200',
  };
  const RES_LABEL: Record<GHResource['type'], string> = { pdf: 'PDF', video: '▶ Video', docs: 'Docs', other: 'Link' };

  const INPUT_CLS = "w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all";
  const LABEL_CLS = "text-xs font-semibold text-gray-600 mb-1.5 block";

  return (
    <div className="space-y-4">
      {/* Program Selector */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Building2 className="w-5 h-5 text-blue-500" />
          <h2 className="text-sm font-bold text-gray-900">Select Internship Program</h2>
        </div>
        <select
          value={selectedProgramId}
          onChange={e => { setSelectedProgramId(e.target.value); setSelectedTaskId(''); }}
          className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all min-w-[300px]"
        >
          {programs.map(p => (
            <option key={p.id} value={p.id}>{p.title} - {p.company}</option>
          ))}
        </select>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Sprint Tasks',  value: tasks.length,                               grad: 'from-blue-500 to-cyan-500',   Icon: GitBranch     },
          { label: 'Repos Forked',  value: totalForked,                                grad: 'from-purple-500 to-pink-500', Icon: GitPullRequest },
          { label: 'AI Graded',     value: totalGraded,                                grad: 'from-emerald-500 to-teal-500',Icon: Cpu           },
          { label: 'Avg AI Score',  value: gradedList.length > 0 ? `${avgScore}★ /5` : '—', grad: 'from-amber-500 to-orange-500', Icon: Zap  },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <div className={`w-8 h-8 rounded-xl bg-gradient-to-br ${s.grad} flex items-center justify-center mb-2`}>
              <s.Icon className="w-4 h-4 text-white" />
            </div>
            <p className="text-2xl font-bold text-gray-900">{s.value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Workflow banner */}
      <div className="bg-gradient-to-r from-blue-50 via-indigo-50 to-purple-50 border border-blue-100 rounded-2xl p-4">
        <p className="text-xs font-bold text-blue-800 mb-3 flex items-center gap-1.5">
          <Zap className="w-3.5 h-3.5 text-blue-600" /> GitHub Internship Workflow — How it works
        </p>
        <div className="flex items-start gap-1.5 overflow-x-auto pb-1">
          {[
            { Icon: GitBranch,     label: '① Admin creates task',    sub: 'pastes Template Repo URL',     cls: 'bg-blue-100 text-blue-700'    },
            { Icon: GitPullRequest,label: '② Student forks',         sub: 'template to their GitHub',     cls: 'bg-indigo-100 text-indigo-700' },
            { Icon: Code2,         label: '③ Student codes & pushes',sub: 'commits to their fork',        cls: 'bg-amber-100 text-amber-700'   },
            { Icon: Radio,         label: '④ Webhook fires',         sub: 'auto attendance → PRESENT',    cls: 'bg-purple-100 text-purple-700' },
            { Icon: Send,          label: '⑤ Student submits',       sub: 'triggers AI evaluation',       cls: 'bg-cyan-100 text-cyan-700'     },
            { Icon: Cpu,           label: '⑥ AI grades code',        sub: 'score /100 with breakdown',    cls: 'bg-emerald-100 text-emerald-700'},
          ].map((step, i) => (
            <div key={i} className="flex items-center gap-1 flex-shrink-0">
              <div className={`${step.cls} rounded-xl px-2.5 py-2 text-center min-w-[100px]`}>
                <step.Icon className="w-4 h-4 mx-auto mb-1" />
                <p className="text-[10px] font-bold leading-tight">{step.label}</p>
                <p className="text-[9px] opacity-70 mt-0.5 leading-tight">{step.sub}</p>
              </div>
              {i < 5 && <span className="text-gray-300 text-sm font-bold">→</span>}
            </div>
          ))}
        </div>
      </div>

      {/* Sprint / Task selector + Create button */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 p-1 bg-white rounded-xl border border-gray-200 shadow-sm overflow-x-auto">
          {sprintGroups.map(sprint => (
            <button key={sprint}
              onClick={() => { const t = tasks.find(x => x.sprintNo === sprint); if (t) setSelectedTaskId(t.id); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all flex-shrink-0 ${
                selectedTask?.sprintNo === sprint ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-50'
              }`}>
              Sprint {sprint}
            </button>
          ))}
        </div>
        <div className="flex gap-1.5 flex-1 flex-wrap">
          {tasks.filter(t => t.sprintNo === selectedTask?.sprintNo).map(t => (
            <button key={t.id} onClick={() => setSelectedTaskId(t.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all border ${
                selectedTask?.id === t.id ? 'bg-indigo-50 border-indigo-300 text-indigo-700' : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
              }`}>
              {t.title}
            </button>
          ))}
        </div>
        <button onClick={() => setShowCreateTask(true)}
          className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-blue-600 to-cyan-600 text-white text-xs font-bold rounded-xl shadow-md flex-shrink-0">
          <Plus className="w-3.5 h-3.5" /> Create Sprint Task
        </button>
      </div>

      {/* Main content: task info + student pipeline */}
      {selectedTask ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Left panel: task details */}
          <div className="space-y-3">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center flex-shrink-0">
                  <GitBranch className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="font-bold text-gray-900 text-sm">Sprint {selectedTask.sprintNo}: {selectedTask.title}</p>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <p className="text-[10px] text-gray-400 flex items-center gap-1">
                      <Calendar className="w-3 h-3" /> Due: {selectedTask.dueDate}
                    </p>
                    {selectedTask.artifactType && (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-200">
                        {selectedTask.artifactType}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <button
                onClick={() => {
                  if (window.confirm(`Are you sure you want to delete the task "${selectedTask.title}"? This will delete all student progress for this task.`)) {
                    deleteTaskMut.mutate(selectedTask.id);
                  }
                }}
                disabled={deleteTaskMut.isPending}
                className="p-2 text-red-500 hover:bg-red-50 rounded-xl transition-colors"
                title="Delete Task"
              >
                <Trash2 className="w-4.5 h-4.5" />
              </button>
            </div>
            <p className="text-xs text-gray-600 mb-4 leading-relaxed">{selectedTask.description}</p>

            {/* Template Repo */}
            <div className="bg-gray-50 rounded-xl p-3 mb-3">
              <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1.5 flex items-center gap-1">
                <GitPullRequest className="w-3 h-3" /> Template Repository
              </p>
              {selectedTask.templateRepoUrl ? (
                <a href={selectedTask.templateRepoUrl} target="_blank" rel="noopener noreferrer"
                  className="text-xs text-blue-600 hover:underline font-mono flex items-center gap-1.5 break-all">
                  {selectedTask.templateRepoUrl.replace('https://github.com/', 'github.com/')}
                  <ExternalLink className="w-3 h-3 flex-shrink-0" />
                </a>
              ) : (
                <span className="text-xs text-gray-400 italic">No template repository set</span>
              )}
              <p className="text-[10px] text-gray-400 mt-1.5">Students fork this repo to start coding</p>
            </div>

            {/* Task files */}
            {selectedTask.taskFiles.length > 0 && (
              <div className="mb-1">
                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1.5">Task Files</p>
                <div className="space-y-1.5">
                  {selectedTask.taskFiles.map(f => (
                    <button key={f.name}
                      className="w-full flex items-center gap-2 p-2.5 bg-blue-50 border border-blue-100 rounded-xl hover:bg-blue-100 transition-colors text-left">
                      <FileText className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
                      <span className="text-xs text-blue-700 font-medium flex-1">{f.name}</span>
                      <span className="text-[9px] font-bold text-blue-500 uppercase">{f.type}</span>
                      <Download className="w-3 h-3 text-blue-400 flex-shrink-0" />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Resources */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <p className="text-xs font-bold text-gray-700 mb-3 flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5 text-indigo-500" /> Learning Resources
            </p>
            <div className="space-y-2">
              {selectedTask.resources.map(r => (
                <a key={r.id} href={r.url} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2.5 p-2.5 rounded-xl border border-slate-100 hover:border-blue-200 hover:bg-blue-50/30 transition-all">
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border flex-shrink-0 ${RES_STYLE[r.type]}`}>
                    {RES_LABEL[r.type]}
                  </span>
                  <span className="text-xs text-gray-700 font-medium flex-1 leading-tight">{r.title}</span>
                  <ExternalLink className="w-3 h-3 text-gray-300 flex-shrink-0" />
                </a>
              ))}
            </div>
          </div>
        </div>

        {/* Right panel: student pipeline */}
        <div className="lg:col-span-2 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <p className="text-sm font-bold text-gray-900 flex items-center gap-2">
              <Users className="w-4 h-4 text-blue-500" />
              Student Pipeline — Sprint {selectedTask.sprintNo}: {selectedTask.title}
            </p>
            <div className="flex gap-1 p-0.5 bg-gray-100 rounded-lg">
              {(['pipeline', 'webhooks'] as const).map(v => (
                <button key={v} onClick={() => setActiveView(v)}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all capitalize ${
                    activeView === v ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  }`}>
                  {v === 'webhooks' ? 'Webhook Log' : 'Pipeline View'}
                </button>
              ))}
            </div>
          </div>

          {activeView === 'pipeline' ? (
            <div className="space-y-3">
              {taskProgress.length === 0 ? (
                <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center">
                  <Users className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                  <p className="text-sm text-gray-400">No students assigned to this task yet.</p>
                </div>
              ) : taskProgress.map(prog => {
                const curIdx = stepIdx(prog.status);
                const latestProg = progress.find(p => p.id === prog.id) ?? prog;
                return (
                  <div key={prog.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 hover:border-blue-200 transition-colors">
                    {/* Student header */}
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center text-white font-bold text-xs flex-shrink-0">
                          {prog.studentName.split(' ').map(n => n[0]).join('')}
                        </div>
                        <div>
                          <p className="font-bold text-gray-900 text-sm">{prog.studentName}</p>
                          <p className="text-[10px] text-gray-400 mt-0.5">
                            {latestProg.lastPushAt
                              ? <span className="flex items-center gap-1"><GitBranch className="w-2.5 h-2.5" />Last push: {latestProg.lastPushAt} · {latestProg.commitCount} commit{latestProg.commitCount !== 1 ? 's' : ''}</span>
                              : 'No pushes yet'}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap justify-end">
                        {latestProg.attendanceAutoMarked && (
                          <span className="text-[9px] bg-emerald-100 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded-full font-bold flex items-center gap-0.5">
                            <CheckCircle2 className="w-2.5 h-2.5" /> Attended
                          </span>
                        )}
                        {latestProg.aiScore !== null && (
                          <span className="text-[9px] bg-amber-100 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded-full font-bold flex items-center gap-0.5">
                            <Star className="w-2.5 h-2.5 fill-amber-500 text-amber-500" />
                            {typeof latestProg.aiScore === 'number' ? latestProg.aiScore.toFixed(1) : latestProg.aiScore}/5
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Pipeline steps */}
                    <div className="flex items-center gap-1 mb-4 overflow-x-auto pb-1">
                      {PIPELINE_STEPS.map((step, i) => (
                        <div key={step.status} className="flex items-center gap-1 flex-shrink-0">
                          <div className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold transition-all ${
                            curIdx >= i ? step.activeCls : 'bg-gray-50 text-gray-300 border border-gray-100'
                          }`}>
                            {curIdx > i  && <CheckCircle2 className="w-3 h-3" />}
                            {curIdx === i && <span className="w-2 h-2 rounded-full bg-current inline-block animate-pulse" />}
                            {curIdx < i  && <span className="w-2 h-2 rounded-full border-2 border-current inline-block" />}
                            <span className="ml-0.5">{step.label}</span>
                          </div>
                          {i < PIPELINE_STEPS.length - 1 && <span className="text-gray-200 text-xs font-bold">›</span>}
                        </div>
                      ))}
                    </div>

                    {/* Fork URL */}
                    {latestProg.forkUrl && (
                      <div className="bg-gray-50 rounded-xl px-3 py-2 mb-3 flex items-center gap-2">
                        <GitPullRequest className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
                        <a href={latestProg.forkUrl} target="_blank" rel="noopener noreferrer"
                          className="text-xs text-blue-600 hover:underline font-mono truncate flex-1">
                          {latestProg.forkUrl.replace('https://github.com/', 'github.com/')}
                        </a>
                        <ExternalLink className="w-3 h-3 text-gray-400 flex-shrink-0" />
                      </div>
                    )}

                    {/* Action buttons */}
                    {latestProg.status === 'AI_GRADED' && (
                      <div className="flex gap-2 flex-wrap">
                        <button onClick={() => setShowAIPanel(latestProg.id)}
                          className="text-xs px-3 py-1.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-100 font-semibold flex items-center gap-1.5 transition-colors">
                          <Eye className="w-3 h-3" /> View AI Score
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            /* Webhook Log */
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-4 py-3 bg-gradient-to-r from-purple-50 to-indigo-50 border-b border-purple-100 flex items-center gap-2">
                <Radio className="w-4 h-4 text-purple-600" />
                <h3 className="text-sm font-bold text-purple-800">GitHub Webhook Events</h3>
                <span className="ml-auto text-[10px] bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-mono font-bold border border-purple-200">
                  POST /api/v1/intern/github/webhook
                </span>
              </div>
              <div className="divide-y divide-gray-50">
                {webhookEvents.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-10">No events yet. Simulate a push to generate webhook events.</p>
                ) : webhookEvents.map(ev => {
                  const initials = ev.studentName
                    ? ev.studentName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
                    : (ev.pusherLogin || 'UN').slice(0, 2).toUpperCase();

                  const isError = ev.status === 'ERROR';
                  const isUnlinked = ev.status === 'STUDENT_NOT_FOUND';
                  const isNoProgress = ev.status === 'PROGRESS_NOT_FOUND';
                  const isSuccess = ev.status === 'SUCCESS';

                  const avatarBg = isSuccess
                    ? 'bg-emerald-100 text-emerald-700'
                    : (isUnlinked || isNoProgress)
                    ? 'bg-amber-100 text-amber-700'
                    : 'bg-red-100 text-red-700';

                  const branchName = ev.ref ? ev.ref.replace('refs/heads/', '') : 'main';
                  const repoFullName = ev.repoOwner ? `${ev.repoOwner}/${ev.repoName}` : ev.repoName;
                  const shortSha = ev.headSha ? ev.headSha.slice(0, 7) : '';

                  return (
                    <div key={ev.id} className="px-4 py-3.5 hover:bg-gray-50/50 transition-colors">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-2.5 flex-1 min-w-0">
                          <div className={`w-7 h-7 rounded-full ${avatarBg} font-bold text-[10px] flex items-center justify-center flex-shrink-0 mt-0.5`}>
                            {initials}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              {ev.studentName ? (
                                <p className="text-xs font-semibold text-gray-900">
                                  {ev.studentName}
                                  <span className="text-xs font-normal text-gray-500"> (@{ev.pusherLogin})</span>
                                </p>
                              ) : (
                                <p className="text-xs font-semibold text-amber-700 flex items-center gap-1">
                                  Unlinked Account (@{ev.pusherLogin})
                                </p>
                              )}
                              <span className="text-[10px] text-gray-400 font-normal"> pushed to </span>
                              <span className="text-blue-600 font-mono text-xs">{repoFullName}</span>
                              <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.2 rounded font-mono">
                                {branchName}
                              </span>
                              {shortSha && (
                                <span className="text-[10px] text-gray-400 font-mono">
                                  @{shortSha}
                                </span>
                              )}
                            </div>

                            <p className="text-[11px] text-gray-600 font-mono mt-1 break-all bg-gray-50/80 px-2 py-1 rounded border border-gray-100">
                              "{ev.commitMessage}"
                            </p>

                            {ev.errorMessage && (
                              <div className={`mt-2 text-[11px] p-2 rounded-lg border font-mono ${
                                isError
                                  ? 'bg-red-50 text-red-700 border-red-100'
                                  : 'bg-amber-50 text-amber-800 border-amber-100'
                              }`}>
                                <div className="font-bold mb-0.5">
                                  {isUnlinked ? 'Unlinked User Warning:' : isNoProgress ? 'Matching Progress Warning:' : 'Grading Error:'}
                                </div>
                                {ev.errorMessage}
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                          <span className="text-[10px] text-gray-400 font-mono">{ev.timestamp}</span>
                          <div className="flex items-center gap-1.5">
                            {getWebhookStatusBadge(ev.status)}
                            {ev.attendanceMarked && (
                              <span className="text-[9px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full font-bold flex items-center gap-0.5 border border-emerald-200">
                                <CheckCircle2 className="w-2.5 h-2.5" /> Attendance → PRESENT
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center text-gray-500">
          <GitBranch className="w-10 h-10 mx-auto text-gray-300 mb-3" />
          <p className="font-semibold text-gray-800">No Sprint Tasks Found</p>
          <p className="text-sm mt-1">Select a program with existing tasks or click "Create Sprint Task" to start.</p>
        </div>
      )}

      {/* AI Grade Modal */}
      {showAIPanel && (
        <AIGradeModal 
          progress={progress} 
          showAIPanel={showAIPanel} 
          setShowAIPanel={setShowAIPanel} 
        />
      )}

      {/* Create Sprint Task Modal */}
      {showCreateTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white">
              <h3 className="text-base font-bold text-gray-900">Create Sprint Task</h3>
              <button onClick={() => setShowCreateTask(false)} className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-lg"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={LABEL_CLS}>Sprint Number *</label>
                  <input type="number" min={1} value={taskForm.sprintNo}
                    onChange={e => setTaskForm(prev => ({ ...prev, sprintNo: +e.target.value }))}
                    className={INPUT_CLS} />
                </div>
                <div>
                  <label className={LABEL_CLS}>Due Date</label>
                  <input type="date" value={taskForm.dueDate}
                    onChange={e => setTaskForm(prev => ({ ...prev, dueDate: e.target.value }))}
                    className={INPUT_CLS} />
                </div>
              </div>
              <div>
                <label className={LABEL_CLS}>Task Title *</label>
                <input value={taskForm.title}
                  onChange={e => setTaskForm(prev => ({ ...prev, title: e.target.value }))}
                  className={INPUT_CLS} placeholder="e.g. User Authentication Module" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={LABEL_CLS}>Artifact Type</label>
                  <select value={taskForm.artifactType}
                    onChange={e => setTaskForm(prev => ({ ...prev, artifactType: e.target.value }))}
                    className={INPUT_CLS}>
                    {['Python', 'SQL', 'HTML/CSS', 'JavaScript', 'Node.js', 'React', 'Other'].map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className={LABEL_CLS}>Project PDF Name</label>
                  <input value={taskForm.projectPdfName}
                    onChange={e => setTaskForm(prev => ({ ...prev, projectPdfName: e.target.value }))}
                    className={INPUT_CLS} placeholder="sprint-1-guide.pdf" />
                </div>
              </div>
              <div>
                <label className={LABEL_CLS}>GitHub Template Repository URL *</label>
                <input type="url" value={taskForm.templateRepoUrl}
                  onChange={e => setTaskForm(prev => ({ ...prev, templateRepoUrl: e.target.value }))}
                  className={INPUT_CLS} placeholder="https://github.com/your-org/template-repo" />
                <p className="text-[10px] text-gray-400 mt-1.5 flex items-center gap-1">
                  <GitPullRequest className="w-3 h-3" /> Students will fork this repo to their own GitHub and start coding
                </p>
              </div>
              <div>
                <label className={LABEL_CLS}>Task Description</label>
                <textarea rows={3} value={taskForm.description}
                  onChange={e => setTaskForm(prev => ({ ...prev, description: e.target.value }))}
                  className={`${INPUT_CLS} resize-none`}
                  placeholder="Describe what students need to build…" />
              </div>

              {/* Solution File Upload (private) */}
              <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 space-y-2">
                <div className="flex items-center gap-2 mb-1">
                  <Lock className="w-3.5 h-3.5 text-purple-600" />
                  <p className="text-xs font-bold text-purple-800">Model Solution File</p>
                  <span className="text-[9px] px-1.5 py-0.5 bg-purple-200 text-purple-700 rounded-full font-bold">PRIVATE — NOT VISIBLE TO STUDENTS</span>
                </div>
                <p className="text-[10px] text-purple-600 mb-2">Upload a reference solution (PDF, ZIP, .py, .js etc). AI will use it to compare with student submissions and give a more accurate grade.</p>
                <input
                  ref={solutionFileRef}
                  type="file"
                  className="hidden"
                  onChange={e => setSolutionFile(e.target.files?.[0] ?? null)}
                />
                {solutionFile ? (
                  <div className="flex items-center gap-2 bg-white border border-purple-200 rounded-lg px-3 py-2">
                    <FileText className="w-3.5 h-3.5 text-purple-500" />
                    <span className="text-xs text-gray-700 flex-1 truncate">{solutionFile.name}</span>
                    <button onClick={() => setSolutionFile(null)} className="text-red-400 hover:text-red-600">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <button onClick={() => solutionFileRef.current?.click()}
                    className="w-full flex items-center justify-center gap-2 py-2.5 border-2 border-dashed border-purple-300 rounded-lg text-xs text-purple-600 hover:border-purple-500 hover:bg-purple-100 transition-all">
                    <Upload className="w-3.5 h-3.5" /> Click to upload solution file (optional)
                  </button>
                )}
              </div>

              <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 space-y-1">
                <p className="text-[10px] font-bold text-blue-800 flex items-center gap-1.5"><Zap className="w-3 h-3" /> What happens next:</p>
                <p className="text-[10px] text-blue-700">1. Students see this task with the template URL</p>
                <p className="text-[10px] text-blue-700">2. They click "Fork Template" → repo is forked to their GitHub</p>
                <p className="text-[10px] text-blue-700">3. Every push auto-marks their attendance as PRESENT via webhook</p>
                <p className="text-[10px] text-blue-700">4. On submit, AI evaluates their fork{solutionFile ? ' against your solution' : ''} and gives a score /5</p>
              </div>
            </div>
            <div className="flex gap-3 px-6 pb-6">
              <button onClick={() => setShowCreateTask(false)} className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 font-medium">Cancel</button>
              <button
                onClick={() => {
                  if (!taskForm.title.trim() || !taskForm.templateRepoUrl.trim()) return;
                  createTaskMut.mutate({ ...taskForm });
                }}
                disabled={!taskForm.title.trim() || !taskForm.templateRepoUrl.trim() || createTaskMut.isPending || uploadingSolution}
                className="flex-1 py-2 text-sm font-bold text-white bg-gradient-to-r from-blue-600 to-cyan-600 rounded-xl disabled:opacity-50 shadow-md flex items-center justify-center gap-2">
                {(createTaskMut.isPending || uploadingSolution) ? <><span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin inline-block" />{uploadingSolution ? 'Uploading Solution…' : 'Creating…'}</> : 'Create Sprint Task'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
