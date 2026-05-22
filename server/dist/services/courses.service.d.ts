import type { CreateCourseInput, UpdateCourseInput } from '../validators/course.validator';
export declare function listCourses(query: {
    search?: string;
    category?: string;
    status?: string;
    level?: string;
    page: number;
    limit: number;
    trainerId?: string;
}): Promise<{
    courses: {
        id: any;
        title: any;
        category: any;
        status: any;
        level: any;
        durationMonths: any;
        description: any;
        colorToken: any;
        trainer: {
            id: any;
            name: any;
        } | null;
        batchCount: any;
        studentCount: any;
        completionPct: any;
        createdAt: any;
        updatedAt: any;
    }[];
    total: number;
    page: number;
    totalPages: number;
}>;
export declare function getCourse(id: string): Promise<{
    id: any;
    title: any;
    category: any;
    status: any;
    level: any;
    durationMonths: any;
    description: any;
    colorToken: any;
    trainer: {
        id: any;
        name: any;
    } | null;
    batchCount: any;
    createdAt: any;
    updatedAt: any;
}>;
export declare function createCourse(input: CreateCourseInput, forcedTrainerId?: string): Promise<{
    id: any;
    title: any;
    category: any;
    status: any;
    level: any;
    durationMonths: any;
    description: any;
    colorToken: any;
    trainer: {
        id: any;
        name: any;
    } | null;
    batchCount: any;
    createdAt: any;
    updatedAt: any;
}>;
export declare function updateCourse(id: string, input: UpdateCourseInput, trainerId?: string): Promise<{
    id: any;
    title: any;
    category: any;
    status: any;
    level: any;
    durationMonths: any;
    description: any;
    colorToken: any;
    trainer: {
        id: any;
        name: any;
    } | null;
    batchCount: any;
    createdAt: any;
    updatedAt: any;
}>;
export declare function unarchiveCourse(id: string): Promise<{
    id: any;
    title: any;
    category: any;
    status: any;
    level: any;
    durationMonths: any;
    description: any;
    colorToken: any;
    trainer: {
        id: any;
        name: any;
    } | null;
    batchCount: any;
    createdAt: any;
    updatedAt: any;
}>;
export declare function deleteCourse(id: string): Promise<{
    action: 'archived' | 'deleted';
}>;
//# sourceMappingURL=courses.service.d.ts.map