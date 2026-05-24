export declare function listBatches(courseId?: string, trainerId?: string): Promise<{
    id: any;
    name: any;
    courseId: any;
    course: {
        id: any;
        title: any;
        category: any;
    };
    startDate: any;
    endDate: any;
    capacity: any;
    status: any;
    createdAt: any;
    _count: {
        enrollments: any;
    };
}[]>;
export declare function getBatch(id: string): Promise<{
    id: any;
    name: any;
    courseId: any;
    course: {
        id: any;
        title: any;
        category: any;
    };
    startDate: any;
    endDate: any;
    capacity: any;
    status: any;
    createdAt: any;
    enrollments: {
        id: any;
        completionPct: any;
        grade: any;
        enrolledAt: any;
        student: {
            id: any;
            name: any;
            email: any;
        };
    }[];
}>;
export declare function archiveBatch(id: string, trainerId?: string): Promise<{
    id: any;
    name: any;
    courseId: any;
    course: {
        id: any;
        title: any;
        category: any;
    };
    startDate: any;
    endDate: any;
    capacity: any;
    status: any;
    createdAt: any;
    enrollments: {
        id: any;
        completionPct: any;
        grade: any;
        enrolledAt: any;
        student: {
            id: any;
            name: any;
            email: any;
        };
    }[];
}>;
export declare function restoreBatch(id: string): Promise<{
    id: any;
    name: any;
    courseId: any;
    course: {
        id: any;
        title: any;
        category: any;
    };
    startDate: any;
    endDate: any;
    capacity: any;
    status: any;
    createdAt: any;
    enrollments: {
        id: any;
        completionPct: any;
        grade: any;
        enrolledAt: any;
        student: {
            id: any;
            name: any;
            email: any;
        };
    }[];
}>;
export declare function createBatch(input: {
    name: string;
    courseId: string;
    startDate: string;
    endDate: string;
    capacity?: number;
    status?: string;
}, trainerId?: string): Promise<{
    id: any;
    name: any;
    courseId: any;
    course: {
        id: any;
        title: any;
        category: any;
    };
    startDate: any;
    endDate: any;
    capacity: any;
    status: any;
    createdAt: any;
    enrollments: {
        id: any;
        completionPct: any;
        grade: any;
        enrolledAt: any;
        student: {
            id: any;
            name: any;
            email: any;
        };
    }[];
}>;
export declare function updateBatch(id: string, input: {
    name?: string;
    startDate?: string;
    endDate?: string;
    capacity?: number;
    status?: string;
    courseId?: string;
}, trainerId?: string): Promise<{
    id: any;
    name: any;
    courseId: any;
    course: {
        id: any;
        title: any;
        category: any;
    };
    startDate: any;
    endDate: any;
    capacity: any;
    status: any;
    createdAt: any;
    enrollments: {
        id: any;
        completionPct: any;
        grade: any;
        enrolledAt: any;
        student: {
            id: any;
            name: any;
            email: any;
        };
    }[];
}>;
export declare function deleteBatch(id: string): Promise<void>;
export declare function getAvailableStudents(batchId: string): Promise<any[]>;
export declare function enrollStudent(batchId: string, studentId: string): Promise<{
    id: any;
    name: any;
    courseId: any;
    course: {
        id: any;
        title: any;
        category: any;
    };
    startDate: any;
    endDate: any;
    capacity: any;
    status: any;
    createdAt: any;
    enrollments: {
        id: any;
        completionPct: any;
        grade: any;
        enrolledAt: any;
        student: {
            id: any;
            name: any;
            email: any;
        };
    }[];
}>;
export declare function unenrollStudent(batchId: string, studentId: string): Promise<void>;
export declare function updateEnrollment(enrollmentId: string, completionPct: number, grade?: string): Promise<void>;
export declare function getBatchAnalytics(batchId: string): Promise<{
    batch: {
        id: any;
        name: any;
        capacity: any;
        status: any;
        startDate: any;
        endDate: any;
        courseTitle: any;
    };
    totalEnrolled: any;
    capacity: any;
    avgCompletion: any;
    completed100: any;
    completionBuckets: {
        range: string;
        count: number;
    }[];
    students: {
        studentName: any;
        completionPct: any;
        grade: any;
        enrolledAt: any;
    }[];
}>;
//# sourceMappingURL=batches.service.d.ts.map