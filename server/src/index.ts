import 'dotenv/config';
import 'express-async-errors';
import express from 'express';
import path from 'path';
import { ensureUploadDirs } from './lib/uploads';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { errorHandler } from './middleware/error.middleware';
import apiRoutes from './routes/index';
import { sequelize } from './lib/sequelize';

const app: express.Application = express();
const PORT = parseInt(process.env.PORT ?? '5000', 10);

// ─── Security Middleware ───────────────────────────────────
app.use(helmet());
app.use(
  cors({
    origin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }),
);

// ─── Rate Limiting ─────────────────────────────────────────
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests, please try again later.' },
});
app.use('/api/', limiter);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { success: false, message: 'Too many auth attempts, please try again later.' },
});
app.use('/api/v1/auth', authLimiter);

// ─── General Middleware ────────────────────────────────────
app.use(compression());
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ─── Health Check ──────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), env: process.env.NODE_ENV });
});

// ─── Uploaded files (PDF assignments, datasets) ────────────
ensureUploadDirs();
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// ─── API Routes ────────────────────────────────────────────
app.use('/api/v1', apiRoutes);

// ─── 404 Handler ───────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ success: false, message: 'Route not found', code: 'NOT_FOUND' });
});

// ─── Error Handler ─────────────────────────────────────────
app.use(errorHandler);

// ─── Start Server ──────────────────────────────────────────
async function startServer() {
  try {
    await sequelize.authenticate();
    console.log('\u2705 Database connection established via Sequelize');

    app.listen(PORT, () => {
      console.log(`\n\u{1F680} LMS Server running on http://localhost:${PORT}`);
      console.log(`\u{1F4CA} API available at http://localhost:${PORT}/api/v1`);
      console.log(`\u{1F3E5} Health check: http://localhost:${PORT}/health\n`);
    });
  } catch (err) {
    console.error('\u274C Failed to connect to database:', err);
    process.exit(1);
  }
}

startServer();

export default app;
