import { BatchSessionFeedbackConfig, SessionFeedback } from '../models';
import db from '../lib/db';
import { AppError } from '../middleware/error.middleware';

export async function getFeedbackConfig(batchId: string) {
  const configs = await BatchSessionFeedbackConfig.findAll({
    where: { batchId },
  });
  return configs;
}

export async function updateFeedbackConfig(batchId: string, moduleIds: string[]) {
  // Clear old config for batch
  await BatchSessionFeedbackConfig.destroy({ where: { batchId } });

  // Create new config
  if (moduleIds.length > 0) {
    const data = moduleIds.map((moduleId) => ({
      batchId,
      moduleId,
      requiresFeedback: true,
    }));
    await BatchSessionFeedbackConfig.bulkCreate(data);
  }

  return getFeedbackConfig(batchId);
}

export async function getStudentFeedbackStatus(enrollmentId: string, moduleId: string, studentId: string) {
  // First, find the batchId from the enrollment
  const enrollRes = await db.query<any>(`SELECT batch_id FROM enrollments WHERE id = $1 AND student_id = $2`, [enrollmentId, studentId]);
  if (!enrollRes.rows.length) return { requiresFeedback: false, submitted: false };
  const batchId = enrollRes.rows[0].batch_id;

  const config = await BatchSessionFeedbackConfig.findOne({
    where: { batchId, moduleId },
  });

  const requiresFeedback = !!config?.requiresFeedback;

  const existingFeedback = await SessionFeedback.findOne({
    where: { batchId, moduleId, studentId },
  });

  return {
    requiresFeedback,
    submitted: !!existingFeedback,
    batchId, // return batchId so frontend can use it in the submit payload
  };
}


interface SubmitFeedbackDto {
  enrollmentId: string;
  moduleId: string;
  sessionContentRelevance: number;
  conceptExplanation: number;
  practicalDemonstration: number;
  learningMaterialQuality: number;
  overallSessionSatisfaction: number;
  valuableTakeaway?: string;
  suggestionsImprovement?: string;
}

export async function submitStudentFeedback(studentId: string, data: SubmitFeedbackDto) {
  const { requiresFeedback, submitted, batchId } = await getStudentFeedbackStatus(data.enrollmentId, data.moduleId, studentId);

  if (!requiresFeedback || !batchId) {
    throw new AppError('Feedback is not required for this session', 400, 'NOT_REQUIRED');
  }

  if (submitted) {
    throw new AppError('Feedback already submitted for this session', 400, 'ALREADY_SUBMITTED');
  }

  const feedback = await SessionFeedback.create({
    studentId,
    batchId,
    moduleId: data.moduleId,
    sessionContentRelevance: data.sessionContentRelevance,
    conceptExplanation: data.conceptExplanation,
    practicalDemonstration: data.practicalDemonstration,
    learningMaterialQuality: data.learningMaterialQuality,
    overallSessionSatisfaction: data.overallSessionSatisfaction,
    valuableTakeaway: data.valuableTakeaway || null,
    suggestionsImprovement: data.suggestionsImprovement || null,
  });

  return feedback;
}

interface SubmitCourseFeedbackDto {
  enrollmentId: string;
  courseId: string;
  courseContentQuality: number;
  conceptClarity: number;
  practicalExercises: number;
  courseAssessmentStructure: number;
  overallCourseSatisfaction: number;
  additionalComments?: string;
  mostUsefulTopic?: string;
  additionalTopics?: string;
}

import { CourseFeedback } from '../models/CourseFeedback';
import { ProgramFeedback } from '../models/ProgramFeedback';
import { User } from '../models/User';

export async function submitCourseFeedback(studentId: string, data: SubmitCourseFeedbackDto) {
  // Find batchId
  const enrollRes = await db.query<any>(`SELECT batch_id FROM enrollments WHERE id = $1 AND student_id = $2`, [data.enrollmentId, studentId]);
  if (!enrollRes.rows.length) throw new AppError('Enrollment not found', 404, 'NOT_FOUND');
  const batchId = enrollRes.rows[0].batch_id;

  const existingFeedback = await CourseFeedback.findOne({
    where: { batchId, courseId: data.courseId, studentId },
  });

  if (existingFeedback) {
    throw new AppError('Feedback already submitted for this course', 400, 'ALREADY_SUBMITTED');
  }

  const feedback = await CourseFeedback.create({
    studentId,
    batchId,
    courseId: data.courseId,
    courseContentQuality: data.courseContentQuality,
    conceptClarity: data.conceptClarity,
    practicalExercises: data.practicalExercises,
    courseAssessmentStructure: data.courseAssessmentStructure,
    overallCourseSatisfaction: data.overallCourseSatisfaction,
    additionalComments: data.additionalComments || null,
    mostUsefulTopic: data.mostUsefulTopic || null,
    additionalTopics: data.additionalTopics || null,
  });

  return feedback;
}

export async function getPendingFeedback(studentId: string) {
  const res = await db.query<any>(`
    SELECT
      e.id AS "enrollmentId",
      c.batch_id AS "batchId",
      c.module_id AS "moduleId",
      COALESCE(cm.title, am.title, 'Session') AS "title"
    FROM enrollments e
    JOIN batch_session_feedback_config c ON c.batch_id = e.batch_id
    LEFT JOIN session_feedbacks sf
      ON sf.module_id = c.module_id
     AND sf.student_id = e.student_id
    LEFT JOIN course_modules cm ON cm.id = c.module_id
    LEFT JOIN attendance_sessions am ON am.id = c.module_id
    WHERE e.student_id = $1
      AND c.requires_feedback = true
      AND sf.id IS NULL
    LIMIT 1
  `, [studentId]);

  return res.rows[0] || null;
}

export async function getBatchFeedbackResponses(batchId: string) {
  const res = await db.query<any>(`
    SELECT
      sf.id,
      sf.student_id AS "studentId",
      u.name AS "studentName",
      u.email AS "studentEmail",
      sf.module_id AS "moduleId",
      cm.course_id AS "courseId",
      COALESCE(cm.title, am.title, 'Unknown Session') AS "sessionTitle",
      sf.conceptual_understanding AS "conceptualUnderstanding",
      sf.problem_solving AS "problemSolving",
      sf.hands_on_experience AS "handsOnExperience",
      sf.class_participation AS "classParticipation",
      sf.punctuality,
      sf.additional_comments AS "additionalComments",
      sf.created_at AS "createdAt"
    FROM session_feedbacks sf
    JOIN users u ON u.id = sf.student_id
    LEFT JOIN course_modules cm ON cm.id = sf.module_id
    LEFT JOIN attendance_sessions am ON am.id = sf.module_id
    WHERE sf.batch_id = $1
    ORDER BY sf.created_at DESC
  `, [batchId]);

  return res.rows;
}

export async function getCourseFeedbackStatus(enrollmentId: string, courseId: string, studentId: string) {
  const enrollRes = await db.query<any>(`SELECT batch_id FROM enrollments WHERE id = $1 AND student_id = $2`, [enrollmentId, studentId]);
  if (!enrollRes.rows.length) return { submitted: false };
  const batchId = enrollRes.rows[0].batch_id;

  const existingFeedback = await CourseFeedback.findOne({
    where: { batchId, courseId, studentId },
  });

  return { submitted: !!existingFeedback };
}

export async function getBatchCourseFeedbackResponses(batchId: string) {
  const res = await db.query<any>(`
    SELECT
      cf.id,
      cf.student_id AS "studentId",
      u.name AS "studentName",
      u.email AS "studentEmail",
      c.title AS "courseTitle",
      cf.course_content_quality AS "courseContentQuality",
      cf.concept_clarity AS "conceptClarity",
      cf.practical_exercises AS "practicalExercises",
      cf.course_assessment_structure AS "courseAssessmentStructure",
      cf.overall_course_satisfaction AS "overallCourseSatisfaction",
      cf.additional_comments AS "additionalComments",
      cf.most_useful_topic AS "mostUsefulTopic",
      cf.additional_topics AS "additionalTopics",
      cf.created_at AS "createdAt"
    FROM course_feedbacks cf
    JOIN users u ON u.id = cf.student_id
    JOIN courses c ON c.id = cf.course_id
    WHERE cf.batch_id = $1
    ORDER BY cf.created_at DESC
  `, [batchId]);

  return res.rows;
}


export interface SubmitProgramFeedbackDto {
  programId: string;
  programCurriculumRelevance: number;
  learningOutcomeAchievement: number;
  practicalLearningExperience: number;
  placementCareerReadinessSupport: number;
  overallProgramSatisfaction: number;
  mostLiked?: string;
  improvementsSuggested?: string;
  additionalComments?: string;
}

export async function submitProgramFeedback(studentId: string, dto: SubmitProgramFeedbackDto) {
  const student = await User.findByPk(studentId);
  if (!student) throw new Error('Student not found');

  const existing = await ProgramFeedback.findOne({
    where: {
      programId: dto.programId,
      studentId,
    },
  });

  if (existing) {
    throw new Error('Program feedback already submitted');
  }

  const feedback = await ProgramFeedback.create({
    programId: dto.programId,
    studentId,
    studentName: student.name,
    studentEmail: student.email,
    programCurriculumRelevance: dto.programCurriculumRelevance,
    learningOutcomeAchievement: dto.learningOutcomeAchievement,
    practicalLearningExperience: dto.practicalLearningExperience,
    placementCareerReadinessSupport: dto.placementCareerReadinessSupport,
    overallProgramSatisfaction: dto.overallProgramSatisfaction,
    mostLiked: dto.mostLiked || null,
    improvementsSuggested: dto.improvementsSuggested || null,
    additionalComments: dto.additionalComments || null,
  });

  return feedback;
}

export async function getProgramFeedbackStatus(programId: string, studentId: string) {
  const existing = await ProgramFeedback.findOne({
    where: {
      programId,
      studentId,
    },
  });

  // Check if they have ANY completed batches in this program's courses
  const { rows } = await db.query(`
    SELECT 1
    FROM enrollments e
    JOIN batches b ON b.id = e.batch_id
    JOIN batch_courses bc ON bc.batch_id = b.id
    JOIN program_course_selections pcs ON pcs.course_id = bc.course_id
    JOIN program_enrollments pe ON pe.id = pcs.program_enrollment_id
    WHERE pe.program_id = $1 AND e.student_id = $2 AND b.status = 'COMPLETED'
    LIMIT 1
  `, [programId, studentId]);

  const canSubmit = rows.length > 0;

  return { submitted: !!existing, canSubmit };
}

export async function getProgramFeedbackResponses(programId: string) {
  const responses = await ProgramFeedback.findAll({
    where: { programId },
    order: [['created_at', 'DESC']],
  });
  
  return responses.map(r => ({
    id: r.id,
    programId: r.programId,
    studentId: r.studentId,
    studentName: r.studentName,
    studentEmail: r.studentEmail,
    programCurriculumRelevance: r.programCurriculumRelevance,
    learningOutcomeAchievement: r.learningOutcomeAchievement,
    practicalLearningExperience: r.practicalLearningExperience,
    placementCareerReadinessSupport: r.placementCareerReadinessSupport,
    overallProgramSatisfaction: r.overallProgramSatisfaction,
    mostLiked: r.mostLiked,
    improvementsSuggested: r.improvementsSuggested,
    additionalComments: r.additionalComments,
    createdAt: (r as any).getDataValue('created_at'),
  }));
}

