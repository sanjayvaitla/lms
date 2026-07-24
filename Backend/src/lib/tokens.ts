import crypto from 'crypto';
import db from './db';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from './jwt';
import { AppError } from '../middleware/error.middleware';

export function hashRefreshToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

function refreshExpiresAt(): Date {
  const days = parseInt(process.env.JWT_REFRESH_DAYS ?? '7', 10);
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + (Number.isFinite(days) && days > 0 ? days : 7));
  return expiresAt;
}

/** Short TTL cache — pollers / many tabs hit authenticate often; avoid a DB roundtrip every time. */
const authGateCache = new Map<string, { at: number; value: { id: string; role: string } }>();
const AUTH_GATE_TTL_MS = 20_000;

export function invalidateAuthGateCache(userId?: string) {
  if (userId) authGateCache.delete(userId);
  else authGateCache.clear();
}

/** Shared gate for login / refresh / middleware — keeps status + expiry consistent. */
export async function assertUserCanAuthenticate(userId: string): Promise<{ id: string; role: string }> {
  const hit = authGateCache.get(userId);
  if (hit && Date.now() - hit.at < AUTH_GATE_TTL_MS) return hit.value;

  const { rows } = await db.query<{ id: string; role: string; account_status: string; created_at: Date }>(
    `SELECT id, role, account_status, created_at FROM users WHERE id = $1`,
    [userId],
  );
  const user = rows[0];
  if (!user) throw new AppError('User not found', 401, 'UNAUTHORIZED');

  if (user.role === 'STUDENT' || user.role === 'INTERN') {
    const msInYear = 365 * 24 * 60 * 60 * 1000;
    if (Date.now() - new Date(user.created_at).getTime() > msInYear) {
      throw new AppError('Account expired. Learner accounts are valid for 365 days.', 403, 'ACCOUNT_EXPIRED');
    }
  }

  if (user.account_status === 'PENDING') {
    throw new AppError('Your account is pending approval.', 403, 'ACCOUNT_PENDING');
  }
  if (user.account_status === 'REJECTED') {
    throw new AppError('Your account has been rejected.', 403, 'ACCOUNT_REJECTED');
  }
  if (user.account_status === 'BLOCKED') {
    throw new AppError('Your account has been blocked.', 403, 'ACCOUNT_BLOCKED');
  }

  const value = { id: user.id, role: user.role };
  authGateCache.set(userId, { at: Date.now(), value });
  return value;
}

/** Issue a new access + refresh pair. Keeps previous row briefly for cross-tab refresh races. */
export async function issueTokenPair(userId: string, role: string) {
  const payload = { userId, role };
  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);
  const expiresAt = refreshExpiresAt();

  await db.query(
    `DELETE FROM refresh_tokens
     WHERE user_id = $1
       AND (expires_at < NOW() OR created_at < NOW() - INTERVAL '30 seconds')`,
    [userId],
  );

  await db.query(
    `INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)`,
    [userId, hashRefreshToken(refreshToken), expiresAt],
  );

  invalidateAuthGateCache(userId);
  return { accessToken, refreshToken };
}

/** Rotate refresh token and return a fresh access + refresh pair. */
export async function refreshSession(rawToken: string) {
  let payload: { userId: string; role: string };
  try {
    payload = verifyRefreshToken(rawToken);
  } catch {
    throw new AppError('Refresh token invalid or expired', 401, 'UNAUTHORIZED');
  }

  const tokenHash = hashRefreshToken(rawToken);

  // Atomic claim: delete matching row in one statement to reduce races
  const { rows: claimed } = await db.query<{ id: string; user_id: string; expires_at: Date }>(
    `DELETE FROM refresh_tokens
     WHERE (token = $1 OR token = $2)
       AND expires_at > NOW()
     RETURNING id, user_id, expires_at`,
    [tokenHash, rawToken],
  );
  const stored = claimed[0];

  if (!stored) {
    // Peer tab may have already rotated — do not mass-revoke
    throw new AppError('Session expired. Please log in again.', 401, 'UNAUTHORIZED');
  }

  if (stored.user_id !== payload.userId) {
    throw new AppError('Session invalid. Please log in again.', 401, 'UNAUTHORIZED');
  }

  const user = await assertUserCanAuthenticate(payload.userId);
  return issueTokenPair(user.id, user.role);
}

export async function revokeUserSessions(userId: string) {
  await db.query('DELETE FROM refresh_tokens WHERE user_id = $1', [userId]);
  invalidateAuthGateCache(userId);
}
