import { z } from 'zod';

export const createInterviewSchema = z.object({
  student_id: z.string().uuid('Invalid student ID'),
  trainer_id: z.string().uuid('Invalid trainer ID'),
  course_id: z.string().uuid('Invalid course ID').optional().nullable(),
  start_time: z.string().refine((val) => !isNaN(Date.parse(val)), { message: 'Invalid start time format' }),
  end_time: z.string().refine((val) => !isNaN(Date.parse(val)), { message: 'Invalid end time format' }),
  meeting_link: z.string().url('Invalid meeting link URL').optional().or(z.literal('')),
  is_ai_driven: z.boolean().optional(),
  ai_topic: z.string().optional(),
  ai_context_file_url: z.string().optional(),
  ai_domain: z.string().optional(),
  ai_experience: z.string().optional(),
});

export const gradeInterviewSchema = z.object({
  score_technical: z.number().min(0).max(25, 'Technical score must be between 0 and 25').optional(),
  score_problem_solving: z.number().min(0).max(20, 'Problem solving score must be between 0 and 20').optional(),
  score_coding: z.number().min(0).max(25, 'Coding score must be between 0 and 25').optional(),
  score_project: z.number().min(0).max(20, 'Project score must be between 0 and 20').optional(),
  score_debugging: z.number().min(0).max(10, 'Debugging score must be between 0 and 10').optional(),
  score: z.number().min(0).max(100, 'Score must be between 0 and 100').optional(),
  feedback: z.string().min(1, 'Feedback is required'),
  key_strengths: z.union([z.string(), z.array(z.string())]).optional(),
  areas_of_improvement: z.union([z.string(), z.array(z.string())]).optional(),
  status: z.enum(['SCHEDULED', 'COMPLETED', 'CANCELLED']).optional(),
});
