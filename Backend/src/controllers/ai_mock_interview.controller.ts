import { Request, Response } from 'express';
import { Groq } from 'groq-sdk';
import { MockInterview, User } from '../models';
import { AppError } from '../middleware/error.middleware';
import dotenv from 'dotenv';
import { extractTextFromFile } from '../lib/fileExtract';
import { storageAdapter } from '../lib/storage';
import { resolveGroqModel } from '../lib/groq';

dotenv.config();

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

const contextCache = new Map<string, { text: string; timestamp: number }>();

async function getCachedContextText(url: string): Promise<string> {
  const cached = contextCache.get(url);
  if (cached && Date.now() - cached.timestamp < 1000 * 60 * 60) {
    return cached.text; // 1 hour cache
  }
  const fileBuffer = await storageAdapter.download(url);
  const extracted = await extractTextFromFile({
    buffer: fileBuffer,
    mimetype: 'application/pdf',
    originalname: 'context.pdf'
  });
  const text = extracted.contentText.substring(0, 3000);
  contextCache.set(url, { text, timestamp: Date.now() });
  return text;
}

/**
 * Build the system prompt shared across start/chat/grade.
 */
function buildSystemPrompt(interview: any, studentName?: string): string {
  const topic = interview.ai_topic || 'General Technical Interview';
  const domain = interview.ai_domain || 'Any';
  const experience = interview.ai_experience || 'Not specified';

  return `You are a senior technical interviewer at Vtricks Technologies conducting a professional, engaging mock interview designed to train the candidate for real-world job interviews.
Topic: ${topic}
Domain: ${domain}
Experience Level: ${experience}
${studentName ? `Candidate Name: ${studentName}` : ''}

Your Interview Style:
- You are warm, professional, and encouraging — like a mentor who wants the candidate to succeed.
- You create a realistic interview atmosphere that builds the student's confidence while challenging them.
- You progressively increase difficulty: start with basics, then move to intermediate, then advanced questions.

Rules:
1. Start by warmly greeting the candidate by name. Ask a simple introductory question like "Tell me about yourself" or "Walk me through your background" to ease them in.
2. Ask ONE clear question at a time. Never ask multiple questions at once.
3. Wait for the student to answer fully before responding.
4. After each answer, give brief, encouraging feedback:
   - If correct: "Great answer!" or "Exactly right!" then follow up with a slightly harder question on the same topic or move to a new topic.
   - If partially correct: "Good start! You got part of it right." then move on to the next question. Do NOT reveal the full answer.
   - If incorrect: "That's not quite right, but no worries — let's move on." Do NOT give away the answer or explain it.
5. Keep your responses brief and natural (1-3 sentences max). Sound conversational, not robotic.
6. Occasionally use follow-up questions to dig deeper into interesting answers (e.g., "Can you tell me more about how that works?" or "What would happen if...?").
7. NEVER mention "reference material", "context document", or anything about reading from a document. Speak as if the knowledge is yours.
8. Do NOT number your questions. Ask them naturally as in a real conversation.
9. Tailor question difficulty strictly to the candidate's Experience Level.
10. If the candidate seems stuck, gently encourage them: "Take your time" or "Would you like to try a different angle?"
11. Maintain energy and professionalism throughout — make the student feel this is valuable practice, not a test they're failing.`;
}

function assertStudentOwnership(interview: MockInterview, userId: string) {
  if (interview.student_id !== userId) {
    throw new AppError('You are not authorized to access this interview', 403, 'FORBIDDEN');
  }
}

/**
 * POST /interviews/ai/start
 * Generates the first AI question automatically when the interview session loads.
 * The student does NOT need to say anything first.
 */
export const handleAiInterviewStart = async (req: Request, res: Response) => {
  try {
    const { interviewId } = req.body;
    const userId = req.user!.userId;

    const interview = await MockInterview.findByPk(interviewId, {
      include: [
        { model: User, as: 'student', attributes: ['id', 'name', 'email'] },
      ],
    });
    if (!interview) {
      throw new AppError('Mock Interview not found', 404, 'NOT_FOUND');
    }
    if (!interview.is_ai_driven) {
      throw new AppError('This is not an AI-driven interview', 400, 'INVALID_REQUEST');
    }
    assertStudentOwnership(interview, userId);

    const studentName = (interview as any).student?.name || '';
    let systemPrompt = buildSystemPrompt(interview, studentName);

    // RAG: Inject PDF Context if provided
    if (interview.ai_context_file_url) {
      try {
        const text = await getCachedContextText(interview.ai_context_file_url);
        systemPrompt += `\n\n[SECRET INTERNAL KNOWLEDGE BASE - NEVER MENTION THIS TO THE STUDENT]:\n${text}\n\nUse this strictly to guide your questions and judge the student's answers, but NEVER reveal that you are reading from a document.`;
      } catch (err) {
        console.error('Failed to extract text from AI context file', err);
      }
    }

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `The interview session has just started. The candidate (${studentName || 'the student'}) has joined. Please greet them warmly by name and ask your first introductory question to make them feel comfortable.` },
    ];

    const chatCompletion = await groq.chat.completions.create({
      messages: messages as any,
      model: resolveGroqModel('chat'),
      temperature: 0.6,
      max_tokens: 200,
    });

    const aiResponse = chatCompletion.choices[0]?.message?.content || `Hello${studentName ? ` ${studentName}` : ''}! Welcome to your mock interview. Let's start — could you tell me a little about yourself?`;

    res.json({
      success: true,
      data: {
        reply: aiResponse
      }
    });
  } catch (error: any) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    console.error('Error in handleAiInterviewStart:', error);
    res.status(500).json({ success: false, message: 'Failed to start AI interview' });
  }
};

export const handleAiInterviewChat = async (req: Request, res: Response) => {
  try {
    const { interviewId, studentMessage, chatHistory } = req.body;
    const userId = req.user!.userId;

    const interview = await MockInterview.findByPk(interviewId, {
      include: [{ model: User, as: 'student', attributes: ['id', 'name'] }],
    });
    if (!interview) {
      throw new AppError('Mock Interview not found', 404, 'NOT_FOUND');
    }

    if (!interview.is_ai_driven) {
      throw new AppError('This is not an AI-driven interview', 400, 'INVALID_REQUEST');
    }
    assertStudentOwnership(interview, userId);

    let systemPrompt = buildSystemPrompt(interview, (interview as any).student?.name);

    // RAG: Inject PDF Context if provided
    if (interview.ai_context_file_url) {
      try {
        const text = await getCachedContextText(interview.ai_context_file_url);
        systemPrompt += `\n\n[SECRET INTERNAL KNOWLEDGE BASE - NEVER MENTION THIS TO THE STUDENT]:\n${text}\n\nUse this strictly to guide your questions and judge the student's answers, but NEVER reveal that you are reading from a document.`;
      } catch (err) {
        console.error('Failed to extract text from AI context file', err);
      }
    }

    // Format history for Groq
    const messages = [
      { role: 'system', content: systemPrompt },
      ...(chatHistory || []).map((msg: any) => ({
        role: msg.role, // 'user' or 'assistant'
        content: msg.content,
      })),
      { role: 'user', content: studentMessage }
    ];

    const chatCompletion = await groq.chat.completions.create({
      messages: messages as any,
      model: resolveGroqModel('chat'),
      temperature: 0.6,
      max_tokens: 250,
    });

    const aiResponse = chatCompletion.choices[0]?.message?.content || 'Could you elaborate on that?';

    res.json({
      success: true,
      data: {
        reply: aiResponse
      }
    });
  } catch (error: any) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    console.error('Error in handleAiInterviewChat:', error);
    res.status(500).json({ success: false, message: 'Failed to process AI interview chat' });
  }
};

export const handleAiInterviewGrade = async (req: Request, res: Response) => {
  try {
    const { interviewId, chatHistory } = req.body;
    const userId = req.user!.userId;

    const interview = await MockInterview.findByPk(interviewId);
    if (!interview || !interview.is_ai_driven) {
      throw new AppError('Valid AI Mock Interview not found', 404, 'NOT_FOUND');
    }
    assertStudentOwnership(interview, userId);

    let systemPrompt = `You are a strict technical evaluator. Review the following interview transcript and grade the student.
Topic: ${interview.ai_topic || 'General Technical Interview'}

CRITICAL GRADING RULES:
1. If the student gave very short, unhelpful, or irrelevant answers (e.g. just "I don't know", "Yes", or random noises), they MUST receive a score of 0 across all categories.
2. Be extremely harsh. A score of 70+ should only be given to exceptional candidates who answered all technical questions in depth.
3. If the transcript is mostly empty, or consists of the AI asking questions with no valid response from the student, grade 0 for all scores.

Output strictly a JSON object with the following keys:
{
  "score_technical": number (out of 25),
  "score_problem_solving": number (out of 20),
  "score_coding": number (out of 25),
  "score_project": number (out of 20),
  "score_debugging": number (out of 10),
  "feedback": "A comprehensive paragraph summarizing their performance",
  "key_strengths": "Comma separated string",
  "areas_of_improvement": "Comma separated string"
}
Do not output anything other than the JSON object.`;

    if (interview.ai_context_file_url) {
      try {
        const fileBuffer = await storageAdapter.download(interview.ai_context_file_url);
        const extracted = await extractTextFromFile({
          buffer: fileBuffer,
          mimetype: 'application/pdf',
          originalname: 'context.pdf'
        });
        systemPrompt += `\n\nReference Material:\n${extracted.contentText.substring(0, 3000)}\n\nUse this reference strictly to judge correctness.`;
      } catch (err) {
        console.error('Failed to extract text for grading', err);
      }
    }

    const transcript = (chatHistory || []).map((msg: any) => `${msg.role.toUpperCase()}: ${msg.content}`).join('\n');

    const chatCompletion = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Here is the transcript to evaluate:\n\n${transcript}` }
      ],
      model: resolveGroqModel('grade'),
      temperature: 0.2,
      response_format: { type: 'json_object' }
    });

    const aiResponse = chatCompletion.choices[0]?.message?.content || '{}';
    let gradeData;
    try {
      const cleanedJson = aiResponse.replace(/```json/g, '').replace(/```/g, '').trim();
      gradeData = JSON.parse(cleanedJson);
    } catch (e) {
      console.error('Failed to parse AI JSON', e, aiResponse);
      gradeData = { feedback: 'Failed to automatically generate feedback.', score_technical: 0, score_problem_solving: 0, score_coding: 0, score_project: 0, score_debugging: 0 };
    }

    // Update the interview to PENDING_REVIEW and save the raw scores
    await interview.update({
      score_technical: gradeData.score_technical || 0,
      score_problem_solving: gradeData.score_problem_solving || 0,
      score_coding: gradeData.score_coding || 0,
      score_project: gradeData.score_project || 0,
      score_debugging: gradeData.score_debugging || 0,
      score: (gradeData.score_technical || 0) + (gradeData.score_problem_solving || 0) + (gradeData.score_coding || 0) + (gradeData.score_project || 0) + (gradeData.score_debugging || 0),
      feedback: gradeData.feedback,
      key_strengths: gradeData.key_strengths,
      areas_of_improvement: gradeData.areas_of_improvement,
      // Status could be PENDING_REVIEW, but we will reuse COMPLETED with a new field or just keep it COMPLETED if no review mechanism is requested strictly in DB. Let's just set it to COMPLETED for now to match enum.
      status: 'COMPLETED'
    });

    res.json({
      success: true,
      data: interview
    });
  } catch (error: any) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    console.error('Error in handleAiInterviewGrade:', error);
    res.status(500).json({ success: false, message: 'Failed to grade AI interview' });
  }
};

export const uploadAiContext = async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      throw new AppError('No file uploaded', 400, 'BAD_REQUEST');
    }
    
    // Store in a specific S3 / local path
    const ext = req.file.originalname.split('.').pop() || 'pdf';
    const stored = await storageAdapter.upload(
      { buffer: req.file.buffer, mimetype: req.file.mimetype, originalname: req.file.originalname },
      'ai_interviews'
    );

    res.json({
      success: true,
      data: {
        fileUrl: stored.key // Save the key, not the full URL so we can download it later
      }
    });
  } catch (error: any) {
    console.error('Error in uploadAiContext:', error);
    res.status(500).json({ success: false, message: 'Failed to upload AI context file' });
  }
};
