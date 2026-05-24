"use strict";
/**
 * storage.ts — Unified file storage abstraction
 *
 * S3 is used when all four AWS env vars are set:
 *   AWS_S3_BUCKET, AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
 * Otherwise files go to local disk under server/uploads/.
 *
 * Run `npm install` in /server after adding AWS SDK packages to package.json.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.storageAdapter = exports.UPLOADS_ROOT = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
exports.UPLOADS_ROOT = path_1.default.join(__dirname, '../../uploads');
function ensureDir(dir) {
    if (!fs_1.default.existsSync(dir))
        fs_1.default.mkdirSync(dir, { recursive: true });
}
const S3_CONFIGURED = !!(process.env.AWS_S3_BUCKET &&
    process.env.AWS_REGION &&
    process.env.AWS_ACCESS_KEY_ID &&
    process.env.AWS_SECRET_ACCESS_KEY);
// ── S3 adapter ────────────────────────────────────────────────────────────────
async function s3Upload(file, folder) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { S3Client } = require('@aws-sdk/client-s3'); // eslint-disable-line @typescript-eslint/no-explicit-any
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Upload } = require('@aws-sdk/lib-storage'); // eslint-disable-line @typescript-eslint/no-explicit-any
    const client = new S3Client({
        region: process.env.AWS_REGION,
        credentials: {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        },
    });
    const bucket = process.env.AWS_S3_BUCKET;
    const safeName = `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const key = `${folder}/${safeName}`;
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
async function s3Delete(key) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { S3Client, DeleteObjectCommand } = require('@aws-sdk/client-s3'); // eslint-disable-line @typescript-eslint/no-explicit-any
    const client = new S3Client({
        region: process.env.AWS_REGION,
        credentials: {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        },
    });
    await client.send(new DeleteObjectCommand({ Bucket: process.env.AWS_S3_BUCKET, Key: key }));
}
// ── Local adapter ─────────────────────────────────────────────────────────────
function localUpload(file, folder) {
    const dir = path_1.default.join(exports.UPLOADS_ROOT, folder);
    ensureDir(dir);
    const safeName = `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const fullPath = path_1.default.join(dir, safeName);
    fs_1.default.writeFileSync(fullPath, file.buffer);
    const key = `${folder}/${safeName}`;
    return { key, url: `/uploads/${key}` };
}
function localDelete(key) {
    const fullPath = path_1.default.join(exports.UPLOADS_ROOT, key);
    if (fs_1.default.existsSync(fullPath))
        fs_1.default.unlinkSync(fullPath);
}
// ── Public adapter ────────────────────────────────────────────────────────────
exports.storageAdapter = {
    mode: (S3_CONFIGURED ? 's3' : 'local'),
    async upload(file, folder) {
        return S3_CONFIGURED ? s3Upload(file, folder) : localUpload(file, folder);
    },
    async delete(key) {
        if (S3_CONFIGURED)
            return s3Delete(key);
        localDelete(key);
    },
    async getUrl(key, expiresInSeconds = 3600) {
        if (!S3_CONFIGURED)
            return `/uploads/${key}`;
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3'); // eslint-disable-line @typescript-eslint/no-explicit-any
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { getSignedUrl } = require('@aws-sdk/s3-request-presigner'); // eslint-disable-line @typescript-eslint/no-explicit-any
        const client = new S3Client({
            region: process.env.AWS_REGION,
            credentials: {
                accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            },
        });
        return getSignedUrl(client, new GetObjectCommand({ Bucket: process.env.AWS_S3_BUCKET, Key: key }), { expiresIn: expiresInSeconds });
    },
};
console.log('[storage] mode =', exports.storageAdapter.mode, S3_CONFIGURED ? `(bucket: ${process.env.AWS_S3_BUCKET})` : '(local disk)');
//# sourceMappingURL=storage.js.map