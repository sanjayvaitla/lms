interface UploadedFile {
    mimetype: string;
    originalname: string;
    buffer: Buffer;
}
export declare function uploadSyllabus(courseId: string, uploadedBy: string, file: UploadedFile): Promise<SyllabusResult>;
export declare function getSyllabus(courseId: string): Promise<SyllabusResult | null>;
export interface SyllabusResult {
    id: string;
    filename: string;
    fileType: 'PDF' | 'EXCEL';
    contentText: string;
    createdAt: string;
    uploadedByName?: string;
}
export {};
//# sourceMappingURL=syllabus.service.d.ts.map