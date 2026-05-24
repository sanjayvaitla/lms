/**
 * storage.ts — Unified file storage abstraction
 *
 * S3 is used when all four AWS env vars are set:
 *   AWS_S3_BUCKET, AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
 * Otherwise files go to local disk under server/uploads/.
 *
 * Run `npm install` in /server after adding AWS SDK packages to package.json.
 */

import fs   from 'fs';
import path from 'path';

export const UPLOADS_ROOT = path.join(__dirname, '../../uploads');

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

export interface UploadResult {
  key:     string;   // S3 key or local relative path — store in DB
  url:     string;   // public/presigned URL (S3) or /uploads/... (local)
  bucket?: string;
}

export interface StorageFile {
  buffer:       Buffer;
  originalname: string;
  mimetype:     string;
}

const S3_CONFIGURED = !!(
  process.env.AWS_S3_BUCKET &&
  process.env.AWS_REGION &&
  process.env.AWS_ACCESS_KEY_ID &&
  process.env.AWS_SECRET_ACCESS_KEY
);

// ── S3 adapter ────────────────────────────────────────────────────────────────
async function s3Upload(file: StorageFile, folder: string): Promise<UploadResult> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { S3Client } = require('@aws-sdk/client-s3') as any;            // eslint-disable-line @typescript-eslint/no-explicit-any
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { Upload }   = require('@aws-sdk/lib-storage') as any;          // eslint-disable-line @typescript-eslint/no-explicit-any

  const client  = new S3Client({
    region:      process.env.AWS_REGION,
    credentials: {
      accessKeyId:     process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  });

  const bucket   = process.env.AWS_S3_BUCKET!;
  const safeName = `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const key      = `${folder}/${safeName}`;

  const upload = new Upload({
    client,
    params: { Bucket: bucket, Key: key, Body: file.buffer, ContentType: file.mimetype },
  });
  await upload.done();

  const url = process.env.AWS_S3_CUSTOM_DOMAIN
    ? `${process.env.AWS_S3_CUSTOM_DOMAIN}/${key}`
    : `https://${bucket}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;

  return { key, url, bucket };
}

async function s3Delete(key: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { S3Client, DeleteObjectCommand } = require('@aws-sdk/client-s3') as any; // eslint-disable-line @typescript-eslint/no-explicit-any
  const client = new S3Client({
    region:      process.env.AWS_REGION,
    credentials: {
      accessKeyId:     process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  });
  await client.send(new DeleteObjectCommand({ Bucket: process.env.AWS_S3_BUCKET, Key: key }));
}

// ── Local adapter ─────────────────────────────────────────────────────────────
function localUpload(file: StorageFile, folder: string): UploadResult {
  const dir      = path.join(UPLOADS_ROOT, folder);
  ensureDir(dir);
  const safeName = `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const fullPath = path.join(dir, safeName);
  fs.writeFileSync(fullPath, file.buffer);
  const key = `${folder}/${safeName}`;
  return { key, url: `/uploads/${key}` };
}

function localDelete(key: string): void {
  const fullPath = path.join(UPLOADS_ROOT, key);
  if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
}

// ── Public adapter ────────────────────────────────────────────────────────────
export const storageAdapter = {
  mode: (S3_CONFIGURED ? 's3' : 'local') as 's3' | 'local',

  async upload(file: StorageFile, folder: string): Promise<UploadResult> {
    return S3_CONFIGURED ? s3Upload(file, folder) : localUpload(file, folder);
  },

  async delete(key: string): Promise<void> {
    if (S3_CONFIGURED) return s3Delete(key);
    localDelete(key);
  },

  async getUrl(key: string, expiresInSeconds = 3600): Promise<string> {
    if (!S3_CONFIGURED) return `/uploads/${key}`;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { S3Client, GetObjectCommand }  = require('@aws-sdk/client-s3') as any;           // eslint-disable-line @typescript-eslint/no-explicit-any
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getSignedUrl }                = require('@aws-sdk/s3-request-presigner') as any; // eslint-disable-line @typescript-eslint/no-explicit-any
    const client = new S3Client({
      region:      process.env.AWS_REGION,
      credentials: {
        accessKeyId:     process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    });
    return getSignedUrl(
      client,
      new GetObjectCommand({ Bucket: process.env.AWS_S3_BUCKET, Key: key }),
      { expiresIn: expiresInSeconds },
    );
  },
};

console.log(
  '[storage] mode =',
  storageAdapter.mode,
  S3_CONFIGURED ? `(bucket: ${process.env.AWS_S3_BUCKET})` : '(local disk)',
);
