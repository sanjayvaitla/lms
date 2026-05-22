interface UploadedFile {
    mimetype: string;
    originalname: string;
    buffer: Buffer;
}
export declare function extractTextFromFile(file: UploadedFile): Promise<{
    contentText: string;
    fileType: string;
}>;
export {};
//# sourceMappingURL=fileExtract.d.ts.map