/**
 * storage.ts — Production S3-only file storage (no local disk).
 *
 * - Uploads go to S3 (AES256 SSE), never to the API server disk
 * - Clients always receive short-lived presigned GET URLs
 * - DB stores S3 object keys (not permanent public URLs)
 * - Local disk is disabled unless ALLOW_LOCAL_STORAGE=true AND not production
 */

import dns from 'dns';
import path from 'path';
import { S3Client, DeleteObjectCommand, HeadBucketCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { AppError } from '../middleware/error.middleware';

dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);

const BUCKET = process.env.AWS_S3_BUCKET ?? '';
const REGION = process.env.AWS_REGION ?? 'ap-south-1';
const KEY_ID = process.env.AWS_ACCESS_KEY_ID ?? '';
const SECRET = process.env.AWS_SECRET_ACCESS_KEY ?? '';
const CDN = process.env.AWS_S3_CUSTOM_DOMAIN ?? '';
const PATH_STYLE = process.env.AWS_S3_PATH_STYLE === 'true';
const IS_PROD = process.env.NODE_ENV === 'production';

export const S3_CONFIGURED = !!(BUCKET && REGION && KEY_ID && SECRET);

/** Local disk only for explicit local debugging — never in production. */
const ALLOW_LOCAL =
  !IS_PROD &&
  process.env.ALLOW_LOCAL_STORAGE === 'true' &&
  !S3_CONFIGURED;

export function assertStorageReady(): void {
  if (S3_CONFIGURED) return;
  if (ALLOW_LOCAL) return;
  throw new AppError(
    'File storage is not configured. Set AWS_S3_BUCKET, AWS_REGION, AWS_ACCESS_KEY_ID, and AWS_SECRET_ACCESS_KEY.',
    503,
    'STORAGE_UNAVAILABLE',
  );
}

let _s3: S3Client | null = null;

function getS3(): S3Client {
  if (!_s3) {
    if (!S3_CONFIGURED) {
      throw new AppError('S3 is not configured', 503, 'STORAGE_UNAVAILABLE');
    }
    _s3 = new S3Client({
      region: REGION,
      forcePathStyle: PATH_STYLE,
      credentials: { accessKeyId: KEY_ID, secretAccessKey: SECRET },
    });
  }
  return _s3;
}

/** Extract an S3 object key from a raw key, /uploads/ path, or full S3/CDN URL. */
export function extractStorageKey(value: string | null | undefined): string {
  if (!value) return '';
  const raw = String(value).trim();
  if (!raw) return '';

  if (raw.startsWith('/uploads/')) return raw.slice('/uploads/'.length);
  if (!/^https?:\/\//i.test(raw)) return raw.replace(/^\/+/, '');

  try {
    const u = new URL(raw);
    let p = decodeURIComponent(u.pathname.replace(/^\//, ''));

    // Path-style: s3.region.amazonaws.com/bucket/key
    if (PATH_STYLE && BUCKET && p.startsWith(`${BUCKET}/`)) {
      p = p.slice(BUCKET.length + 1);
    }
    // Virtual-hosted already has key in pathname
    // CDN custom domain — pathname is the key
    return p;
  } catch {
    return raw;
  }
}

async function signGetUrl(key: string, expiresIn = 3600): Promise<string> {
  const cmd = new GetObjectCommand({ Bucket: BUCKET, Key: key });
  return getSignedUrl(getS3(), cmd, { expiresIn });
}

function publicObjectUrl(key: string): string {
  if (CDN) return `${CDN.replace(/\/$/, '')}/${key}`;
  const baseUrl = PATH_STYLE
    ? `https://s3.${REGION}.amazonaws.com/${BUCKET}`
    : `https://${BUCKET}.s3.${REGION}.amazonaws.com`;
  return `${baseUrl}/${key}`;
}

export async function checkS3(): Promise<void> {
  if (!S3_CONFIGURED) {
    if (IS_PROD) {
      console.error('[storage] FATAL: S3 is required in production. Set AWS_S3_* env vars.');
      process.exit(1);
    }
    if (ALLOW_LOCAL) {
      console.warn('[storage] ALLOW_LOCAL_STORAGE=true — using local disk (dev only). Do not use in production.');
      return;
    }
    console.error('[storage] S3 not configured — uploads will fail until AWS_S3_* is set.');
    return;
  }

  try {
    await getS3().send(new HeadBucketCommand({ Bucket: BUCKET }));
    console.log(`[storage] S3 connected: ${BUCKET} (${REGION})`);
  } catch (err: any) {
    const code = err?.name ?? err?.Code ?? '';
    const msg = err?.message ?? String(err);
    if (code === 'NotFound' || code === '404') {
      console.error(`[storage] S3 bucket "${BUCKET}" not found in "${REGION}".`);
    } else if (code === 'Forbidden' || code === '403' || code === 'AccessDenied') {
      console.error(`[storage] S3 access denied for "${BUCKET}". Check IAM permissions.`);
    } else if (msg.includes('getaddrinfo') || msg.includes('ENOENT') || msg.includes('ENOTFOUND')) {
      console.error(`[storage] S3 DNS failed — check network access to amazonaws.com.`);
    } else {
      console.error(`[storage] S3 error: ${msg}`);
    }
    if (IS_PROD) {
      console.error('[storage] FATAL: refusing to start without a working S3 bucket.');
      process.exit(1);
    }
  }
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 60)
    || 'untitled';
}

function ext(originalname: string): string {
  const e = path.extname(originalname).toLowerCase();
  return e || '';
}

export type UploadType =
  | 'syllabus'
  | 'assignment'
  | 'submission'
  | 'assessment'
  | 'assessment-submission'
  | 'assessment-rubric'
  | 'quiz-dataset'
  | 'quiz-results'
  | 'avatar'
  | 'reference'
  | 'slm'
  | 'artifact'
  | 'ppt';

export interface UploadContext {
  type: UploadType;
  courseSlug?: string;
  batchSlug?: string;
  syllabusLabel?: string;
  title?: string;
  userId?: string;
  studentSlug?: string;
  moduleSlug?: string;
}

export function buildS3Key(ctx: UploadContext, originalname: string): string {
  const ts = Date.now();
  const e = ext(originalname);
  const course = ctx.courseSlug ?? 'general';

  switch (ctx.type) {
    case 'syllabus': {
      const ver = ctx.syllabusLabel ? slugify(ctx.syllabusLabel) : 'v1';
      return `syllabi/${course}/${ver}/${ts}_${course}-syllabus${e}`;
    }
    case 'assignment': {
      const batch = ctx.batchSlug ?? 'all-batches';
      const title = ctx.title ? slugify(ctx.title) : 'assignment';
      return `assignments/${course}/${batch}/${ts}_${title}.pdf`;
    }
    case 'submission': {
      const batch = ctx.batchSlug ?? 'unknown-batch';
      const title = ctx.title ? slugify(ctx.title) : 'assignment';
      const uid = ctx.userId ?? 'unknown-student';
      const student = ctx.studentSlug ?? uid;
      const base = slugify(path.basename(originalname, e)) || 'submission';
      return `student-submissions/assignments/${course}/${batch}/${title}/${uid}_${student}/${ts}_${base}${e}`;
    }
    case 'assessment': {
      const batch = ctx.batchSlug ?? 'all-batches';
      const title = ctx.title ? slugify(ctx.title) : 'assessment';
      return `assessments/${course}/${batch}/${ts}_${title}.pdf`;
    }
    case 'assessment-submission': {
      const batch = ctx.batchSlug ?? 'unknown-batch';
      const title = ctx.title ? slugify(ctx.title) : 'assessment';
      const uid = ctx.userId ?? 'unknown-student';
      const student = ctx.studentSlug ?? uid;
      const base = slugify(path.basename(originalname, e)) || 'submission';
      return `student-submissions/assessments/${course}/${batch}/${title}/${uid}_${student}/${ts}_${base}${e}`;
    }
    case 'assessment-rubric': {
      const title = ctx.title ? slugify(ctx.title) : 'rubric';
      return `assessments/${course}/rubrics/${ts}_${title}${e}`;
    }
    case 'quiz-dataset': {
      const base = slugify(path.basename(originalname, e)) || 'dataset';
      return `quiz-datasets/${course}/${ts}_${base}${e}`;
    }
    case 'quiz-results': {
      const batch = ctx.batchSlug ?? 'unknown-batch';
      const student = ctx.studentSlug ?? ctx.userId ?? 'student';
      const title = ctx.title ? slugify(ctx.title) : 'quiz';
      return `student-submissions/quiz-results/${course}/${batch}/${student}_${title}_${ts}.csv`;
    }
    case 'avatar': {
      const uid = ctx.userId ?? 'unknown';
      return `avatars/users/${uid}/${ts}${e}`;
    }
    case 'reference': {
      const mod = ctx.moduleSlug ?? 'general';
      const base = slugify(path.basename(originalname, e)) || 'reference';
      return `references/${course}/${mod}/${ts}_${base}${e}`;
    }
    case 'slm': {
      const mod = ctx.moduleSlug ?? 'general';
      const title = ctx.title ? slugify(ctx.title) : slugify(path.basename(originalname, e)) || 'slm';
      return `slm/${course}/${mod}/${ts}_${title}${e}`;
    }
    case 'artifact': {
      const mod = ctx.moduleSlug ?? 'general';
      const title = ctx.title ? slugify(ctx.title) : slugify(path.basename(originalname, e)) || 'artifact';
      return `artifacts/${course}/${mod}/${ts}_${title}${e}`;
    }
    case 'ppt': {
      const mod = ctx.moduleSlug ?? 'general';
      const title = ctx.title ? slugify(ctx.title) : slugify(path.basename(originalname, e)) || 'ppt';
      return `ppt/${course}/${mod}/${ts}_${title}${e}`;
    }
    default:
      return `uploads/misc/${ts}_${slugify(path.basename(originalname, e))}${e}`;
  }
}

export interface UploadResult {
  key: string;
  /** Short-lived presigned GET URL — never a permanent public bucket URL */
  url: string;
}

export interface StorageFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
}

async function s3UploadWithKey(file: StorageFile, key: string): Promise<UploadResult> {
  const upload = new Upload({
    client: getS3(),
    params: {
      Bucket: BUCKET,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
      ServerSideEncryption: 'AES256',
    },
  });
  await upload.done();
  const url = await signGetUrl(key, 3600);
  return { key, url };
}

/** Dev-only local fallback — memory→disk under Backend/uploads (never production). */
async function localUploadWithKey(file: StorageFile, key: string): Promise<UploadResult> {
  const fs = await import('fs');
  const root = path.join(__dirname, '../../uploads');
  const fullPath = path.join(root, key);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, file.buffer);
  // Still return a path the API can resolve — but production never hits this.
  return { key, url: `/uploads/${key}` };
}

const presignCache = new Map<string, { url: string; expiresAt: number }>();

export const storageAdapter = {
  mode: (S3_CONFIGURED ? 's3' : ALLOW_LOCAL ? 'local' : 'unavailable') as 's3' | 'local' | 'unavailable',

  async uploadWithContext(file: StorageFile, ctx: UploadContext): Promise<UploadResult> {
    assertStorageReady();
    if (file.buffer.length > 50 * 1024 * 1024) {
      throw new AppError('File too large — max 50 MB', 400, 'FILE_TOO_LARGE');
    }

    const key = buildS3Key(ctx, file.originalname);
    try {
      if (S3_CONFIGURED) return await s3UploadWithKey(file, key);
      return await localUploadWithKey(file, key);
    } catch (err: any) {
      if (err instanceof AppError) throw err;
      const msg = err?.message ?? String(err);
      if (msg.includes('ENOENT') || msg.includes('getaddrinfo') || msg.includes('ENOTFOUND')) {
        throw new AppError(
          `S3 unreachable (${REGION}). Check network/firewall for amazonaws.com.`,
          503,
          'STORAGE_UNAVAILABLE',
        );
      }
      throw new AppError(`Upload failed: ${msg}`, 502, 'UPLOAD_FAILED');
    }
  },

  async upload(file: StorageFile, folder: string): Promise<UploadResult> {
    assertStorageReady();
    if (file.buffer.length > 50 * 1024 * 1024) {
      throw new AppError('File too large — max 50 MB', 400, 'FILE_TOO_LARGE');
    }
    if (!/^[a-zA-Z0-9/_-]+$/.test(folder)) {
      throw new AppError('Invalid folder name', 400, 'VALIDATION_ERROR');
    }

    const name = `${Date.now()}-${file.originalname
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .replace(/\.{2,}/g, '.')
      .replace(/^\.+|\.+$/g, '')
      .substring(0, 100)}`;
    const key = `${folder}/${name}`;

    try {
      if (S3_CONFIGURED) return await s3UploadWithKey(file, key);
      return await localUploadWithKey(file, key);
    } catch (err: any) {
      if (err instanceof AppError) throw err;
      const msg = err?.message ?? String(err);
      if (msg.includes('ENOENT') || msg.includes('getaddrinfo') || msg.includes('ENOTFOUND')) {
        throw new AppError(
          `S3 unreachable (${REGION}). Check network/firewall for amazonaws.com.`,
          503,
          'STORAGE_UNAVAILABLE',
        );
      }
      throw new AppError(`Upload failed: ${msg}`, 502, 'UPLOAD_FAILED');
    }
  },

  async download(keyOrUrl: string): Promise<Buffer> {
    assertStorageReady();
    const key = extractStorageKey(keyOrUrl);
    if (!key) throw new AppError('No storage key provided', 400, 'VALIDATION_ERROR');

    if (!S3_CONFIGURED && ALLOW_LOCAL) {
      const fs = await import('fs');
      const full = path.join(__dirname, '../../uploads', key);
      return fs.readFileSync(full);
    }

    const cmd = new GetObjectCommand({ Bucket: BUCKET, Key: key });
    const resp = await getS3().send(cmd);
    const chunks: Uint8Array[] = [];
    for await (const chunk of resp.Body as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  },

  async delete(keyOrUrl: string): Promise<void> {
    const key = extractStorageKey(keyOrUrl);
    if (!key) return;

    if (S3_CONFIGURED) {
      await getS3().send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
      return;
    }
    if (ALLOW_LOCAL) {
      const fs = await import('fs');
      const full = path.join(__dirname, '../../uploads', key);
      if (fs.existsSync(full)) fs.unlinkSync(full);
    }
  },

  /**
   * Presigned GET URL for private S3 objects.
   * Accepts a raw key or a legacy full URL /uploads path.
   */
  async getUrl(keyOrUrl: string, expiresIn = 3600): Promise<string> {
    const key = extractStorageKey(keyOrUrl);
    if (!key) return '';

    if (!S3_CONFIGURED) {
      if (ALLOW_LOCAL) return key.startsWith('/') ? key : `/uploads/${key}`;
      throw new AppError('S3 is not configured', 503, 'STORAGE_UNAVAILABLE');
    }

    const cacheKey = `${key}:${expiresIn}`;
    const cached = presignCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.url;

    try {
      const url = await signGetUrl(key, expiresIn);
      presignCache.set(cacheKey, {
        url,
        expiresAt: Date.now() + Math.max(60, expiresIn - 300) * 1000,
      });
      return url;
    } catch {
      // Last-resort absolute URL (works only if object/bucket is public — prefer private + resign)
      return publicObjectUrl(key);
    }
  },

  async getUrls(keys: string[], expiresIn = 3600): Promise<Map<string, string>> {
    const unique = [...new Set(keys.filter(Boolean))];
    const map = new Map<string, string>();
    await Promise.all(
      unique.map(async (k) => map.set(k, await storageAdapter.getUrl(k, expiresIn))),
    );
    return map;
  },

  /** Permanent public/CDN URL — only for intentionally public objects. Prefer getUrl. */
  publicUrl(keyOrUrl: string): string {
    const key = extractStorageKey(keyOrUrl);
    if (!key) return '';
    if (!S3_CONFIGURED) {
      if (ALLOW_LOCAL) return `/uploads/${key}`;
      throw new AppError('S3 is not configured', 503, 'STORAGE_UNAVAILABLE');
    }
    return publicObjectUrl(key);
  },
};
