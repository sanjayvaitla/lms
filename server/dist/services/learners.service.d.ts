export interface Learner {
    id: string;
    name: string;
    email: string;
    createdAt: string;
    enrollmentCount: number;
    avgCompletion: number;
    activeBatches: number;
}
export interface LearnerEnrollment {
    enrollmentId: string;
    batchId: string;
    batchName: string;
    batchStatus: string;
    startDate: string;
    endDate: string;
    courseId: string;
    courseTitle: string;
    category: string;
    colorToken: string;
    completionPct: number;
    grade: string | null;
    enrolledAt: string;
}
export interface LearnerDetail extends Learner {
    enrollments: LearnerEnrollment[];
}
export declare function listLearners(search?: string, page?: number, limit?: number): Promise<{
    learners: Learner[];
    total: number;
    page: number;
    limit: number;
}>;
export declare function getLearner(id: string): Promise<LearnerDetail>;
export declare function createLearner(data: {
    name: string;
    email: string;
    password?: string;
}): Promise<any>;
export declare function updateLearner(id: string, data: {
    name?: string;
    email?: string;
}): Promise<any>;
export declare function deleteLearner(id: string): Promise<void>;
export declare function getAvailableBatches(learnerId: string): Promise<any[]>;
export declare function assignBatch(learnerId: string, batchId: string): Promise<any>;
export declare function removeBatch(learnerId: string, batchId: string): Promise<void>;
export declare function getDashboardStats(): Promise<any>;
//# sourceMappingURL=learners.service.d.ts.map