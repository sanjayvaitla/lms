import Groq from 'groq-sdk';
import pdfParse from 'pdf-parse';
import db from '../lib/db';
import { AppError } from '../middleware/error.middleware';
import { storageAdapter } from '../lib/storage';

const GROQ_API_KEY = process.env.GROQ_API_KEY ?? '';
import { resolveGroqModel } from '../lib/groq';

const GROQ_MODEL = resolveGroqModel('grade');

async function parsePdf(buffer: Buffer, maxChars = 14000): Promise<string> {
  try {
    const data = await pdfParse(buffer);
    return data.text.trim().substring(0, maxChars);
  } catch {
    return '[PDF could not be parsed]';
  }
}

async function groqJson(
  groq: Groq,
  messages: Groq.Chat.Completions.ChatCompletionMessageParam[],
  maxRetries = 2,
): Promise<Record<string, unknown>> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const completion = await groq.chat.completions.create({
        model: GROQ_MODEL,
        messages,
        temperature: 0.05,
        max_tokens: 2000,
        response_format: { type: 'json_object' },
      });
      const content = completion.choices[0]?.message?.content ?? '{}';
      return JSON.parse(content) as Record<string, unknown>;
    } catch (err) {
      lastErr = err;
      if (attempt < maxRetries - 1) {
        messages.push({ role: 'assistant', content: 'I will return only valid JSON now.' });
      }
    }
  }
  throw lastErr;
}

export async function aiGradeAssessmentSubmission(
  submissionId: string,
  pdfBuffer?: Buffer,
): Promise<void> {
  if (!GROQ_API_KEY) {
    console.log('[ai-assessment-grader] no key — skipping', submissionId);
    await db.query(
      `UPDATE assessment_submissions
       SET ai_status = 'FAILED', ai_feedback = 'AI Grading failed: GROQ_API_KEY is not configured in the backend.'
       WHERE id = $1`,
      [submissionId],
    ).catch(e => console.error('Failed to update ai_status for missing key:', e));
    return;
  }

  try {
    console.log('[ai-assessment-grader] start:', submissionId);

    // Fetch the submission and assessment details
    const { rows } = await db.query<any>(
      `SELECT s.id, s.pdf_key,
              u.name AS student_name,
              a.title AS assessment_title, a.description,
              a.part_b_approach_pct,
              a.part_b_viva_pct,
              a.total_marks,
              a.part_b_marks,
              a.ai_rubric,
              a.ai_rubric_pdf_key
       FROM assessment_submissions s
       JOIN assessments a ON a.id = s.assessment_id
       JOIN users u ON u.id = s.student_id
       WHERE s.id = $1`,
      [submissionId],
    );

    if (!rows.length) throw new AppError('Submission not found', 404, 'NOT_FOUND');
    const sub = rows[0];

    // Check if there is a PDF to grade
    if (!sub.pdf_key && !pdfBuffer) {
      throw new AppError('No PDF provided for grading', 422, 'NO_CONTENT');
    }

    // Calculate actual marks for Approach and Solution
    // percentages are relative to PART B marks
    const maxApproachScore = (sub.part_b_marks * sub.part_b_approach_pct) / 100;
    // implicit solution pct
    const solutionPct = 100 - sub.part_b_approach_pct - sub.part_b_viva_pct;
    const maxSolutionScore = (sub.part_b_marks * solutionPct) / 100;

    // Download and parse PDF
    const buf = pdfBuffer ?? await storageAdapter.download(sub.pdf_key);
    const pdfText = await parsePdf(buf, 20000);

    if (pdfText.startsWith('[PDF could not')) {
      throw new AppError('PDF could not be parsed', 422, 'UNREADABLE_PDF');
    }

    const groq = new Groq({ apiKey: GROQ_API_KEY });

    // Download and parse Rubric PDF if available
    let rubricPdfText = '';
    if (sub.ai_rubric_pdf_key) {
      try {
        const rubricBuf = await storageAdapter.download(sub.ai_rubric_pdf_key);
        rubricPdfText = await parsePdf(rubricBuf, 10000);
      } catch (err) {
        console.warn('[ai-assessment-grader] Failed to parse rubric PDF', err);
      }
    }

    let rubricBlock = '';
    if (sub.ai_rubric || rubricPdfText) {
      rubricBlock = '=== GRADING RUBRIC / MODEL ANSWER ===\n';
      if (sub.ai_rubric) rubricBlock += `[Instructions]\n${sub.ai_rubric}\n\n`;
      if (rubricPdfText) rubricBlock += `[Model Answer Document]\n${rubricPdfText}\n`;
      rubricBlock += '=== END RUBRIC ===';
    } else {
      rubricBlock = 'No specific rubric provided. Grade based on standard industry best practices for the question.';
    }

    const systemPrompt = `You are an expert trainer grading an assessment submission.
Your task is to grade ONLY the "Approach" and "Solution" components of the student's answer.
Do NOT grade the "Viva" component.

${rubricBlock}

Maximum Approach Score: ${maxApproachScore}
Maximum Solution Score: ${maxSolutionScore}

Grade the student's submission carefully.
If they completely missed the point, give 0.
If they did perfectly according to the rubric, give full marks.

Return ONLY a JSON object in this exact format:
{
  "approach_score": <number between 0 and ${maxApproachScore}>,
  "solution_score": <number between 0 and ${maxSolutionScore}>,
  "feedback": "<Explain what they did well and where they lost marks in their approach and solution. Max 4 sentences.>"
}`;

    const messages: Groq.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: `Student Name: ${sub.student_name}
Assessment Title: ${sub.assessment_title}
Assessment Description: ${sub.description ?? 'None'}

=== STUDENT SUBMISSION TEXT ===
${pdfText}
=== END STUDENT SUBMISSION ===

Grade the approach and solution. Return the JSON.`,
      },
    ];

    const result = await groqJson(groq, messages);

    // Sanitize scores
    const approachScore = Math.min(maxApproachScore, Math.max(0, Number(result.approach_score) || 0));
    const solutionScore = Math.min(maxSolutionScore, Math.max(0, Number(result.solution_score) || 0));
    const feedback = String(result.feedback || 'No feedback provided.');

    // Save back to DB
    await db.query(
      `UPDATE assessment_submissions
       SET ai_approach_score = $1,
           ai_solution_score = $2,
           ai_feedback = $3,
           ai_status = 'COMPLETED'
       WHERE id = $4`,
      [approachScore, solutionScore, feedback, submissionId],
    );

    console.log(`[ai-assessment-grader] done: ${submissionId} | Approach: ${approachScore}/${maxApproachScore} | Solution: ${solutionScore}/${maxSolutionScore}`);

  } catch (err: any) {
    console.error('[ai-assessment-grader] failed:', submissionId, err.message);
    // Mark as failed in DB
    await db.query(
      `UPDATE assessment_submissions
       SET ai_status = 'FAILED', ai_feedback = $1
       WHERE id = $2`,
      [`AI Grading failed: ${err.message}`, submissionId],
    ).catch(e => console.error('Failed to update ai_status to FAILED:', e));
  }
}
