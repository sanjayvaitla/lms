/** LMS in-portal media helpers — keep content inside the app (except Google Meet / Zoom / Teams). */

export function isExternalMeetingUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return /meet\.google\.com|zoom\.us|teams\.microsoft\.com|teams\.live\.com/i.test(url);
}

export function isYoutubeUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return /youtu\.be\/|youtube\.com\//i.test(url);
}

export function youtubeEmbedUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const match = url.match(/^.*(youtu\.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/);
  if (match && match[2]?.length === 11) {
    // nocookie + locked-down params — play inside LMS only
    return `https://www.youtube-nocookie.com/embed/${match[2]}?rel=0&modestbranding=1&iv_load_policy=3&playsinline=1&color=white&fs=1`;
  }
  return null;
}

export function isPdfUrl(url: string | null | undefined, filePath?: string | null): boolean {
  const s = `${filePath ?? ''} ${url ?? ''}`.toLowerCase();
  return s.includes('.pdf') || s.includes('application/pdf');
}

export function isOfficeUrl(url: string | null | undefined, filePath?: string | null): boolean {
  const s = `${filePath ?? ''} ${url ?? ''}`.toLowerCase();
  return /\.(docx?|pptx?|xlsx?)(\?|$)/i.test(s);
}

/** Build an embeddable src that stays inside an LMS iframe. Expects absolute S3/CDN URLs from the API. */
export function toInPortalViewerSrc(url: string, filePath?: string | null): string {
  // Relative /uploads paths are no longer supported — API must return absolute S3 URLs
  if (url.startsWith('/uploads/')) {
    console.warn('[inAppMedia] Relative /uploads URL ignored — configure S3 and refresh.');
  }
  if (isYoutubeUrl(url)) {
    return youtubeEmbedUrl(url) ?? url;
  }
  if (filePath) {
    const lower = filePath.toLowerCase();
    if (lower.endsWith('.pdf')) {
      return `${url}#toolbar=0&navpanes=0&scrollbar=0`;
    }
    if (/\.(docx?|pptx?|xlsx?)$/.test(lower)) {
      return `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`;
    }
  }
  if (isPdfUrl(url)) {
    return `${url}#toolbar=0&navpanes=0&scrollbar=0`;
  }
  if (isOfficeUrl(url)) {
    return `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`;
  }
  return url;
}

export type InAppViewerPayload = {
  url: string;
  title?: string;
  filePath?: string | null;
};
