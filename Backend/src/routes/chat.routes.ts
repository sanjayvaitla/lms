import { Router } from 'express';
import { handleStudentChat } from '../controllers/chat.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

router.post('/', authenticate, handleStudentChat);

export default router;
