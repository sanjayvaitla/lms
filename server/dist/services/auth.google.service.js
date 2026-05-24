"use strict";
/**
 * auth.google.service.ts — Google OAuth 2.0 via passport-google-oauth20
 *
 * Required env vars:
 *   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
 *   GOOGLE_CALLBACK_URL  (default: http://localhost:5000/api/v1/auth/google/callback)
 *   CLIENT_URL           (default: http://localhost:5173)
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GOOGLE_CONFIGURED = void 0;
exports.setupGooglePassport = setupGooglePassport;
exports.upsertGoogleUser = upsertGoogleUser;
exports.issueTokensForUser = issueTokensForUser;
const db_1 = __importDefault(require("../lib/db"));
const jwt_1 = require("../lib/jwt");
const error_middleware_1 = require("../middleware/error.middleware");
exports.GOOGLE_CONFIGURED = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
// ── Passport setup ────────────────────────────────────────────────────────────
function setupGooglePassport() {
    if (!exports.GOOGLE_CONFIGURED) {
        console.warn('[auth/google] GOOGLE_CLIENT_ID not set — Google OAuth disabled.');
        return;
    }
    /* eslint-disable @typescript-eslint/no-var-requires */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const passport = require('passport');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const GoogleStrategy = require('passport-google-oauth20').Strategy;
    /* eslint-enable @typescript-eslint/no-var-requires */
    passport.use(new GoogleStrategy({
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: process.env.GOOGLE_CALLBACK_URL ?? 'http://localhost:5000/api/v1/auth/google/callback',
        scope: ['profile', 'email'],
    }, async (_accessToken, _refreshToken, profile, 
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    done) => {
        try {
            const user = await upsertGoogleUser(profile);
            done(null, user);
        }
        catch (err) {
            done(err);
        }
    }));
    console.log('[auth/google] Google OAuth configured OK');
}
// ── Upsert user ───────────────────────────────────────────────────────────────
async function upsertGoogleUser(profile) {
    const email = profile.emails?.[0]?.value ?? null;
    const googleId = profile.id;
    const avatarUrl = profile.photos?.[0]?.value ?? null;
    if (!email)
        throw new error_middleware_1.AppError('Google account has no email', 400, 'VALIDATION_ERROR');
    const existing = await db_1.default.query('SELECT id, role, email, name FROM users WHERE google_id = $1 OR email = $2 LIMIT 1', [googleId, email]);
    let user;
    if (existing.rows.length) {
        const row = existing.rows[0];
        await db_1.default.query(`UPDATE users
       SET google_id     = COALESCE(google_id, $2),
           auth_provider = 'GOOGLE',
           avatar_url    = COALESCE(avatar_url, $3),
           updated_at    = NOW()
       WHERE id = $1`, [row.id, googleId, avatarUrl]);
        user = row;
    }
    else {
        const { rows } = await db_1.default.query(`INSERT INTO users (name, email, google_id, auth_provider, avatar_url, role, password_hash)
       VALUES ($1, $2, $3, 'GOOGLE', $4, 'STUDENT', NULL)
       RETURNING id, role, email, name`, [profile.displayName, email, googleId, avatarUrl]);
        user = rows[0];
    }
    return user;
}
// ── Issue JWT tokens ──────────────────────────────────────────────────────────
async function issueTokensForUser(userId, role) {
    const payload = { userId, role };
    const accessToken = (0, jwt_1.signAccessToken)(payload);
    const refreshToken = (0, jwt_1.signRefreshToken)(payload);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);
    await db_1.default.query('DELETE FROM refresh_tokens WHERE user_id = $1', [userId]);
    await db_1.default.query('INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)', [userId, refreshToken, expiresAt]);
    return { accessToken, refreshToken };
}
//# sourceMappingURL=auth.google.service.js.map