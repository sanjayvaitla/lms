import { Router, Request, Response, NextFunction } from 'express';
import * as authController   from '../controllers/auth.controller';
import * as googleController from '../controllers/auth.google.controller';
import * as otpController    from '../controllers/auth.otp.controller';
import { authenticate }      from '../middleware/auth.middleware';
import { trackActivity }       from '../middleware/activityTracker';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const multer = require('multer');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit for avatars
  fileFilter: (_req: Request, file: { mimetype: string; originalname: string }, cb: (err: Error | null, accept?: boolean) => void) => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    const ok = allowedTypes.includes(file.mimetype);
    cb(ok ? null : new Error('Only JPEG, PNG, and WebP images are allowed for avatars.'), ok);
  },
});

function handleAvatarUpload(req: Request, res: Response, next: NextFunction) {
  upload.single('avatar')(req, res, (err: unknown) => {
    if (err) return next(err);
    next();
  });
}

const router: import('express').Router = Router();

// Standard email/password
router.get('/check-email',     authController.checkEmail);
router.post('/register',       authController.register);
router.post('/login',          authController.login);
router.post('/refresh',        authController.refresh);
router.post('/logout',         authenticate, authController.logout);
router.get ('/me',             authenticate, trackActivity('VIEW_PROFILE', 'User'), authController.me);
router.patch('/profile',       authenticate, authController.updateProfile);

// Password reset
router.post('/forgot-password', authController.forgotPassword);
router.post('/validate-reset-token', authController.validateResetToken);
router.post('/reset-password',  authController.resetPassword);

// Avatar
router.post  ('/upload-avatar', authenticate, handleAvatarUpload, authController.uploadAvatar);
router.delete('/avatar',        authenticate, authController.deleteAvatar);

// Google OAuth
router.get('/google',          googleController.googleAuth);
router.get('/google/callback', googleController.googleCallback);

// GitHub OAuth
import { GithubAuthController } from '../controllers/auth.github.controller';
router.get('/github',          GithubAuthController.githubAuth);
router.get('/github/callback', GithubAuthController.githubCallback);

// OTP
router.post('/send-otp',   otpController.sendOtp);
router.post('/verify-otp', otpController.verifyOtp);

export default router;
