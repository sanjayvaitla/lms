import { PlacementJob, PlacementMaterial, StudentResume, JobApplication, MockInterview, User, PlacementMatch } from '../models';
import { AppError } from '../middleware/error.middleware';
import db from '../lib/db';
import { storageAdapter, extractStorageKey } from '../lib/storage';

// ── Admin Services ────────────────────────────────────────────────────────────

export async function addPlacementJob(data: any, creatorId: string) {
  return await PlacementJob.create({
    ...data,
    created_by: creatorId,
  });
}

export async function getPlacementJobs(userRole: string, userId: string) {
  const whereClause = userRole === 'STUDENT' ? { status: 'ACTIVE' } : {};
  const jobs = await PlacementJob.findAll({
    where: whereClause,
    order: [['created_at', 'DESC']],
    include: [{ model: User, as: 'creator', attributes: ['id', 'name'] }]
  });

  const mapped = await Promise.all(jobs.map(async (j) => {
    const jv = j.toJSON() as any;
    if (jv.attachment_url) {
      try { jv.attachment_url = await storageAdapter.getUrl(jv.attachment_url); } catch { /* keep */ }
    }
    return jv;
  }));

  if (userRole === 'STUDENT') {
    const matches = await PlacementMatch.findAll({ where: { student_id: userId } });
    const matchMap = new Map(matches.map(m => [m.job_id, m]));
    return mapped.map(jv => {
      const match = matchMap.get(jv.id);
      if (match) {
        jv.match_percentage = match.match_percentage;
        jv.matching_skills = match.matching_skills;
        jv.missing_skills = match.missing_skills;
      }
      return jv;
    });
  }

  return mapped;
}

export async function deletePlacementJob(jobId: string) {
  const job = await PlacementJob.findByPk(jobId);
  if (!job) {
    throw new AppError('Job not found', 404, 'JOB_NOT_FOUND');
  }
  // Delete applications first to prevent foreign key errors
  await JobApplication.destroy({ where: { job_id: jobId } });
  return await job.destroy();
}

export async function addPlacementMaterial(data: any, uploaderId: string) {
  return await PlacementMaterial.create({
    ...data,
    uploaded_by: uploaderId,
  });
}

export async function getPlacementMaterials() {
  const rows = await PlacementMaterial.findAll({
    order: [['created_at', 'DESC']],
    include: [{ model: User, as: 'uploader', attributes: ['id', 'name'] }]
  });
  return Promise.all(rows.map(async (m) => {
    const jv = m.toJSON() as any;
    if (jv.file_url) {
      try { jv.file_url = await storageAdapter.getUrl(jv.file_url); } catch { /* keep */ }
    }
    return jv;
  }));
}

export async function deletePlacementMaterial(materialId: string) {
  const material = await PlacementMaterial.findByPk(materialId);
  if (!material) throw new AppError('Material not found', 404, 'NOT_FOUND');

  const key = extractStorageKey(material.file_url);
  if (key) {
    try {
      await storageAdapter.delete(key);
    } catch (err) {
      console.warn('[placement] Failed to delete material file from storage:', key, err);
    }
  }

  await material.destroy();
}

export async function getJobApplications(jobId: string) {
  return await JobApplication.findAll({
    where: { job_id: jobId },
    include: [
      { model: User, as: 'student', attributes: ['id', 'name', 'email', 'phone_number'] }
    ],
    order: [['applied_at', 'DESC']]
  });
}

export async function getCourseJobApplicationsStatus(jobId: string, courseId: string) {
  const { rows } = await db.query(
    `SELECT
       u.id AS "studentId",
       u.name,
       u.email,
       u.phone_number AS "phoneNumber",
       CASE WHEN ja.id IS NOT NULL THEN true ELSE false END AS "applied",
       ja.applied_at AS "appliedAt",
       sr.resume_url AS "resumeUrl"
     FROM users u
     JOIN enrollments e ON e.student_id = u.id
     JOIN batches b ON b.id = e.batch_id
     JOIN batch_courses bc ON bc.batch_id = b.id AND bc.course_id = $2
     LEFT JOIN job_applications ja ON ja.student_id = u.id AND ja.job_id = $1
     LEFT JOIN student_resumes sr ON sr.student_id = u.id
     WHERE u.role = 'STUDENT'
     GROUP BY u.id, ja.id, sr.resume_url
     ORDER BY u.name ASC`,
    [jobId, courseId]
  );
  return Promise.all(rows.map(async (r: any) => {
    if (r.resumeUrl) {
      try { r.resumeUrl = await storageAdapter.getUrl(r.resumeUrl); } catch { /* keep */ }
    }
    return r;
  }));
}

// ── Student Services ──────────────────────────────────────────────────────────

export async function checkStudentEligibility(studentId: string) {
  const interview = await MockInterview.findOne({
    where: { student_id: studentId, status: 'COMPLETED' },
  });
  return !!interview;
}

export async function getEligibleStudents() {
  const interviews = await MockInterview.findAll({
    where: { status: 'COMPLETED' },
    include: [{ model: User, as: 'student' }]
  });
  
  const studentMap = new Map<string, any>();
  for (const i of interviews) {
    if (i.student) {
      studentMap.set(i.student.id, i.student);
    }
  }
  return Array.from(studentMap.values());
}

export async function uploadStudentResume(studentId: string, resumeKey: string) {
  const isEligible = await checkStudentEligibility(studentId);
  if (!isEligible) {
    throw new AppError('You must clear a mock interview first.', 403, 'NOT_ELIGIBLE');
  }

  const [resume] = await StudentResume.upsert({
    student_id: studentId,
    resume_url: resumeKey, // store S3 key; resolve with getUrl on read
    updated_at: new Date()
  });
  return resume;
}

export async function getStudentResume(studentId: string) {
  const resume = await StudentResume.findByPk(studentId);
  if (!resume) return null;
  const jv = resume.toJSON() as any;
  if (jv.resume_url) {
    try { jv.resume_url = await storageAdapter.getUrl(jv.resume_url); } catch { /* keep */ }
  }
  return jv;
}

export async function applyForJob(studentId: string, jobId: string) {
  const isEligible = await checkStudentEligibility(studentId);
  if (!isEligible) {
    throw new AppError('You must clear a mock interview first.', 403, 'NOT_ELIGIBLE');
  }

  const resume = await StudentResume.findByPk(studentId);
  if (!resume) {
    throw new AppError('Please upload your resume before applying.', 400, 'NO_RESUME');
  }

  const job = await PlacementJob.findByPk(jobId);
  if (!job || job.status !== 'ACTIVE') {
    throw new AppError('Job is not active or does not exist.', 404, 'JOB_NOT_FOUND');
  }

  const existing = await JobApplication.findOne({ where: { job_id: jobId, student_id: studentId } });
  if (existing) {
    throw new AppError('You have already applied for this job.', 400, 'ALREADY_APPLIED');
  }

  return await JobApplication.create({
    job_id: jobId,
    student_id: studentId,
    status: 'APPLIED',
  });
}

export async function getStudentApplications(studentId: string) {
  return await JobApplication.findAll({
    where: { student_id: studentId },
    include: [{ model: PlacementJob, as: 'job' }]
  });
}
