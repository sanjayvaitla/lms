import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Briefcase, CheckCircle2, Clock, DollarSign, Search, Plus, Building2, Calendar, Edit2, Trash2, X } from 'lucide-react';
import api from '../../../../lib/axios';
import { TabError, INPUT_CLS, LABEL_CLS } from '../shared';

export interface ProgramRow {
  id: string; title: string; company: string;
  batchName: string; mentorName: string;
  startDate: string; endDate: string;
  stipendPerMonth: number; isActive: boolean; description: string;
}

export type ProgramForm = Omit<ProgramRow, 'id'>;

const BLANK_PROGRAM: ProgramForm = {
  title: '', company: '', batchName: '', mentorName: '',
  startDate: '', endDate: '', stipendPerMonth: 0,
  isActive: true, description: '',
};

export function ProgramsTab() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<ProgramRow | null>(null);
  const [form, setForm] = useState<ProgramForm>(BLANK_PROGRAM);

  const { data: programs = [], isLoading, isError: programsError } = useQuery<ProgramRow[]>({
    queryKey: ['admin-intern-programs'],
    queryFn: async () => (await api.get('/intern/admin/programs')).data.data,
    retry: 2,
  });

  const createMut = useMutation({
    mutationFn: (body: ProgramForm) => api.post('/intern/admin/programs', body),
    onSuccess: () => {
      toast.success('Program created!');
      qc.invalidateQueries({ queryKey: ['admin-intern-programs'] });
      setShowModal(false);
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Failed to create'),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: ProgramForm }) => api.put(`/intern/admin/programs/${id}`, body),
    onSuccess: () => {
      toast.success('Program updated!');
      qc.invalidateQueries({ queryKey: ['admin-intern-programs'] });
      setShowModal(false);
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Failed to update'),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/intern/admin/programs/${id}`),
    onSuccess: () => {
      toast.success('Program deleted');
      qc.invalidateQueries({ queryKey: ['admin-intern-programs'] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Failed to delete'),
  });

  function openCreate() { setForm({ ...BLANK_PROGRAM }); setEditing(null); setShowModal(true); }
  function openEdit(p: ProgramRow) {
    setForm({
      title: p.title, company: p.company, batchName: '',
      mentorName: '', startDate: p.startDate, endDate: p.endDate,
      stipendPerMonth: p.stipendPerMonth, isActive: p.isActive, description: p.description || '',
    });
    setEditing(p); setShowModal(true);
  }
  function handleSave() {
    if (!form.title.trim() || !form.company.trim() || !form.startDate || !form.endDate) return;
    if (editing) updateMut.mutate({ id: editing.id, body: form });
    else createMut.mutate(form);
  }

  const filtered = programs.filter(p =>
    p.title.toLowerCase().includes(search.toLowerCase()) ||
    p.company.toLowerCase().includes(search.toLowerCase())
  );

  const saving = createMut.isPending || updateMut.isPending;

  if (programsError) return <TabError />;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Programs', value: programs.length,                             color: 'from-blue-500 to-cyan-500',    icon: Briefcase },
          { label: 'Active',         value: programs.filter(p => p.isActive).length,     color: 'from-emerald-500 to-teal-500', icon: CheckCircle2 },
          { label: 'Inactive',       value: programs.filter(p => !p.isActive).length,    color: 'from-gray-400 to-gray-500',    icon: Clock },
          { label: 'Total Stipend',  value: `₹${programs.reduce((a, p) => a + (p.stipendPerMonth || 0), 0).toLocaleString()}`, color: 'from-emerald-500 to-green-500', icon: DollarSign },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
            <div className={`w-8 h-8 rounded-xl bg-gradient-to-br ${s.color} flex items-center justify-center mb-2`}>
              <s.icon className="w-4 h-4 text-white" />
            </div>
            <p className="text-2xl font-bold text-gray-900">{s.value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by title or company…"
            className="w-full bg-white border border-gray-200 rounded-xl pl-9 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
        </div>
        <button onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-cyan-600 text-white text-sm font-semibold rounded-xl shadow-md hover:shadow-lg transition-all">
          <Plus className="w-4 h-4" /> New Program
        </button>
      </div>

      {isLoading ? (
        <div className="grid gap-3">{[1,2,3].map(i => <div key={i} className="bg-gray-100 rounded-2xl h-24 animate-pulse" />)}</div>
      ) : (
        <div className="grid gap-3">
          {filtered.length === 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center text-gray-400">
              <Briefcase className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No programs yet. Create one to get started.</p>
            </div>
          )}
          {filtered.map(p => (
            <div key={p.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 hover:border-blue-200 transition-all">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <h3 className="text-sm font-bold text-gray-900">{p.title}</h3>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${p.isActive ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-gray-100 text-gray-500 border-gray-200'}`}>
                      {p.isActive ? 'ACTIVE' : 'INACTIVE'}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-gray-500">
                    <span className="flex items-center gap-1"><Building2 className="w-3 h-3" />{p.company}</span>
                    <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{p.startDate} → {p.endDate}</span>
                    {p.stipendPerMonth > 0 && <span className="flex items-center gap-1 font-semibold text-emerald-600"><DollarSign className="w-3 h-3" />₹{p.stipendPerMonth.toLocaleString()}/mo</span>}
                  </div>
                  {p.description && <p className="text-xs text-gray-400 mt-1.5 line-clamp-1">{p.description}</p>}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => openEdit(p)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg" title="Edit">
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => { if (confirm(`Delete "${p.title}"? This also deletes all its references and tasks.`)) deleteMut.mutate(p.id); }}
                    className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg" title="Delete">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
              <h3 className="text-base font-bold text-gray-900">{editing ? 'Edit Program' : 'New Internship Program'}</h3>
              <button onClick={() => setShowModal(false)} className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-lg"><X className="w-4 h-4" /></button>
            </div>
            <div className="overflow-y-auto flex-1 p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className={LABEL_CLS}>Program Title *</label>
                  <input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} className={INPUT_CLS} placeholder="Full Stack Development Internship" />
                </div>
                <div>
                  <label className={LABEL_CLS}>Company / Partner *</label>
                  <input value={form.company} onChange={e => setForm(p => ({ ...p, company: e.target.value }))} className={INPUT_CLS} placeholder="TechCorp Solutions" />
                </div>
                <div>
                  <label className={LABEL_CLS}>Stipend / Month (₹)</label>
                  <input type="number" min={0} value={form.stipendPerMonth} onChange={e => setForm(p => ({ ...p, stipendPerMonth: +e.target.value }))} className={INPUT_CLS} />
                </div>
                <div>
                  <label className={LABEL_CLS}>Start Date *</label>
                  <input type="date" value={form.startDate} onChange={e => setForm(p => ({ ...p, startDate: e.target.value }))} className={INPUT_CLS} />
                </div>
                <div>
                  <label className={LABEL_CLS}>End Date *</label>
                  <input type="date" value={form.endDate} onChange={e => setForm(p => ({ ...p, endDate: e.target.value }))} className={INPUT_CLS} />
                </div>
              </div>
              <div>
                <label className={LABEL_CLS}>Description</label>
                <textarea rows={3} value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                  className={`${INPUT_CLS} resize-none`} placeholder="Brief overview of the internship program…" />
              </div>
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input type="checkbox" checked={form.isActive} onChange={e => setForm(p => ({ ...p, isActive: e.target.checked }))} className="w-4 h-4 accent-blue-600" />
                <span className="text-sm font-medium text-gray-700">Mark as Active</span>
              </label>
            </div>
            <div className="flex gap-3 px-6 py-4 border-t border-gray-100 shrink-0">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200">Cancel</button>
              <button onClick={handleSave} disabled={!form.title.trim() || !form.company.trim() || !form.startDate || !form.endDate || saving}
                className="flex-1 py-2 text-sm font-bold text-white bg-gradient-to-r from-blue-600 to-cyan-600 rounded-xl disabled:opacity-50 flex items-center justify-center gap-2">
                {saving ? <><span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin inline-block" /> Saving…</> : (editing ? 'Save Changes' : 'Create Program')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
