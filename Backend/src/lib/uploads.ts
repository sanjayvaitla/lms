/**
 * uploads.ts — legacy path helpers only.
 * All file I/O goes through storageAdapter (S3). Local upload dirs are not used in production.
 */
import path from 'path';

export function safeFilename(original: string): string {
  const base = path.basename(original).replace(/[^a-zA-Z0-9._-]/g, '_');
  return `${Date.now()}-${base}`;
}

export function relativeUploadPath(subdir: string, filename: string): string {
  return path.join(subdir, filename).replace(/\\/g, '/');
}
