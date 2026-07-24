import { Router } from 'express';
import { GithubWebhookController } from '../controllers/github.webhook.controller';

const router = Router();

// Endpoint for GitHub to send POST requests to
router.post('/', GithubWebhookController.handleWebhook);

export default router;
