/**
 * auth.google.service.ts — Google OAuth 2.0 via passport-google-oauth20
 *
 * Required env vars:
 *   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
 *   GOOGLE_CALLBACK_URL  (default: http://localhost:5000/api/v1/auth/google/callback)
 *   CLIENT_URL           (default: http://localhost:5173)
 */

import db from '../lib/db';
import { signAccessToken, signRefreshToken } from '../lib/jwt';
import { AppError } from '../middleware/error.middleware';

export const GOOGLE_CONFIGURED = !!(
  process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
);

// ── Passport setup ────────────────────────────────────────────────────────────
export function setupGooglePassport(): void {
  if (!GOOGLE_CONFIGURED) {
    console.warn('[auth/google] GOOGLE_CLIENT_ID not set — Google OAuth disabled.');
    return;
  }
  /* eslint-disable @typescript-eslint/no-var-requires */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const passport      = require('passport')               as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const GoogleStrategy = (require('passport-google-oauth20') as any).Strategy;
  /* eslint-enable @typescript-eslint/no-var-requires */

  passport.use(new GoogleStrategy(
    {
      clientID:    process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL:  process.env.GOOGLE_CALLBACK_URL ?? 'http://localhost:5000/api/v1/auth/google/callback',
      scope:        ['profile', 'email'],
    },
    async (
      _accessToken: string,
      _refreshToken: string,
      profile: GoogleProfile,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      done: (err: Error | null, user?: any) => void,
    ) => {
      try {
        const user = await upsertGoogleUser(profile);
        done(null, user);
      } catch (err) {
        done(err as Error);
      }
    },
  ));
  console.log('[auth/google] Google OAuth configured OK');
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface GoogleProfile {
  id:          string;
  displayName: string;
  emails?:     Array<{ value: string }>;
  photos?:     Array<{ value: string }>;
}

// ── Upsert user ───────────────────────────────────────────────────────────────
export async function upsertGoogleUser(profile: GoogleProfile) {
  const email     = profile.emails?.[0]?.value ?? null;
  const googleId  = profile.id;
  const avatarUrl = profile.photos?.[0]?.value ?? null;

  if (!email) throw new AppError('Google account has no email', 400, 'VALIDATION_ERROR');

  const existing = await db.query(
    'SELECT id, role, email, name FROM users WHERE google_id = $1 OR email = $2 LIMIT 1',
    [googleId, email],
  );

  let user: { id: string; role: string; email: string; name: string };

  if (existing.rows.length) {
    const row = existing.rows[0] as typeof user;
    await db.query(
      `UPDATE users
       SET google_id     = COALESCE(google_id, $2),
           auth_provider = 'GOOGLE',
           avatar_url    = COALESCE(avatar_url, $3),
           updated_at    = NOW()
       WHERE id = $1`,
      [row.id, googleId, avatarUrl],
    );
    user = row;
  } else {
    const { rows } = await db.query(
      `INSERT INTO users (name, email, google_id, auth_provider, avatar_url, role, password_hash)
       VALUES ($1, $2, $3, 'GOOGLE', $4, 'STUDENT', NULL)
       RETURNING id, role, email, name`,
      [profile.displayName, email, googleId, avatarUrl],
    );
    user = rows[0] as typeof user;
  }

  return user;
}

// ── Issue JWT tokens ──────────────────────────────────────────────────────────
export async function issueTokensForUser(userId: string, role: string) {
  const payload      = { userId, role };
  const accessToken  = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  await db.query('DELETE FROM refresh_tokens WHERE user_id = $1', [userId]);
  await db.query(
    'INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)',
    [userId, refreshToken, expiresAt],
  );

  return { accessToken, refreshToken };
}
