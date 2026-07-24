import { MockInterview, User, Course } from '../models';
import { AppError } from '../middleware/error.middleware';
import { sendEmail, mockInterviewAssignedEmail, trainerMockInterviewAssignedEmail, mockInterviewFeedbackEmail } from '../lib/email';
import { Op } from 'sequelize';
import moment from 'moment-timezone';

interface CreateInterviewDto {
  student_id: string;
  trainer_id: string;
  course_id?: string | null;
  start_time: string;
  end_time: string;
  meeting_link?: string;
  is_ai_driven?: boolean;
  ai_topic?: string;
  ai_context_file_url?: string;
  ai_domain?: string;
  ai_experience?: string;
}

interface GradeInterviewDto {
  score?: number;
  score_technical?: number;
  score_problem_solving?: number;
  score_coding?: number;
  score_project?: number;
  score_debugging?: number;
  feedback: string;
  key_strengths?: string | string[];
  areas_of_improvement?: string | string[];
  status?: string;
}

export async function createInterview(data: CreateInterviewDto, creatorId: string) {
  // Validate student and trainer exist
  const student = await User.findByPk(data.student_id);
  const trainer = await User.findByPk(data.trainer_id);

  if (!student || student.role !== 'STUDENT') {
    throw new AppError('Invalid student ID', 400, 'VALIDATION_ERROR');
  }
  if (!trainer || trainer.role !== 'TRAINER') {
    throw new AppError('Invalid trainer ID', 400, 'VALIDATION_ERROR');
  }

  // Create the interview
  const interview = await MockInterview.create({
    student_id: data.student_id,
    trainer_id: data.trainer_id,
    course_id: data.course_id || null,
    created_by: creatorId,
    start_time: new Date(data.start_time),
    end_time: new Date(data.end_time),
    meeting_link: data.meeting_link || '',
    status: 'SCHEDULED',
    is_ai_driven: data.is_ai_driven || false,
    ai_topic: data.ai_topic || null,
    ai_context_file_url: data.ai_context_file_url || null,
    ai_domain: data.ai_domain || null,
    ai_experience: data.ai_experience || null,
  });

  const formattedDate = moment(interview.start_time).format('MMMM Do YYYY');
  const formattedTime = moment(interview.start_time).format('h:mm A z');

  // Send email to student
  try {
    if (student.email) {
      const emailOpts = mockInterviewAssignedEmail(
        student.name,
        formattedDate,
        formattedTime,
        interview.meeting_link
      );
      emailOpts.to = student.email;
      await sendEmail(emailOpts);
    }
  } catch (err) {
    console.error('[MockInterview] Failed to send email to student:', err);
    // Don't fail the request if email fails
  }

  // Send email to trainer
  try {
    if (trainer.email) {
      const trainerEmailOpts = trainerMockInterviewAssignedEmail(
        trainer.name,
        student.name,
        formattedDate,
        formattedTime,
        interview.meeting_link
      );
      trainerEmailOpts.to = trainer.email;
      await sendEmail(trainerEmailOpts);
    }
  } catch (err) {
    console.error('[MockInterview] Failed to send email to trainer:', err);
  }

  return getInterviewById(interview.id);
}

export async function getInterviewById(id: string, userRole?: string, userId?: string) {
  const interview = await MockInterview.findByPk(id, {
    include: [
      { model: User, as: 'student', attributes: ['id', 'name', 'email', 'avatar_url'] },
      { model: User, as: 'trainer', attributes: ['id', 'name', 'email', 'avatar_url'] },
      { model: User, as: 'creator', attributes: ['id', 'name'] },
      { model: Course, as: 'course', attributes: ['id', 'title'] },
    ],
  });
  if (!interview) throw new AppError('Interview not found', 404, 'NOT_FOUND');

  if (userRole === 'STUDENT' && interview.student_id !== userId) {
    throw new AppError('Interview not found', 404, 'NOT_FOUND');
  }
  if (userRole === 'TRAINER' && interview.trainer_id !== userId) {
    throw new AppError('Interview not found', 404, 'NOT_FOUND');
  }

  // Students only see published scores
  if (userRole === 'STUDENT' && !interview.is_published) {
    const plain = interview.toJSON() as any;
    delete plain.score;
    delete plain.score_technical;
    delete plain.score_problem_solving;
    delete plain.score_coding;
    delete plain.score_project;
    delete plain.score_debugging;
    delete plain.feedback;
    delete plain.key_strengths;
    delete plain.areas_of_improvement;
    return plain;
  }

  return interview;
}

export async function listInterviews(userRole: string, userId: string) {
  let whereClause = {};

  if (userRole === 'STUDENT') {
    // Students only see their own assigned interviews
    whereClause = { student_id: userId };
  } else if (userRole === 'TRAINER') {
    // Trainers only see interviews they are assigned to conduct
    whereClause = { trainer_id: userId };
  }
  // Admin/L&D Manager see all (whereClause remains empty)

  const interviews = await MockInterview.findAll({
    where: whereClause,
    include: [
      { model: User, as: 'student', attributes: ['id', 'name', 'email', 'avatar_url'] },
      { model: User, as: 'trainer', attributes: ['id', 'name', 'email', 'avatar_url'] },
      { model: Course, as: 'course', attributes: ['id', 'title'] },
    ],
    order: [['start_time', 'ASC']],
  });

  return interviews;
}

export async function gradeInterview(id: string, data: GradeInterviewDto) {
  const interview = await MockInterview.findByPk(id);
  if (!interview) throw new AppError('Interview not found', 404, 'NOT_FOUND');

  // Convert array to string for text fields
  const ks = Array.isArray(data.key_strengths) ? data.key_strengths.join(', ') : data.key_strengths;
  const aoi = Array.isArray(data.areas_of_improvement) ? data.areas_of_improvement.join(', ') : data.areas_of_improvement;

  let totalScore = data.score;
  if (
    data.score_technical !== undefined ||
    data.score_problem_solving !== undefined ||
    data.score_coding !== undefined ||
    data.score_project !== undefined ||
    data.score_debugging !== undefined
  ) {
    totalScore = (data.score_technical || 0) + 
                 (data.score_problem_solving || 0) + 
                 (data.score_coding || 0) + 
                 (data.score_project || 0) + 
                 (data.score_debugging || 0);
  }

  await interview.update({
    score: totalScore,
    score_technical: data.score_technical,
    score_problem_solving: data.score_problem_solving,
    score_coding: data.score_coding,
    score_project: data.score_project,
    score_debugging: data.score_debugging,
    feedback: data.feedback,
    key_strengths: ks,
    areas_of_improvement: aoi,
    status: data.status || 'COMPLETED',
  });

  // Send feedback email to student
  try {
    const updatedInterview = await getInterviewById(id);
    if (updatedInterview.student && updatedInterview.student.email) {
      const emailOpts = mockInterviewFeedbackEmail(updatedInterview.student.name);
      emailOpts.to = updatedInterview.student.email;
      await sendEmail(emailOpts);
    }
  } catch (err) {
    console.error('[MockInterview] Failed to send feedback email:', err);
  }

  return getInterviewById(id);
}

export async function deleteInterview(id: string) {
  const interview = await MockInterview.findByPk(id);
  if (!interview) throw new AppError('Interview not found', 404, 'NOT_FOUND');

  await interview.destroy();
  return { success: true };
}

export async function publishInterview(id: string) {
  const interview = await MockInterview.findByPk(id);
  if (!interview) throw new AppError('Interview not found', 404, 'NOT_FOUND');

  await interview.update({ is_published: true });
  
  // Send feedback email to student
  try {
    const updatedInterview = await getInterviewById(id);
    if (updatedInterview.student && updatedInterview.student.email) {
      const emailOpts = mockInterviewFeedbackEmail(updatedInterview.student.name);
      emailOpts.to = updatedInterview.student.email;
      await sendEmail(emailOpts);
    }
  } catch (err) {
    console.error('[MockInterview] Failed to send feedback email:', err);
  }

  return getInterviewById(id);
}
