/**
 * storage.ts — Unified file storage abstraction
 *
 * S3 is used when all four AWS env vars are set:
 *   AWS_S3_BUCKET, AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
 * Otherwise files go to local disk under server/uploads/.
 *
 * Run `npm install` in /server after adding AWS SDK packages to package.json.
 */
export declare const UPLOADS_ROOT: string;
export interface UploadResult {
    key: string;
    url: string;
    bucket?: string;
}
export interface StorageFile {
    buffer: Buffer;
    originalname: string;
    mimetype: string;
}
export declare const storageAdapter: {
    mode: "s3" | "local";
    upload(file: StorageFile, folder: string): Promise<UploadResult>;
    delete(key: string): Promise<void>;
    getUrl(key: string, expiresInSeconds?: number): Promise<string>;
};
//# sourceMappingURL=storage.d.ts.map