import { Request, Response } from 'express';
export declare function dashboard(_req: Request, res: Response): Promise<void>;
export declare function listDatasets(req: Request, res: Response): Promise<void>;
export declare function uploadDataset(req: Request, res: Response): Promise<void>;
export declare function getDataset(req: Request, res: Response): Promise<void>;
export declare function deleteDataset(req: Request, res: Response): Promise<void>;
export declare function listQuestions(req: Request, res: Response): Promise<void>;
export declare function createQuestion(req: Request, res: Response): Promise<void>;
export declare function deleteQuestion(req: Request, res: Response): Promise<void>;
export declare function listQuizzes(req: Request, res: Response): Promise<void>;
export declare function createQuiz(req: Request, res: Response): Promise<void>;
export declare function updateQuiz(req: Request, res: Response): Promise<void>;
export declare function deleteQuiz(req: Request, res: Response): Promise<void>;
export declare function previewRandom(req: Request, res: Response): Promise<void>;
export declare function startAttempt(req: Request, res: Response): Promise<void>;
export declare function submitAttempt(req: Request, res: Response): Promise<void>;
export declare function listAttempts(req: Request, res: Response): Promise<void>;
//# sourceMappingURL=quizzes.controller.d.ts.map