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
    attemptId: string;
    attemptNumber: number;
    timeLimitMinutes: number | null;
    passingScore: number;
    questions: {
        id: string;
        questionText: string;
        questionType: string;
        points: number;
        difficulty: string;
        options: string[] | {
            shuffled: string[];
            correctIndex: number;
            correctLabel: string;
        } | null;
    }[];
}>;
export declare function submitAttempt(attemptId: string, answers: {
    questionId: string;
    selectedAnswer: string;
}[]): Promise<{
    attemptId: string;
    score: number;
    passed: boolean;
    earnedPoints: number;
    totalPoints: number;
}>;
export declare function listAttempts(quizId?: string): Promise<any[]>;
export declare function previewRandomDraw(quizId: string): Promise<{
    quizTitle: string;
    description: string | null;
    poolSize: number;
    questionsPerAttempt: number;
    passingScore: number;
    timeLimitMinutes: number | null;
    draws: {
        studentLabel: string;
        questions: {
            id: string;
            text: string;
            type: string;
            options: string[] | null;
            correctAnswer: string;
            explanation: string | null;
            points: number;
            difficulty: string;
        }[];
    }[];
}>;
export interface CsvImportSettings {
    title: string;
    questionsPerAttempt: number;
    timeLimitMinutes: number | null;
    passingScore: number;
    maxAttempts: number;
    status: string;
}
export declare function importQuizFromCsv(courseId: string, moduleId: string, createdBy: string, file: {
    buffer: Buffer;
    originalname: string;
    mimetype: string;
}): Promise<{
    quizId: string;
    title: any;
    questionsImported: number;
    moduleTitle: any;
}>;
//# sourceMappingURL=quizzes.service.d.ts.map