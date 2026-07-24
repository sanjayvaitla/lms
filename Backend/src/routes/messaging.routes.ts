import { Router } from 'express';
import { sendEmail } from '../controllers/messaging.controller';
import { authenticate, requireRole } from '../middleware/auth.middleware';

const router = Router();

// Only SUPER_ADMIN and TRAINER can send emails
router.post('/send-email', authenticate, requireRole('SUPER_ADMIN', 'TRAINER', 'LD_MANAGER'), sendEmail);

export default router;
