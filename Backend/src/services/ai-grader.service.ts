import path from 'path';
import Groq from 'groq-sdk';
import JSZip from 'jszip';
import pdfParse from 'pdf-parse';
import db from '../lib/db';
import { AppError } from '../middleware/error.middleware';
import { storageAdapter } from '../lib/storage';
import { fetchRepoTreeCode } from './intern-push-processor.service';

import { resolveGroqModel } from '../lib/groq';

// Always use the large model — accuracy > speed for grading.
const GROQ_API_KEY = process.env.GROQ_API_KEY    ?? '';
const GROQ_MODEL   = resolveGroqModel('grade');

const CODE_EXTS = new Set([
  '.py', '.sql', '.html', '.htm', '.css', '.js', '.ts',
  '.ipynb', '.r', '.jsx', '.tsx', '.scss',
  '.json', '.yaml', '.yml', '.txt', '.md',
  '.java', '.c', '.cpp', '.cs', '.go', '.rb', '.php', '.sh',
]);

// Priority order for file types in ZIP (most relevant first)
const EXT_PRIORITY: Record<string, number> = {
  '.py': 0, '.sql': 1, '.ipynb': 2, '.r': 3,
  '.html': 4, '.js': 5, '.ts': 6, '.jsx': 7, '.tsx': 8,
  '.css': 9, '.md': 10, '.txt': 11,
};

export interface AIGradeResult {
  score:        number;
  feedback:     string;
  breakdown:    Record<string, string>;
  model:        string;
  needs_review: boolean;
  raw:          Record<string, unknown>;
}

// ── File parsers ──────────────────────────────────────────────────────────────

async function parsePdf(buffer: Buffer, maxChars = 14000): Promise<string> {
  try {
    const data = await pdfParse(buffer);
    return data.text.trim().substring(0, maxChars);
  } catch {
    return '[PDF could not be parsed]';
  }
}

function parseJupyterNotebook(raw: string): string {
  try {
    const nb = JSON.parse(raw);
    const cells: string[] = [];
    for (const cell of (nb.cells ?? [])) {
      const src = Array.isArray(cell.source) ? cell.source.join('') : (cell.source ?? '');
      if (!src.trim()) continue;
      const tag = cell.cell_type === 'markdown' ? '# [MARKDOWN]' : '# [CODE]';
      cells.push(`${tag}\n${src.substring(0, 2000)}`);
      // Also include outputs for code cells (printed results, errors)
      if (cell.cell_type === 'code' && Array.isArray(cell.outputs)) {
        for (const out of cell.outputs.slice(0, 3)) {
          const text = Array.isArray(out.text) ? out.text.join('').substring(0, 500)
                     : typeof out.text === 'string' ? out.text.substring(0, 500) : '';
          if (text.trim()) cells.push(`# [OUTPUT]\n${text}`);
        }
      }
    }
    return cells.join('\n\n') || '[Empty notebook]';
  } catch {
    return '[Jupyter notebook could not be parsed]';
  }
}

async function parseZip(buffer: Buffer, maxTotal = 20000): Promise<string> {
  const zip   = await JSZip.loadAsync(buffer);
  const parts: string[] = [];
  let   total = 0;

  const entries = Object.entries(zip.files).sort(([a], [b]) => {
    const pa = EXT_PRIORITY[path.extname(a).toLowerCase()] ?? 99;
    const pb = EXT_PRIORITY[path.extname(b).toLowerCase()] ?? 99;
    return pa - pb;
  });

  for (const [name, file] of entries) {
    if (file.dir) continue;
    const ext = path.extname(name).toLowerCase();
    if (!CODE_EXTS.has(ext)) continue;
    try {
      const text = await file.async('string');
      const content = ext === '.ipynb'
        ? parseJupyterNotebook(text)
        : text.substring(0, 4000);
      parts.push(`\n### FILE: ${name}\n\`\`\`\n${content}\n\`\`\``);
      total += content.length;
      if (total > maxTotal) break;
    } catch { /* skip unreadable files */ }
  }

  return parts.length ? parts.join('\n') : '[No readable code files in ZIP]';
}

// ── Groq JSON call with retry ─────────────────────────────────────────────────

async function groqJson(
  groq: Groq,
  messages: Groq.Chat.Completions.ChatCompletionMessageParam[],
  maxRetries = 2,
): Promise<Record<string, unknown>> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const completion = await groq.chat.completions.create({
        model:           GROQ_MODEL,
        messages,
        temperature:     0.05,
        max_tokens:      2500,
        response_format: { type: 'json_object' },
      });
      const content = completion.choices[0]?.message?.content ?? '{}';
      return JSON.parse(content) as Record<string, unknown>;
    } catch (err) {
      lastErr = err;
      if (attempt < maxRetries - 1) {
        // Add a nudge for JSON format on retry
        messages = [
          ...messages,
          { role: 'assistant', content: 'I will return only valid JSON now.' },
        ];
      }
    }
  }
  throw lastErr;
}

// ── Synthetic rubric when assignment has no instructions PDF ──────────────────

async function buildSyntheticRubric(
  groq: Groq,
  title: string,
  description: string,
  maxScore: number,
  submissionType: 'theory' | 'code' | 'code+report',
): Promise<string> {
  const typeGuide =
    submissionType === 'theory'
      ? 'The student submitted a WRITTEN/THEORY answer (no code files). Generate criteria that assess written explanation, concept accuracy, depth, and clarity — NOT code quality or execution.'
      : submissionType === 'code'
      ? 'The student submitted CODE files (no written report). Generate criteria that assess code correctness, logic, best practices, and output — NOT essay writing.'
      : 'The student submitted both code and a written report. Balance criteria between code quality and written explanation.';

  try {
    const result = await groqJson(groq, [
      {
        role: 'system',
        content: 'You are an academic curriculum designer for a Python/Data Analytics job-training course.',
      },
      {
        role: 'user',
        content: `Assignment title: "${title}"
Description: ${description || '(none)'}
Max score: ${maxScore}
${typeGuide}

Generate a realistic grading rubric with 4-6 criteria that sum to ${maxScore} points.
Return ONLY this JSON:
{
  "rubric": "<criteria list: criterion name | max pts | what counts as full marks | what counts as partial>",
  "criteria_sum": <total points in rubric>
}`,
      },
    ]);
    return String(result.rubric ?? '');
  } catch {
    return `Complete all required tasks correctly (${submissionType} submission). Max: ${maxScore} points.`;
  }
}

// ── Core grader ───────────────────────────────────────────────────────────────

interface GradeOptions {
  submissionPdfBuffer?: Buffer;
  submissionZipBuffer?: Buffer;
}

export async function aiGradeSubmission(
  submissionId: string,
  opts: GradeOptions = {},
): Promise<AIGradeResult> {
  if (!GROQ_API_KEY) {
    throw new AppError('GROQ_API_KEY not configured', 500, 'CONFIG_ERROR');
  }

  const { rows } = await db.query<any>(
    `SELECT s.id, s.pdf_key AS submission_pdf_key, s.zip_key, s.github_fork_url,
            u.name AS student_name,
            a.title AS assignment_title, a.description,
            a.max_score, a.pdf_path AS instructions_pdf_key
     FROM assignment_submissions s
     JOIN assignments a ON a.id = s.assignment_id
     JOIN users       u ON u.id = s.student_id
     WHERE s.id = $1`,
    [submissionId],
  );
  if (!rows.length) throw new AppError('Submission not found', 404, 'NOT_FOUND');
  const sub = rows[0];

  const groq = new Groq({ apiKey: GROQ_API_KEY });

  // ── Assignment instructions ───────────────────────────────────────────────
  let instructionsText = '';
  if (sub.instructions_pdf_key) {
    try {
      const buf = await storageAdapter.download(sub.instructions_pdf_key);
      instructionsText = await parsePdf(buf, 14000);
    } catch { /* download failed */ }
  }

  // ── Student submission ────────────────────────────────────────────────────
  const pdfBuf = opts.submissionPdfBuffer
    ?? (sub.submission_pdf_key
      ? await storageAdapter.download(sub.submission_pdf_key).catch(() => null)
      : null);
  const zipBuf = opts.submissionZipBuffer
    ?? (sub.zip_key
      ? await storageAdapter.download(sub.zip_key).catch(() => null)
      : null);

  const pdfText = pdfBuf ? await parsePdf(pdfBuf, 10000) : null;
  let zipText = zipBuf ? await parseZip(zipBuf, 20000) : null;

  // Handle GitHub tasks
  if (sub.github_fork_url) {
    try {
      const match = sub.github_fork_url.match(/github\.com\/([^/]+)\/([^/]+)/);
      if (match) {
        const owner = match[1];
        const repo = match[2];
        const repoCode = await fetchRepoTreeCode(owner, repo);
        if (repoCode) {
          zipText = repoCode;
        }
      }
    } catch (err) {
      console.error('[ai-grader] Failed to fetch github repo code', err);
    }
  }

  let submissionContent = '';
  if (pdfText && !pdfText.startsWith('[PDF could not')) submissionContent += `\n## STUDENT PDF\n${pdfText}\n`;
  if (zipText && !zipText.startsWith('[No readable'))   submissionContent += `\n## STUDENT CODE FILES\n${zipText}\n`;

  if (!submissionContent.trim()) {
    throw new AppError('No content could be extracted from this submission', 422, 'NO_CONTENT');
  }

  const hasCode = !!zipText && !zipText.startsWith('[No readable');
  const hasPdf  = !!pdfText && !pdfText.startsWith('[PDF could not');
  const subType = hasCode && hasPdf ? 'code+report' : hasCode ? 'code' : 'theory';

  // Use real instructions or synthesize a rubric so grader is never flying blind
  let rubricBlock: string;
  if (instructionsText.length > 100) {
    rubricBlock = `=== ASSIGNMENT INSTRUCTIONS & RUBRIC ===\n${instructionsText}\n=== END ===`;
  } else {
    console.log('[ai-grader] no instructions PDF — building synthetic rubric for', sub.assignment_title);
    const synth = await buildSyntheticRubric(groq, sub.assignment_title, sub.description ?? '', sub.max_score, subType);
    rubricBlock = `=== ASSIGNMENT: ${sub.assignment_title} ===\n${sub.description ?? ''}\n\n=== GENERATED RUBRIC ===\n${synth}\n=== END ===`;
  }

  const systemPrompt = `You are a STRICT and FAIR academic assignment grader for a Python/Data Analytics job-training course.

GRADING RULES (non-negotiable):
1. Extract EVERY rubric criterion with its exact point value from the instructions.
2. For each criterion: search the submission for SPECIFIC evidence. Quote it exactly.
3. Grade each criterion: Full (100%) | Partial (50%) | Missing (0%) — based on evidence quality.
4. Calculate: sum(earned) / sum(max_per_criterion) × ${sub.max_score} = final score.
5. Round to nearest integer. Clamp to [0, ${sub.max_score}].

FAIRNESS RULES:
- Different quality submissions MUST get different scores. Never default to round numbers.
- External deliverables referenced but not in files (GitHub link, screenshots) = Partial (50%), NOT 0.
- Task attempted but wrong = Partial. Task absent with zero trace = 0.
- Correct concise theory = Full. Vague handwavy theory = Partial.
- Code that runs and produces correct output = Full. Code with bugs = Partial. No code = 0.
- If submission is completely off-topic or blank = 0 with explanation.`;

  const typeHint =
    subType === 'theory'    ? 'SUBMISSION TYPE: Theory/Written (PDF only)'
    : subType === 'code'    ? 'SUBMISSION TYPE: Code Assignment (ZIP files only)'
    :                         'SUBMISSION TYPE: Code + Written Report (ZIP + PDF)';

  // ── PASS 1: Grade ─────────────────────────────────────────────────────────
  const pass1Messages: Groq.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content: `${rubricBlock}

Maximum Score: ${sub.max_score}
Student: ${sub.student_name}
${typeHint}

=== STUDENT SUBMISSION ===
${submissionContent.substring(0, 20000)}
=== END SUBMISSION ===

Grade this submission. Return ONLY this JSON (no prose, no markdown fences):
{
  "score": <integer 0–${sub.max_score}>,
  "total_rubric_pts": <sum of all criterion max points>,
  "earned_rubric_pts": <sum of all earned points>,
  "feedback": "<4-6 sentences: name each task, what passed with evidence, what failed and why>",
  "breakdown": {
    "criteria_detail": "<table: Criterion | Max | Earned | Evidence quoted from submission>",
    "score_calculation": "<earned_rubric_pts / total_rubric_pts × ${sub.max_score} = score>",
    "submission_type": "${subType}",
    "key_issues": "<top 3 specific issues found, or 'None — all criteria met'>",
    "strengths": "<top 2 things done well, or 'N/A'>"
  }
}`,
    },
  ];

  const pass1 = await groqJson(groq, pass1Messages);

  // Compute score from rubric arithmetic first (more reliable than model's self-reported score)
  let pass1Score: number;
  if (
    typeof pass1.earned_rubric_pts === 'number' &&
    typeof pass1.total_rubric_pts  === 'number' &&
    pass1.total_rubric_pts > 0
  ) {
    pass1Score = Math.round((pass1.earned_rubric_pts / pass1.total_rubric_pts) * sub.max_score);
  } else {
    pass1Score = Math.round(Number(pass1.score ?? 0));
  }
  pass1Score = Math.min(sub.max_score, Math.max(0, pass1Score));

  // ── PASS 2: Verification — catch over/under scoring ──────────────────────
  // Only run verification pass if auto-grade (saves API calls on manual grade too, but accuracy matters more)
  const pass2Messages: Groq.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
    ...pass1Messages.slice(1),
    { role: 'assistant', content: JSON.stringify(pass1) },
    {
      role: 'user',
      content: `You gave a score of ${pass1Score}/${sub.max_score}.

VERIFICATION: Review your grading for these common errors:
1. Did you overlook evidence that IS present in the submission? (under-scoring)
2. Did you give credit for something vague or missing? (over-scoring)
3. Is the score consistent with the evidence you quoted?
4. If a student saw this feedback, would they consider it fair and accurate?

If the score needs adjustment, change it. If it is correct, keep it.

Return ONLY this JSON:
{
  "verified_score": <integer 0–${sub.max_score}>,
  "score_change": "<'increased by X', 'decreased by X', or 'no change'>",
  "adjustment_reason": "<why you changed it, or 'Score accurately reflects evidence'>"
}`,
    },
  ];

  let finalScore = pass1Score;
  let needsReview = false;
  let adjustmentReason = 'Score accurately reflects evidence';
  let scoreAdjusted = false;

  try {
    const pass2 = await groqJson(groq, pass2Messages);
    const v = Math.min(sub.max_score, Math.max(0, Math.round(Number(pass2.verified_score ?? pass1Score))));
    adjustmentReason = String(pass2.adjustment_reason ?? '');
    const delta = Math.abs(v - pass1Score);
    // Relative threshold: flag for review only when disagreement exceeds 20% of max_score
    // (min 15 pts to protect low-score assignments). Prevents aggressive reductions like 12→0
    // being silently accepted just because the flat 15-pt cap allows it.
    const reviewThreshold = Math.max(15, Math.round(sub.max_score * 0.20));
    if (delta > reviewThreshold) {
      // Large disagreement — average both scores and require human review
      needsReview = true;
      finalScore = Math.round((pass1Score + v) / 2);
      scoreAdjusted = true;
    } else {
      finalScore = v;
      scoreAdjusted = delta > 0;
    }
  } catch (err) {
    needsReview = true;
    console.warn('[ai-grader] pass2 failed, using pass1 score:', err);
  }

  // Append verification note to feedback when score was adjusted, so admins
  // and students can see WHY the score changed (not just buried in raw JSON).
  let feedbackText = String(pass1.feedback ?? '');
  if (scoreAdjusted) {
    const dir = finalScore > pass1Score ? 'increased' : 'decreased';
    feedbackText += ` [Score ${dir} from ${pass1Score} to ${finalScore} after verification: ${adjustmentReason}]`;
  }

  // Flag edge cases for human review
  if (finalScore === 0 || finalScore === sub.max_score) needsReview = true;

  const p1Breakdown = (pass1.breakdown as Record<string, string>) ?? {};

  // Overwrite score_calculation to always reflect the FINAL score, not pass-1 intermediate.
  // Pass-1's score_calculation may show a different number if pass-2 adjusted it —
  // keeping the stale value causes admins to see two contradictory numbers.
  const finalScoreCalc = (typeof pass1.earned_rubric_pts === 'number' && typeof pass1.total_rubric_pts === 'number' && (pass1.total_rubric_pts as number) > 0)
    ? `${finalScore}/${sub.max_score} (rubric: ${pass1.earned_rubric_pts}/${pass1.total_rubric_pts} pts → ${pass1Score}${finalScore !== pass1Score ? ` → adjusted to ${finalScore} by verification` : ''})`
    : `${finalScore}/${sub.max_score}`;

  const breakdown = {
    ...p1Breakdown,
    score_calculation: finalScoreCalc,
    verification: adjustmentReason,
    pass1_score: String(pass1Score),
    final_score: String(finalScore),
    needs_human_review: needsReview ? 'YES — please verify' : 'No',
  };

  return {
    score:        finalScore,
    feedback:     feedbackText,
    breakdown,
    model:        GROQ_MODEL,
    needs_review: needsReview,
    raw:          pass1,
  };
}

// ── Auto-grade (fire-and-forget after student submit) ─────────────────────────

// ── Intern-specific grading (reuses groqJson + 2-pass pattern) ──────────────────

export interface InternGradeOptions {
  /** Task metadata */
  taskTitle: string;
  taskDescription: string;
  artifactType: string;
  /** Model solution text (extracted from admin-uploaded solution file) */
  solutionText?: string | null;
  /** Student's code context (PR diff or commit diff, fetched from GitHub) */
  codeContext: string;
  /** Source description for the prompt (e.g. "manual PR submission" vs "push event") */
  sourceLabel?: string;
}

export interface InternGradeResult {
  score: number;        // 1.0–5.0
  breakdown: object[]; // [{ label, score, max }, ...]
  feedback: string;
  model: string;
  needs_review: boolean;
}

const INTERN_METRICS = [
  'Code Quality',
  'Functionality',
  'Documentation',
  'Test Coverage',
  'Performance',
];

async function buildInternRubric(groq: Groq, opts: InternGradeOptions): Promise<string> {
  // When no model solution exists, synthesize evaluation criteria from the task
  // description so the grader is never flying blind.
  if (opts.solutionText?.trim()) return opts.solutionText;

  try {
    const result = await groqJson(groq, [
      { role: 'system', content: 'You are an internship curriculum designer. Return only valid JSON.' },
      {
        role: 'user',
        content: `Intern task title: "${opts.taskTitle}"
Technology: ${opts.artifactType}
Description: ${opts.taskDescription || '(none)'}

Generate a concise evaluation checklist for grading an intern's submission on these 5 metrics:
${INTERN_METRICS.map(m => `- ${m}`).join('\n')}

Return ONLY this JSON:
{ "rubric": "<per-metric checklist: what counts as full marks (5/5), partial (3/5), and missing (1/5)>" }`,
      },
    ]);
    return String(result.rubric ?? '');
  } catch {
    return `Grade "${opts.taskTitle}" (${opts.artifactType}) — ${opts.taskDescription}`;
  }
}

export async function aiGradeInternTask(opts: InternGradeOptions): Promise<InternGradeResult> {
  if (!GROQ_API_KEY) {
    console.log('[intern-grader] no GROQ_API_KEY — returning fallback');
    return internFallbackScore(opts);
  }

  const groq = new Groq({ apiKey: GROQ_API_KEY });

  // Build or reuse evaluation criteria
  const rubric = await buildInternRubric(groq, opts);
  const solutionBlock = opts.solutionText?.trim()
    ? `\nPRIVATE MODEL SOLUTION (not visible to student):\n${opts.solutionText.slice(0, 50000)}\n`
    : '';

  const sourceHint = opts.sourceLabel ?? 'code submission';

  const systemPrompt = `You are a strict but fair internship code evaluator.
GRADING RULES:
1. Evaluate on exactly 5 metrics: ${INTERN_METRICS.join(', ')}.
2. Each metric scores 1–5 (integer). Overall = weighted average, 1 decimal.
3. Quote specific code evidence for each metric.
4. Full marks (5) only for genuinely excellent work that meets or exceeds the rubric.
5. If model solution exists, penalise missing features or different logic approach vs solution.
6. If student's solution is better than model solution while satisfying requirements, full score is allowed.

FAIRNESS: Different quality submissions MUST get different scores. Never default to round numbers.`;

  // ── PASS 1: Grade ───────────────────────────────────────────────────────────
  const pass1Messages: Groq.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content: `Grade this internship ${sourceHint}:

Task: "${opts.taskTitle}"
Technology: ${opts.artifactType}
Description: ${opts.taskDescription}
${solutionBlock ? `${solutionBlock}\n` : ''}=== EVALUATION CRITERIA ===
${rubric}
=== END ===

STUDENT CODE:
${opts.codeContext.substring(0, 60000)}

Return ONLY this JSON:
{
  "overall": <float 1.0–5.0, one decimal>,
  "metrics": [
    {"label":"Code Quality","score":<1-5>,"max":5,"evidence":"<quote from code>"},
    {"label":"Functionality","score":<1-5>,"max":5,"evidence":"<quote from code>"},
    {"label":"Documentation","score":<1-5>,"max":5,"evidence":"<quote from code>"},
    {"label":"Test Coverage","score":<1-5>,"max":5,"evidence":"<quote from code>"},
    {"label":"Performance","score":<1-5>,"max":5,"evidence":"<quote from code>"}
  ],
  "feedback": "<4-6 sentences: what was done well, what is missing compared to criteria, specific improvements>"
}`,
    },
  ];

  const pass1 = await groqJson(groq, pass1Messages);
  const pass1Score = Math.min(5, Math.max(1, parseFloat(String(pass1.overall ?? 3.5))));
  const pass1Metrics = Array.isArray(pass1.metrics) ? pass1.metrics : [];
  const pass1Feedback = String(pass1.feedback ?? '');

  // ── PASS 2: Verification ──────────────────────────────────────────────────
  let finalScore = pass1Score;
  let needsReview = false;
  let adjustedFeedback = pass1Feedback;
  let finalMetrics = pass1Metrics;

  try {
    const pass2 = await groqJson(groq, [
      { role: 'system', content: systemPrompt },
      ...pass1Messages.slice(1),
      { role: 'assistant', content: JSON.stringify(pass1) },
      {
        role: 'user',
        content: `You gave a score of ${pass1Score}/5.0.

VERIFICATION: Check for:
1. Did you overlook evidence that IS in the code? (under-scoring)
2. Did you give credit for something vague or missing? (over-scoring)
3. Are metric scores consistent with the quoted evidence?

Return ONLY this JSON:
{
  "verified_score": <float 1.0–5.0>,
  "metrics": <same 5-metric array with corrected scores and evidence>,
  "adjustment_reason": "<why changed, or 'Score accurately reflects evidence'>"
}`,
      },
    ]);

    const verified = Math.min(5, Math.max(1, parseFloat(String(pass2.verified_score ?? pass1Score))));
    const delta = Math.abs(verified - pass1Score);

    if (delta > 1.0) {
      // Large disagreement — average and flag for review
      needsReview = true;
      finalScore = parseFloat(((pass1Score + verified) / 2).toFixed(1));
      finalMetrics = Array.isArray(pass2.metrics) ? pass2.metrics : pass1Metrics;
      adjustedFeedback += ` [Score adjusted from ${pass1Score} to ${finalScore} after verification]`;
    } else {
      finalScore = parseFloat(verified.toFixed(1));
      if (Array.isArray(pass2.metrics)) finalMetrics = pass2.metrics;
      if (delta > 0) {
        adjustedFeedback += ` [Verified: ${String(pass2.adjustment_reason ?? 'minor correction')}]`;
      }
    }
  } catch (err) {
    needsReview = true;
    console.warn('[intern-grader] pass2 failed, using pass1:', err);
  }

  // Edge-case flags
  if (finalScore === 1.0 || finalScore === 5.0) needsReview = true;

  // Normalize metrics to always have the expected 5 labels
  const normalizedMetrics = INTERN_METRICS.map(m => {
    const match = finalMetrics.find((x: any) => x.label === m);
    return {
      label: m,
      score: Math.max(1, Math.min(5, Math.round(Number(match?.score ?? finalScore)))),
      max: 5,
    };
  });

  return {
    score: finalScore,
    breakdown: normalizedMetrics,
    feedback: adjustedFeedback,
    model: GROQ_MODEL,
    needs_review: needsReview,
  };
}

/** Deterministic fallback when Groq is unavailable or code context is empty */
function internFallbackScore(opts: InternGradeOptions): InternGradeResult {
  const hasCode = opts.codeContext.trim().length > 0;
  let score: number;

  if (!hasCode) {
    score = 1.5;
  } else if (!GROQ_API_KEY) {
    score = 3.0;
  } else {
    // Heuristic based on solution overlap (same logic as before, but clearly labeled)
    const solution = opts.solutionText ?? '';
    const common = solution
      ? solution.toLowerCase().split(/\W+/).filter(w => w.length > 4 && opts.codeContext.toLowerCase().includes(w)).length
      : 0;
    score = Math.min(4.2, Math.max(2.2, 2.2 + common / 80));
  }

  score = parseFloat(score.toFixed(1));
  const mk = (f: number) => Math.max(1, Math.min(5, Math.round(score * f)));
  const feedback = !hasCode
    ? 'Unable to fetch readable code. Verify the PR is public or configure GitHub access, then resubmit.'
    : !GROQ_API_KEY
      ? 'Automated fallback score (AI provider unavailable). Configure GROQ_API_KEY for detailed semantic grading.'
      : 'Automated fallback (AI grading failed). Score based on solution overlap heuristic.';

  return {
    score,
    breakdown: [
      { label: 'Code Quality',  score: mk(0.92), max: 5 },
      { label: 'Functionality', score: mk(1.05), max: 5 },
      { label: 'Documentation', score: mk(0.72), max: 5 },
      { label: 'Test Coverage', score: mk(0.82), max: 5 },
      { label: 'Performance',   score: mk(0.96), max: 5 },
    ],
    feedback,
    model: 'fallback',
    needs_review: true,
  };
}

// ── Auto-grade (fire-and-forget after student submit) ─────────────────────────

export async function autoAiGrade(
  submissionId: string,
  pdfBuffer?: Buffer,
  zipBuffer?: Buffer,
): Promise<void> {
  if (!GROQ_API_KEY) {
    console.log('[ai-grader] no key — skipping', submissionId);
    return;
  }
  try {
    console.log('[ai-grader] start:', submissionId);
    const result = await aiGradeSubmission(submissionId, {
      submissionPdfBuffer: pdfBuffer,
      submissionZipBuffer: zipBuffer,
    });
    await db.query(
      `UPDATE assignment_submissions
       SET ai_score = $1, ai_feedback = $2, ai_breakdown = $3,
           ai_graded_at = NOW(), ai_model = $4
       WHERE id = $5`,
      [
        result.score,
        result.feedback,
        JSON.stringify(result.breakdown),
        result.model,
        submissionId,
      ],
    );
    const flag = result.needs_review ? ' ⚠ NEEDS REVIEW' : '';
    console.log(`[ai-grader] done: ${submissionId} | score=${result.score}/${(result.raw as any)?.total_rubric_pts ?? '?'} | ${result.model}${flag}`);
  } catch (err) {
    console.error('[ai-grader] failed:', submissionId, err);
  }
}
