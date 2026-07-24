import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Eye, X, Loader2 } from 'lucide-react';
import {
  toInPortalViewerSrc,
  isYoutubeUrl,
  type InAppViewerPayload,
} from '../../../lib/inAppMedia';

interface ViewerState extends InAppViewerPayload {
  src: string;
}

/**
 * Full-screen in-LMS document / media viewer.
 * PDFs, office docs, and YouTube recordings open here — never a new browser tab.
 */
export function InAppDocumentViewer({
  open,
  url,
  title = 'Document',
  filePath,
  onClose,
  sidePanel,
}: {
  open: boolean;
  url: string | null;
  title?: string;
  filePath?: string | null;
  onClose: () => void;
  /** Optional right panel (e.g. session AI chat) */
  sidePanel?: ReactNode;
}) {
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setLoaded(false);
  }, [url]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open || !url) return null;

  const src = toInPortalViewerSrc(url, filePath);
  const isVideo = isYoutubeUrl(url);

  const modal = (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/70 p-3 sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-2xl w-full max-w-[96vw] h-full max-h-[94vh] flex flex-col overflow-hidden shadow-2xl border border-slate-200/80">
        <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3 border-b border-slate-100 bg-slate-50/90 shrink-0">
          <h3 className="text-sm sm:text-base font-semibold text-slate-800 flex items-center gap-2 min-w-0">
            <Eye className="w-4 h-4 text-blue-600 shrink-0" />
            <span className="truncate">{title}</span>
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="lms-press p-2 hover:bg-slate-200 rounded-xl transition-colors duration-300 ease-out shrink-0"
            aria-label="Close viewer"
          >
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        <div className="flex-1 w-full flex overflow-hidden min-h-0">
          <div className={`relative bg-slate-100 min-h-0 ${sidePanel ? 'flex-[7] border-r border-slate-200' : 'flex-1'}`}>
            {!loaded && (
              <div className="absolute inset-0 flex items-center justify-center z-[1]">
                <Loader2 className="w-7 h-7 text-blue-500 animate-spin" />
              </div>
            )}
            {isVideo ? (
              <div className="absolute inset-0 flex items-center justify-center bg-black">
                <div className="relative w-full max-w-5xl" style={{ paddingBottom: '56.25%' }}>
                  <iframe
                    src={src}
                    title={title}
                    className="absolute inset-0 w-full h-full"
                    style={{ border: 'none' }}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    onLoad={() => setLoaded(true)}
                  />
                  {/* Soft overlays — reduce accidental jumps to YouTube UI chrome */}
                  <div className="absolute inset-x-0 top-0 h-10 z-10 pointer-events-auto" />
                  <div className="absolute bottom-0 right-0 w-28 h-10 z-10 pointer-events-auto" />
                </div>
              </div>
            ) : (
              <iframe
                src={src}
                title={title}
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                className="absolute inset-0 w-full h-full border-0"
                onLoad={() => setLoaded(true)}
              />
            )}
          </div>
          {sidePanel && (
            <div className="flex-[3] relative bg-white flex flex-col min-w-[280px] max-w-md border-l border-slate-200">
              {sidePanel}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}

/** Hook: open PDFs / docs / videos inside LMS without a new browser tab. */
export function useInAppViewer() {
  const [state, setState] = useState<ViewerState | null>(null);

  const open = useCallback((payload: InAppViewerPayload) => {
    setState({
      ...payload,
      src: toInPortalViewerSrc(payload.url, payload.filePath),
    });
  }, []);

  const close = useCallback(() => setState(null), []);

  const viewer = (
    <InAppDocumentViewer
      open={!!state}
      url={state?.url ?? null}
      title={state?.title}
      filePath={state?.filePath}
      onClose={close}
    />
  );

  return { open, close, viewer, isOpen: !!state };
}

/** Button that opens a URL in the in-app viewer (or calls onOpen). */
export function InAppOpenButton({
  url,
  title,
  filePath,
  onOpen,
  className = '',
  children,
}: {
  url: string;
  title?: string;
  filePath?: string | null;
  onOpen: (payload: InAppViewerPayload) => void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen({ url, title, filePath })}
      className={className}
    >
      {children}
    </button>
  );
}
