import 'dotenv/config';
import 'reflect-metadata';
import 'express-async-errors';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { errorHandler } from './middleware/error.middleware';
import { authenticate, requireRole } from './middleware/auth.middleware';
import apiRoutes from './routes/index';
import { setupGooglePassport } from './services/auth.google.service';
import { checkS3 } from './lib/storage';
import sequelize from './lib/sequelize';
import './models'; // register all Sequelize models
import { startScheduler } from './services/scheduler.service';
import { startCronJobs } from './jobs/cron';
import { startInternCommitPoller } from './services/intern-commit-poller.service';
import { startAssignmentCommitPoller } from './services/assignment-commit-poller.service';

// Initialise Google OAuth passport strategy (no-op if not configured)
setupGooglePassport();

import db from './lib/db';
import { runMigrations } from './db/migrations';

// Verify Sequelize can reach the DB (non-blocking)
sequelize.authenticate().catch((err: Error) =>
  console.warn('  [sequelize] Connection failed (raw pg still active):', err.message),
);

// Start scheduled background jobs
startCronJobs();

const app: express.Application = express();
const PORT = parseInt(process.env.PORT ?? '6000', 10);

// Prevent 304 Not Modified on JSON API — stale uploads/refs in Content Master
app.set('etag', false);

// Validate critical env vars at startup
const requiredEnv = ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'DATABASE_URL'];
if (process.env.NODE_ENV === 'production') {
  requiredEnv.push('AWS_S3_BUCKET', 'AWS_REGION', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY');
}
const missingEnv = requiredEnv.filter((k) => !process.env[k]);
if (missingEnv.length > 0) {
  console.error(`[startup] Missing required env vars: ${missingEnv.join(', ')}`);
  if (process.env.NODE_ENV === 'production') process.exit(1);
}

if (process.env.NODE_ENV === 'production') {
  if (process.env.WHATSAPP_ACCESS_TOKEN && !process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
    console.error('[startup] WHATSAPP_WEBHOOK_VERIFY_TOKEN is required when WhatsApp is enabled');
    process.exit(1);
  }
}

const smtpConfigured = !!(
  process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS
) || !!process.env.SENDGRID_API_KEY || !!process.env.AWS_SES_REGION;

if (!smtpConfigured) {
  console.warn(
    '[startup] SMTP is NOT configured (SMTP_HOST/USER/PASS empty). Welcome, password-reset, and notification emails will NOT reach students — only console fallback.',
  );
  if (process.env.NODE_ENV === 'production' && process.env.REQUIRE_SMTP === 'true') {
    console.error('[startup] REQUIRE_SMTP=true but SMTP is missing — refusing to start');
    process.exit(1);
  }
}

// Security
app.use(helmet({
  crossOriginResourcePolicy: false,
  xFrameOptions: false,
  contentSecurityPolicy: false,
}));
app.use(cors({
  origin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Rate limiting
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests, please try again later.' },
});
app.use('/api/', globalLimiter);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  // Offices/NATs share one IP across many learners — keep room for cohort logins
  max: 200,
  message: { success: false, message: 'Too many auth attempts, please try again later.' },
});
app.use('/api/v1/auth', authLimiter);

const authStrictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { success: false, message: 'Too many password reset attempts. Please wait and try again.' },
});
app.use('/api/v1/auth/forgot-password', authStrictLimiter);
app.use('/api/v1/auth/register', authStrictLimiter);

const otpLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 5,
  message: { success: false, message: 'Too many OTP requests, please wait before retrying.' },
});
app.use('/api/v1/auth/send-otp', otpLimiter);

// General middleware
app.use(compression());
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(express.json({
  limit: '10mb',
  // Stash the raw request bytes for routes that need HMAC verification
  // (e.g. the intern GitHub webhook). express.json runs before route-level
  // middleware, so a route-level raw() parser arrives too late — we capture
  // the buffer here instead.
  verify: (req, _res, buf) => {
    const url = req.url ?? '';
    if (url.includes('/intern/github/webhook') || url.includes('/webhooks/github') || url.includes('/webhook/whatsapp')) {
      (req as any).rawBody = buf;
    }
  },
}));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Health check
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

app.get('/health/details', authenticate, requireRole('SUPER_ADMIN'), (_req, res) => {
  const smtpOk = !!(
    (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) ||
    process.env.SENDGRID_API_KEY ||
    process.env.AWS_SES_REGION
  );
  const s3Ok = !!(
    process.env.AWS_S3_BUCKET &&
    process.env.AWS_REGION &&
    process.env.AWS_ACCESS_KEY_ID &&
    process.env.AWS_SECRET_ACCESS_KEY
  );
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV,
    storage: s3Ok ? 's3' : 'unavailable',
    google: process.env.GOOGLE_CLIENT_ID ? 'configured' : 'disabled',
    msg91: process.env.MSG91_API_KEY ? 'configured' : 'disabled',
    smtp: smtpOk ? 'configured' : 'missing',
  });
});

// Storage health endpoint — SUPER_ADMIN only
app.get('/storage-health', authenticate, requireRole('SUPER_ADMIN'), async (_req, res) => {
  const { storageAdapter, S3_CONFIGURED } = await import('./lib/storage');
  if (!S3_CONFIGURED || storageAdapter.mode !== 's3') {
    res.status(503).json({
      mode: storageAdapter.mode,
      ok: false,
      message: 'S3 is required. Set AWS_S3_BUCKET / AWS_REGION / AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY.',
    });
    return;
  }
  try {
    const { S3Client, HeadBucketCommand } = require('@aws-sdk/client-s3') as any;
    const client = new S3Client({
      region: process.env.AWS_REGION,
      forcePathStyle: process.env.AWS_S3_PATH_STYLE === 'true',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    });
    await client.send(new HeadBucketCommand({ Bucket: process.env.AWS_S3_BUCKET }));
    res.json({ mode: 's3', ok: true, bucket: process.env.AWS_S3_BUCKET, region: process.env.AWS_REGION });
  } catch (err: any) {
    res.status(503).json({
      mode: 's3', ok: false,
      bucket: process.env.AWS_S3_BUCKET,
      region: process.env.AWS_REGION,
      error: err?.message ?? String(err),
    });
  }
});

// Files are served from private S3 via short-lived presigned URLs — never from local disk.

// API docs
app.get('/api/v1/docs', (_req, res) => {
  res.json({
    title: 'LMS API Documentation',
    version: '1.0.0',
    baseUrl: '/api/v1',
  });
});

// WhatsApp webhook — must be before API routes, no auth middleware
import whatsappWebhookRoutes from './routes/whatsapp.webhook.routes';
app.use('/webhook/whatsapp', whatsappWebhookRoutes);

// API Routes
app.use('/api/v1', apiRoutes);

// 404
app.use((_req, res) => {
  res.status(404).json({ success: false, message: 'Route not found', code: 'NOT_FOUND' });
});

// Error handler
app.use(errorHandler);

// Start scheduled jobs
startScheduler();

// Start polling services
startInternCommitPoller();
startAssignmentCommitPoller();

async function startServer() {
  // S3 must be healthy before accepting traffic in production
  await checkS3();

  try {
    await runMigrations();
  } catch (err) {
    console.warn('  [DB] Startup migrations warning:', (err as Error).message);
  }

  app.listen(PORT, () => {
    console.log('');
    console.log('  LMS Server running on http://localhost:' + PORT);
    console.log('  API:         http://localhost:' + PORT + '/api/v1');
    console.log('  Health:      http://localhost:' + PORT + '/health');
    console.log('  S3 Health:   http://localhost:' + PORT + '/storage-health');
    console.log('');
  });
}

startServer();

export default app;
