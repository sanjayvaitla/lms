import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FolderKanban, GitBranch } from 'lucide-react';
import api from '../../../../lib/axios';
import { statusBadge, SprintTask, StudentGitHubProgress, GitHubPipelineStatus } from '../shared';

const INPUT_CLS = "w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all";

export function ProjectsTab() {
  const [selectedProgramId, setSelectedProgramId] = useState('');

  const { data: programs = [] } = useQuery<{ id: string; title: string; company: string }[]>({
    queryKey: ['admin-intern-programs'],
    queryFn: async () => (await api.get('/intern/admin/programs')).data.data,
  });

  useEffect(() => {
    if (!selectedProgramId && programs.length > 0) setSelectedProgramId(programs[0].id);
  }, [programs, selectedProgramId]);

  const { data: tasks = [] } = useQuery<SprintTask[]>({
    queryKey: ['admin-tasks', selectedProgramId],
    queryFn: async () => (await api.get(`/intern/admin/programs/${selectedProgramId}/tasks`)).data.data,
    enabled: !!selectedProgramId,
  });

  const { data: progress = [], isLoading } = useQuery<StudentGitHubProgress[]>({
    queryKey: ['admin-pipeline', selectedProgramId],
    queryFn: async () => (await api.get(`/intern/admin/programs/${selectedProgramId}/pipeline`)).data.data,
    enabled: !!selectedProgramId,
  });

  const taskMap = Object.fromEntries(tasks.map(t => [t.id, t]));
  const grouped = [...progress.reduce((map, p) => {
    const key = p.studentId ?? p.studentName;
    const entry = map.get(key) ?? { studentId: key, studentName: p.studentName, items: [] as StudentGitHubProgress[] };
    entry.items.push(p);
    map.set(key, entry);
    return map;
  }, new Map<string, { studentId: string; studentName: string; items: StudentGitHubProgress[] }>()).values()];

  const stepIdx = (s: GitHubPipelineStatus) =>
    ['NOT_STARTED', 'FORKED', 'CODING', 'SUBMITTED', 'AI_GRADED'].indexOf(s);

  const totalStudents = grouped.length;
  const inProgress = grouped.filter(g => g.items.some(i => i.status !== 'NOT_STARTED' && i.status !== 'AI_GRADED')).length;
  const completed = grouped.filter(g => g.items.length > 0 && g.items.every(i => i.status === 'AI_GRADED')).length;

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-3 flex-wrap">
        <FolderKanban className="w-4 h-4 text-blue-500 shrink-0" />
        <select value={selectedProgramId} onChange={e => setSelectedProgramId(e.target.value)} className={INPUT_CLS + ' flex-1 min-w-48'}>
          {programs.map(p => <option key={p.id} value={p.id}>{p.title} — {p.company}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Students', value: totalStudents, color: 'text-blue-600' },
          { label: 'In Progress', value: inProgress, color: 'text-cyan-600' },
          { label: 'All Graded', value: completed, color: 'text-emerald-600' },
          { label: 'Sprint Tasks', value: tasks.length, color: 'text-purple-600' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 text-center">
            <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-[10px] text-gray-500 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-gray-400 text-xs">Loading pipeline…</div>
      ) : grouped.length === 0 ? (
        <div className="text-center py-12 text-gray-400 text-xs">No student task progress yet. Create sprint tasks in the GitHub tab.</div>
      ) : (
        <div className="grid gap-4">
          {grouped.map(group => {
            const graded = group.items.filter(i => i.status === 'AI_GRADED').length;
            const pct = group.items.length > 0 ? Math.round((graded / group.items.length) * 100) : 0;
            return (
              <div key={group.studentId || group.studentName} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 hover:border-blue-200 transition-colors">
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center flex-shrink-0">
                      <FolderKanban className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <p className="font-bold text-gray-900">{group.studentName}</p>
                      <p className="text-xs text-gray-500">{graded}/{group.items.length} tasks graded</p>
                    </div>
                  </div>
                  {statusBadge(pct === 100 ? 'COMPLETED' : pct === 0 ? 'NOT_STARTED' : 'IN_PROGRESS')}
                </div>
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className={`h-2.5 rounded-full ${pct === 100 ? 'bg-emerald-500' : pct > 50 ? 'bg-blue-500' : 'bg-amber-500'}`} style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-sm font-bold text-gray-700 w-10 text-right">{pct}%</span>
                </div>
                <div className="space-y-2">
                  {group.items.map(item => {
                    const task = taskMap[item.taskId];
                    const idx = stepIdx(item.status);
                    return (
                      <div key={item.id} className="border border-gray-100 rounded-xl p-3">
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <p className="text-xs font-semibold text-gray-800">{task?.title ?? `Task ${item.taskId.slice(0, 8)}`}</p>
                          {statusBadge(item.status)}
                        </div>
                        <div className="flex gap-1">
                          {['NOT_STARTED', 'FORKED', 'CODING', 'SUBMITTED', 'AI_GRADED'].map((step, i) => (
                            <div key={step} className={`flex-1 h-1.5 rounded-full ${i <= idx ? 'bg-blue-500' : 'bg-gray-100'}`} />
                          ))}
                        </div>
                        <div className="flex items-center gap-3 mt-2 text-[10px] text-gray-500 flex-wrap">
                          {item.forkUrl && (
                            <a href={item.forkUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline flex items-center gap-1">
                              <GitBranch className="w-3 h-3" /> Fork
                            </a>
                          )}
                          {item.commitCount > 0 && <span>{item.commitCount} commits</span>}
                          {item.aiScore != null && <span className="text-amber-600 font-bold">{item.aiScore}/5 AI</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
