"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.googleAuth = googleAuth;
exports.googleCallback = googleCallback;
const error_middleware_1 = require("../middleware/error.middleware");
const auth_google_service_1 = require("../services/auth.google.service");
// GET /api/auth/google — redirects to Google consent
function googleAuth(req, res, next) {
    if (!auth_google_service_1.GOOGLE_CONFIGURED) {
        return next(new error_middleware_1.AppError('Google OAuth is not configured on this server.', 501, 'NOT_CONFIGURED'));
    }
    // passport.authenticate('google') handles redirect
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const passport = require('passport');
    passport.authenticate('google', { scope: ['profile', 'email'] })(req, res, next);
}
// GET /api/auth/google/callback — Google sends code here
function googleCallback(req, res, next) {
    if (!auth_google_service_1.GOOGLE_CONFIGURED) {
        return next(new error_middleware_1.AppError('Google OAuth is not configured on this server.', 501, 'NOT_CONFIGURED'));
    }
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const passport = require('passport');
    passport.authenticate('google', { session: false }, async (err, user) => {
        if (err || !user) {
            const clientUrl = process.env.CLIENT_URL ?? 'http://localhost:5173';
            return res.redirect(`${clientUrl}/login?error=google_auth_failed`);
        }
        try {
            const { accessToken, refreshToken } = await (0, auth_google_service_1.issueTokensForUser)(user.id, user.role);
            const clientUrl = process.env.CLIENT_URL ?? 'http://localhost:5173';
            // Redirect to frontend with tokens as query params
            // Frontend reads them once and stores in memory / context
            res.redirect(`${clientUrl}/auth/callback?accessToken=${accessToken}&refreshToken=${refreshToken}`);
        }
        catch (e) {
            next(e);
        }
    })(req, res, next);
}
//# sourceMappingURL=auth.google.controller.js.map