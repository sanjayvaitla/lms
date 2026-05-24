import { Request, Response, NextFunction } from 'express';
import { AppError } from '../middleware/error.middleware';
import { issueTokensForUser, GOOGLE_CONFIGURED } from '../services/auth.google.service';

// GET /api/auth/google — redirects to Google consent
export function googleAuth(req: Request, res: Response, next: NextFunction) {
  if (!GOOGLE_CONFIGURED) {
    return next(new AppError('Google OAuth is not configured on this server.', 501, 'NOT_CONFIGURED'));
  }
  // passport.authenticate('google') handles redirect
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const passport = require('passport') as import('passport').PassportStatic;
  passport.authenticate('google', { scope: ['profile', 'email'] })(req, res, next);
}

// GET /api/auth/google/callback — Google sends code here
export function googleCallback(req: Request, res: Response, next: NextFunction) {
  if (!GOOGLE_CONFIGURED) {
    return next(new AppError('Google OAuth is not configured on this server.', 501, 'NOT_CONFIGURED'));
  }
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const passport = require('passport') as import('passport').PassportStatic;
  passport.authenticate('google', { session: false }, async (err: Error | null, user: { id: string; role: string } | false) => {
    if (err || !user) {
      const clientUrl = process.env.CLIENT_URL ?? 'http://localhost:5173';
      return res.redirect(`${clientUrl}/login?error=google_auth_failed`);
    }
    try {
      const { accessToken, refreshToken } = await issueTokensForUser(user.id, user.role);
      const clientUrl = process.env.CLIENT_URL ?? 'http://localhost:5173';
      // Redirect to frontend with tokens as query params
      // Frontend reads them once and stores in memory / context
      res.redirect(
        `${clientUrl}/auth/callback?accessToken=${accessToken}&refreshToken=${refreshToken}`,
      );
    } catch (e) {
      next(e);
    }
  })(req, res, next);
}
