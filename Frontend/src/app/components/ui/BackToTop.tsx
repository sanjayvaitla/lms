import { useEffect, useState, type RefObject } from 'react';
import { ArrowUp } from 'lucide-react';

interface BackToTopProps {
  scrollRef?: RefObject<HTMLElement | null>;
}

/** Appears after scrolling — smooth scroll to top of scroll container */
export function BackToTop({ scrollRef }: BackToTopProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = scrollRef?.current ?? null;
    const target: HTMLElement | Window = el ?? window;

    const getScrollTop = () =>
      el ? el.scrollTop : window.scrollY;

    const onScroll = () => setVisible(getScrollTop() > 400);
    target.addEventListener('scroll', onScroll as EventListener, { passive: true });
    onScroll();
    return () => target.removeEventListener('scroll', onScroll as EventListener);
  }, [scrollRef]);

  if (!visible) return null;

  const scrollToTop = () => {
    const el = scrollRef?.current;
    if (el) el.scrollTo({ top: 0, behavior: 'smooth' });
    else window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <button
      type="button"
      aria-label="Back to top"
      onClick={scrollToTop}
      className="lms-back-to-top fixed bottom-6 right-6 z-40 flex h-11 w-11 items-center justify-center rounded-full bg-white/90 text-slate-700 shadow-lg ring-1 ring-slate-200/80 backdrop-blur-md lms-press hover:shadow-xl"
    >
      <ArrowUp className="h-4 w-4" />
    </button>
  );
}
