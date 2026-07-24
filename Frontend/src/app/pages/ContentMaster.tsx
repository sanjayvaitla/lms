/**
 * ContentMaster.tsx
 * Admin page — manage SLM, References, and Artifacts per session per batch.
 * Light admin theme matching BatchMaster.
 */

import { useState, useRef, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  LibraryBig,
  ChevronDown,
  ChevronRight,
  Search,
  BookOpen,
  FileText,
  Package,
  BookMarked,
  Upload,
  X,
  Plus,
  Trash2,
  Loader2,
  ExternalLink,
  CheckCircle2,
  PlayCircle,
  Lock,
  Unlock,
  RotateCcw,
  AlertCircle,
  RefreshCw,
  Layers,
  Presentation,
} from "lucide-react";
import api from "../../lib/axios";
import { useCourseList } from "../../lib/courseList";
import {
  contentMasterCourseQueryOptions,
  contentMasterBatchQueryOptions,
  patchContentMasterSessionItem,
  removeContentMasterSessionItem,
  refetchContentMaster,
  type ContentTabField,
  type ContentItemRow,
} from "../../lib/contentMasterSessions";
import { useAuth } from "../../store/AuthContext";
import { toast } from "sonner";

// ── Types ─────────────────────────────────────────────────────────────────────

interface BatchOption {
  id: string;
  name: string;
  status: string;
  courses: { id: string; title: string }[];
  colorToken?: string;
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

interface SessionRow {
  id: string;
  title: string;
  section: string;
  sessionNumber: string | null;
  sortOrder: number;
  status: string;
  courseId: string;
  references: ContentItem[];
  slm: ContentItem[];
  ppt: ContentItem[];
  artifacts: ContentItem[];
}

interface SectionGroup {
  section: string;
  sessions: SessionRow[];
}

interface BatchDetail {
  id: string;
  batchName: string;
  courseTitle: string;
  colorToken: string;
}

type ContentTab = "references" | "slm" | "ppt" | "artifacts";

const TAB_CONFIG: Record<
  ContentTab,
  {
    label: string;
    icon: typeof FileText;
    bgColor: string;
    textColor: string;
    borderColor: string;
    badgeBg: string;
    endpoint: string;
  }
> = {
  references: {
    label: "References",
    icon: FileText,
    bgColor: "bg-sky-50",
    textColor: "text-sky-700",
    borderColor: "border-sky-200",
    badgeBg: "bg-sky-100 text-sky-700",
    endpoint: "references",
  },
  slm: {
    label: "SLM",
    icon: BookMarked,
    bgColor: "bg-emerald-50",
    textColor: "text-emerald-700",
    borderColor: "border-emerald-200",
    badgeBg: "bg-emerald-100 text-emerald-700",
    endpoint: "slm",
  },
  ppt: {
    label: "PPT",
    icon: Presentation,
    bgColor: "bg-purple-50",
    textColor: "text-purple-700",
    borderColor: "border-purple-200",
    badgeBg: "bg-purple-100 text-purple-700",
    endpoint: "ppt",
  },
  artifacts: {
    label: "Artifacts",
    icon: Package,
    bgColor: "bg-rose-50",
    textColor: "text-rose-700",
    borderColor: "border-rose-200",
    badgeBg: "bg-rose-100 text-rose-700",
    endpoint: "artifacts",
  },
};

// Section color palette matching BatchMaster
const SECTION_GRADIENTS = [
  "from-blue-500 to-cyan-500",
  "from-purple-500 to-pink-500",
  "from-emerald-500 to-teal-500",
  "from-orange-500 to-amber-500",
  "from-rose-500 to-red-500",
  "from-indigo-500 to-violet-500",
];

// ── Add-content modal ─────────────────────────────────────────────────────────

interface AddModalProps {
  tab: ContentTab;
  moduleId: string;
  moduleTitle: string;
  courseId: string;
  batchId?: string;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}

function AddContentModal({
  tab,
  moduleId,
  moduleTitle,
  courseId,
  batchId,
  onClose,
  onSaved,
}: AddModalProps) {
  const qc = useQueryClient();
  const cfg = TAB_CONFIG[tab];
  const Icon = cfg.icon;

  const typeOptions =
    tab === "references"
      ? ["LINK", "PDF"]
      : (tab === "slm" || tab === "ppt")
        ? ["PDF"] // Not displayed because type chips are hidden for slm and ppt
        : ["WORD_DOC"];

  const [title, setTitle] = useState("");
  const [description, setDesc] = useState("");
  const [url, setUrl] = useState("");
  const [type, setType] = useState(typeOptions[0]);
  const [file, setFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const isUrlMode = type === "LINK";
  const acceptExt =
    tab === "artifacts"
      ? ".doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      : tab === "ppt"
        ? ".pdf,application/pdf,.ppt,.pptx,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation"
        : ".pdf,application/pdf";

  const mut = useMutation({
    mutationFn: async () => {
      const fd = new FormData();
      fd.append("title", title.trim());
      if (description.trim()) fd.append("description", description.trim());
      if (isUrlMode && url.trim()) fd.append("url", url.trim());
      if (!isUrlMode && file) fd.append("file", file);
      if (tab !== "slm" && tab !== "ppt") fd.append("type", type);
      const { data } = await api.post(`/student/sessions/${moduleId}/${cfg.endpoint}`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      return data.data as ContentItemRow;
    },
    meta: { refreshLms: { courseId, batchId } },
    onSuccess: async (created: ContentItemRow) => {
      toast.success(`${cfg.label} added successfully`);
      // Instant UI update; mutationCache meta.refreshLms refetches from server
      patchContentMasterSessionItem(qc, {
        courseId,
        batchId,
        moduleId,
        field: tab as ContentTabField,
        item: created,
      });
      onClose();
      void onSaved();
    },
    onError: (e: any) =>
      toast.error(e?.response?.data?.message ?? "Failed to add"),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-4">
      <div className="bg-white border border-gray-200 rounded-t-2xl sm:rounded-2xl w-full max-w-md shadow-2xl max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${cfg.bgColor} border ${cfg.borderColor}`}
            >
              <Icon className={`w-4 h-4 ${cfg.textColor}`} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-gray-900">Add {cfg.label}</p>
              <p className="text-xs text-gray-400 truncate">
                {moduleTitle}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors flex-shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {/* Title */}
          <div>
            <label className="text-xs font-semibold text-gray-600 mb-1.5 block">
              Title *
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Python Cheat Sheet"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-colors"
            />
          </div>

          {/* Type chips */}
          {tab !== "slm" && tab !== "ppt" && (
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1.5 block">
                Type
              </label>
              <div className="flex flex-wrap gap-1.5">
                {typeOptions.map((t) => (
                  <button
                    key={t}
                    onClick={() => {
                      setType(t);
                      if (t === "LINK") setFile(null);
                      else setUrl("");
                    }}
                    className={`px-3 py-1 rounded-full text-xs font-semibold border transition-all ${
                      type === t
                        ? `${cfg.bgColor} ${cfg.textColor} ${cfg.borderColor}`
                        : "bg-gray-50 border-gray-200 text-gray-500 hover:border-gray-300"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* URL / File Input */}
          <div>
            <label className="text-xs font-semibold text-gray-600 mb-1.5 block">
              {isUrlMode ? "URL / Link *" : "Upload File *"}
            </label>
            {isUrlMode ? (
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://..."
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-colors"
              />
            ) : (
              <div
                onClick={() => fileRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-colors ${
                  file
                    ? "border-blue-300 bg-blue-50"
                    : "border-gray-200 hover:border-blue-300 hover:bg-gray-50"
                }`}
              >
                {file ? (
                  <div className="flex items-center justify-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-blue-600" />
                    <span className="text-sm text-gray-800 font-medium truncate max-w-[220px]">
                      {file.name}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setFile(null);
                      }}
                      className="text-gray-400 hover:text-red-500 transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <>
                    <Upload className="w-6 h-6 text-gray-400 mx-auto mb-2" />
                    <p className="text-sm text-gray-500">
                      Click to select file
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {tab === "artifacts"
                        ? "Word Docs (.doc, .docx)"
                        : tab === "ppt"
                          ? "PPTX or PDF"
                          : "PDF format only"}{" "}
                      — max 20 MB
                    </p>
                  </>
                )}
                <input
                  ref={fileRef}
                  type="file"
                  accept={acceptExt}
                  hidden
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </div>
            )}
          </div>

          {/* Description */}
          <div>
            <label className="text-xs font-semibold text-gray-600 mb-1.5 block">
              Description (optional)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDesc(e.target.value)}
              rows={2}
              placeholder="Brief description..."
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-colors resize-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-white flex items-center justify-end gap-2 sm:gap-3 px-4 sm:px-5 py-4 border-t border-gray-100">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 sm:flex-none px-4 py-2.5 sm:py-2 rounded-xl text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors font-medium"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!title.trim() || mut.isPending}
            onClick={() => mut.mutate()}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 sm:py-2 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 shadow-md transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {mut.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Plus className="w-4 h-4" />
            )}
            Add {cfg.label}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Content items list ────────────────────────────────────────────────────────

function ContentItemsList({
  items,
  tab,
  onDelete,
  deleting,
}: {
  items: ContentItem[];
  tab: ContentTab;
  onDelete: (id: string) => void;
  deleting: boolean;
}) {
  const cfg = TAB_CONFIG[tab];
  const TabIcon = cfg.icon;

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-6 gap-2 rounded-xl border border-dashed border-gray-200 bg-gray-50">
        <TabIcon className="w-5 h-5 text-gray-300" />
        <p className="text-gray-400 text-xs">
          No {cfg.label.toLowerCase()} added yet
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {items.map((item) => (
        <div
          key={item.id}
          className="flex items-start gap-2.5 sm:gap-3 p-2.5 sm:p-3 rounded-xl bg-white border border-gray-100 hover:border-gray-200 transition-colors group shadow-sm"
        >
          <div
            className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${cfg.bgColor} border ${cfg.borderColor}`}
          >
            <TabIcon className={`w-3.5 h-3.5 ${cfg.textColor}`} />
          </div>
          <div className="flex-1 min-w-0 overflow-hidden">
            <p className="text-sm font-semibold text-gray-800 break-words leading-snug">
              {item.title}
            </p>
            {item.description && (
              <p className="text-xs text-gray-400 mt-0.5 line-clamp-2 break-words">
                {item.description}
              </p>
            )}
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${cfg.badgeBg}`}
              >
                {item.type}
              </span>
              {(item.fileUrl ?? item.url) && (
                <a
                  href={item.fileUrl ?? item.url ?? "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-[10px] text-blue-500 hover:text-blue-700 transition-colors"
                >
                  <ExternalLink className="w-3 h-3 flex-shrink-0" />
                  {item.filePath ? "Open file" : "Open link"}
                </a>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={() => onDelete(item.id)}
            disabled={deleting}
            aria-label="Delete"
            className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors flex-shrink-0 sm:opacity-0 sm:group-hover:opacity-100"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}

// ── Session card ──────────────────────────────────────────────────────────────

interface SessionCardProps {
  session: SessionRow;
  batchId?: string;
  onRefresh: () => void;
}

const SESSIONS_PAGE_SIZE = 20;

function VirtualSessionList({
  sessions,
  batchId,
  onRefresh,
}: {
  sessions: SessionRow[];
  batchId?: string;
  onRefresh: () => void;
}) {
  const [visibleCount, setVisibleCount] = useState(SESSIONS_PAGE_SIZE);
  const sessionIdsKey = sessions.map((s) => s.id).join(',');
  useEffect(() => setVisibleCount(SESSIONS_PAGE_SIZE), [sessionIdsKey]);

  const visible = sessions.slice(0, visibleCount);
  const remaining = sessions.length - visible.length;

  return (
    <>
      {visible.map((sess) => (
        <SessionCard key={sess.id} session={sess} batchId={batchId} onRefresh={onRefresh} />
      ))}
      {remaining > 0 && (
        <button
          type="button"
          onClick={() => setVisibleCount((n) => n + SESSIONS_PAGE_SIZE)}
          className="w-full py-2 text-xs font-semibold text-blue-600 hover:bg-blue-50 rounded-lg border border-dashed border-blue-200 transition-colors"
        >
          Load {Math.min(SESSIONS_PAGE_SIZE, remaining)} more session{remaining !== 1 ? 's' : ''} ({remaining} remaining)
        </button>
      )}
    </>
  );
}

function SessionCard({ session, batchId, onRefresh }: SessionCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<ContentTab>("references");
  const [addModal, setAddModal] = useState<ContentTab | null>(null);
  const qc = useQueryClient();

  const isCompleted = session.status === "COMPLETED";
  const isReleased  = session.status === "RELEASED";
  const isLocked    = session.status === "LOCKED";

  const actionMut = useMutation({
    mutationFn: async ({ action }: { action: 'release' | 'lock' | 'complete' | 'uncomplete' }) => {
      if (!batchId) {
        throw new Error('Open By Batch view to change session status for a specific batch');
      }
      const method = (action === 'release' || action === 'lock') ? 'patch' : 'post';
      const body = { batchId };
      const res = await (api as any)[method](
        `/courses/${session.courseId}/modules/${session.id}/${action}`,
        body,
      );
      return res?.data;
    },
    meta: { refreshLms: { courseId: session.courseId, batchId } },
    onSuccess: async (data: any) => {
      const releasedA = data?.releasedAssignmentIds?.length ?? 0;
      const releasedQ = data?.releasedQuizIds?.length ?? 0;
      if (releasedA || releasedQ) {
        toast.success(
          `Session updated — ${[releasedQ && `${releasedQ} quiz(zes)`, releasedA && `${releasedA} assignment(s)`].filter(Boolean).join(' & ')} released; students notified`,
        );
      } else {
        toast.success(data?.message ?? 'Session updated');
      }
      onRefresh();
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Failed'),
  });

  const totalContent =
    (session.references?.length || 0) + (session.slm?.length || 0) + (session.ppt?.length || 0) + (session.artifacts?.length || 0);

  const deleteMut = useMutation({
    mutationFn: async ({
      itemId,
      endpoint,
    }: {
      itemId: string;
      endpoint: string;
    }) => {
      await api.delete(`/student/sessions/${endpoint}/${itemId}`);
      return itemId;
    },
    meta: { refreshLms: { courseId: session.courseId, batchId } },
    onSuccess: async (itemId: string) => {
      toast.success("Item removed");
      removeContentMasterSessionItem(qc, {
        courseId: session.courseId,
        batchId,
        moduleId: session.id,
        field: activeTab as ContentTabField,
        itemId,
      });
      onRefresh();
    },
    onError: (e: any) =>
      toast.error(e?.response?.data?.message ?? "Failed to remove"),
  });

  const currentItems =
    activeTab === "references"
      ? session.references || []
      : activeTab === "slm"
        ? session.slm || []
        : activeTab === "ppt"
          ? session.ppt || []
          : session.artifacts || [];

  const statusBadge = isCompleted
    ? {
        label: "Completed",
        cls: "bg-emerald-100 text-emerald-700 border-emerald-200",
      }
    : isReleased
      ? { label: "Released", cls: "bg-blue-100 text-blue-700 border-blue-200" }
      : { label: "Locked", cls: "bg-gray-100 text-gray-500 border-gray-200" };

  return (
    <>
      {addModal && (
        <AddContentModal
          tab={addModal}
          moduleId={session.id}
          moduleTitle={session.title}
          courseId={session.courseId}
          batchId={batchId}
          onClose={() => setAddModal(null)}
          onSaved={onRefresh}
        />
      )}

      <div
        className={`rounded-xl border transition-all duration-200 overflow-hidden ${
          isCompleted
            ? "border-emerald-100 bg-emerald-50/30"
            : isReleased
              ? "border-blue-100 bg-blue-50/20"
              : "border-gray-100 bg-white"
        }`}
      >
        {/* Session header — stacked on mobile to avoid title/action overlap */}
        <div
          className="px-3 sm:px-4 py-3 cursor-pointer hover:bg-gray-50/80 transition-colors select-none"
          onClick={() => setExpanded((v) => !v)}
        >
          <div className="flex items-start gap-2.5 sm:gap-3">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold mt-0.5 ${
                isCompleted
                  ? "bg-emerald-100 text-emerald-700"
                  : isReleased
                    ? "bg-blue-100 text-blue-700"
                    : "bg-gray-100 text-gray-500"
              }`}
            >
              {isCompleted ? (
                <CheckCircle2 className="w-4 h-4" />
              ) : isLocked ? (
                <Lock className="w-3.5 h-3.5" />
              ) : isReleased ? (
                <PlayCircle className="w-4 h-4" />
              ) : (
                (session.sessionNumber ?? "?")
              )}
            </div>

            <div className="flex-1 min-w-0 overflow-hidden">
              <div className="flex items-start gap-2">
                <p className="flex-1 min-w-0 text-sm font-semibold text-gray-800 leading-snug break-words">
                  {session.title}
                </p>
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold border flex-shrink-0 ${statusBadge.cls}`}
                >
                  {statusBadge.label}
                </span>
                <ChevronDown
                  className={`w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
                />
              </div>

              {totalContent > 0 && (
                <div className="flex items-center gap-x-2 gap-y-0.5 mt-1 flex-wrap">
                  {(session.references?.length || 0) > 0 && (
                    <span className="text-[10px] text-sky-600 font-medium">
                      {session.references.length} ref{session.references.length !== 1 ? "s" : ""}
                    </span>
                  )}
                  {(session.slm?.length || 0) > 0 && (
                    <span className="text-[10px] text-emerald-600 font-medium">
                      {session.slm.length} SLM
                    </span>
                  )}
                  {(session.ppt?.length || 0) > 0 && (
                    <span className="text-[10px] text-purple-600 font-medium">
                      {session.ppt.length} PPT
                    </span>
                  )}
                  {(session.artifacts?.length || 0) > 0 && (
                    <span className="text-[10px] text-rose-600 font-medium">
                      {session.artifacts.length} artifact{session.artifacts.length !== 1 ? "s" : ""}
                    </span>
                  )}
                </div>
              )}

              {!batchId && (
                <p className="text-[10px] text-gray-400 mt-1 leading-tight">
                  Upload here · release in By Batch
                </p>
              )}
            </div>
          </div>

          {/* Actions row — wraps cleanly under title on all sizes */}
          <div
            className="mt-2.5 pl-10 sm:pl-11 flex flex-wrap items-center gap-1.5"
            onClick={(e) => e.stopPropagation()}
          >
            {batchId && (
              <>
                {isLocked ? (
                  <button
                    type="button"
                    onClick={() => actionMut.mutate({ action: "release" })}
                    disabled={actionMut.isPending}
                    className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold rounded-lg border border-blue-200 text-blue-600 hover:bg-blue-50 transition-colors"
                  >
                    <Unlock className="w-3 h-3" /> Unlock
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => actionMut.mutate({ action: "lock" })}
                    disabled={actionMut.isPending}
                    className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors"
                  >
                    <Lock className="w-3 h-3" /> Lock
                  </button>
                )}
                {isCompleted ? (
                  <button
                    type="button"
                    onClick={() => actionMut.mutate({ action: "uncomplete" })}
                    disabled={actionMut.isPending}
                    className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors"
                  >
                    <RotateCcw className="w-3 h-3" /> Pending
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => actionMut.mutate({ action: "complete" })}
                    disabled={actionMut.isPending}
                    className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold rounded-lg border border-emerald-200 text-emerald-600 hover:bg-emerald-50 transition-colors"
                  >
                    <CheckCircle2 className="w-3 h-3" /> Complete
                  </button>
                )}
              </>
            )}

            <div className="flex items-center gap-1 ml-auto sm:ml-0">
              {(Object.keys(TAB_CONFIG) as ContentTab[]).map((tab) => {
                const c = TAB_CONFIG[tab];
                const TabIcon = c.icon;
                return (
                  <button
                    key={tab}
                    type="button"
                    title={`Add ${c.label}`}
                    aria-label={`Add ${c.label}`}
                    onClick={() => setAddModal(tab)}
                    className={`p-2 sm:p-1.5 rounded-lg border transition-all active:scale-95 ${c.bgColor} ${c.borderColor} ${c.textColor}`}
                  >
                    <TabIcon className="w-3.5 h-3.5" />
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Expanded content */}
        {expanded && (
          <div className="border-t border-gray-100 px-3 sm:px-4 pb-4 pt-3 bg-white">
            <div className="flex flex-col gap-2.5 mb-3">
              <div className="-mx-1 px-1 flex items-center gap-1.5 overflow-x-auto pb-0.5" style={{ WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none' }}>
                {(Object.keys(TAB_CONFIG) as ContentTab[]).map((tab) => {
                  const c = TAB_CONFIG[tab];
                  const TabIcon = c.icon;
                  const count =
                    tab === "references"
                      ? session.references?.length || 0
                      : tab === "slm"
                        ? session.slm?.length || 0
                        : tab === "ppt"
                          ? session.ppt?.length || 0
                          : session.artifacts?.length || 0;
                  const isActive = activeTab === tab;
                  return (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setActiveTab(tab)}
                      className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all whitespace-nowrap flex-shrink-0 ${
                        isActive
                          ? `${c.bgColor} ${c.borderColor} ${c.textColor}`
                          : "bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100"
                      }`}
                    >
                      <TabIcon className="w-3 h-3 flex-shrink-0" />
                      <span>{c.label}</span>
                      <span
                        className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${isActive ? "bg-white/60" : "bg-gray-200 text-gray-500"}`}
                      >
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={() => setAddModal(activeTab)}
                className="w-full sm:w-auto sm:self-end flex items-center justify-center gap-1.5 px-3 py-2 sm:py-1.5 rounded-lg text-xs font-bold text-white bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 shadow-sm transition-all"
              >
                <Plus className="w-3 h-3" />
                Add {TAB_CONFIG[activeTab].label}
              </button>
            </div>

            <ContentItemsList
              items={currentItems}
              tab={activeTab}
              onDelete={(itemId) =>
                deleteMut.mutate({
                  itemId,
                  endpoint:
                    activeTab === "artifacts"
                      ? "artifacts"
                      : activeTab === "slm"
                        ? "slm"
                        : activeTab === "ppt"
                          ? "ppt"
                          : "references",
                })
              }
              deleting={deleteMut.isPending}
            />
          </div>
        )}
      </div>
    </>
  );
}

// ── Course content card (inside a batch) ─────────────────────────────────────

function CourseContentCard({
  course, batchId, isOpen, onToggle, index, embedded,
}: {
  course: { id: string; title: string };
  batchId?: string;
  isOpen: boolean;
  onToggle: () => void;
  index: number;
  /** Hide outer course header — used inside CourseAccordionCard */
  embedded?: boolean;
}) {
  const [search, setSearch] = useState('');
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const gradient = SECTION_GRADIENTS[index % SECTION_GRADIENTS.length];
  const qc = useQueryClient();

  const showContent = embedded || isOpen;

  const {
    data: courseContent,
    isLoading: loadingCourse,
    isError: courseError,
    refetch: refetchCourse,
  } = useQuery({
    ...contentMasterCourseQueryOptions(course.id),
    enabled: showContent && !batchId,
  });

  const {
    data: batchContent,
    isLoading: loadingBatch,
    isError: batchError,
    refetch: refetchBatch,
  } = useQuery({
    ...contentMasterBatchQueryOptions(batchId ?? ''),
    enabled: showContent && !!batchId,
  });

  const contentLoading = batchId ? loadingBatch : loadingCourse;
  const contentError = batchId ? batchError : courseError;

  const courseSections = useMemo(() => {
    if (batchId && batchContent?.sections) {
      return batchContent.sections
        .map((sec) => ({
          ...sec,
          sessions: sec.sessions.filter(
            (s) => String(s.courseId) === String(course.id),
          ),
        }))
        .filter((sec) => sec.sessions.length > 0) as SectionGroup[];
    }
    if (courseContent?.sections) {
      return courseContent.sections as SectionGroup[];
    }
    return [];
  }, [batchId, batchContent, courseContent, course.id]);

  const sectionKey = courseSections.map((s) => s.section).join('|');

  // When course opens / sections load, expand all (can still close manually)
  useEffect(() => {
    if (isOpen || embedded) {
      setExpandedSections(new Set(courseSections.map((s) => s.section)));
    } else {
      setExpandedSections(new Set());
    }
  }, [isOpen, embedded, sectionKey]);

  const filteredSections = useMemo(() =>
    courseSections
      .map(sec => ({
        ...sec,
        sessions: search
          ? sec.sessions.filter(s => s.title.toLowerCase().includes(search.toLowerCase()) || s.sessionNumber?.includes(search))
          : sec.sessions,
      }))
      .filter(sec => sec.sessions.length > 0),
    [courseSections, search],
  );

  function toggleSection(name: string) {
    setExpandedSections(prev => { const n = new Set(prev); n.has(name) ? n.delete(name) : n.add(name); return n; });
  }

  const allSessions = courseSections.flatMap(s => s.sessions);
  const totalContentItems = allSessions.reduce(
    (a, s) => a + (s.references?.length || 0) + (s.slm?.length || 0) + (s.ppt?.length || 0),
    0,
  );
  const totalArts = allSessions.reduce((a, s) => a + (s.artifacts?.length || 0), 0);

  const showContentPanel = embedded || isOpen;
  const listLoading = contentLoading && courseSections.length === 0;

  async function handleRefresh() {
    if (batchId) {
      await refetchBatch();
      await refetchContentMaster(qc, { courseId: course.id, batchId });
    } else {
      await refetchCourse();
      await refetchContentMaster(qc, { courseId: course.id });
    }
  }

  return (
    <div className={embedded ? '' : `rounded-xl border overflow-hidden bg-white ${isOpen ? 'border-blue-200' : 'border-gray-100'}`}>
      {!embedded && (
      <button type="button" onClick={onToggle} className={`w-full flex items-start sm:items-center gap-3 px-3 sm:px-4 py-3 text-left transition-colors ${
        isOpen ? 'bg-gradient-to-r from-blue-50 to-cyan-50 hover:from-blue-100 hover:to-cyan-100' : 'bg-gray-50/60 hover:bg-gray-100'
      }`}>
        <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${gradient} flex items-center justify-center flex-shrink-0 shadow-sm mt-0.5 sm:mt-0`}>
          <BookOpen className="w-3.5 h-3.5 text-white" />
        </div>
        <div className="flex-1 min-w-0 text-left overflow-hidden">
          <span className={`text-sm font-bold break-words block leading-snug ${isOpen ? 'text-blue-800' : 'text-gray-700'}`}>{course.title}</span>
          <p className="text-xs text-gray-400 mt-0.5">
            {allSessions.length} session{allSessions.length !== 1 ? 's' : ''}
            {totalContentItems > 0 ? ` · ${totalContentItems} content` : ''}
            {totalArts > 0 ? ` · ${totalArts} arts` : ''}
          </p>
        </div>
        {isOpen
          ? <ChevronDown className="w-4 h-4 flex-shrink-0 text-blue-500 mt-1 sm:mt-0" />
          : <ChevronRight className="w-4 h-4 flex-shrink-0 text-gray-400 mt-1 sm:mt-0" />}
      </button>
      )}

      {showContentPanel && (
        <div className={embedded ? '' : 'border-t border-blue-100'}>
          {contentError ? (
            <div className="flex flex-col items-center gap-2 text-red-500 text-sm py-6">
              <AlertCircle className="w-4 h-4" /> Failed to load session content
              <button type="button" onClick={() => handleRefresh()} className="text-blue-600 hover:underline text-xs">Retry</button>
            </div>
          ) : (
          <>
          <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2.5 border-b border-gray-100">
            <div className="flex-1 relative min-w-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search sessions…"
                className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-9 pr-8 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-colors" />
              {search && <button type="button" onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-gray-400 hover:text-gray-600"><X className="w-3.5 h-3.5" /></button>}
            </div>
            <button type="button" onClick={(e) => { e.stopPropagation(); handleRefresh(); }} aria-label="Refresh"
              className="p-2 text-gray-500 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 flex-shrink-0">
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="p-2 sm:p-3 space-y-2">
            {listLoading ? (
              <div className="flex items-center justify-center py-8 gap-2 text-gray-400 text-sm">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading sessions…
              </div>
            ) : filteredSections.length === 0 ? (
              <div className="flex flex-col items-center py-6 gap-2">
                <AlertCircle className="w-5 h-5 text-gray-300" />
                <p className="text-gray-400 text-sm">No sessions{search ? ` for "${search}"` : ''}</p>
                {!search && (
                  <p className="text-gray-400 text-xs text-center max-w-xs">
                    Upload syllabus in Curriculum Master for this course, then refresh.
                  </p>
                )}
              </div>
            ) : filteredSections.map((sec, secIdx) => {
              const isSecOpen = expandedSections.has(sec.section);
              const secGradient = SECTION_GRADIENTS[secIdx % SECTION_GRADIENTS.length];
              const sectionContent = sec.sessions.reduce(
                (a, s) => a + (s.references?.length || 0) + (s.slm?.length || 0) + (s.ppt?.length || 0),
                0,
              );
              const sectionArts = sec.sessions.reduce((a, s) => a + (s.artifacts?.length || 0), 0);
              return (
                <div key={sec.section} className="rounded-xl border border-gray-100 overflow-hidden">
                  <button type="button" onClick={() => toggleSection(sec.section)}
                    className="w-full bg-gradient-to-r from-blue-50 to-cyan-50 px-3 sm:px-4 py-2.5 flex items-start sm:items-center justify-between gap-2 hover:from-blue-100 hover:to-cyan-100 transition-colors border-b border-blue-100">
                    <div className="flex items-start sm:items-center gap-2 min-w-0 flex-1">
                      <div className={`w-5 h-5 rounded-md bg-gradient-to-br ${secGradient} flex items-center justify-center flex-shrink-0 mt-0.5 sm:mt-0`}>
                        <Layers className="w-2.5 h-2.5 text-white" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <span className="text-sm font-bold text-blue-800 break-words block leading-snug">{sec.section}</span>
                        <span className="text-[10px] text-blue-600 font-semibold mt-0.5 inline-block">
                          {sec.sessions.length} session{sec.sessions.length !== 1 ? 's' : ''}
                          {sectionContent > 0 ? ` · ${sectionContent} content` : ''}
                          {sectionArts > 0 ? ` · ${sectionArts} arts` : ''}
                        </span>
                      </div>
                    </div>
                    <ChevronDown className={`w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5 transition-transform duration-200 ${isSecOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {isSecOpen && (
                    <div className="p-1.5 sm:p-2 space-y-2 bg-white">
                      <VirtualSessionList
                        sessions={sec.sessions}
                        batchId={batchId}
                        onRefresh={handleRefresh}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Standalone course accordion (course-first — no batch required) ────────────

interface CourseOption {
  id: string;
  title: string;
  colorToken?: string;
}

function CourseAccordionCard({ course, isOpen, onToggle, index }: {
  course: CourseOption; isOpen: boolean; onToggle: () => void; index: number;
}) {
  const gradient = SECTION_GRADIENTS[index % SECTION_GRADIENTS.length];

  return (
    <div className={`rounded-2xl border overflow-hidden shadow-sm transition-all ${isOpen ? 'border-blue-200' : 'border-gray-100'}`}>
      <button type="button" onClick={onToggle} className={`w-full flex items-start sm:items-center gap-3 sm:gap-4 px-3 sm:px-5 py-3.5 sm:py-4 text-left transition-colors ${
        isOpen ? 'bg-gradient-to-r from-blue-50 to-cyan-50 hover:from-blue-100 hover:to-cyan-100' : 'bg-white hover:bg-gray-50'
      }`}>
        <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center flex-shrink-0 shadow-sm`}>
          <BookOpen className="w-4 h-4 text-white" />
        </div>
        <div className="flex-1 min-w-0 text-left overflow-hidden">
          <span className={`text-sm font-bold break-words block leading-snug ${isOpen ? 'text-blue-800' : 'text-gray-800'}`}>{course.title}</span>
          <p className="text-xs text-gray-400 mt-0.5 leading-snug">
            <span className="sm:hidden">Upload content · map to batch later</span>
            <span className="hidden sm:inline">Upload content now — link to a batch in Batch Master when ready</span>
          </p>
        </div>
        {isOpen
          ? <ChevronDown className="w-4 h-4 flex-shrink-0 text-blue-500 mt-1 sm:mt-0" />
          : <ChevronRight className="w-4 h-4 flex-shrink-0 text-gray-400 mt-1 sm:mt-0" />}
      </button>

      {isOpen && (
        <div className="border-t border-blue-100 bg-white p-2 sm:p-3">
          <CourseContentCard
            course={course}
            embedded
            isOpen
            onToggle={() => {}}
            index={index}
          />
        </div>
      )}
    </div>
  );
}

// ── Batch accordion card ──────────────────────────────────────────────────────

function BatchAccordionCard({ batch, isOpen, onToggle, index }: {
  batch: BatchOption; isOpen: boolean; onToggle: () => void; index: number;
}) {
  // Courses open by default when batch expands — no second click required
  const [openCourseIds, setOpenCourseIds] = useState<Set<string>>(() => new Set());
  const gradient = SECTION_GRADIENTS[index % SECTION_GRADIENTS.length];
  const courseIdsKey = batch.courses.map((c) => c.id).join(',');

  useEffect(() => {
    if (isOpen && batch.courses.length > 0) {
      setOpenCourseIds(new Set([batch.courses[0].id]));
    } else {
      setOpenCourseIds(new Set());
    }
  }, [isOpen, batch.id, courseIdsKey]);

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
      <button type="button" onClick={onToggle} className={`w-full flex items-start sm:items-center gap-3 sm:gap-4 px-3 sm:px-5 py-3.5 sm:py-4 text-left transition-colors ${
        isOpen ? 'bg-gradient-to-r from-blue-50 to-cyan-50 hover:from-blue-100 hover:to-cyan-100' : 'bg-white hover:bg-gray-50'
      }`}>
        <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center flex-shrink-0 shadow-sm`}>
          <BookOpen className="w-4 h-4 text-white" />
        </div>
        <div className="flex-1 min-w-0 text-left overflow-hidden">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-sm font-bold break-words ${isOpen ? 'text-blue-800' : 'text-gray-800'}`}>{batch.name}</span>
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold flex-shrink-0 ${
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
          ? <ChevronDown className="w-4 h-4 flex-shrink-0 text-blue-500 mt-1 sm:mt-0" />
          : <ChevronRight className="w-4 h-4 flex-shrink-0 text-gray-400 mt-1 sm:mt-0" />}
      </button>

      {isOpen && (
        <div className="border-t border-blue-100 bg-blue-50/20 p-2 sm:p-3 space-y-2">
          {batch.courses.length === 0 ? (
            <div className="flex flex-col items-center py-8 gap-2">
              <AlertCircle className="w-5 h-5 text-gray-300" />
              <p className="text-gray-400 text-sm">No courses assigned to this batch</p>
            </div>
          ) : (
            batch.courses.map((course, courseIdx) => (
              <CourseContentCard
                key={course.id}
                course={course}
                batchId={batch.id}
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

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ContentMasterPage() {
  const { user } = useAuth();
  const [viewMode, setViewMode] = useState<'course' | 'batch'>('course');
  const [openBatchId, setOpenBatchId] = useState('');
  const [openCourseId, setOpenCourseId] = useState('');

  const { data: coursesData, isLoading: loadingCourses, isError: coursesError, refetch: refetchCourses } = useCourseList({
    enabled: !!user,
  });

  const { data: batchesData, isLoading: loadingBatches } = useQuery({
    queryKey: ['all-batches-for-content'],
    queryFn: async () => {
      const { data } = await api.get('/batches');
      const raw: any[] = Array.isArray(data.data) ? data.data : data.data?.batches ?? [];
      return raw.map(b => ({
        id: b.id,
        name: b.name,
        status: b.status,
        courses: (b.courses ?? []).map((c: any) => ({ id: c.id, title: c.title })),
        colorToken: b.colorToken,
      })) as BatchOption[];
    },
    enabled: !!user && viewMode === 'batch',
  });

  const courses: CourseOption[] = coursesData ?? [];
  const batches: BatchOption[] = batchesData ?? [];
  const loading = viewMode === 'course' ? loadingCourses : loadingBatches;

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Content Master</h1>
          <p className="text-gray-500 text-xs sm:text-sm mt-0.5 leading-snug">
            <span className="sm:hidden">Upload SLM, refs &amp; artifacts per session</span>
            <span className="hidden sm:inline">Upload SLM, references &amp; artifacts per session — map courses to batches later</span>
          </p>
        </div>
        <div className="flex w-full sm:w-auto rounded-xl border border-gray-200 bg-gray-50 p-1 text-sm">
          <button
            type="button"
            onClick={() => { setViewMode('course'); setOpenBatchId(''); }}
            className={`flex-1 sm:flex-none px-4 py-2 sm:py-1.5 rounded-lg font-medium transition-colors text-center ${
              viewMode === 'course' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            By Course
          </button>
          <button
            type="button"
            onClick={() => { setViewMode('batch'); setOpenCourseId(''); }}
            className={`flex-1 sm:flex-none px-4 py-2 sm:py-1.5 rounded-lg font-medium transition-colors text-center ${
              viewMode === 'batch' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
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
          <div className="flex flex-col items-center justify-center py-24 gap-4 bg-white rounded-2xl border border-red-100 shadow-sm">
            <AlertCircle className="w-10 h-10 text-red-400" />
            <p className="text-gray-700 font-semibold">Could not load courses</p>
            <button type="button" onClick={() => refetchCourses()}
              className="px-4 py-2 text-sm font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100">
              Retry
            </button>
          </div>
        ) : courses.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4 bg-white rounded-2xl border border-gray-100 shadow-sm">
            <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-blue-50 to-cyan-50 border border-blue-100 flex items-center justify-center">
              <LibraryBig className="w-9 h-9 text-blue-300" />
            </div>
            <p className="text-gray-700 font-semibold text-lg">No courses found</p>
            <p className="text-gray-400 text-sm">Create a course in Curriculum Master first.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {courses.map((c, idx) => (
              <CourseAccordionCard
                key={c.id}
                course={c}
                index={idx}
                isOpen={openCourseId === c.id}
                onToggle={() => setOpenCourseId(prev => prev === c.id ? '' : c.id)}
              />
            ))}
          </div>
        )
      ) : batches.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4 bg-white rounded-2xl border border-gray-100 shadow-sm">
          <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-blue-50 to-cyan-50 border border-blue-100 flex items-center justify-center">
            <LibraryBig className="w-9 h-9 text-blue-300" />
          </div>
          <p className="text-gray-700 font-semibold text-lg">No batches found</p>
          <p className="text-gray-400 text-sm">Link courses to batches in Batch Master when you are ready.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {batches.map((b, idx) => (
            <BatchAccordionCard
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
