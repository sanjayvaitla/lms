import type { CreateQuestionInput, CreateQuizInput } from '../validators/quiz.validator';
export declare function getQuizDashboard(): Promise<{
    totalModules: any;
    totalQuestions: any;
    totalQuizzes: any;
    releasedQuizzes: any;
    totalAttempts: any;
}>;
export declare function listDatasets(courseId?: string): Promise<any[]>;
export declare function uploadDataset(courseId: string, title: string, uploadedBy: string, file: {
    mimetype: string;
    originalname: string;
    buffer: Buffer;
}): Promise<any>;
export declare function getDataset(id: string): Promise<any>;
export declare function deleteDataset(id: string): Promise<void>;
export declare function listQuestions(filters: {
    courseId?: string;
    moduleId?: string;
}): Promise<any[]>;
export declare function createQuestion(input: CreateQuestionInput): Promise<any>;
export declare function deleteQuestion(id: string): Promise<void>;
export declare function listQuizzes(filters: {
    courseId?: string;
    releasedOnly?: boolean;
}): Promise<any[]>;
export declare function createQuiz(input: CreateQuizInput, createdBy: string): Promise<any>;
export declare function updateQuiz(id: string, input: Partial<CreateQuizInput>): Promise<any>;
export declare function deleteQuiz(id: string): Promise<void>;
export declare function startAttempt(quizId: string, studentId: string): Promise<{
    attempt: any;
    questions: {
        id: string;
        questionText: string;
        questionType: string;
        options: string[];
        points: number;
    }[];
    timeLimitMinutes: unknown;
}>;
export declare function submitAttempt(attemptId: string, answers: {
    questionId: string;
    selectedAnswer: string;
}[]): Promise<{
    score: number;
    earnedPoints: number;
    totalPoints: number;
    passed: boolean;
}>;
export declare function listAttempts(quizId?: string): Promise<any[]>;
export declare function previewRandomDraw(quizId: string): Promise<{
    poolSize: number;
    questionsPerAttempt: number;
    draws: {
        studentLabel: string;
        questionIds: string[];
        questions: {
            id: string;
            text: string;
        }[];
    }[];
}>;
//# sourceMappingURL=quizzes.service.d.ts.map