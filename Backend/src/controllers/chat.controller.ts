import { Request, Response } from 'express';
import Groq from 'groq-sdk';
import db from '../lib/db';
import { storageAdapter } from '../lib/storage';
import { extractTextFromFile } from '../lib/fileExtract';
import { resolveGroqModel } from '../lib/groq';
import { ensureBatchModuleProgress } from '../services/batch-progress.service';

const GROQ_API_KEY = process.env.GROQ_API_KEY ?? '';
const GROQ_MODEL = resolveGroqModel('chat');

const VTRICKS_POLICY = `
Thank you for choosing Vtricks Technologies for your learning journey.
Before your learning journey begins, please carefully review the following Admission Policies,
Terms & Conditions and reply with your acknowledgement:
● Regular attendance needs to be maintained.
● 100% participation with maximum performance in all assessments conducted.
● Assignments must be submitted on time.
● Sharing of LMS login credentials is strictly prohibited and may lead to a permanent block of access.
● Change of batch will be accepted only for genuine reasons.
● Timely payment of fees is mandatory; delay may affect your course continuity and can lead to discontinuation.
● No refund will be provided unless there is a valid medical reason (batch transfer is allowed with medical certificates).
● After course completion, the project submission is mandatory to avail placement assistance.
● Admission confirmation requires you to start the course within 2 months and clear all dues within 3 months.
● For freshers, all backlogs in graduation or post-graduation must be cleared before availing placement assistance.
Wishing you all the best for your learning journey.
`;

/** Student may use SLM context only when enrolled and the session is unlocked for their batch. */
async function studentCanAccessModuleSlm(
  studentId: string,
  moduleId: string,
  enrollmentId?: string,
): Promise<boolean> {
  const modRes = await db.query<{ course_id: string }>(
    'SELECT course_id FROM course_modules WHERE id = $1',
    [moduleId],
  );
  if (!modRes.rows.length) return false;
  const courseId = modRes.rows[0].course_id;

  let batchId: string | null = null;
  if (enrollmentId) {
    const enr = await db.query<{ batch_id: string }>(
      `SELECT e.batch_id
       FROM enrollments e
       JOIN batch_courses bc ON bc.batch_id = e.batch_id AND bc.course_id = $3
       WHERE e.id = $1 AND e.student_id = $2`,
      [enrollmentId, studentId, courseId],
    );
    batchId = enr.rows[0]?.batch_id ?? null;
  } else {
    const enr = await db.query<{ batch_id: string }>(
      `SELECT e.batch_id
       FROM enrollments e
       JOIN batch_courses bc ON bc.batch_id = e.batch_id AND bc.course_id = $2
       WHERE e.student_id = $1
       ORDER BY e.enrolled_at DESC
       LIMIT 1`,
      [studentId, courseId],
    );
    batchId = enr.rows[0]?.batch_id ?? null;
  }
  if (!batchId) return false;

  await ensureBatchModuleProgress(batchId, courseId);
  const bmp = await db.query<{ status: string }>(
    `SELECT status FROM batch_module_progress WHERE batch_id = $1 AND module_id = $2`,
    [batchId, moduleId],
  );
  const status = bmp.rows[0]?.status;
  return status === 'RELEASED' || status === 'COMPLETED';
}

export async function handleStudentChat(req: Request, res: Response) {
  try {
    const { message, moduleId, enrollmentId, history = [] } = req.body;
    const studentId = req.user?.userId;

    if (!message) {
      return res.status(400).json({ success: false, message: 'Message is required' });
    }

    if (!GROQ_API_KEY) {
      return res.status(500).json({ success: false, message: 'GROQ_API_KEY is not configured in the backend.' });
    }

    let slmContext = '';

    // If a moduleId is provided, fetch SLMs only when the student can access that session
    if (moduleId && studentId) {
      const allowed = await studentCanAccessModuleSlm(studentId, moduleId, enrollmentId);
      if (allowed) {
        const slmRes = await db.query(
          `SELECT file_path FROM session_references WHERE module_id = $1 AND type = 'SLM' LIMIT 3`,
          [moduleId],
        );

        for (const row of slmRes.rows) {
          if (row.file_path) {
            try {
              const buffer = await storageAdapter.download(row.file_path);
              const extracted = await extractTextFromFile({
                buffer,
                mimetype: 'application/pdf',
                originalname: 'slm.pdf',
              });
              slmContext += `\\n\\n--- Document Context ---\\n${extracted.contentText.substring(0, 5000)}`;
            } catch (err) {
              console.error('Failed to extract text from SLM:', err);
            }
          }
        }
      }
    }

    const systemPrompt = `You are a helpful teaching assistant chatbot for students at Vtricks Technologies. 
Your goal is to resolve doubts related to the students' courses based on the provided document context (SLMs) if available.
Do NOT give direct code answers to assignments, guide the student to the answer with hints.
If the student asks about policies, strictly adhere to the following Vtricks Admission Policy:
${VTRICKS_POLICY}

${slmContext ? `Here is context extracted from the student's current module learning materials:\n${slmContext}` : ''}
`;

    const groq = new Groq({ apiKey: GROQ_API_KEY });

    const messages: Groq.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...history.map((h: any) => ({ role: h.role, content: h.content })),
      { role: 'user', content: message },
    ];

    const completion = await groq.chat.completions.create({
      model: GROQ_MODEL,
      messages: messages,
      temperature: 0.7,
      max_tokens: 1024,
    });

    const reply = completion.choices[0]?.message?.content || 'I could not generate a response.';

    return res.json({ success: true, reply });
  } catch (err: any) {
    console.error('Chat error:', err);
    return res.status(500).json({ success: false, message: err.message || 'Failed to process chat' });
  }
}
