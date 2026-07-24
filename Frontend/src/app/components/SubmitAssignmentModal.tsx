import { useState, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  X, FileText, Archive, Upload, Loader2,
  ExternalLink, Calendar, AlertCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import api from '../../lib/axios';

interface Props {
  assignmentId: string;
  assignmentTitle: string;
  courseTitle?: string;
  batchName?: string;
  dueDate?: string | null;
  pdfUrl?: string | null;
  onClose: () => void;
  onSuccess: () => void;
  onOpenPdf?: (url: string, title: string) => void;
}

export default function SubmitAssignmentModal({
  assignmentId,
  assignmentTitle,
  courseTitle,
  batchName,
  dueDate,
  pdfUrl,
  onClose,
  onSuccess,
  onOpenPdf,
}: Props) {
  const [pdfFile, setPdfFile]           = useState<File | null>(null);
  const [zipFile, setZipFile]           = useState<File | null>(null);
  const [pdfConfirmed, setPdfConfirmed] = useState(false);
  const [zipConfirmed, setZipConfirmed] = useState(false);
  const [dragOver, setDragOver]         = useState<'pdf' | 'zip' | null>(null);
  const pdfRef = useRef<HTMLInputElement>(null);
  const zipRef = useRef<HTMLInputElement>(null);

  const isPastDue = dueDate ? new Date(dueDate).getTime() < Date.now() : false;

  // Submit enabled only when ≥1 file and every uploaded file is confirmed
  const canSubmit =
    !isPastDue &&
    (pdfFile !== null || zipFile !== null) &&
    (pdfFile === null || pdfConfirmed) &&
    (zipFile === null || zipConfirmed);

  const submitMut = useMutation({
    mutationFn: async () => {
      const fd = new FormData();
      if (pdfFile) fd.append('pdf', pdfFile);
      if (zipFile) fd.append('zip', zipFile);
      await api.post(`/assignments/${assignmentId}/submit`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    },
    onSuccess: () => {
      toast.success('Assignment submitted successfully!');
      onSuccess();
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg ?? 'Submission failed. Please try again.');
    },
  });

  function handleDrop(e: React.DragEvent, type: 'pdf' | 'zip') {
    e.preventDefault();
    if (isPastDue) return;
    setDragOver(null);
    const file = e.dataTransfer.files[0];
    if (!file) return;
    const name = file.name.toLowerCase();
    if (type === 'pdf') {
      if (name.endsWith('.pdf')) { setPdfFile(file); setPdfConfirmed(false); }
      else toast.error('Please drop a .pdf file');
    } else {
      if (name.endsWith('.zip')) { setZipFile(file); setZipConfirmed(false); }
      else toast.error('Please drop a .zip file');
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-lg bg-[#0c1120] border border-white/10 rounded-2xl shadow-2xl overflow-hidden">

        {/* ── Header ── */}
        <div className="flex items-start justify-between px-6 py-5 border-b border-white/10">
          <div className="min-w-0 pr-3">
            <h2 className="text-lg font-bold text-white">Submit Assignment</h2>
            <p className="text-gray-400 text-sm mt-0.5 truncate">{assignmentTitle}</p>
            {(courseTitle || batchName) && (
              <p className="text-gray-600 text-xs mt-0.5">
                {[courseTitle, batchName].filter(Boolean).join(' · ')}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="flex-shrink-0 p-2 hover:bg-white/10 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        <div className="p-6 space-y-5">

          {/* Due date */}
          {dueDate && (
            <div className={`flex items-center gap-2 text-xs rounded-lg px-3 py-2 ${isPastDue ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' : 'bg-white/5 text-gray-500'}`}>
              <Calendar className="w-3.5 h-3.5 flex-shrink-0" />
              {isPastDue ? 'Past Due:' : 'Due:'} {new Date(dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
            </div>
          )}

          {isPastDue ? (
            <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-4 text-center">
              <AlertCircle className="w-8 h-8 text-rose-400 mx-auto mb-2" />
              <p className="text-white font-medium">Submission Closed</p>
              <p className="text-rose-400/80 text-sm mt-1">
                The due date for this assignment has passed. You can no longer submit or update your files.
              </p>
            </div>
          ) : (
            <>
              {/* Instruction */}
              <p className="text-xs text-gray-500 flex items-start gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-amber-500" />
                Upload your PDF, ZIP, or both. Tick the confirmation checkbox for each uploaded file before submitting.
              </p>

              {/* ── PDF Zone ── */}
              <div className="space-y-2">
                <div
                  className={`border-2 border-dashed rounded-xl p-4 cursor-pointer transition-all ${
                    dragOver === 'pdf'
                      ? 'border-red-400 bg-red-500/10'
                      : pdfFile
                      ? 'border-red-500/50 bg-red-500/5'
                      : 'border-white/10 hover:border-red-500/40 hover:bg-red-500/5'
                  }`}
                  onDragOver={(e) => { e.preventDefault(); setDragOver('pdf'); }}
                  onDragLeave={() => setDragOver(null)}
                  onDrop={(e) => handleDrop(e, 'pdf')}
                  onClick={() => pdfRef.current?.click()}
                >
                  <input
                    ref={pdfRef}
                    type="file"
                    accept=".pdf,application/pdf"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0] ?? null;
                      setPdfFile(f);
                      setPdfConfirmed(false);
                      e.target.value = '';
                    }}
                  />
                  {pdfFile ? (
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-red-500/10 flex items-center justify-center flex-shrink-0">
                        <FileText className="w-5 h-5 text-red-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm font-medium truncate">{pdfFile.name}</p>
                        <p className="text-gray-500 text-xs">{(pdfFile.size / 1024).toFixed(1)} KB · PDF</p>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setPdfFile(null); setPdfConfirmed(false); }}
                        className="p-1.5 hover:bg-white/10 rounded-lg text-gray-500 hover:text-white transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0">
                        <FileText className="w-5 h-5 text-gray-500" />
                      </div>
                      <div>
                        <p className="text-gray-300 text-sm font-medium">PDF Report</p>
                        <p className="text-gray-600 text-xs">Drag & drop or click · .pdf · max 50 MB</p>
                      </div>
                    </div>
                  )}
                </div>

                {pdfFile && (
                  <label className="flex items-center gap-2.5 cursor-pointer px-1 select-none">
                    <input
                      type="checkbox"
                      checked={pdfConfirmed}
                      onChange={(e) => setPdfConfirmed(e.target.checked)}
                      className="w-4 h-4 rounded border-white/20 bg-white/5 text-teal-500 focus:ring-teal-500 cursor-pointer accent-teal-500"
                    />
                    <span className="text-xs text-gray-400">
                      I confirm{' '}
                      <span className="text-white font-medium">{pdfFile.name}</span>{' '}
                      is my final PDF submission
                    </span>
                  </label>
                )}
              </div>

              {/* ── ZIP Zone ── */}
              <div className="space-y-2">
                <div
                  className={`border-2 border-dashed rounded-xl p-4 cursor-pointer transition-all ${
                    dragOver === 'zip'
                      ? 'border-blue-400 bg-blue-500/10'
                      : zipFile
                      ? 'border-blue-500/50 bg-blue-500/5'
                      : 'border-white/10 hover:border-blue-500/40 hover:bg-blue-500/5'
                  }`}
                  onDragOver={(e) => { e.preventDefault(); setDragOver('zip'); }}
                  onDragLeave={() => setDragOver(null)}
                  onDrop={(e) => handleDrop(e, 'zip')}
                  onClick={() => zipRef.current?.click()}
                >
                  <input
                    ref={zipRef}
                    type="file"
                    accept=".zip,application/zip,application/x-zip-compressed"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0] ?? null;
                      setZipFile(f);
                      setZipConfirmed(false);
                      e.target.value = '';
                    }}
                  />
                  {zipFile ? (
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                        <Archive className="w-5 h-5 text-blue-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm font-medium truncate">{zipFile.name}</p>
                        <p className="text-gray-500 text-xs">{(zipFile.size / 1024).toFixed(1)} KB · ZIP</p>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setZipFile(null); setZipConfirmed(false); }}
                        className="p-1.5 hover:bg-white/10 rounded-lg text-gray-500 hover:text-white transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0">
                        <Archive className="w-5 h-5 text-gray-500" />
                      </div>
                      <div>
                        <p className="text-gray-300 text-sm font-medium">ZIP Archive</p>
                        <p className="text-gray-600 text-xs">Drag & drop or click · .zip · max 50 MB</p>
                      </div>
                    </div>
                  )}
                </div>

                {zipFile && (
                  <label className="flex items-center gap-2.5 cursor-pointer px-1 select-none">
                    <input
                      type="checkbox"
                      checked={zipConfirmed}
                      onChange={(e) => setZipConfirmed(e.target.checked)}
                      className="w-4 h-4 rounded border-white/20 bg-white/5 text-teal-500 focus:ring-teal-500 cursor-pointer accent-teal-500"
                    />
                    <span className="text-xs text-gray-400">
                      I confirm{' '}
                      <span className="text-white font-medium">{zipFile.name}</span>{' '}
                      is my final ZIP submission
                    </span>
                  </label>
                )}
              </div>
            </>
          )}

          {/* View instructions link */}
          {pdfUrl && (
            <button
              type="button"
              onClick={() => onOpenPdf?.(pdfUrl, assignmentTitle)}
              className="flex items-center gap-1.5 text-xs text-teal-600 hover:text-teal-700 transition-colors w-fit"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              View assignment instructions
            </button>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="px-6 pb-3 flex gap-3">
          <button
            onClick={onClose}
            disabled={submitMut.isPending}
            className="flex-1 py-2.5 text-sm font-medium text-gray-400 hover:text-white border border-white/10 hover:border-white/20 rounded-xl transition-colors disabled:opacity-40"
          >
            {isPastDue ? 'Close' : 'Cancel'}
          </button>
          {!isPastDue && (
            <button
              onClick={() => submitMut.mutate()}
              disabled={!canSubmit || submitMut.isPending}
              className="flex-1 py-2.5 text-sm font-semibold bg-teal-600 hover:bg-teal-500 disabled:bg-teal-600/40 disabled:cursor-not-allowed text-white rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              {submitMut.isPending ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Uploading...</>
              ) : (
                <><Upload className="w-4 h-4" /> Submit Assignment</>
              )}
            </button>
          )}
        </div>

        {/* Validation hint */}
        {!isPastDue && (pdfFile || zipFile) && !canSubmit && !submitMut.isPending && (
          <p className="px-6 pb-5 text-xs text-amber-500/80 text-center">
            Tick the confirmation checkbox{pdfFile && zipFile ? 'es' : ''} above to enable submit
          </p>
        )}
        {!isPastDue && !pdfFile && !zipFile && (
          <p className="px-6 pb-5 text-xs text-gray-600 text-center">
            Upload at least one file (PDF or ZIP) to proceed
          </p>
        )}

      </div>
    </div>
  );
}
