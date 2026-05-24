interface UploadedFile {
    mimetype: string;
    originalname: string;
    buffer: Buffer;
}
export interface SyllabusSession {
    session: string | number;
    module: string;
    topics: string[];
    duration: number | null;
}
export interface SyllabusSheet {
    name: string;
    courseTitle: string;
    sessions: SyllabusSession[];
}
export interface StructuredSyllabus {
    type: 'excel_structured' | 'csv_structured';
    sheets: SyllabusSheet[];
}
export interface SyllabusResult {
    id: string;
    filename: string;
    fileType: 'PDF' | 'EXCEL' | 'CSV';
    label: string | null;
    contentText: string;
    structuredData: StructuredSyllabus | null;
    createdAt: string;
    uploadedByName?: string;
}
export declare function uploadSyllabus(courseId: string, uploadedBy: string, file: UploadedFile, label?: string): Promise<SyllabusResult>;
export declare function listSyllabi(courseId: string): Promise<SyllabusResult[]>;
export declare function getSyllabus(courseId: string, syllabusId?: string): Promise<SyllabusResult | null>;
export declare function deleteSyllabus(courseId: string, syllabusId: string): Promise<void>;
export declare function assignSyllabusToBatch(batchId: string, syllabusId: string): Promise<void>;
export declare function getBatchSyllabus(batchId: string): Promise<SyllabusResult | null>;
export {};
//# sourceMappingURL=syllabus.service.d.ts.map