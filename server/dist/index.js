"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
require("reflect-metadata");
require("express-async-errors");
const express_1 = __importDefault(require("express"));
const path_1 = __importDefault(require("path"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const compression_1 = __importDefault(require("compression"));
const morgan_1 = __importDefault(require("morgan"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const error_middleware_1 = require("./middleware/error.middleware");
const index_1 = __importDefault(require("./routes/index"));
const auth_google_service_1 = require("./services/auth.google.service");
const sequelize_1 = __importDefault(require("./lib/sequelize"));
require("./models"); // register all Sequelize models
// Initialise Google OAuth passport strategy (no-op if not configured)
(0, auth_google_service_1.setupGooglePassport)();
// Verify Sequelize can reach the DB (non-blocking — server starts regardless)
sequelize_1.default.authenticate()
    .then(() => console.log('  [sequelize] Connection established.'))
    .catch((err) => console.warn('  [sequelize] Connection failed (raw pg still active):', err.message));
const app = (0, express_1.default)();
const PORT = parseInt(process.env.PORT ?? '5000', 10);
// ── Security ───────────────────────────────────────────────────────────────────
app.use((0, helmet_1.default)({
    crossOriginResourcePolicy: false,
    xFrameOptions: false,
    contentSecurityPolicy: false,
}));
app.use((0, cors_1.default)({
    origin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
}));
// ── Rate limiting ──────────────────────────────────────────────────────────────
const globalLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: 20000,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many requests, please try again later.' },
});
app.use('/api/', globalLimiter);
const authLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: 50,
    message: { success: false, message: 'Too many auth attempts, please try again later.' },
});
app.use('/api/v1/auth', authLimiter);
const otpLimiter = (0, express_rate_limit_1.default)({
    windowMs: 5 * 60 * 1000,
    max: 5,
    message: { success: false, message: 'Too many OTP requests, please wait before retrying.' },
});
app.use('/api/v1/auth/send-otp', otpLimiter);
// ── General middleware ──────────────────────────────────────────────────────────
app.use((0, compression_1.default)());
app.use((0, morgan_1.default)(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(express_1.default.json({ limit: '10mb' }));
app.use(express_1.default.urlencoded({ extended: true }));
app.use((0, cookie_parser_1.default)());
// ── Health check ────────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        env: process.env.NODE_ENV,
        storage: process.env.AWS_S3_BUCKET ? 's3' : 'local',
        google: process.env.GOOGLE_CLIENT_ID ? 'configured' : 'disabled',
        msg91: process.env.MSG91_API_KEY ? 'configured' : 'disabled',
    });
});
// ── Static uploads (local fallback when S3 not configured) ──────────────────────
app.use('/uploads', express_1.default.static(path_1.default.join(__dirname, '../uploads')));
// ── API Routes ──────────────────────────────────────────────────────────────────
app.use('/api/v1', index_1.default);
// ── 404 ─────────────────────────────────────────────────────────────────────────
app.use((_req, res) => {
    res.status(404).json({ success: false, message: 'Route not found', code: 'NOT_FOUND' });
});
// ── Error handler ────────────────────────────────────────────────────────────────
app.use(error_middleware_1.errorHandler);
// ── Start ────────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
    console.log('');
    console.log('  LMS Server running on http://localhost:' + PORT);
    console.log('  API:         http://localhost:' + PORT + '/api/v1');
    console.log('  Health:      http://localhost:' + PORT + '/health');
    console.log('');
});
exports.default = app;
//# sourceMappingURL=index.js.map