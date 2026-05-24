import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import db from '../lib/db';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../lib/jwt';
import { AppError } from '../middleware/error.middleware';
import { sendEmail, forgotPasswordEmail } from '../lib/email';
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
}

function sanitize(u: DbUser) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    avatarUrl: u.avatar_url,
    createdAt: u.created_at,
  };
}

export async function register(input: RegisterInput) {
  const existing = await db.query<DbUser>(
    'SELECT id FROM users WHERE email = $1',
    [input.email],
  );
  if (existing.rowCount && existing.rowCount > 0) {
    throw new AppError('Email already registered', 409, 'DUPLICATE');
  }

  const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);
  const { rows } = await db.query<DbUser>(
    `INSERT INTO users (name, email, password_hash, role)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [input.name, input.email, passwordHash, input.role ?? 'STUDENT'],
  );
  const user = rows[0];

  const payload = { userId: user.id, role: user.role };
  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);
  await db.query(
    `INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)`,
    [user.id, refreshToken, expiresAt],
  );

  return { user: sanitize(user), accessToken, refreshToken };
}

export async function login(input: LoginInput) {
  const { rows } = await db.query<DbUser>(
    'SELECT * FROM users WHERE email = $1',
    [input.email],
  );
  const user = rows[0];
  if (!user) throw new AppError('Invalid email or password', 401, 'INVALID_CREDENTIALS');

  const valid = await bcrypt.compare(input.password, user.password_hash);
  if (!valid) throw new AppError('Invalid email or password', 401, 'INVALID_CREDENTIALS');

  const payload = { userId: user.id, role: user.role };
  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  await db.query('DELETE FROM refresh_tokens WHERE user_id = $1', [user.id]);
  await db.query(
    `INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)`,
    [user.id, refreshToken, expiresAt],
  );

  return { user: sanitize(user), accessToken, refreshToken };
}

export async function refresh(token: string) {
  const payload = verifyRefreshToken(token);
  const { rows } = await db.query(
    'SELECT * FROM refresh_tokens WHERE token = $1',
    [token],
  );
  const stored = rows[0];
  if (!stored || new Date(stored.expires_at as string) < new Date()) {
    throw new AppError('Refresh token invalid or expired', 401, 'UNAUTHORIZED');
  }
  const accessToken = signAccessToken({ userId: payload.userId, role: payload.role });
  return { accessToken };
}

export async function logout(userId: string) {
  await db.query('DELETE FROM refresh_tokens WHERE user_id = $1', [userId]);
}

export async function getMe(userId: string) {
  const { rows } = await db.query<DbUser>(
    'SELECT * FROM users WHERE id = $1',
    [userId],
  );
  const user = rows[0];
  if (!user) throw new AppError('User not found', 404, 'NOT_FOUND');
  return sanitize(user);
}

// ── Forgot Password ───────────────────────────────────────────────────────────
export async function forgotPassword(email: string) {
  const { rows } = await db.query<DbUser>(
    'SELECT id, name, email FROM users WHERE email = $1',
    [email],
  );
  if (!rows.length) return; // silent — prevent email enumeration

  const user = rows[0];

  await db.query('DELETE FROM password_reset_tokens WHERE user_id = $1', [user.id]);

  const rawToken  = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 min

  await db.query(
    `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
    [user.id, tokenHash, expiresAt],
  );

  const clientUrl = process.env.CLIENT_URL ?? 'http://localhost:5173';
  const resetUrl  = `${clientUrl}/reset-password?token=${rawToken}`;

  const template = forgotPasswordEmail(user.name, resetUrl);
  await sendEmail({ ...template, to: user.email });
}

// ── Reset Password ────────────────────────────────────────────────────────────
export async function resetPassword(rawToken: string, newPassword: string) {
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

  const { rows } = await db.query<{ id: string; user_id: string; expires_at: Date; used: boolean }>(
    'SELECT * FROM password_reset_tokens WHERE token_hash = $1',
    [tokenHash],
  );
  const record = rows[0];
  if (!record) throw new AppError('Reset link is invalid or has expired', 400, 'INVALID_TOKEN');
  if (record.used) throw new AppError('Reset link has already been used', 400, 'TOKEN_USED');
  if (new Date(record.expires_at) < new Date()) {
    throw new AppError('Reset link has expired. Please request a new one.', 400, 'TOKEN_EXPIRED');
  }

  const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

  await db.transaction(async (client) => {
    await db.query(
      `UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2`,
      [passwordHash, record.user_id],
      client,
    );
    await db.query(
      `UPDATE password_reset_tokens SET used = TRUE WHERE id = $1`,
      [record.id],
      client,
    );
    await db.query(
      `DELETE FROM refresh_tokens WHERE user_id = $1`,
      [record.user_id],
      client,
    );
  });
}
