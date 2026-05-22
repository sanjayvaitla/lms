import type { CreateAssignmentInput } from '../validators/assignment.validator';
export declare function getAssignmentDashboard(): Promise<{
    totalAssignments: any;
    published: any;
    totalSubmissions: any;
    pendingGrading: any;
}>;
export declare function listAssignments(filters: {
    courseId?: string;
    status?: string;
}): Promise<any[]>;
export declare function getAssignment(id: string): Promise<any>;
export declare function createAssignment(input: CreateAssignmentInput, createdBy: string, file: {
    originalname: string;
    buffer: Buffer;
    size: number;
}): Promise<any>;
export declare function updateAssignment(id: string, input: Partial<CreateAssignmentInput>): Promise<any>;
export declare function deleteAssignment(id: string): Promise<void>;
export declare function gradeSubmission(submissionId: string, score: number, feedback?: string): Promise<any>;
//# sourceMappingURL=assignments.service.d.ts.map