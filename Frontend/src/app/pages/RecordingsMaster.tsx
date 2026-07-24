import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Video, Clock, Link2, Trash2, Plus, X, Loader2,
  CheckCircle2, AlertCircle, RefreshCw, ChevronDown, ChevronRight,
  Calendar, Layers, Edit2, ExternalLink, Eye,
} from 'lucide-react';
import { toast } from 'sonner';
import api from '../../lib/axios';
import { useCourseList } from '../../lib/courseList';
import {
  contentMasterCourseQueryOptions,
  contentMasterBatchQueryOptions,
} from '../../lib/contentMasterSessions';
import { refreshAfterSessionChange } from '../../lib/lmsCache';
import { useInAppViewer } from '../components/ui/InAppDocumentViewer';

// ── Types ─────────────────────────────────────────────────────────────────────
interface BatchOption {
  id: string; name: string; status: string;
  courses: { id: string; title: string }[];
}
interface Recording {
  id: string; moduleId: string; batchId: string | null;
  title: string; youtubeUrl: string | null;
  recordedDate: string | null; availableFrom: string | null;
  moduleTitle: string; section: string; sessionNumber: string;
  batchName?: string | null;
}
interface SectionGroup {
  section: string;
  sessions: { id: string; title: string; sessionNumber: string; status: string; courseId?: string }[];
}

// ── Add / Edit Recording Modal ────────────────────────────────────────────────
function AddRecordingModal({
  moduleId, moduleTitle, batchId: fixedBatchId, courseId, existing, onClose, onSaved,
}: {
  moduleId: string; moduleTitle: string;
  batchId?: string;
  courseId?: string;
  existing?: Recording;
  onClose: () => void; onSaved: () => void;
}) {
  const isCourseFirst = !fixedBatchId;
  const [title,        setTitle]  = useState(existing?.title ?? moduleTitle);
  const [youtubeUrl,   setUrl]    = useState(existing?.youtubeUrl ?? '');
  const [recordedDate, setDate]   = useState(
    existing?.recordedDate ?? new Date().toISOString().split('T')[0],
  );
  const [endTime, setEndTime] = useState(existing ? '' : '11:00');
  const [batchId, setBatchId] = useState(fixedBatchId ?? existing?.batchId ?? '');

  const { data: courseBatches = [] } = useQuery<{ id: string; name: string; status: string }[]>({
    queryKey: ['batches-for-recording', courseId],
    queryFn: async () => {
      const { data } = await api.get('/batches', { params: { courseId } });
      return Array.isArray(data.data) ? data.data : data.data?.batches ?? [];
    },
    enabled: !!courseId && !fixedBatchId,
  });

  const mut = useMutation({
    mutationFn: () => {
      const payload: Record<string, string> = {
        moduleId, title, youtubeUrl, recordedDate, endTime,
      };
      if (batchId) payload.batchId = batchId;
      return api.post('/recordings/recordings', payload);
    },
    onSuccess: () => {
      toast.success(existing ? 'Recording updated!' : 'Recording saved — will apply when course is mapped to a batch');
      onSaved();
      onClose();
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Failed to save'),
  });

  const isValidYt = /^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\/.+/i.test(youtubeUrl);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl border border-gray-200">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-red-50 border border-red-200 flex items-center justify-center">
              <Video className="w-4 h-4 text-red-600" />
            </div>
            <div>
              <p className="text-sm font-bold text-gray-900">
                {existing ? 'Update Recording' : 'Add Recording'}
              </p>
              <p className="text-xs text-gray-400 truncate max-w-[200px]">{moduleTitle}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {!fixedBatchId && courseBatches.length > 0 && (
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Batch (optional)</label>
              <select
                value={batchId}
                onChange={(e) => setBatchId(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-400"
              >
                <option value="">All batches (when mapped in Batch Master)</option>
                {courseBatches.map((b) => (
                  <option key={b.id} value={b.id}>{b.name} ({b.status})</option>
                ))}
              </select>
              <p className="text-[11px] text-gray-400 mt-1">
                Leave empty to save at course level — auto-applies when you link this course to a batch.
              </p>
            </div>
          )}
          {isCourseFirst && courseBatches.length === 0 && (
            <p className="text-xs text-blue-700 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
              No batch linked yet — recording saves at course level and appears for students once you map the course in Batch Master.
            </p>
          )}
          {/* Title */}
          <div>
            <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Recording Title *</label>
            <input value={title} onChange={e => setTitle(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-400" />
          </div>

          {/* YouTube URL */}
          <div>
            <label className="text-xs font-semibold text-gray-600 mb-1.5 block">YouTube Video URL *</label>
            <div className="relative">
              <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                value={youtubeUrl}
                onChange={e => setUrl(e.target.value)}
                placeholder="https://youtube.com/watch?v=... or https://youtu.be/..."
                className={`w-full border rounded-xl pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 transition-colors ${
                  youtubeUrl && !isValidYt
                    ? 'border-red-300 focus:ring-red-500/20 focus:border-red-400'
                    : 'border-gray-200 focus:ring-red-500/20 focus:border-red-400'
                }`}
              />
            </div>
            {youtubeUrl && !isValidYt && (
              <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                Must be a valid YouTube URL (youtube.com or youtu.be)
              </p>
            )}
            {isValidYt && (
              <p className="text-xs text-emerald-600 mt-1 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> Valid YouTube URL
              </p>
            )}
            <p className="text-[11px] text-gray-400 mt-1">
              Paste the YouTube link. Works with private, unlisted, or public videos.
            </p>
          </div>

          {/* Date + End Time */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Recorded Date *</label>
              <input type="date" value={recordedDate} onChange={e => setDate(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-400" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Class End Time *</label>
              <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-400" />
            </div>
          </div>

          <p className="text-[11px] text-gray-400 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 flex items-start gap-1.5">
            <Clock className="w-3 h-3 text-amber-500 mt-0.5 shrink-0" />
            Recording will be visible to students 4 hours after the end time on the recorded date.
          </p>
        </div>

        <div className="flex gap-3 px-5 pb-5">
          <button onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 font-medium">
            Cancel
          </button>
          <button
            onClick={() => mut.mutate()}
            disabled={mut.isPending || !title.trim() || !isValidYt || !recordedDate || !endTime}
            className="flex-1 flex items-center justify-center gap-2 py-2 text-sm font-bold text-white bg-gradient-to-r from-red-500 to-rose-600 rounded-xl hover:from-red-600 hover:to-rose-700 disabled:opacity-50 shadow-md transition-all">
            {mut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            {existing ? 'Update Link' : 'Save Recording'}
          </button>
        </div>
      </div>
    </div>
  );
}

const REC_GRADIENTS = [
  'from-blue-500 to-cyan-500',
  'from-purple-500 to-pink-500',
  'from-emerald-500 to-teal-500',
  'from-orange-500 to-amber-500',
  'from-rose-500 to-red-500',
  'from-indigo-500 to-violet-500',
];

// ── Course recording card (sessions for one course inside a batch) ────────────

function CourseRecordingCard({
  course, batchId, batchSections, recordings, onRefreshRec, index, isOpen, onToggle,
}: {
  course: { id: string; title: string };
  batchId: string;
  batchSections: SectionGroup[];
  recordings: Recording[];
  onRefreshRec: () => void;
  index: number;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const qc = useQueryClient();
  const { open: openDoc, viewer: docViewer } = useInAppViewer();
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [addModal, setAddModal] = useState<{
    moduleId: string; moduleTitle: string; existing?: Recording;
  } | null>(null);
  const gradient = REC_GRADIENTS[index % REC_GRADIENTS.length];

  const delMut = useMutation({
    mutationFn: (id: string) => api.delete(`/recordings/recordings/${id}`),
    onSuccess: () => { toast.success('Recording removed'); onRefreshRec(); },
    onError: () => toast.error('Failed to delete'),
  });

  const courseSections = useMemo(() => {
    return batchSections
      .map(sec => ({ ...sec, sessions: sec.sessions.filter(s => String(s.courseId) === String(course.id)) }))
      .filter(sec => sec.sessions.length > 0);
  }, [batchSections, course.id]);

  const recMap = Object.fromEntries(recordings.map(r => [r.moduleId, r]));
  const linkedCount = courseSections.flatMap(s => s.sessions).filter(s => recMap[s.id]).length;

  function toggleSection(s: string) {
    setExpandedSections(prev => { const n = new Set(prev); n.has(s) ? n.delete(s) : n.add(s); return n; });
  }

  return (
    <>
      {addModal && (
        <AddRecordingModal
          moduleId={addModal.moduleId}
          moduleTitle={addModal.moduleTitle}
          batchId={batchId}
          existing={addModal.existing}
          onClose={() => setAddModal(null)}
          onSaved={() => {
            setAddModal(null);
            qc.invalidateQueries({ queryKey: ['batch-recordings', batchId] });
          }}
        />
      )}
      <div className={`rounded-xl border overflow-hidden transition-all ${isOpen ? 'border-blue-200' : 'border-gray-100'}`}>
        <button onClick={onToggle} className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
          isOpen ? 'bg-gradient-to-r from-blue-50 to-cyan-50 hover:from-blue-100 hover:to-cyan-100' : 'bg-white hover:bg-gray-50'
        }`}>
          <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${gradient} flex items-center justify-center flex-shrink-0 shadow-sm`}>
            <Video className="w-3.5 h-3.5 text-white" />
          </div>
          <div className="flex-1 min-w-0 text-left">
            <span className={`text-sm font-semibold ${isOpen ? 'text-blue-800' : 'text-gray-800'}`}>{course.title}</span>
          </div>
          {linkedCount > 0 && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-semibold flex-shrink-0">
              {linkedCount} linked
            </span>
          )}
          <ChevronDown className={`w-4 h-4 flex-shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180 text-blue-500' : 'text-gray-400'}`} />
        </button>

        {isOpen && (
          <div className="border-t border-blue-100 bg-white">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100">
              <span className="text-xs text-gray-400">Available 4 hrs after class end time</span>
              <button onClick={onRefreshRec}
                className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 font-medium">
                <RefreshCw className="w-3 h-3" /> Refresh
              </button>
            </div>
            <div className="p-3 space-y-2">
              {courseSections.length === 0 ? (
                <div className="flex flex-col items-center py-8 gap-2">
                  <Video className="w-6 h-6 text-gray-300" />
                  <p className="text-gray-400 text-sm">No sessions found.</p>
                </div>
              ) : courseSections.map((sec, secIdx) => {
                const isSecOpen = expandedSections.has(sec.section);
                const secLinked = sec.sessions.filter(s => recMap[s.id]).length;
                const secGradient = REC_GRADIENTS[secIdx % REC_GRADIENTS.length];
                return (
                  <div key={sec.section} className="rounded-xl border border-gray-100 overflow-hidden">
                    <button onClick={() => toggleSection(sec.section)}
                      className="w-full flex items-center justify-between px-4 py-3 bg-gradient-to-r from-blue-50 to-cyan-50 hover:from-blue-100 hover:to-cyan-100 transition-colors border-b border-blue-100">
                      <div className="flex items-center gap-2">
                        <div className={`w-6 h-6 rounded-lg bg-gradient-to-br ${secGradient} flex items-center justify-center flex-shrink-0`}>
                          <Layers className="w-3 h-3 text-white" />
                        </div>
                        <span className="text-sm font-bold text-blue-800">{sec.section}</span>
                        <span className="text-[10px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full font-semibold">
                          {sec.sessions.length} sessions · {secLinked} linked
                        </span>
                      </div>
                      <ChevronDown className={`w-4 h-4 text-blue-400 transition-transform duration-200 ${isSecOpen ? 'rotate-180' : ''}`} />
                    </button>
                    {isSecOpen && (
                      <div className="divide-y divide-gray-50 bg-white">
                        {sec.sessions.map(sess => {
                          const rec = recMap[sess.id];
                          return (
                            <div key={sess.id} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50/60 transition-colors">
                              <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-600 shrink-0">
                                {sess.sessionNumber ?? '?'}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-800 truncate">{sess.title}</p>
                                {rec ? (
                                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border bg-emerald-100 text-emerald-700 border-emerald-200">
                                      <CheckCircle2 className="w-3 h-3" /> Linked
                                    </span>
                                    {rec.recordedDate && (
                                      <span className="text-xs text-gray-400 flex items-center gap-1">
                                        <Calendar className="w-3 h-3" />{rec.recordedDate}
                                      </span>
                                    )}
                                    {rec.youtubeUrl && (
                                      <button
                                        type="button"
                                        onClick={() => openDoc({ url: rec.youtubeUrl!, title: rec.title || sess.title })}
                                        className="text-xs text-blue-500 hover:text-blue-700 flex items-center gap-0.5"
                                      >
                                        <Eye className="w-3 h-3" /> Preview in LMS
                                      </button>
                                    )}
                                  </div>
                                ) : (
                                  <p className="text-xs text-gray-400 mt-0.5">No recording linked yet</p>
                                )}
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                {rec && (
                                  <button
                                    onClick={() => { if (confirm('Remove this recording link?')) delMut.mutate(rec.id); }}
                                    className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                                <button
                                  onClick={() => setAddModal({ moduleId: sess.id, moduleTitle: sess.title, existing: rec })}
                                  className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg border transition-all ${
                                    rec
                                      ? 'text-gray-500 border-gray-200 hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50'
                                      : 'text-blue-600 border-blue-200 bg-blue-50 hover:bg-blue-100'
                                  }`}>
                                  {rec ? <><Edit2 className="w-3 h-3" /> Edit</> : <><Link2 className="w-3 h-3" /> Link</>}
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
      {docViewer}
    </>
  );
}

// ── Course-first recording accordion ──────────────────────────────────────────

interface CourseRecOption { id: string; title: string; colorToken?: string; }

function CourseRecordingAccordion({ course, isOpen, onToggle, index }: {
  course: CourseRecOption; isOpen: boolean; onToggle: () => void; index: number;
}) {
  const qc = useQueryClient();
  const { open: openDoc, viewer: docViewer } = useInAppViewer();
  const gradient = REC_GRADIENTS[index % REC_GRADIENTS.length];
  const [addModal, setAddModal] = useState<{ moduleId: string; moduleTitle: string; existing?: Recording } | null>(null);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());

  const { data: contentData, isLoading: loadingContent, refetch: refetchContent } = useQuery({
    ...contentMasterCourseQueryOptions(course.id),
    enabled: isOpen,
    select: (data) => ({ sections: data.sections }),
  });

  const { data: recordings = [], refetch: refetchRec } = useQuery({
    queryKey: ['course-recordings', course.id],
    queryFn: async () =>
      (await api.get(`/recordings/courses/${course.id}/recordings`)).data.data as Recording[],
    enabled: isOpen,
  });

  const sections = contentData?.sections ?? [];
  const recsByModule = useMemo(() => {
    const m = new Map<string, Recording>();
    for (const r of recordings) {
      const prev = m.get(r.moduleId);
      if (!prev || r.batchId === null) m.set(r.moduleId, r);
      else if (!prev.batchId) m.set(r.moduleId, prev);
      else if (!m.has(r.moduleId)) m.set(r.moduleId, r);
    }
    return m;
  }, [recordings]);

  useEffect(() => {
    if (isOpen) setExpandedSections(new Set(sections.map((s) => s.section)));
    else setExpandedSections(new Set());
  }, [isOpen, sections.map((s) => s.section).join('|')]);

  const delMut = useMutation({
    mutationFn: (id: string) => api.delete(`/recordings/recordings/${id}`),
    onSuccess: () => {
      toast.success('Recording removed');
      refetchRec();
      void refreshAfterSessionChange(qc, { courseId: course.id });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Failed'),
  });

  return (
    <>
      {addModal && (
        <AddRecordingModal
          moduleId={addModal.moduleId}
          moduleTitle={addModal.moduleTitle}
          courseId={course.id}
          existing={addModal.existing}
          onClose={() => setAddModal(null)}
          onSaved={() => {
            setAddModal(null);
            refetchRec();
            refetchContent();
            void refreshAfterSessionChange(qc, { courseId: course.id });
          }}
        />
      )}
      <div className={`rounded-2xl border overflow-hidden shadow-sm transition-all ${isOpen ? 'border-blue-200' : 'border-gray-100'}`}>
        <button type="button" onClick={onToggle} className={`w-full flex items-center gap-4 px-5 py-4 text-left transition-colors ${
          isOpen ? 'bg-gradient-to-r from-blue-50 to-cyan-50 hover:from-blue-100 hover:to-cyan-100' : 'bg-white hover:bg-gray-50'
        }`}>
          <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center flex-shrink-0 shadow-sm`}>
            <Video className="w-4 h-4 text-white" />
          </div>
          <div className="flex-1 min-w-0 text-left">
            <span className={`text-sm font-bold ${isOpen ? 'text-blue-800' : 'text-gray-800'}`}>{course.title}</span>
            <p className="text-xs text-gray-400 mt-0.5">Save recordings now — they apply when course is mapped to a batch</p>
          </div>
          {isOpen ? <ChevronDown className="w-4 h-4 text-blue-500" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
        </button>
        {isOpen && (
          <div className="border-t border-blue-100 bg-white p-3 space-y-2">
            {loadingContent ? (
              [1, 2].map((i) => <div key={i} className="h-12 rounded-xl bg-gray-100 animate-pulse" />)
            ) : sections.length === 0 ? (
              <div className="flex flex-col items-center py-8 gap-2 text-gray-400 text-sm">
                <AlertCircle className="w-5 h-5" />
                No sessions — add curriculum in Curriculum Master first
              </div>
            ) : sections.map((sec, secIdx) => {
              const isSecOpen = expandedSections.has(sec.section);
              const secGradient = REC_GRADIENTS[secIdx % REC_GRADIENTS.length];
              return (
                <div key={sec.section} className="rounded-xl border border-gray-100 overflow-hidden">
                  <button type="button" onClick={() => setExpandedSections((prev) => {
                    const n = new Set(prev); n.has(sec.section) ? n.delete(sec.section) : n.add(sec.section); return n;
                  })}
                    className="w-full flex items-center justify-between px-4 py-3 bg-gradient-to-r from-blue-50 to-cyan-50 border-b border-blue-100">
                    <div className="flex items-center gap-2">
                      <div className={`w-6 h-6 rounded-lg bg-gradient-to-br ${secGradient} flex items-center justify-center`}>
                        <Layers className="w-3 h-3 text-white" />
                      </div>
                      <span className="text-sm font-bold text-blue-800">{sec.section}</span>
                    </div>
                    <ChevronDown className={`w-4 h-4 text-blue-400 transition-transform ${isSecOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {isSecOpen && (
                    <div className="divide-y divide-gray-50">
                      {sec.sessions.map((sess) => {
                        const rec = recsByModule.get(sess.id);
                        return (
                          <div key={sess.id} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50/60">
                            <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-600 shrink-0">
                              {sess.sessionNumber ?? '?'}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-800 truncate">{sess.title}</p>
                              {rec ? (
                                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-semibold">
                                    {rec.batchId ? (rec.batchName ?? 'Batch') : 'Course — pending batch'}
                                  </span>
                                  {rec.youtubeUrl && (
                                    <button
                                      type="button"
                                      onClick={() => openDoc({ url: rec.youtubeUrl!, title: rec.title || sess.title })}
                                      className="text-xs text-blue-500 flex items-center gap-0.5"
                                    >
                                      <Eye className="w-3 h-3" /> Preview in LMS
                                    </button>
                                  )}
                                  <button type="button" onClick={() => { if (confirm('Remove?')) delMut.mutate(rec.id); }}
                                    className="text-xs text-red-500 hover:text-red-700">Remove</button>
                                </div>
                              ) : (
                                <p className="text-xs text-gray-400 mt-0.5">No recording linked yet</p>
                              )}
                            </div>
                            <button type="button" onClick={() => setAddModal({ moduleId: sess.id, moduleTitle: sess.title, existing: rec })}
                              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg border text-blue-600 border-blue-200 bg-blue-50 hover:bg-blue-100 shrink-0">
                              <Link2 className="w-3 h-3" /> {rec ? 'Edit' : 'Link'}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      {docViewer}
    </>
  );
}

// ── Batch recording accordion (top-level batch card) ─────────────────────────

function BatchRecordingAccordion({ batch, isOpen, onToggle, index }: {
  batch: BatchOption; isOpen: boolean; onToggle: () => void; index: number;
}) {
  const [openCourseIds, setOpenCourseIds] = useState<Set<string>>(() => new Set());
  const gradient = REC_GRADIENTS[index % REC_GRADIENTS.length];
  const courseIdsKey = batch.courses.map((c) => c.id).join(',');

  // Courses open by default when batch expands
  useEffect(() => {
    if (isOpen) {
      setOpenCourseIds(new Set(batch.courses.map((c) => c.id)));
    } else {
      setOpenCourseIds(new Set());
    }
  }, [isOpen, batch.id, courseIdsKey]);

  const { data: recordings = [], isLoading: loadingRec, refetch: refetchRec } = useQuery({
    queryKey: ['batch-recordings', batch.id],
    queryFn: async () =>
      (await api.get(`/recordings/batches/${batch.id}/recordings`)).data.data as Recording[],
    enabled: isOpen,
  });

  const { data: contentData, isLoading: loadingContent } = useQuery({
    ...contentMasterBatchQueryOptions(batch.id),
    enabled: isOpen,
    select: (data) => ({ sections: data.sections as SectionGroup[] }),
  });

  const sections = contentData?.sections ?? [];

  function toggleCourse(courseId: string) {
    setOpenCourseIds((prev) => {
      const next = new Set(prev);
      if (next.has(courseId)) next.delete(courseId);
      else next.add(courseId);
      return next;
    });
  }

  return (
    <div className={`rounded-2xl border overflow-hidden shadow-sm transition-all ${isOpen ? 'border-blue-200' : 'border-gray-100'}`}>
      <button type="button" onClick={onToggle} className={`w-full flex items-center gap-4 px-5 py-4 text-left transition-colors ${
        isOpen ? 'bg-gradient-to-r from-blue-50 to-cyan-50 hover:from-blue-100 hover:to-cyan-100' : 'bg-white hover:bg-gray-50'
      }`}>
        <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center flex-shrink-0 shadow-sm`}>
          <Video className="w-4 h-4 text-white" />
        </div>
        <div className="flex-1 min-w-0 text-left">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-sm font-bold ${isOpen ? 'text-blue-800' : 'text-gray-800'}`}>{batch.name}</span>
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
              batch.status === 'ONGOING' ? 'bg-emerald-100 text-emerald-700' :
              batch.status === 'UPCOMING' ? 'bg-blue-100 text-blue-700' :
              'bg-gray-100 text-gray-500'
            }`}>{batch.status}</span>
          </div>
          <p className="text-xs text-gray-400 mt-0.5">
            {batch.courses.length} course{batch.courses.length !== 1 ? 's' : ''}
          </p>
        </div>
        {isOpen
          ? <ChevronDown className="w-4 h-4 flex-shrink-0 text-blue-500" />
          : <ChevronRight className="w-4 h-4 flex-shrink-0 text-gray-400" />}
      </button>

      {isOpen && (
        <div className="border-t border-blue-100 bg-blue-50/20 p-3 space-y-2">
          {loadingRec || loadingContent ? (
            [1, 2].map(i => <div key={i} className="h-12 rounded-xl bg-gray-100 animate-pulse" />)
          ) : batch.courses.length === 0 ? (
            <div className="flex flex-col items-center py-8 gap-2">
              <AlertCircle className="w-5 h-5 text-gray-300" />
              <p className="text-gray-400 text-sm">No courses assigned to this batch</p>
            </div>
          ) : (
            batch.courses.map((course, courseIdx) => (
              <CourseRecordingCard
                key={course.id}
                course={course}
                batchId={batch.id}
                batchSections={sections}
                recordings={recordings}
                onRefreshRec={() => refetchRec()}
                index={courseIdx}
                isOpen={openCourseIds.has(course.id)}
                onToggle={() => toggleCourse(course.id)}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function RecordingsMasterPage() {
  const [viewMode, setViewMode] = useState<'course' | 'batch'>('course');
  const [openBatchId, setOpenBatchId] = useState('');
  const [openCourseId, setOpenCourseId] = useState('');

  const { data: courses = [], isLoading: loadingCourses, isError: coursesError, refetch: refetchCourses } = useCourseList();

  const { data: batchesData, isLoading: loadingBatches } = useQuery({
    queryKey: ['all-batches-for-recordings'],
    queryFn: async () => {
      const { data } = await api.get('/batches');
      const raw: any[] = Array.isArray(data.data) ? data.data : data.data?.batches ?? [];
      return raw.map(b => ({
        id: b.id,
        name: b.name,
        status: b.status,
        courses: (b.courses ?? []).map((c: any) => ({ id: c.id, title: c.title })),
      })) as BatchOption[];
    },
    enabled: viewMode === 'batch',
  });

  const batches: BatchOption[] = batchesData ?? [];
  const loading = viewMode === 'course' ? loadingCourses : loadingBatches;

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Recordings Master</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            YouTube links per session — link course to batch when ready
          </p>
        </div>
        <div className="flex rounded-xl border border-gray-200 bg-gray-50 p-1 text-sm">
          <button type="button" onClick={() => { setViewMode('course'); setOpenBatchId(''); }}
            className={`px-4 py-1.5 rounded-lg font-medium transition-colors ${viewMode === 'course' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            By Course
          </button>
          <button type="button" onClick={() => { setViewMode('batch'); setOpenCourseId(''); }}
            className={`px-4 py-1.5 rounded-lg font-medium transition-colors ${viewMode === 'batch' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            By Batch
          </button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-16 rounded-2xl bg-white border border-gray-100 animate-pulse shadow-sm" />)}
        </div>
      ) : viewMode === 'course' ? (
        coursesError ? (
          <div className="flex flex-col items-center py-24 gap-4 bg-white rounded-2xl border border-red-100">
            <AlertCircle className="w-10 h-10 text-red-400" />
            <button type="button" onClick={() => refetchCourses()} className="px-4 py-2 text-sm text-blue-700 bg-blue-50 border border-blue-200 rounded-lg">Retry</button>
          </div>
        ) : courses.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4 bg-white rounded-2xl border border-gray-100 shadow-sm">
            <Video className="w-9 h-9 text-blue-300" />
            <p className="text-gray-700 font-semibold">No courses found</p>
            <p className="text-gray-400 text-sm">Create a course in Curriculum Master first.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {courses.map((c, idx) => (
              <CourseRecordingAccordion
                key={c.id}
                course={c}
                index={idx}
                isOpen={openCourseId === c.id}
                onToggle={() => setOpenCourseId((prev) => (prev === c.id ? '' : c.id))}
              />
            ))}
          </div>
        )
      ) : batches.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4 bg-white rounded-2xl border border-gray-100 shadow-sm">
          <div className="w-20 h-20 rounded-3xl bg-blue-50 border border-blue-100 flex items-center justify-center">
            <Video className="w-9 h-9 text-blue-300" />
          </div>
          <p className="text-gray-700 font-semibold text-lg">No batches found</p>
          <p className="text-gray-400 text-sm">Create batches in Batch Master first.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {batches.map((b, idx) => (
            <BatchRecordingAccordion
              key={b.id}
              batch={b}
              index={idx}
              isOpen={openBatchId === b.id}
              onToggle={() => setOpenBatchId(prev => prev === b.id ? '' : b.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
