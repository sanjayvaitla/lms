// Minor change for verification
import { Request, Response } from 'express';
import * as placementService from '../services/placement.service';
import { storageAdapter } from '../lib/storage';
import axios from 'axios';
import { User, PlacementMatch } from '../models';

export async function addJob(req: Request, res: Response) {
  const { company_name, job_description, ctc, qualification, experience } = req.body;
  const user = req.user!;
  let attachment_url = '';

  if (req.file) {
    const uploadRes = await storageAdapter.upload(
      {
        buffer: req.file.buffer,
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
      },
      'placements/jobs'
    );
    attachment_url = uploadRes.key; // store key; signed on read
  }

  const job = await placementService.addPlacementJob({
    company_name,
    job_description,
    ctc,
    qualification,
    experience,
    attachment_url
  }, user.userId);

  // Send email to all eligible students
  const eligibleStudents = await placementService.getEligibleStudents();
  if (eligibleStudents && eligibleStudents.length > 0) {
    // Import sendEmail dynamically or use the existing email.ts import if available
    const { sendEmail, placementOpportunityEmail } = require('../lib/email');

    // We can run this in the background
    Promise.all(eligibleStudents.map((student: any) => {
      if (student.email) {
        return sendEmail(placementOpportunityEmail(
          student.name,
          company_name,
          job_description, // using job_description or "Role" since we don't have a separate job role field
          experience
        )).catch((err: any) => console.error('Failed to send placement email to', student.email, err));
      }
    })).catch(err => console.error('Error sending placement emails:', err));
  }

  // Trigger Azure Logic App Automation for Resume matching
  const webhookUrl = "https://prod-57.eastus.logic.azure.com:443/workflows/e772aeb5f88941dfa2198e6ea913db77/triggers/When_an_HTTP_request_is_received/paths/invoke?api-version=2016-10-01&sp=%2Ftriggers%2FWhen_an_HTTP_request_is_received%2Frun&sv=1.0&sig=0P8ffelzA1SVg1wX5V6rgwsmqj7yJ9HYBc5g8CC8VB0";
  axios.post(webhookUrl, { bucket_name: "lmsvtricks", job_id: job.id }).catch((err: any) => {
    console.error('Failed to trigger placement automation webhook:', err.message);
  });

  res.status(201).json({ success: true, data: job });
}

export async function getJobs(req: Request, res: Response) {
  const jobs = await placementService.getPlacementJobs(req.user!.role, req.user!.userId);
  res.json({ success: true, data: jobs });
}

export async function deleteJob(req: Request, res: Response) {
  const jobId = req.params.jobId as string;
  await placementService.deletePlacementJob(jobId);
  res.json({ success: true, message: 'Job deleted successfully' });
}

export async function addMaterial(req: Request, res: Response) {
  const { title, description } = req.body;
  const user = req.user!;

  if (!req.file) {
    return res.status(400).json({ success: false, message: 'File is required for material' });
  }

  const uploadRes = await storageAdapter.upload(
    {
      buffer: req.file.buffer,
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
    },
    'placements/materials'
  );

  const material = await placementService.addPlacementMaterial({
    title,
    description,
    file_url: uploadRes.key, // store key; signed on read
  }, user.userId);

  res.status(201).json({ success: true, data: material });
}

export async function getMaterials(req: Request, res: Response) {
  const materials = await placementService.getPlacementMaterials();
  res.json({ success: true, data: materials });
}

export async function deleteMaterial(req: Request, res: Response) {
  const materialId = req.params.materialId as string;
  await placementService.deletePlacementMaterial(materialId);
  res.json({ success: true, message: 'Material deleted successfully' });
}

export async function getJobApplications(req: Request, res: Response) {
  const jobId = req.params.jobId as string;
  const applications = await placementService.getJobApplications(jobId);

  // For each application, fetch the student's resume
  const appsWithResume = await Promise.all(applications.map(async (app) => {
    const resume = await placementService.getStudentResume(app.student_id);
    return {
      ...app.toJSON(),
      resume_url: resume?.resume_url || null
    };
  }));

  res.json({ success: true, data: appsWithResume });
}

export async function courseJobApplications(req: Request, res: Response) {
  const jobId = req.params.jobId as string;
  const courseId = req.params.courseId as string;
  const data = await placementService.getCourseJobApplicationsStatus(jobId, courseId);
  res.json({ success: true, data });
}

export async function checkEligibility(req: Request, res: Response) {
  const isEligible = await placementService.checkStudentEligibility(req.user!.userId);
  res.json({ success: true, data: { isEligible } });
}

export async function uploadResume(req: Request, res: Response) {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'Resume file is required' });
  }

  const uploadRes = await storageAdapter.upload(
    {
      buffer: req.file.buffer,
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
    },
    'placements/resumes'
  );

  const resume = await placementService.uploadStudentResume(req.user!.userId, uploadRes.key);
  res.json({ success: true, data: resume });
}

export async function getResume(req: Request, res: Response) {
  const resume = await placementService.getStudentResume(req.user!.userId);
  res.json({ success: true, data: resume });
}

export async function applyJob(req: Request, res: Response) {
  const jobId = req.params.jobId as string;
  const application = await placementService.applyForJob(req.user!.userId, jobId);
  res.status(201).json({ success: true, data: application });
}

export async function getMyApplications(req: Request, res: Response) {
  const apps = await placementService.getStudentApplications(req.user!.userId);
  res.json({ success: true, data: apps });
}

export async function saveMatchResults(req: Request, res: Response) {
  const webhookSecret = process.env.PLACEMENT_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return res.status(503).json({ success: false, message: 'Webhook not configured' });
  }
  const provided = req.headers['x-webhook-secret'] as string;
  if (provided !== webhookSecret) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  const { job_id, candidates } = req.body;
  if (!job_id || !candidates || !Array.isArray(candidates)) {
    return res.status(400).json({ success: false, message: 'Invalid payload' });
  }

  try {
    for (const candidate of candidates) {
      if (!candidate.email) continue;
      const user = await User.findOne({ where: { email: candidate.email } });
      if (user) {
        // Upsert the match result
        const existing = await PlacementMatch.findOne({ where: { job_id, student_id: user.id } });
        if (existing) {
          await existing.update({
            match_percentage: candidate.match_percentage,
            matching_skills: candidate.matching_skills,
            missing_skills: candidate.missing_skills
          });
        } else {
          await PlacementMatch.create({
            job_id,
            student_id: user.id,
            match_percentage: candidate.match_percentage,
            matching_skills: candidate.matching_skills,
            missing_skills: candidate.missing_skills
          });
        }
      }
    }
    res.json({ success: true, message: 'Match results saved successfully' });
  } catch (error: any) {
    console.error('Error saving match results:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
}
