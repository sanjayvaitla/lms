import React, { useState, useRef } from 'react';
import { useQueryClient, useQuery, useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { BookOpen, Plus, Eye, Trash2, X, ExternalLink, AlertCircle } from 'lucide-react';
import api from '../../../../lib/axios';
import { AdminReference, INPUT_CLS, LABEL_CLS } from '../shared';

const REF_TYPE_META: Record<string, { icon: string; color: string; bg: string }> = {
  pdf:     { icon: '📄', color: 'text-red-700 border-red-200',       bg: 'bg-red-50' },
  video:   { icon: '🎬', color: 'text-purple-700 border-purple-200', bg: 'bg-purple-50' },
  website: { icon: '🌐', color: 'text-blue-700 border-blue-200',     bg: 'bg-blue-50' },
  ppt:     { icon: '📊', color: 'text-amber-700 border-amber-200',   bg: 'bg-amber-50' },
};

type RefItemForm = {
  enabled: boolean;
  label: string;
  url: string;       // for video / website
  file: File | null; // for pdf / ppt
  uploading: boolean;
};

function blankItemsForm(): Record<string, RefItemForm> {
  return {
    pdf:     { enabled: false, label: 'PDF Document',  url: '', file: null, uploading: false },
    video:   { enabled: false, label: 'YouTube Video', url: '', file: null, uploading: false },
    website: { enabled: false, label: 'Website Link',  url: '', file: null, uploading: false },
    ppt:     { enabled: false, label: 'PPT / Slides',  url: '', file: null, uploading: false },
  };
}

export function ReferencesTab() {
  const qc = useQueryClient();

  // Load programs to pick which one to manage
  const { data: programs = [] } = useQuery<{ id: string; title: string; company: string; batchName: string }[]>({
    queryKey: ['admin-intern-programs'],
    queryFn: async () => (await api.get('/intern/admin/programs')).data.data,
  });

  const [selectedProgramId, setSelectedProgramId] = useState('');
  const activeProgramId = selectedProgramId || programs[0]?.id || '';

  const { data: refs = [], isLoading: refsLoading } = useQuery<AdminReference[]>({
    queryKey: ['admin-intern-refs', activeProgramId],
    queryFn: async () => (await api.get(`/intern/admin/references/${activeProgramId}`)).data.data,
    enabled: !!activeProgramId,
  });

  const deleteMut = useMutation({
    mutationFn: async ({ programId, refNo }: { programId: string; refNo: number }) =>
      api.delete(`/intern/admin/references/${programId}/${refNo}`),
    onSuccess: () => {
      toast.success('Reference group deleted');
      qc.invalidateQueries({ queryKey: ['admin-intern-refs', activeProgramId] });
    },
    onError: () => toast.error('Failed to delete'),
  });

  const [showModal, setShowModal] = useState(false);
  const [detailRef, setDetailRef] = useState<AdminReference | null>(null);
  const [formTitle, setFormTitle] = useState('');
  const [itemsForm, setItemsForm] = useState<Record<string, RefItemForm>>(blankItemsForm());
  const [saving, setSaving] = useState(false);
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  function openModal() {
    setFormTitle('');
    setItemsForm(blankItemsForm());
    setShowModal(true);
  }

  function toggleType(t: string) {
    setItemsForm(prev => ({ ...prev, [t]: { ...prev[t], enabled: !prev[t].enabled, url: '', file: null } }));
  }

  function setItemField(t: string, field: string, value: unknown) {
    setItemsForm(prev => ({ ...prev, [t]: { ...prev[t], [field]: value } }));
  }

  async function uploadFile(t: string, file: File): Promise<string> {
    setItemField(t, 'uploading', true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await api.post('/intern/admin/references/upload', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return res.data.data.url as string;
    } finally {
      setItemField(t, 'uploading', false);
    }
  }

  async function handleSave() {
    if (!formTitle.trim() || !activeProgramId) return;
    const activeTypes = (['pdf', 'video', 'website', 'ppt'] as const).filter(t => itemsForm[t].enabled);
    if (activeTypes.length === 0) { toast.error('Select at least one resource type'); return; }

    setSaving(true);
    try {
      const items: Array<{ type: string; url: string; label: string }> = [];

      for (const t of activeTypes) {
        const item = itemsForm[t];
        let url = item.url.trim();

        if ((t === 'pdf' || t === 'ppt') && item.file) {
          url = await uploadFile(t, item.file);
        }

        if (!url) { toast.error(`Please provide a URL or file for ${t.toUpperCase()}`); setSaving(false); return; }
        items.push({ type: t, url, label: item.label.trim() || t.toUpperCase() });
      }

      await api.post('/intern/admin/references', {
        programId: activeProgramId,
        title: formTitle.trim(),
        items,
      });

      toast.success('Reference group created!');
      qc.invalidateQueries({ queryKey: ['admin-intern-refs', activeProgramId] });
      setShowModal(false);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to create reference');
    } finally {
      setSaving(false);
    }
  }

  const totalItems = refs.reduce((a, r) => a + r.items.length, 0);
  const countByType = (t: string) => refs.reduce((a, r) => a + r.items.filter(i => i.type === t).length, 0);
  const canSave = formTitle.trim() !== '' && (['pdf', 'video', 'website', 'ppt'] as const).some(t => {
    const item = itemsForm[t];
    return item.enabled && (item.url.trim() || item.file);
  });

  return (
    <div className="space-y-4">
      {/* Program selector */}
      {programs.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-3">
          <BookOpen className="w-4 h-4 text-blue-500 shrink-0" />
          <span className="text-xs font-semibold text-gray-600">Managing references for:</span>
          <select
            value={activeProgramId}
            onChange={e => setSelectedProgramId(e.target.value)}
            className="flex-1 border border-gray-200 rounded-xl px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
            {programs.map(p => (
              <option key={p.id} value={p.id}>
                {p.title}{p.company ? ` · ${p.company}` : ''}{p.batchName ? ` — ${p.batchName}` : ''}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        {(['pdf', 'video', 'website', 'ppt'] as const).map(t => {
          const m = REF_TYPE_META[t];
          return (
            <div key={t} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-center">
              <p className="text-2xl mb-1">{m.icon}</p>
              <p className="text-2xl font-bold text-gray-900">{countByType(t)}</p>
              <p className="text-xs text-gray-500 mt-0.5 uppercase font-semibold">{t}</p>
            </div>
          );
        })}
      </div>

      {/* Header + add */}
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <p className="text-sm font-bold text-gray-900">{refs.length} Reference Groups · {totalItems} Total Resources</p>
          <p className="text-xs text-gray-400 mt-0.5">Each group (Ref 1, Ref 2 …) bundles multiple resource types — students see them grouped</p>
        </div>
        <button onClick={openModal} disabled={!activeProgramId}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-cyan-600 text-white text-sm font-semibold rounded-xl shadow-md disabled:opacity-50">
          <Plus className="w-4 h-4" /> New Reference Group
        </button>
      </div>

      {/* Grid of reference groups */}
      {refsLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[1, 2, 3].map(i => <div key={i} className="bg-gray-100 rounded-2xl h-40 animate-pulse" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {refs.map(ref => (
            <div key={ref.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 hover:shadow-md hover:border-blue-100 transition-all">
              <div className="flex items-start justify-between gap-2 mb-3">
                <span className="text-[10px] font-bold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">REF {ref.refNo}</span>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => setDetailRef(ref)} className="p-1.5 text-blue-500 hover:bg-blue-50 rounded-lg" title="Preview">
                    <Eye className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => { if (confirm('Delete this reference group?')) deleteMut.mutate({ programId: activeProgramId, refNo: ref.refNo }); }}
                    className="p-1.5 text-red-400 hover:bg-red-50 rounded-lg">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>

              <p className="text-sm font-bold text-gray-900 mb-3">{ref.title}</p>

              {/* Chips showing included types */}
              <div className="flex flex-wrap gap-1.5 mb-3">
                {(['pdf', 'video', 'website', 'ppt'] as const).map(t => {
                  const has = ref.items.some(i => i.type === t);
                  const m = REF_TYPE_META[t];
                  return has ? (
                    <span key={t} className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${m.bg} ${m.color}`}>
                      {m.icon} {t.toUpperCase()}
                    </span>
                  ) : (
                    <span key={t} className="text-[10px] font-bold px-2 py-0.5 rounded-full border border-gray-100 bg-gray-50 text-gray-300">
                      {t.toUpperCase()}
                    </span>
                  );
                })}
              </div>

              <button onClick={() => setDetailRef(ref)}
                className="w-full text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-xl py-1.5 transition-colors flex items-center justify-center gap-1.5">
                <Eye className="w-3 h-3" /> View {ref.items.length} Resource{ref.items.length !== 1 ? 's' : ''}
              </button>
            </div>
          ))}
          {refs.length === 0 && !refsLoading && (
            <div className="col-span-3 text-center py-12 text-gray-400">
              <BookOpen className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No reference groups yet. Add one to get started.</p>
            </div>
          )}
        </div>
      )}

      {/* Detail Preview Modal */}
      {detailRef && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white">
              <div>
                <span className="text-[10px] font-bold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">REF {detailRef.refNo}</span>
                <h3 className="text-base font-bold text-gray-900 mt-1">{detailRef.title}</h3>
              </div>
              <button onClick={() => setDetailRef(null)} className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-lg"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-6 space-y-3">
              {detailRef.items.map((item, i) => {
                const m = REF_TYPE_META[item.type];
                return (
                  <div key={i} className={`rounded-xl border p-4 flex items-start gap-3 ${m.bg}`}>
                    <div className="text-xl shrink-0">{m.icon}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border bg-white ${m.color}`}>{item.type.toUpperCase()}</span>
                        <span className="text-xs font-semibold text-gray-800">{item.label}</span>
                      </div>
                      <a href={item.url} target="_blank" rel="noopener noreferrer"
                        className="text-xs text-blue-600 hover:underline font-semibold flex items-center gap-1 mt-1">
                        <ExternalLink className="w-3 h-3 shrink-0" />
                        <span className="truncate">{item.url.length > 60 ? item.url.slice(0, 60) + '…' : item.url}</span>
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Create Reference Group Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
              <h3 className="text-base font-bold text-gray-900">New Reference Group</h3>
              <button onClick={() => setShowModal(false)} className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-lg"><X className="w-4 h-4" /></button>
            </div>

            <div className="overflow-y-auto flex-1 p-6 space-y-5">
              {/* Group title */}
              <div>
                <label className={LABEL_CLS}>Reference Group Title *</label>
                <input
                  value={formTitle}
                  onChange={e => setFormTitle(e.target.value)}
                  className={INPUT_CLS}
                  placeholder="e.g. JavaScript Fundamentals" />
              </div>

              {/* Resource type checkboxes */}
              <div>
                <label className="text-xs font-bold text-gray-700 mb-3 block">
                  Select Resources to Include <span className="text-gray-400 font-normal">(check all that apply)</span>
                </label>
                <div className="space-y-3">

                  {/* PDF — file upload */}
                  {(['pdf', 'ppt'] as const).map(t => {
                    const m = REF_TYPE_META[t];
                    const item = itemsForm[t];
                    return (
                      <div key={t} className={`rounded-xl border-2 transition-all ${item.enabled ? 'border-blue-300 bg-blue-50/60' : 'border-gray-100 bg-gray-50'}`}>
                        <label className="flex items-center gap-3 p-3 cursor-pointer select-none">
                          <input type="checkbox" checked={item.enabled} onChange={() => toggleType(t)} className="w-4 h-4 accent-blue-600 shrink-0" />
                          <span className="text-lg">{m.icon}</span>
                          <div>
                            <p className="text-sm font-semibold text-gray-800">{t === 'pdf' ? 'PDF Document' : 'PPT / Slides'}</p>
                            <p className="text-[10px] text-gray-400">Upload from your computer</p>
                          </div>
                        </label>
                        {item.enabled && (
                          <div className="px-3 pb-3 space-y-2">
                            <div>
                              <label className="text-[10px] font-semibold text-gray-500 mb-1 block">Label (shown to student)</label>
                              <input value={item.label} onChange={e => setItemField(t, 'label', e.target.value)} className={INPUT_CLS} placeholder={t === 'pdf' ? 'e.g. JS Fundamentals Guide' : 'e.g. Week 1 Slides'} />
                            </div>
                            <div>
                              <label className="text-[10px] font-semibold text-gray-500 mb-1 block">
                                {t === 'pdf' ? 'PDF File' : 'PPT / PPTX File'} *
                              </label>
                              <input
                                type="file"
                                accept={t === 'pdf' ? '.pdf,application/pdf' : '.ppt,.pptx,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation'}
                                ref={el => { fileRefs.current[t] = el; }}
                                onChange={e => setItemField(t, 'file', e.target.files?.[0] ?? null)}
                                className="hidden"
                              />
                              <button
                                type="button"
                                onClick={() => fileRefs.current[t]?.click()}
                                className={`w-full border-2 border-dashed rounded-xl px-4 py-3 text-sm transition-all ${item.file ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-400 hover:border-blue-300 hover:text-blue-600'}`}>
                                {item.uploading
                                  ? '⏳ Uploading…'
                                  : item.file
                                  ? `✓ ${item.file.name}`
                                  : `Click to choose ${t.toUpperCase()} file`}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Video — URL */}
                  {(() => {
                    const t = 'video';
                    const m = REF_TYPE_META[t];
                    const item = itemsForm[t];
                    return (
                      <div className={`rounded-xl border-2 transition-all ${item.enabled ? 'border-purple-300 bg-purple-50/60' : 'border-gray-100 bg-gray-50'}`}>
                        <label className="flex items-center gap-3 p-3 cursor-pointer select-none">
                          <input type="checkbox" checked={item.enabled} onChange={() => toggleType(t)} className="w-4 h-4 accent-purple-600 shrink-0" />
                          <span className="text-lg">{m.icon}</span>
                          <div>
                            <p className="text-sm font-semibold text-gray-800">YouTube / Video URL</p>
                            <p className="text-[10px] text-gray-400">Paste a YouTube or Vimeo link</p>
                          </div>
                        </label>
                        {item.enabled && (
                          <div className="px-3 pb-3 space-y-2">
                            <div>
                              <label className="text-[10px] font-semibold text-gray-500 mb-1 block">Label</label>
                              <input value={item.label} onChange={e => setItemField(t, 'label', e.target.value)} className={INPUT_CLS} placeholder="e.g. Node.js Tutorial" />
                            </div>
                            <div>
                              <label className="text-[10px] font-semibold text-gray-500 mb-1 block">Video URL *</label>
                              <input type="url" value={item.url} onChange={e => setItemField(t, 'url', e.target.value)} className={INPUT_CLS} placeholder="https://www.youtube.com/watch?v=..." />
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* Website — URL */}
                  {(() => {
                    const t = 'website';
                    const m = REF_TYPE_META[t];
                    const item = itemsForm[t];
                    return (
                      <div className={`rounded-xl border-2 transition-all ${item.enabled ? 'border-blue-300 bg-blue-50/60' : 'border-gray-100 bg-gray-50'}`}>
                        <label className="flex items-center gap-3 p-3 cursor-pointer select-none">
                          <input type="checkbox" checked={item.enabled} onChange={() => toggleType(t)} className="w-4 h-4 accent-blue-600 shrink-0" />
                          <span className="text-lg">{m.icon}</span>
                          <div>
                            <p className="text-sm font-semibold text-gray-800">Website Link</p>
                            <p className="text-[10px] text-gray-400">Official docs, MDN, GitHub, etc.</p>
                          </div>
                        </label>
                        {item.enabled && (
                          <div className="px-3 pb-3 space-y-2">
                            <div>
                              <label className="text-[10px] font-semibold text-gray-500 mb-1 block">Label</label>
                              <input value={item.label} onChange={e => setItemField(t, 'label', e.target.value)} className={INPUT_CLS} placeholder="e.g. MDN Web Docs" />
                            </div>
                            <div>
                              <label className="text-[10px] font-semibold text-gray-500 mb-1 block">Website URL *</label>
                              <input type="url" value={item.url} onChange={e => setItemField(t, 'url', e.target.value)} className={INPUT_CLS} placeholder="https://developer.mozilla.org" />
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                 </div>
                {!(['pdf', 'video', 'website', 'ppt'] as const).some(t => itemsForm[t].enabled) && (
                  <p className="text-xs text-amber-600 mt-2 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5" /> Check at least one resource type above
                  </p>
                )}
              </div>
            </div>

            <div className="flex gap-3 px-6 py-4 border-t border-gray-100 shrink-0">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200">Cancel</button>
              <button onClick={handleSave} disabled={!canSave || saving}
                className="flex-1 py-2 text-sm font-bold text-white bg-gradient-to-r from-blue-600 to-cyan-600 rounded-xl disabled:opacity-50 flex items-center justify-center gap-2">
                {saving ? <><span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin inline-block" /> Saving…</> : 'Create Reference Group'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
