import path from 'path';
import fs from 'fs';

export const UPLOADS_ROOT = path.join(__dirname, '../../uploads');
export const ASSIGNMENTS_DIR = path.join(UPLOADS_ROOT, 'assignments');
export const DATASETS_DIR = path.join(UPLOADS_ROOT, 'datasets');

export function ensureUploadDirs(): void {
  for (const dir of [UPLOADS_ROOT, ASSIGNMENTS_DIR, DATASETS_DIR]) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }
}

export function safeFilename(original: string): string {
  const base = path.basename(original).replace(/[^a-zA-Z0-9._-]/g, '_');
  return `${Date.now()}-${base}`;
}

export function relativeUploadPath(subdir: string, filename: string): string {
  return path.join(subdir, filename).replace(/\\/g, '/');
}
