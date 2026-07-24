import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import db from '../lib/db';
import { issueTokenPair, refreshSession, revokeUserSessions } from '../lib/tokens';
import { AppError } from '../middleware/error.middleware';
import { sendEmail, forgotPasswordEmail } from '../lib/email';
import { storageAdapter } from '../lib/storage';
import type { RegisterInput, LoginInput } from '../validators/auth.validator';

const SALT_ROUNDS = 12;

interface DbUser {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  role: string;
  avatar_url: string | null;
  created_at: Date;
  phone_number?: string | null;
  date_of_birth?: Date | string | null;
  occupation?: string | null;
  qualification?: string | null;
  graduation_year?: string | null;
  class_preference?: string | null;
  lead_source?: string | null;
  address?: string | null;
  account_status?: string | null;
  github_username?: string | null;
}

const PROFILE_SELECT = `
  id, name, email, role, avatar_url, created_at,
  phone_number, date_of_birth, occupation, qualification,
  graduation_year, class_preference, lead_source, address, account_status,
  github_username
`;

function toIsoDate(v: Date | string | null | undefined): string | null {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v);
  return s.length >= 10 ? s.slice(0, 10) : s;
}

/**
 * Extract S3 key from a stored avatar value.
 * Values are stored as raw keys (e.g. "avatars/users/uuid/ts.jpg").
 * Legacy rows may have full S3 URLs — extract the key by stripping the bucket host.
 */
function extractAvatarKey(value: string): string {
  if (!value.startsWith('http')) return value;
  try {
    const u = new URL(value);
    if (u.hostname.endsWith('amazonaws.com') && u.hostname.includes('.s3.')) {
      return u.pathname.replace(/^\//, '');
    }
    if (u.hostname.startsWith('s3.') && u.hostname.endsWith('amazonaws.com')) {
      return u.pathname.replace(/^\/[^/]+\//, '');
    }
  } catch { /* fall through */ }
  return value;
}

async function resolveAvatarUrl(avatarUrl: string | null): Promise<string | null> {
  if (!avatarUrl) return null;
  try {
    return await storageAdapter.getUrl(extractAvatarKey(avatarUrl));
  } catch {
    return null;
  }
}

async function deleteAvatarIfS3(value: string | null): Promise<void> {
  if (!value) return;
  try { await storageAdapter.delete(extractAvatarKey(value)); } catch { /* ignore */ }
}

async function sanitizeWithS3Url(u: DbUser) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    avatarUrl: await resolveAvatarUrl(u.avatar_url),
    createdAt: u.created_at,
    phoneNumber: u.phone_number ?? null,
    dateOfBirth: toIsoDate(u.date_of_birth),
    occupation: u.occupation ?? null,
    qualification: u.qualification ?? null,
    graduationYear: u.graduation_year ?? null,
    classPreference: u.class_preference ?? null,
    leadSource: u.lead_source ?? null,
    address: u.address ?? null,
    accountStatus: u.account_status ?? null,
    githubUsername: u.github_username ?? null,
  };
}

export async function checkEmail(email: string) {
  const existing = await db.query<DbUser>(
    'SELECT id FROM users WHERE LOWER(email) = $1',
    [email.toLowerCase().trim()],
  );
  return { exists: existing.rowCount ? existing.rowCount > 0 : false };
}

export async function register(input: RegisterInput) {
  const { rows: existingRows } = await db.query<DbUser>(
    'SELECT id FROM users WHERE LOWER(email) = $1',
    [input.email.toLowerCase().trim()],
  );
  if (existingRows.length > 0) {
    throw new AppError('Email already registered', 409, 'DUPLICATE');
  }

  const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);
  const role = input.role ?? 'STUDENT';
  // New student and intern signups await fee-admin approval; staff accounts are active immediately.
  const accountStatus = (role === 'STUDENT' || role === 'INTERN') ? 'PENDING' : 'ACTIVE';
  const { rows } = await db.query<DbUser>(
    `INSERT INTO users (name, email, password_hash, phone_number, date_of_birth, occupation, qualification, graduation_year, class_preference, lead_source, address, role, account_status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     RETURNING *`,
    [input.name, input.email, passwordHash,
    input.phoneNumber ?? null,
    input.dateOfBirth ?? null,
    input.occupation ?? null,
    input.qualification ?? null,
    input.graduationYear ?? null,
    input.classPreference ?? null,
    input.leadSource ?? null,
    input.address ?? null,
      role,
      accountStatus],
  );
  const user = rows[0];

  // PENDING learners must not receive sessions — prevents portal access before fee approval
  // and avoids confusing auth failures when editing profile before activation.
  if (accountStatus === 'PENDING') {
    return {
      user: await sanitizeWithS3Url(user),
      requiresApproval: true,
      message: 'Account created. Sign in after fee admin approval.',
    };
  }

  const { accessToken, refreshToken } = await issueTokenPair(user.id, user.role);

  return { user: await sanitizeWithS3Url(user), accessToken, refreshToken };
}

export async function login(input: LoginInput) {
  const { rows } = await db.query<DbUser>(
    `SELECT ${PROFILE_SELECT}, password_hash FROM users WHERE LOWER(email) = $1`,
    [input.email.toLowerCase().trim()],
  );
  const user = rows[0];
  if (!user) throw new AppError('Invalid email or password', 401, 'INVALID_CREDENTIALS');

  // Guard: account may have been created via Google OAuth (no password set)
  if (!user.password_hash) {
    throw new AppError('This account was created with Google. Please sign in with Google.', 401, 'INVALID_CREDENTIALS');
  }

  const valid = await bcrypt.compare(input.password, user.password_hash);
  if (!valid) throw new AppError('Invalid email or password', 401, 'INVALID_CREDENTIALS');

  // Enforce 365-day validity for students
  if (user.role === 'STUDENT') {
    const creationDate = new Date(user.created_at);
    const msInYear = 365 * 24 * 60 * 60 * 1000;
    if (Date.now() - creationDate.getTime() > msInYear) {
      throw new AppError('Account expired. Student accounts are valid for 365 days.', 403, 'ACCOUNT_EXPIRED');
    }
  }

  // Block accounts that are not active (set during fee-admin review).
  if ((user as any).account_status === 'PENDING') {
    throw new AppError('Your account is pending approval. The fee admin will review and activate your account shortly.', 403, 'ACCOUNT_PENDING');
  }
  if ((user as any).account_status === 'REJECTED') {
    throw new AppError('Your account has been rejected. Please contact Vtricks Technologies for more information.', 403, 'ACCOUNT_REJECTED');
  }
  if ((user as any).account_status === 'BLOCKED') {
    throw new AppError('Your account has been blocked by the administrator. Portal access is denied.', 403, 'ACCOUNT_BLOCKED');
  }

  const { accessToken, refreshToken } = await issueTokenPair(user.id, user.role);

  return { user: await sanitizeWithS3Url(user), accessToken, refreshToken };
}

export async function refresh(token: string) {
  return refreshSession(token);
}

export async function logout(userId: string) {
  await revokeUserSessions(userId);
}

export async function getMe(userId: string) {
  const { assertUserCanAuthenticate } = await import('../lib/tokens');
  await assertUserCanAuthenticate(userId);
  const { rows } = await db.query<DbUser>(
    `SELECT ${PROFILE_SELECT} FROM users WHERE id = $1`,
    [userId],
  );
  const user = rows[0];
  if (!user) throw new AppError('User not found', 404, 'NOT_FOUND');
  return sanitizeWithS3Url(user);
}

export async function updateMyProfile(
  userId: string,
  input: import('../validators/auth.validator').UpdateProfileInput,
) {
  // Ensure inactive accounts cannot mutate profile via a leftover JWT
  const { rows: statusRows } = await db.query<{ account_status: string | null }>(
    `SELECT account_status FROM users WHERE id = $1`,
    [userId],
  );
  const status = statusRows[0]?.account_status ?? 'ACTIVE';
  if (status === 'PENDING') {
    throw new AppError('Your account is pending approval. Profile edits unlock after activation.', 403, 'ACCOUNT_PENDING');
  }
  if (status === 'REJECTED' || status === 'BLOCKED') {
    throw new AppError('Your account cannot be edited in its current status.', 403, 'ACCOUNT_INACTIVE');
  }

  // Hard block login-identity fields — never honour phone/email from client body
  const body = input as Record<string, unknown>;
  if ('email' in body || 'phoneNumber' in body || 'phone_number' in body) {
    throw new AppError(
      'Email and phone can only be changed by L&D Manager or Super Admin. Contact them if your login details are wrong.',
      403,
      'IDENTITY_LOCKED',
    );
  }

  const fields: string[] = [];
  const params: unknown[] = [];
  let i = 1;

  const map: Array<[keyof typeof input, string]> = [
    ['name', 'name'],
    ['dateOfBirth', 'date_of_birth'],
    ['address', 'address'],
    ['occupation', 'occupation'],
    ['qualification', 'qualification'],
    ['graduationYear', 'graduation_year'],
    ['classPreference', 'class_preference'],
    ['leadSource', 'lead_source'],
  ];

  for (const [key, col] of map) {
    if (input[key] !== undefined) {
      fields.push(`${col} = $${i++}`);
      const val = input[key];
      params.push(val === '' ? null : val);
    }
  }

  if (input.githubUsername !== undefined) {
    const raw = (input.githubUsername ?? '').toString().trim();
    const normalized = raw ? raw.replace(/^@/, '') : null;
    if (normalized) {
      const clash = await db.query<{ id: string }>(
        `SELECT id FROM users
         WHERE LOWER(github_username) = LOWER($1) AND id <> $2`,
        [normalized, userId],
      );
      if (clash.rows.length) {
        throw new AppError(
          'This GitHub username is already linked to another learner. Each student must use a unique GitHub account.',
          409,
          'GITHUB_TAKEN',
        );
      }
    }
    fields.push(`github_username = $${i++}`);
    params.push(normalized);
  }

  if (!fields.length) throw new AppError('No fields to update', 400, 'VALIDATION_ERROR');

  fields.push('updated_at = NOW()');
  params.push(userId);

  try {
    const { rows } = await db.query<DbUser>(
      `UPDATE users SET ${fields.join(', ')}
       WHERE id = $${i}
       RETURNING ${PROFILE_SELECT}`,
      params,
    );
    if (!rows[0]) throw new AppError('User not found', 404, 'NOT_FOUND');
    return sanitizeWithS3Url(rows[0]);
  } catch (err: unknown) {
    const pg = err as { code?: string };
    if (pg.code === '23505') {
      throw new AppError('GitHub username already in use', 409, 'GITHUB_TAKEN');
    }
    throw err;
  }
}

// ── Forgot Password ───────────────────────────────────────────────────────────
function getClientUrl(): string {
  return process.env.CLIENT_URL ?? process.env.FRONTEND_URL ?? 'http://localhost:5173';
}

/** Create a one-time password-reset URL (hashed token stored server-side). */
export async function createPasswordResetLink(
  userId: string,
  expiresMinutes = 30,
): Promise<string> {
  await db.query('DELETE FROM password_reset_tokens WHERE user_id = $1', [userId]);

  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const expiresAt = new Date(Date.now() + expiresMinutes * 60 * 1000);

  await db.query(
    `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
    [userId, tokenHash, expiresAt],
  );

  return `${getClientUrl().replace(/\/$/, '')}/reset-password?token=${rawToken}`;
}

export async function forgotPassword(email: string) {
  const { rows } = await db.query<DbUser>(
    `SELECT id, name, email, account_status, password_hash
     FROM users WHERE LOWER(email) = $1`,
    [email.toLowerCase().trim()],
  );
  if (!rows.length) return; // silent — prevent email enumeration

  const user = rows[0];
  // No reset for rejected/blocked — still silent
  if (user.account_status === 'REJECTED' || user.account_status === 'BLOCKED') return;

  const expiresMinutes = 60;
  const resetUrl = await createPasswordResetLink(user.id, expiresMinutes);
  const template = forgotPasswordEmail(user.name, resetUrl, expiresMinutes);

  try {
    await sendEmail({ ...template, to: user.email });
  } catch (err) {
    console.error('[auth] Failed to send password reset email:', user.email, err);
  }
}

export async function setupUserPassword(email: string, role: string) {
  const { rows } = await db.query<DbUser>(
    'SELECT id, name, email FROM users WHERE LOWER(email) = $1',
    [email.toLowerCase().trim()],
  );
  if (!rows.length) return;

  const user = rows[0];
  const setupUrl = await createPasswordResetLink(user.id, 30);

  const { setupAccountEmail } = await import('../lib/email');
  const template = setupAccountEmail(user.name, role, setupUrl);
  try {
    await sendEmail({ ...template, to: user.email });
  } catch (err) {
    console.error('[auth] Failed to send setup password email:', user.email, err);
  }
}

// ── Validate reset token (pre-check before showing reset form) ─────────────────
export async function validateResetToken(rawToken: string): Promise<{ valid: boolean; reason?: string }> {
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const { rows } = await db.query<{ expires_at: Date; used: boolean }>(
    'SELECT expires_at, used FROM password_reset_tokens WHERE token_hash = $1',
    [tokenHash],
  );
  const record = rows[0];
  if (!record) return { valid: false, reason: 'INVALID' };
  if (record.used) return { valid: false, reason: 'USED' };
  if (new Date(record.expires_at) < new Date()) return { valid: false, reason: 'EXPIRED' };
  return { valid: true };
}

// ── Reset Password ────────────────────────────────────────────────────────────
export async function resetPassword(rawToken: string, newPassword: string) {
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

  await db.transaction(async (client) => {
    const { rows } = await db.query<{ id: string; user_id: string }>(
      `UPDATE password_reset_tokens
       SET used = TRUE
       WHERE token_hash = $1
         AND used = FALSE
         AND expires_at > NOW()
       RETURNING id, user_id`,
      [tokenHash],
      client,
    );
    const record = rows[0];
    if (!record) {
      throw new AppError('Reset link is invalid, expired, or already used', 400, 'INVALID_TOKEN');
    }

    await db.query(
      `UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2`,
      [passwordHash, record.user_id],
      client,
    );
    await db.query(
      `DELETE FROM refresh_tokens WHERE user_id = $1`,
      [record.user_id],
      client,
    );
  });
}

// ── Avatar Upload ─────────────────────────────────────────────────────────────
export async function uploadAvatar(
  userId: string,
  file: { originalname: string; buffer: Buffer; mimetype: string },
) {
  // Validate file size (additional check beyond multer)
  if (file.buffer.length > 5 * 1024 * 1024) {
    throw new AppError('Avatar file too large. Maximum size is 5MB.', 400, 'FILE_TOO_LARGE');
  }

  // Validate image format
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  if (!allowedTypes.includes(file.mimetype)) {
    throw new AppError('Invalid file type. Only JPEG, PNG, and WebP images are allowed.', 400, 'INVALID_FILE_TYPE');
  }

  // Get current user to check for existing avatar
  const { rows: userRows } = await db.query<DbUser>(
    'SELECT avatar_url FROM users WHERE id = $1',
    [userId],
  );
  if (!userRows.length) throw new AppError('User not found', 404, 'NOT_FOUND');

  const currentAvatarUrl = userRows[0].avatar_url;

  // Upload to structured S3 path: avatars/users/{userId}/{ts}.{ext}
  const stored = await storageAdapter.uploadWithContext(
    { buffer: file.buffer, originalname: file.originalname, mimetype: file.mimetype },
    { type: 'avatar', userId },
  );

  // Update user's avatar URL in a transaction to prevent race conditions
  await db.transaction(async (tx) => {
    await db.query(
      'UPDATE users SET avatar_url = $1, updated_at = NOW() WHERE id = $2',
      [stored.key, userId], // Store S3 key instead of URL for consistency
      tx,
    );

    await deleteAvatarIfS3(currentAvatarUrl);
  });

  return { avatarUrl: await resolveAvatarUrl(stored.key) };
}

export async function deleteAvatar(userId: string) {
  const { rows: userRows } = await db.query<DbUser>(
    'SELECT avatar_url FROM users WHERE id = $1',
    [userId],
  );
  if (!userRows.length) throw new AppError('User not found', 404, 'NOT_FOUND');

  const currentAvatarUrl = userRows[0].avatar_url;

  // Update user to remove avatar
  await db.query(
    'UPDATE users SET avatar_url = NULL, updated_at = NOW() WHERE id = $1',
    [userId],
  );

  await deleteAvatarIfS3(currentAvatarUrl);
  return { message: 'Avatar deleted successfully' };
}
