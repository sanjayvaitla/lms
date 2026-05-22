import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import db from '../lib/db';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../lib/jwt';
import { AppError } from '../middleware/error.middleware';
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
    `INSERT INTO refresh_tokens (user_id, token, expires_at)
     VALUES ($1, $2, $3)`,
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

  // Rotate: delete old tokens, insert new
  await db.query('DELETE FROM refresh_tokens WHERE user_id = $1', [user.id]);
  await db.query(
    `INSERT INTO refresh_tokens (user_id, token, expires_at)
     VALUES ($1, $2, $3)`,
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
