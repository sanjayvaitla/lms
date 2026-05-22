import { z } from 'zod';

export const createDatasetSchema = z.object({
  courseId: z.string().uuid(),
  title:    z.string().min(2),
});

export const createQuestionSchema = z.object({
  courseId:       z.string().uuid(),
  moduleId:       z.string().uuid().optional(),
  datasetId:      z.string().uuid().optional(),
  questionText:   z.string().min(5),
  questionType:   z.enum(['MCQ', 'TRUE_FALSE', 'SHORT_ANSWER']).default('MCQ'),
  options:        z.array(z.string().min(1)).min(2).optional(),
  correctAnswer:  z.string().min(1),
  explanation:    z.string().optional(),
  points:         z.coerce.number().int().min(1).default(1),
  difficulty:     z.enum(['EASY', 'MEDIUM', 'HARD']).default('MEDIUM'),
  tags:           z.string().optional(),
});

export const updateQuestionSchema = createQuestionSchema.partial().omit({ courseId: true });

export const createQuizSchema = z.object({
  courseId:             z.string().uuid(),
  moduleId:             z.string().uuid(),
  title:                z.string().min(2),
  description:          z.string().optional(),
  questionsPerAttempt:  z.coerce.number().int().min(1).default(10),
  timeLimitMinutes:     z.coerce.number().int().min(1).optional(),
  passingScore:         z.coerce.number().int().min(0).max(100).default(60),
  randomizeQuestions:   z.boolean().default(true),
  randomizeOptions:     z.boolean().default(true),
  maxAttempts:          z.coerce.number().int().min(1).default(1),
  status:               z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']).default('DRAFT'),
});

export const updateQuizSchema = createQuizSchema.partial().omit({ courseId: true, moduleId: true });

export const startAttemptSchema = z.object({
  studentId: z.string().uuid().optional(),
});

export const submitAttemptSchema = z.object({
  answers: z.array(z.object({
    questionId:      z.string().uuid(),
    selectedAnswer:  z.string(),
  })),
});

export type CreateQuestionInput = z.infer<typeof createQuestionSchema>;
export type CreateQuizInput = z.infer<typeof createQuizSchema>;
