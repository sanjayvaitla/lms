import type { CreateTrainerInput, UpdateTrainerInput } from '../validators/trainer.validator';
export declare function listTrainers(): Promise<{
    id: unknown;
    name: unknown;
    email: unknown;
    avatarUrl: unknown;
    bio: unknown;
    skills: unknown;
    linkedin: unknown;
    phone: unknown;
    createdAt: unknown;
    courseCount: {};
    studentCount: {};
    activeBatches: {};
}[]>;
export declare function getTrainer(id: string): Promise<{
    courses: any[];
    enrollmentTrend: {
        month: any;
        count: any;
    }[];
    id: unknown;
    name: unknown;
    email: unknown;
    avatarUrl: unknown;
    bio: unknown;
    skills: unknown;
    linkedin: unknown;
    phone: unknown;
    createdAt: unknown;
    courseCount: {};
    studentCount: {};
    activeBatches: {};
}>;
export declare function createTrainer(input: CreateTrainerInput): Promise<{
    courses: any[];
    enrollmentTrend: {
        month: any;
        count: any;
    }[];
    id: unknown;
    name: unknown;
    email: unknown;
    avatarUrl: unknown;
    bio: unknown;
    skills: unknown;
    linkedin: unknown;
    phone: unknown;
    createdAt: unknown;
    courseCount: {};
    studentCount: {};
    activeBatches: {};
}>;
export declare function updateTrainer(id: string, input: UpdateTrainerInput): Promise<{
    courses: any[];
    enrollmentTrend: {
        month: any;
        count: any;
    }[];
    id: unknown;
    name: unknown;
    email: unknown;
    avatarUrl: unknown;
    bio: unknown;
    skills: unknown;
    linkedin: unknown;
    phone: unknown;
    createdAt: unknown;
    courseCount: {};
    studentCount: {};
    activeBatches: {};
}>;
export declare function deleteTrainer(id: string): Promise<void>;
export declare function getTrainerStats(): Promise<any>;
//# sourceMappingURL=trainers.service.d.ts.map