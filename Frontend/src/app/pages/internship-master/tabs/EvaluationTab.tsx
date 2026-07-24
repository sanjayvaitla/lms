import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Star, Plus, X } from 'lucide-react';
import api from '../../../../lib/axios';

const INPUT_CLS = "w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all";
const LABEL_CLS = "text-xs font-semibold text-gray-600 mb-1.5 block";

interface ProgramStudent { studentId: string; name: string; }

const EVAL_PARAMS = [
  { key: 'attendance', category: 'Attendance', label: 'Attendance', max: 10 },
  { key: 'technical', category: 'Technical Skills', label: 'Technical Skills', max: 20 },
  { key: 'communication', category: 'Communication', label: 'Communication', max: 15 },
  { key: 'problemSolving', category: 'Problem Solving', label: 'Problem Solving', max: 20 },
  { key: 'teamwork', category: 'Teamwork', label: 'Teamwork', max: 10 },
  { key: 'projectCompletion', category: 'Project Completion', label: 'Project Completion', max: 25 },
];

function calcRating(total: number) {
  if (total >= 90) return 'Excellent';
  if (total >= 75) return 'Very Good';
  if (total >= 60) return 'Good';
  if (total >= 40) return 'Average';
  return 'Needs Improvement';
}

function ratingColor(rating: string) {
  switch (rating) {
    case 'Excellent': return 'text-purple-600';
    case 'Very Good': return 'text-blue-600';
    case 'Good': return 'text-emerald-600';
    case 'Average': return 'text-amber-600';
    default: return 'text-red-600';
  }
}

export function EvaluationTab() {
  const qc = useQueryClient();
  const [selectedProgramId, setSelectedProgramId] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ studentId: '', attendance: 0, technical: 0, communication: 0, problemSolving: 0, teamwork: 0, projectCompletion: 0 });

  const { data: programs = [] } = useQuery<{ id: string; title: string; company: string }[]>({
    queryKey: ['admin-intern-programs'],
    queryFn: async () => (await api.get('/intern/admin/programs')).data.data,
  });

  useEffect(() => {
    if (!selectedProgramId && programs.length > 0) setSelectedProgramId(programs[0].id);
  }, [programs, selectedProgramId]);

  const { data: enrolledStudents = [] } = useQuery<ProgramStudent[]>({
    queryKey: ['admin-intern-program-students', selectedProgramId],
    queryFn: async () => (await api.get(`/intern/admin/programs/${selectedProgramId}/students`)).data.data,
    enabled: !!selectedProgramId,
  });

  const { data: evals = [], isLoading } = useQuery<any[]>({
    queryKey: ['admin-intern-evaluations', selectedProgramId],
    queryFn: async () => (await api.get(`/intern/admin/evaluations?programId=${selectedProgramId}`)).data.data,
    enabled: !!selectedProgramId,
  });

  const saveMut = useMutation({
    mutationFn: () => api.post('/intern/admin/evaluations', {
      studentId: form.studentId,
      programId: selectedProgramId,
      categories: EVAL_PARAMS.map(p => ({
        category: p.category,
        score: (form as any)[p.key],
        maxScore: p.max,
        feedback: '',
      })),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-intern-evaluations', selectedProgramId] });
      setShowModal(false);
      setForm({ studentId: '', attendance: 0, technical: 0, communication: 0, problemSolving: 0, teamwork: 0, projectCompletion: 0 });
      toast.success('Evaluation saved');
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Failed to save evaluation'),
  });

  const total = form.attendance + form.technical + form.communication + form.problemSolving + form.teamwork + form.projectCompletion;
  const catScore = (categories: any[], name: string) => categories?.find((c: any) => c.category === name)?.score ?? 0;

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-3 flex-wrap">
        <Star className="w-4 h-4 text-blue-500 shrink-0" />
        <select value={selectedProgramId} onChange={e => setSelectedProgramId(e.target.value)} className={INPUT_CLS + ' flex-1 min-w-48'}>
          {programs.map(p => <option key={p.id} value={p.id}>{p.title} — {p.company}</option>)}
        </select>
        <button onClick={() => setShowModal(true)} disabled={!selectedProgramId}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-cyan-600 text-white text-sm font-semibold rounded-xl shadow-md disabled:opacity-50">
          <Plus className="w-4 h-4" /> Add Evaluation
        </button>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-600">Total weightage: <span className="font-bold text-gray-900">100 marks</span></p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {[
          { range: '90-100', label: 'Excellent', color: 'bg-purple-100 text-purple-700' },
          { range: '75-89', label: 'Very Good', color: 'bg-blue-100 text-blue-700' },
          { range: '60-74', label: 'Good', color: 'bg-emerald-100 text-emerald-700' },
          { range: '40-59', label: 'Average', color: 'bg-amber-100 text-amber-700' },
          { range: '<40', label: 'Needs Improvement', color: 'bg-red-100 text-red-700' },
        ].map(r => (
          <div key={r.range} className={`${r.color} rounded-xl px-3 py-2 text-center`}>
            <p className="text-xs font-bold">{r.range}</p>
            <p className="text-[10px] font-semibold">{r.label}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-3">
        {isLoading ? (
          <div className="text-center py-8 text-gray-400 text-xs">Loading evaluations…</div>
        ) : evals.filter(e => e.categories?.length > 0).length === 0 ? (
          <div className="text-center py-12 text-gray-400 text-xs">No evaluations yet. Add one for an enrolled student.</div>
        ) : evals.filter(e => e.categories?.length > 0).map(e => (
          <div key={e.studentId} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-start justify-between mb-4">
              <div>
                <p className="font-bold text-gray-900">{e.studentName}</p>
                <p className="text-xs text-gray-500">{e.company}</p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-gray-900">{e.total}<span className="text-sm text-gray-400">/{e.maxTotal || 100}</span></p>
                <p className={`text-sm font-bold ${ratingColor(e.rating)}`}>{e.rating}</p>
              </div>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              {EVAL_PARAMS.map(p => (
                <div key={p.key} className="text-center bg-gray-50 rounded-xl py-2 px-1">
                  <p className="text-xs font-bold text-gray-900">{catScore(e.categories, p.category)}<span className="text-gray-400">/{p.max}</span></p>
                  <p className="text-[9px] text-gray-500 mt-0.5 leading-tight">{p.label}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white">
              <h3 className="text-base font-bold text-gray-900">Mentor Evaluation</h3>
              <button onClick={() => setShowModal(false)} className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-lg"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className={LABEL_CLS}>Student *</label>
                <select value={form.studentId} onChange={e => setForm(prev => ({ ...prev, studentId: e.target.value }))} className={INPUT_CLS}>
                  <option value="">Select student…</option>
                  {enrolledStudents.map(s => <option key={s.studentId} value={s.studentId}>{s.name}</option>)}
                </select>
              </div>
              {EVAL_PARAMS.map(p => (
                <div key={p.key}>
                  <div className="flex justify-between items-center mb-1.5">
                    <label className="text-xs font-semibold text-gray-600">{p.label}</label>
                    <span className="text-xs font-bold text-blue-600">{(form as any)[p.key]}/{p.max}</span>
                  </div>
                  <input type="range" min={0} max={p.max} value={(form as any)[p.key]}
                    onChange={e => setForm(prev => ({ ...prev, [p.key]: +e.target.value }))}
                    className="w-full accent-blue-600" />
                </div>
              ))}
              <div className="bg-blue-50 rounded-xl p-3 text-center">
                <p className="text-sm text-gray-600">Total Score</p>
                <p className="text-3xl font-bold text-blue-700">{total}<span className="text-base text-gray-400">/100</span></p>
                <p className={`text-sm font-bold mt-1 ${ratingColor(calcRating(total))}`}>{calcRating(total)}</p>
              </div>
            </div>
            <div className="flex gap-3 px-6 pb-6">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 font-medium">Cancel</button>
              <button onClick={() => saveMut.mutate()} disabled={!form.studentId || saveMut.isPending}
                className="flex-1 py-2 text-sm font-bold text-white bg-gradient-to-r from-blue-600 to-cyan-600 rounded-xl disabled:opacity-50">
                Save Evaluation
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
