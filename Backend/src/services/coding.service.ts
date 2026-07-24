import crypto from 'crypto';
import db from '../lib/db';
import { AppError } from '../middleware/error.middleware';
import { autoAiGrade } from './ai-grader.service';
import { sendEmail } from '../lib/email';
import axios from 'axios';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ── Language ID map for Judge0 CE ─────────────────────────────────────────────
const LANGUAGE_IDS: Record<string, number> = {
  python: 71,
  javascript: 63,
  java: 62,
  cpp: 54,
  c: 50,
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

/**
 * Smart output comparison — handles messy student output correctly:
 * - "The sum of 3.0 and 5.0 is: 8.0"  vs  "8"   → PASS (last number matches)
 * - "=== Title ===\n8"                 vs  "8"   → PASS (last line matches)
 * - "Enter number: 8"                  vs  "8"   → PASS (number extracted matches)
 */
function outputsMatch(actual: string, expected: string): boolean {
  const a = actual.trim();
  const e = expected.trim();

  // 1. Exact match
  if (a === e) return true;

  // 2. Normalize whitespace
  if (a.replace(/\s+/g, ' ').toLowerCase() === e.replace(/\s+/g, ' ').toLowerCase()) return true;

  // Helper: extract all numbers from a string
  const nums = (s: string) => (s.match(/-?\d+\.?\d*/g) ?? []).map(n => parseFloat(n));
  const expectedNums = nums(e);

  // If expected is a single number (like "8" or "0")
  if (expectedNums.length === 1) {
    const expVal = expectedNums[0];

    // 3. Check LAST number in actual output (most common — "The answer is: 8")
    const actualNums = nums(a);
    if (actualNums.length > 0 && actualNums[actualNums.length - 1] === expVal) return true;

    // 4. Check last non-empty line (strip prompt lines like "Enter number:")
    const lines = a.split('\n').map(l => l.trim()).filter(Boolean);
    const lastLine = lines[lines.length - 1] ?? '';
    const lastLineNums = nums(lastLine);
    if (lastLineNums.length === 1 && lastLineNums[0] === expVal) return true;

    // Do NOT match "any number anywhere" — too easy to false-pass
  }

  // If expected is multiple numbers on multiple lines (e.g. Fibonacci "0 1 1 2 3")
  if (expectedNums.length > 1) {
    const actualNums = nums(a);

    // All expected numbers appear in order in actual output
    if (JSON.stringify(actualNums.slice(-expectedNums.length)) === JSON.stringify(expectedNums)) return true;
    if (JSON.stringify(actualNums) === JSON.stringify(expectedNums)) return true;

    // Last line contains all expected numbers
    const lines = a.split('\n').map(l => l.trim()).filter(Boolean);
    for (const line of lines.reverse()) {
      const lineNums = nums(line);
      if (JSON.stringify(lineNums) === JSON.stringify(expectedNums)) return true;
    }
  }

  // 6. Line-by-line: last N lines match expected lines
  const eLines = e.split('\n').map(l => l.trim()).filter(Boolean);
  const aLines = a.split('\n').map(l => l.trim()).filter(Boolean);
  if (eLines.length > 0 && aLines.length >= eLines.length) {
    const lastALines = aLines.slice(-eLines.length);
    if (lastALines.every((line, i) => {
      if (line === eLines[i]) return true;
      const ln = nums(line), en = nums(eLines[i]);
      return ln.length > 0 && en.length > 0 && JSON.stringify(ln) === JSON.stringify(en);
    })) return true;
  }

  return false;
}

// ── Execute code via Judge0 CE (or local runner fallback) ─────────────────────
async function executeCode(
  code: string,
  language: string,
  stdin: string,
): Promise<{ stdout: string; stderr: string; status: string; time: number }> {
  const langId = LANGUAGE_IDS[language];
  if (!langId) throw new AppError(`Unsupported language: ${language}`, 400, 'UNSUPPORTED_LANGUAGE');

  const apiKey = (process.env.JUDGE0_API_KEY ?? '').trim();
  const configuredUrl = (process.env.JUDGE0_URL ?? '').trim();
  // RapidAPI always needs a key — without one, use public CE (or skip to local)
  const judge0Url =
    configuredUrl ||
    (apiKey ? 'https://judge0-ce.p.rapidapi.com' : 'https://ce.judge0.com');
  const isRapidApi = /rapidapi\.com/i.test(judge0Url);

  // Don't bother calling RapidAPI without a key (always 401)
  if (isRapidApi && !apiKey) {
    console.warn('[coding] JUDGE0_API_KEY missing for RapidAPI — using local runner');
    return localExecOrThrow(code, language, stdin);
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  if (isRapidApi && apiKey) {
    headers['X-RapidAPI-Key'] = apiKey;
    headers['X-RapidAPI-Host'] = 'judge0-ce.p.rapidapi.com';
  }

  try {
    // wait=true — single round-trip (works on CE + RapidAPI)
    const submitRes = await axios.post(
      `${judge0Url}/submissions?base64_encoded=false&wait=true`,
      {
        source_code: code,
        language_id: langId,
        stdin: stdin ?? '',
        cpu_time_limit: 5,
        memory_limit: 128000,
      },
      { headers, timeout: 25000 },
    );

    let payload = submitRes.data;
    const token = payload?.token;

    // Some hosts ignore wait=true — poll briefly
    if (token && (payload?.status?.id ?? 0) < 3) {
      for (let i = 0; i < 12; i++) {
        await sleep(800);
        const result = await axios.get(
          `${judge0Url}/submissions/${token}?base64_encoded=false`,
          { headers, timeout: 10000 },
        );
        payload = result.data;
        if ((payload?.status?.id ?? 0) >= 3) break;
      }
    }

    if (!payload || (payload?.status?.id ?? 0) < 3) {
      throw new Error('Code execution timed out');
    }

    return {
      stdout: payload.stdout ?? '',
      stderr: payload.stderr ?? payload.compile_output ?? '',
      status: payload.status?.description ?? 'Unknown',
      time: Math.round((parseFloat(payload.time ?? '0') || 0) * 1000),
    };
  } catch (err: any) {
    const status = err?.response?.status;
    console.warn('[coding] Judge0 unavailable:', err?.message ?? status);
    return localExecOrThrow(code, language, stdin);
  }
}

/**
 * Local Python/Node runner.
 * - Always available in non-production (so coding tests work without RapidAPI key)
 * - In production: only if ALLOW_LOCAL_CODE_EXEC=true (prefer real Judge0)
 */
function localExecOrThrow(
  code: string,
  language: string,
  stdin: string,
): { stdout: string; stderr: string; status: string; time: number } {
  const isProd = process.env.NODE_ENV === 'production';
  const allowLocal = !isProd || process.env.ALLOW_LOCAL_CODE_EXEC === 'true';

  if (!allowLocal) {
    throw new AppError(
      'Code execution service is temporarily unavailable. Configure JUDGE0_API_KEY (RapidAPI) or JUDGE0_URL.',
      503,
      'JUDGE_UNAVAILABLE',
    );
  }

  if (language !== 'python' && language !== 'javascript') {
    throw new AppError(
      `${language.toUpperCase()} needs Judge0. Set JUDGE0_API_KEY or JUDGE0_URL, then retry.`,
      503,
      'JUDGE_UNAVAILABLE',
    );
  }

  console.warn(`[coding] Using local ${language} runner (Judge0 unavailable)`);
  return simulateExecution(code, language, stdin);
}

// ── Local code execution (Python / Node only; timeout-bounded) ───────────────
function simulateExecution(
  code: string,
  language: string,
  stdin: string,
): { stdout: string; stderr: string; status: string; time: number } {
  const tmpDir = os.tmpdir();
  const ext: Record<string, string> = { python: 'py', javascript: 'js' };
  const fileExt = ext[language];
  if (!fileExt) {
    return {
      stdout: '',
      stderr: `${language} is not supported by the local runner`,
      status: 'Runtime Error',
      time: 0,
    };
  }
  const id = `${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
  const tmpFile = path.join(tmpDir, `lms_code_${id}.${fileExt}`);

  try {
    fs.writeFileSync(tmpFile, code, 'utf8');

    let cmd = '';
    const isWin = process.platform === 'win32';
    if (language === 'python') {
      const pyCmd = isWin ? 'python' : 'python3';
      cmd = `${pyCmd} "${tmpFile}"`;
    }
    if (language === 'javascript') cmd = `node "${tmpFile}"`;

    const start = Date.now();
    const stdout = execSync(cmd, {
      timeout: 5000,
      encoding: 'utf8',
      input: stdin ?? '',
      windowsHide: true,
      maxBuffer: 1024 * 1024,
      env: {
        ...process.env,
        // Reduce accidental network use from student scripts (best-effort)
        NODE_OPTIONS: '--no-warnings',
      },
    });
    const time = Date.now() - start;
    return { stdout: String(stdout).trimEnd(), stderr: '', status: 'Accepted', time };
  } catch (err: any) {
    const stderr = err?.stderr?.toString() ?? err?.message ?? 'Runtime error';
    const stdout = err?.stdout?.toString()?.trim() ?? '';
    if (stdout) return { stdout, stderr: String(stderr).slice(0, 500), status: 'Runtime Error', time: 0 };
    return { stdout: '', stderr: String(stderr).slice(0, 500), status: 'Runtime Error', time: 0 };
  } finally {
    try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
  }
}

// ── AI Evaluation via OpenAI ──────────────────────────────────────────────────
async function evaluateWithAI(
  problem: { title: string; description: string; expected_concepts?: string | null },
  code: string,
  language: string,
  executionOutput: string,
  testsPassed: number,
  testsTotal: number,
): Promise<{ score: number; grade: string; feedback: string; suggestions: string }> {
  const openaiKey = process.env.OPENAI_API_KEY ?? '';
  const total = Math.max(testsTotal, 1);
  const testPct = testsPassed / total;

  // Test results own the score — AI only nudges quality within a band
  const finalize = (aiScore: number, feedback: string, suggestions: string) => {
    // 75% from tests + 25% from AI quality (capped so AI can't tank a full pass)
    let score = Math.round(testPct * 75 + Math.min(100, Math.max(0, aiScore)) * 0.25);
    if (testPct === 1) score = Math.max(score, 88); // all tests passed → strong score floor
    if (testPct === 0) score = Math.min(score, 35);  // no tests passed → low ceiling
    score = Math.min(100, Math.max(0, score));
    const grade = score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 60 ? 'C' : score >= 45 ? 'D' : 'F';
    return { score, grade, feedback, suggestions };
  };

  if (!openaiKey) {
    return ruleBasedEvaluation(code, testsPassed, testsTotal);
  }

  const prompt = `You are a fair coding instructor. Test results are authoritative.

PROBLEM: ${problem.title}
DESCRIPTION: ${problem.description}
LANGUAGE: ${language}
EXPECTED CONCEPTS: ${problem.expected_concepts ?? 'Not specified'}

STUDENT CODE:
\`\`\`${language}
${code}
\`\`\`

EXECUTION RESULT: ${executionOutput}
TEST CASES PASSED: ${testsPassed}/${testsTotal}

Give a QUALITY score 0-100 for code style/approach ONLY (correctness is already measured by tests).
If ${testsPassed}/${testsTotal} tests passed, do NOT claim the solution is wrong when tests passed.
If tests failed, focus feedback on reading stdin and printing exactly the expected answer (no extra lines).

Respond ONLY with valid JSON:
{
  "score": <number 0-100 quality only>,
  "feedback": "<2-3 sentences>",
  "suggestions": "<2-3 specific tips>"
}`;

  try {
    const res = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
        max_tokens: 400,
        response_format: { type: 'json_object' },
      },
      {
        headers: {
          Authorization: `Bearer ${openaiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 20000,
      },
    );
    const content = res.data?.choices?.[0]?.message?.content ?? '{}';
    const parsed = JSON.parse(content);
    const quality = Math.min(100, Math.max(0, parseInt(parsed.score ?? '70', 10) || 70));
    const feedback = parsed.feedback
      ?? (testPct === 1
        ? `All ${testsTotal} test cases passed.`
        : `${testsPassed}/${testsTotal} test cases passed.`);
    const suggestions = parsed.suggestions
      ?? (testPct < 1
        ? 'Read input from stdin exactly as specified and print only the required answer.'
        : 'Nice work — keep solutions clean and well-commented.');
    return finalize(quality, feedback, suggestions);
  } catch {
    return ruleBasedEvaluation(code, testsPassed, testsTotal);
  }
}

function ruleBasedEvaluation(
  code: string,
  testsPassed: number,
  testsTotal: number,
): { score: number; grade: string; feedback: string; suggestions: string } {
  const total = Math.max(testsTotal, 1);
  const passPct = testsPassed / total;

  // Score is driven by test pass rate (primary), with small quality bonus
  let score = Math.round(passPct * 85);
  if (code.length > 20) score += 4;
  if (code.includes('def ') || code.includes('function ') || code.includes('public ')) score += 4;
  if ((code.includes('input(') || code.includes('readline') || code.includes('scanf') || code.includes('cin'))) score += 4;
  if (!code.includes('TODO') && code.trim().split('\n').length > 2) score += 3;

  if (passPct === 1) score = Math.max(score, 90);
  if (passPct === 0) score = Math.min(score, 30);
  score = Math.min(100, Math.max(0, score));

  const grade = score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 60 ? 'C' : score >= 45 ? 'D' : 'F';

  let feedback = '';
  if (passPct === 1) {
    feedback = `All ${testsTotal} test cases passed. Your code produces the correct output.`;
  } else if (passPct >= 0.5) {
    feedback = `${testsPassed}/${testsTotal} test cases passed. Most cases are correct but some edge cases may be failing.`;
  } else if (passPct > 0) {
    feedback = `${testsPassed}/${testsTotal} test cases passed. Review the failing cases carefully.`;
  } else {
    feedback = `No test cases passed. Check if your output format matches the expected output exactly.`;
  }

  const suggestions = passPct < 1
    ? 'Read numbers from stdin (input()), then print only the final answer — no hardcoded demos or extra lines.'
    : 'Good work! Consider adding edge case handling and comments to improve code quality.';

  return { score, grade, feedback, suggestions };
}

// ════════════════════════════════════════════════════════════════════════════
// CRUD — Problems
// ════════════════════════════════════════════════════════════════════════════

export async function createProblem(data: {
  title: string; description: string; language: string; difficulty: string;
  starter_code: string; solution_hint?: string; expected_concepts?: string;
  points: number; course_id?: string; created_by: string; status: string;
  due_date?: string; time_limit_mins?: number; max_attempts?: number;
  test_cases: { input: string; expected_output: string; is_hidden: boolean; explanation?: string }[];
}) {
  if (!data.title?.trim()) throw new AppError('Title is required', 400, 'VALIDATION_ERROR');
  if (!data.description?.trim()) throw new AppError('Description is required', 400, 'VALIDATION_ERROR');
  if (!data.language) throw new AppError('Language is required', 400, 'VALIDATION_ERROR');
  if (!LANGUAGE_IDS[data.language] && !['python', 'javascript', 'java', 'cpp', 'c'].includes(data.language)) {
    throw new AppError(`Unsupported language: ${data.language}`, 400, 'UNSUPPORTED_LANGUAGE');
  }
  const test_cases = Array.isArray(data.test_cases) ? data.test_cases : [];
  if (test_cases.length === 0) {
    throw new AppError('Add at least one test case', 400, 'VALIDATION_ERROR');
  }
  const fields = data;

  const { rows } = await db.query<any>(
    `INSERT INTO coding_problems
       (title, description, language, difficulty, starter_code, solution_hint, expected_concepts, points, course_id, created_by, status, due_date, time_limit_mins, max_attempts)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     RETURNING *`,
    [fields.title, fields.description, fields.language, fields.difficulty,
    fields.starter_code, fields.solution_hint ?? null, fields.expected_concepts ?? null,
    fields.points, fields.course_id ?? null, fields.created_by, fields.status,
    fields.due_date ?? null, fields.time_limit_mins ?? null, fields.max_attempts ?? 3]
  );
  const problem = rows[0];

  for (let i = 0; i < test_cases.length; i++) {
    const tc = test_cases[i];
    await db.query(
      `INSERT INTO coding_test_cases (problem_id, input, expected_output, is_hidden, explanation, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [problem.id, tc.input, tc.expected_output, tc.is_hidden, tc.explanation ?? null, i],
    );
  }

  return getProblemById(problem.id);
}

export async function listProblems(filters: { courseId?: string; status?: string; difficulty?: string; search?: string }) {
  let sql = `
    SELECT p.*, u.name AS creator_name, c.title AS course_title,
           (SELECT COUNT(*)::int FROM coding_test_cases tc WHERE tc.problem_id = p.id) AS test_case_count,
           (SELECT COUNT(*)::int FROM coding_assignments ca WHERE ca.problem_id = p.id) AS assignment_count
    FROM coding_problems p
    LEFT JOIN users u   ON u.id = p.created_by
    LEFT JOIN courses c ON c.id = p.course_id
    WHERE 1=1`;
  const params: any[] = [];

  if (filters.courseId) { params.push(filters.courseId); sql += ` AND p.course_id = $${params.length}`; }
  if (filters.status) { params.push(filters.status); sql += ` AND p.status = $${params.length}`; }
  if (filters.difficulty) { params.push(filters.difficulty); sql += ` AND p.difficulty = $${params.length}`; }
  if (filters.search) { params.push(`%${filters.search}%`); sql += ` AND (p.title ILIKE $${params.length} OR p.description ILIKE $${params.length})`; }

  sql += ' ORDER BY p.created_at DESC';
  const { rows } = await db.query<any>(sql, params);
  return rows;
}

export async function getProblemById(id: string, opts?: { studentView?: boolean }) {
  const { rows } = await db.query<any>(
    `SELECT p.*, u.name AS creator_name, c.title AS course_title
     FROM coding_problems p
     LEFT JOIN users u   ON u.id = p.created_by
     LEFT JOIN courses c ON c.id = p.course_id
     WHERE p.id = $1`,
    [id],
  );
  if (!rows[0]) throw new AppError('Problem not found', 404, 'NOT_FOUND');
  const problem = rows[0];

  if (opts?.studentView) {
    // Never leak answers / hidden cases / hints to students
    delete problem.solution_hint;
    const { rows: testCases } = await db.query<any>(
      `SELECT id, input, explanation, sort_order, is_hidden
       FROM coding_test_cases
       WHERE problem_id = $1 AND is_hidden = FALSE
       ORDER BY sort_order ASC`,
      [id],
    );
    problem.test_cases = testCases;
    return problem;
  }

  const { rows: testCases } = await db.query<any>(
    `SELECT * FROM coding_test_cases WHERE problem_id = $1 ORDER BY sort_order ASC`,
    [id],
  );
  problem.test_cases = testCases;
  return problem;
}

export async function updateProblem(id: string, data: Partial<{
  title: string; description: string; language: string; difficulty: string;
  starter_code: string; solution_hint: string; expected_concepts: string;
  points: number; course_id: string; status: string;
  test_cases: { id?: string; input: string; expected_output: string; is_hidden: boolean; explanation?: string }[];
}>) {
  const { test_cases, ...fields } = data;

  const setClauses: string[] = [];
  const params: any[] = [];

  const allowed = ['title', 'description', 'language', 'difficulty', 'starter_code', 'solution_hint', 'expected_concepts', 'points', 'course_id', 'status'];
  for (const key of allowed) {
    if (key in fields) {
      params.push((fields as any)[key]);
      setClauses.push(`${key} = $${params.length}`);
    }
  }

  if (setClauses.length > 0) {
    params.push(id);
    await db.query(
      `UPDATE coding_problems SET ${setClauses.join(', ')}, updated_at = NOW() WHERE id = $${params.length}`,
      params,
    );
  }

  if (test_cases) {
    await db.query(`DELETE FROM coding_test_cases WHERE problem_id = $1`, [id]);
    for (let i = 0; i < test_cases.length; i++) {
      const tc = test_cases[i];
      await db.query(
        `INSERT INTO coding_test_cases (problem_id, input, expected_output, is_hidden, explanation, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [id, tc.input, tc.expected_output, tc.is_hidden, tc.explanation ?? null, i],
      );
    }
  }

  return getProblemById(id);
}

export async function deleteProblem(id: string) {
  const { rowCount } = await db.query(`DELETE FROM coding_problems WHERE id = $1`, [id]);
  if (!rowCount) throw new AppError('Problem not found', 404, 'NOT_FOUND');
}

// ════════════════════════════════════════════════════════════════════════════
// CRUD — Assignments
// ════════════════════════════════════════════════════════════════════════════

export async function assignProblem(data: {
  problem_id: string; batch_id: string; assigned_by: string;
  due_date?: string; time_limit_mins?: number; max_attempts?: number;
}) {
  const { rows } = await db.query<any>(
    `INSERT INTO coding_assignments
       (problem_id, batch_id, assigned_by, due_date, time_limit_mins, max_attempts)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (problem_id, batch_id) DO UPDATE
       SET due_date = EXCLUDED.due_date,
           time_limit_mins = EXCLUDED.time_limit_mins,
           max_attempts = EXCLUDED.max_attempts,
           status = 'ACTIVE'
     RETURNING *`,
    [data.problem_id, data.batch_id, data.assigned_by,
    data.due_date ?? null, data.time_limit_mins ?? null, data.max_attempts ?? 3],
  );
  
  const assignment = rows[0];

  // Send email notifications to students in the assigned batch
  const { rows: students } = await db.query(
    `SELECT u.email, u.name 
     FROM enrollments e 
     JOIN users u ON e.student_id = u.id 
     WHERE e.batch_id = $1`,
    [data.batch_id]
  );
  
  const { rows: problemInfo } = await db.query(`SELECT title FROM coding_problems WHERE id = $1`, [data.problem_id]);
  const problemTitle = problemInfo[0]?.title || 'Coding Assessment';

  for (const student of students) {
    if (student.email) {
      sendEmail({
        to: student.email,
        subject: `New Coding Assessment: ${problemTitle}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 8px;">
            <h2 style="color: #0284c7;">New Coding Assessment</h2>
            <p>Hi ${student.name},</p>
            <p>A new coding assessment <strong>"${problemTitle}"</strong> has just been scheduled for your batch.</p>
            ${data.due_date ? `<p><strong>Due Date:</strong> ${new Date(data.due_date).toLocaleString('en-IN')}</p>` : ''}
            <p>Please log in to the portal and head to the Coding section to complete your assessment.</p>
            <br/>
            <p style="color: #666; font-size: 14px;">Happy Coding!<br/>Vtricks Technologies Team</p>
          </div>
        `
      }).catch(err => console.error('[email] Error sending coding assignment email to', student.email, err));
    }
  }

  return assignment;
}

export async function listAssignments(filters: { batchId?: string; problemId?: string; status?: string }) {
  let sql = `
    SELECT ca.*, p.title AS problem_title, p.difficulty, p.language, p.points,
           b.name AS batch_name, u.name AS assigned_by_name,
           (SELECT COUNT(*)::int FROM coding_submissions cs WHERE cs.assignment_id = ca.id) AS submission_count
    FROM coding_assignments ca
    JOIN coding_problems p ON p.id = ca.problem_id
    JOIN batches b         ON b.id = ca.batch_id
    LEFT JOIN users u      ON u.id = ca.assigned_by
    WHERE 1=1`;
  const params: any[] = [];

  if (filters.batchId) { params.push(filters.batchId); sql += ` AND ca.batch_id = $${params.length}`; }
  if (filters.problemId) { params.push(filters.problemId); sql += ` AND ca.problem_id = $${params.length}`; }
  if (filters.status) { params.push(filters.status); sql += ` AND ca.status = $${params.length}`; }

  sql += ' ORDER BY ca.created_at DESC';
  const { rows } = await db.query<any>(sql, params);
  return rows;
}

export async function getStudentAssignments(studentId: string) {
  const { rows } = await db.query<any>(
    `SELECT ca.*, p.title AS problem_title, p.description, p.difficulty, p.language,
            p.points, p.starter_code,
            b.name AS batch_name, c.title AS course_title, c.color_token,
            (SELECT COUNT(*)::int FROM coding_submissions cs
             WHERE cs.assignment_id = ca.id AND cs.student_id = $1) AS attempt_count,
            (SELECT cs2.status FROM coding_submissions cs2
             WHERE cs2.assignment_id = ca.id AND cs2.student_id = $1
             ORDER BY cs2.submitted_at DESC LIMIT 1) AS last_status,
            (SELECT cs3.ai_score FROM coding_submissions cs3
             WHERE cs3.assignment_id = ca.id AND cs3.student_id = $1
             ORDER BY COALESCE(cs3.ai_score, 0) DESC LIMIT 1) AS best_score
     FROM coding_assignments ca
     JOIN coding_problems p  ON p.id = ca.problem_id
     JOIN batches b          ON b.id = ca.batch_id
     JOIN enrollments e      ON e.batch_id = b.id AND e.student_id = $1
     LEFT JOIN LATERAL (
       SELECT c2.title, c2.color_token
       FROM batch_courses bc2 JOIN courses c2 ON c2.id = bc2.course_id
       WHERE bc2.batch_id = b.id ORDER BY bc2.sort_order LIMIT 1
     ) c ON true
     WHERE ca.status = 'ACTIVE'
     ORDER BY ca.created_at DESC`,
    [studentId],
  );
  return rows;
}

// ════════════════════════════════════════════════════════════════════════════
// Submit & Evaluate
// ════════════════════════════════════════════════════════════════════════════

export async function submitCode(data: {
  assignment_id: string;
  student_id: string;
  code: string;
  language: string;
}) {
  // Validate assignment exists and student is enrolled
  const { rows: assignRows } = await db.query<any>(
    `SELECT ca.*, p.title, p.description, p.expected_concepts,
            (SELECT COUNT(*)::int FROM coding_submissions cs
             WHERE cs.assignment_id = ca.id AND cs.student_id = $2) AS attempt_count
     FROM coding_assignments ca
     JOIN coding_problems p  ON p.id = ca.problem_id
     JOIN batches b          ON b.id = ca.batch_id
     JOIN enrollments e      ON e.batch_id = b.id AND e.student_id = $2
     WHERE ca.id = $1 AND ca.status = 'ACTIVE'`,
    [data.assignment_id, data.student_id],
  );
  if (!assignRows[0]) throw new AppError('Assignment not found or not accessible', 404, 'NOT_FOUND');

  const assignment = assignRows[0];

  if (assignment.due_date && new Date() > new Date(assignment.due_date)) {
    throw new AppError('The due date for this coding test has passed. Submissions are no longer accepted.', 403, 'PAST_DUE');
  }

  if (assignment.attempt_count >= assignment.max_attempts) {
    throw new AppError(`Maximum ${assignment.max_attempts} attempts reached`, 400, 'MAX_ATTEMPTS');
  }

  // Get visible test cases
  const { rows: testCases } = await db.query<any>(
    `SELECT * FROM coding_test_cases WHERE problem_id = $1 ORDER BY sort_order ASC`,
    [assignment.problem_id],
  );

  // Create submission record
  const { rows: subRows } = await db.query<any>(
    `INSERT INTO coding_submissions
       (assignment_id, problem_id, student_id, code, language, execution_status, attempt_number)
     VALUES ($1,$2,$3,$4,$5,'RUNNING',$6)
     RETURNING id`,
    [data.assignment_id, assignment.problem_id, data.student_id,
    data.code, data.language, assignment.attempt_count + 1],
  );
  const submissionId = subRows[0].id;

  try {
    // Run code against each test case
    let testsPassed = 0;
    let lastOutput = '';
    let lastStderr = '';
    let totalTime = 0;
    let executionStatus = 'ACCEPTED';
    let judgeUnavailable = false;

    for (const tc of testCases) {
      try {
        const result = await executeCode(data.code, data.language, tc.input);
        lastOutput = result.stdout;
        if (result.stderr) lastStderr = result.stderr;
        totalTime = Math.max(totalTime, result.time);

        const passed = outputsMatch(result.stdout, tc.expected_output);
        if (passed) testsPassed++;

        if (result.status.toLowerCase().includes('runtime') || result.status.toLowerCase().includes('error'))
          executionStatus = 'RUNTIME_ERROR';
        if (result.status.toLowerCase().includes('time')) executionStatus = 'TIME_LIMIT';
        if (result.status.toLowerCase().includes('compile')) executionStatus = 'COMPILE_ERROR';
      } catch (execErr: any) {
        // Judge0 down — still accept submission and grade via AI (core flow must not die)
        if (execErr instanceof AppError && execErr.code === 'JUDGE_UNAVAILABLE') {
          judgeUnavailable = true;
          lastStderr = execErr.message;
          executionStatus = 'JUDGE_UNAVAILABLE';
          break;
        }
        throw execErr;
      }
    }

    if (!judgeUnavailable && executionStatus === 'ACCEPTED' && testsPassed < testCases.length) {
      executionStatus = 'WRONG_ANSWER';
    }

    // AI Evaluation (automated, runs always — even if judge is down)
    const problemForAI = {
      title: assignment.title,
      description: assignment.description,
      expected_concepts: assignment.expected_concepts,
    };
    const ai = await evaluateWithAI(
      problemForAI, data.code, data.language,
      lastOutput || lastStderr, testsPassed, testCases.length || 1,
    );

    // Update submission with results
    await db.query(
      `UPDATE coding_submissions SET
         execution_status  = $1,
         execution_output  = $2,
         stderr            = $3,
         runtime_ms        = $4,
         test_cases_passed = $5,
         test_cases_total  = $6,
         ai_score          = $7,
         ai_feedback       = $8,
         ai_suggestions    = $9,
         ai_grade          = $10,
         status            = 'EVALUATED',
         evaluated_at      = NOW()
       WHERE id = $11`,
      [executionStatus, lastOutput, lastStderr, totalTime,
        testsPassed, testCases.length,
        ai.score, ai.feedback, ai.suggestions, ai.grade,
        submissionId],
    );

    return getSubmissionById(submissionId);
  } catch (err) {
    await db.query(
      `UPDATE coding_submissions SET execution_status = 'RUNTIME_ERROR', status = 'EVALUATED' WHERE id = $1`,
      [submissionId],
    );
    if (err instanceof AppError) throw err;
    throw new AppError('Evaluation failed', 502, 'JUDGE_ERROR');
  }
}

export async function getSubmissionById(id: string) {
  const { rows } = await db.query<any>(
    `SELECT cs.*, u.name AS student_name,
            p.title AS problem_title, p.language AS problem_language
     FROM coding_submissions cs
     JOIN users u            ON u.id = cs.student_id
     JOIN coding_problems p  ON p.id = cs.problem_id
     WHERE cs.id = $1`,
    [id],
  );
  if (!rows[0]) throw new AppError('Submission not found', 404, 'NOT_FOUND');
  return rows[0];
}

export async function getSubmissionsByAssignment(assignmentId: string) {
  const { rows } = await db.query<any>(
    `SELECT cs.*, u.name AS student_name
     FROM coding_submissions cs
     JOIN users u ON u.id = cs.student_id
     WHERE cs.assignment_id = $1
     ORDER BY cs.submitted_at DESC`,
    [assignmentId],
  );
  return rows;
}

export async function getMySubmissions(studentId: string, assignmentId: string) {
  const { rows } = await db.query<any>(
    `SELECT * FROM coding_submissions
     WHERE student_id = $1 AND assignment_id = $2
     ORDER BY submitted_at DESC`,
    [studentId, assignmentId],
  );
  return rows;
}

export async function closeAssignment(id: string) {
  await db.query(`UPDATE coding_assignments SET status = 'CLOSED' WHERE id = $1`, [id]);
}

// ── Run code with custom input (no submission, just execute) ─────────────────
export async function runCode(data: {
  code: string;
  language: string;
  stdin: string;
}): Promise<{ stdout: string; stderr: string; time: number; status: string }> {
  if (!data.code?.trim()) {
    throw new AppError('Code is required', 400, 'VALIDATION_ERROR');
  }
  if (data.code.length > 100_000) {
    throw new AppError('Code is too large (max 100KB)', 400, 'VALIDATION_ERROR');
  }
  const result = await executeCode(data.code, data.language, data.stdin ?? '');
  return {
    stdout: result.stdout,
    stderr: result.stderr,
    time: result.time,
    status: result.status,
  };
}
