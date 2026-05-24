import 'dotenv/config';
import 'reflect-metadata';
import 'express-async-errors';
import express from 'express';
import path from 'path';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { errorHandler } from './middleware/error.middleware';
import apiRoutes from './routes/index';
import { setupGooglePassport } from './services/auth.google.service';
import sequelize from './lib/sequelize';
import './models'; // register all Sequelize models

// Initialise Google OAuth passport strategy (no-op if not configured)
setupGooglePassport();

// Verify Sequelize can reach the DB (non-blocking — server starts regardless)
sequelize.authenticate()
  .then(() => console.log('  [sequelize] Connection established.'))
  .catch((err: Error) => console.warn('  [sequelize] Connection failed (raw pg still active):', err.message));

const app: express.Application = express();
const PORT = parseInt(process.env.PORT ?? '5000', 10);

// ── Security ───────────────────────────────────────────────────────────────────
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

// ── Rate limiting ──────────────────────────────────────────────────────────────
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests, please try again later.' },
});
app.use('/api/', globalLimiter);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  message: { success: false, message: 'Too many auth attempts, please try again later.' },
});
app.use('/api/v1/auth', authLimiter);

const otpLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 5,
  message: { success: false, message: 'Too many OTP requests, please wait before retrying.' },
});
app.use('/api/v1/auth/send-otp', otpLimiter);

// ── General middleware ──────────────────────────────────────────────────────────
app.use(compression());
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ── Health check ────────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({
    status:    'ok',
    timestamp: new Date().toISOString(),
    env:       process.env.NODE_ENV,
    storage:   process.env.AWS_S3_BUCKET ? 's3' : 'local',
    google:    process.env.GOOGLE_CLIENT_ID ? 'configured' : 'disabled',
    msg91:     process.env.MSG91_API_KEY   ? 'configured' : 'disabled',
  });
});

// ── Static uploads (local fallback when S3 not configured) ──────────────────────
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// ── API Routes ──────────────────────────────────────────────────────────────────
app.use('/api/v1', apiRoutes);

// ── 404 ─────────────────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ success: false, message: 'Route not found', code: 'NOT_FOUND' });
});

// ── Error handler ────────────────────────────────────────────────────────────────
app.use(errorHandler);

// ── Start ────────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log('');
  console.log('  LMS Server running on http://localhost:' + PORT);
  console.log('  API:         http://localhost:' + PORT + '/api/v1');
  console.log('  Health:      http://localhost:' + PORT + '/health');
  console.log('');
});

export default app;
