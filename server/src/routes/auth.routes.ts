import { Router } from 'express';
import * as authController   from '../controllers/auth.controller';
import * as googleController from '../controllers/auth.google.controller';
import * as otpController    from '../controllers/auth.otp.controller';
import { authenticate }      from '../middleware/auth.middleware';

const router: Router = Router();

// Standard email/password
router.post('/register', authController.register);
router.post('/login',    authController.login);
router.post('/refresh',  authController.refresh);
router.post('/logout',   authenticate, authController.logout);
router.get('/me',        authenticate, authController.me);

// Google OAuth 2.0
router.get('/google',          googleController.googleAuth);
router.get('/google/callback', googleController.googleCallback);

// Forgot / Reset password
router.post('/forgot-password', authController.forgotPassword);
router.post('/reset-password',  authController.resetPassword);

// MSG91 OTP / MFA
router.post('/send-otp',   otpController.sendOtp);
router.post('/verify-otp', otpController.verifyOtp);

export default router;
