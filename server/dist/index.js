"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
require("express-async-errors");
const express_1 = __importDefault(require("express"));
const path_1 = __importDefault(require("path"));
const uploads_1 = require("./lib/uploads");
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const compression_1 = __importDefault(require("compression"));
const morgan_1 = __importDefault(require("morgan"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const error_middleware_1 = require("./middleware/error.middleware");
const index_1 = __importDefault(require("./routes/index"));
const sequelize_1 = require("./lib/sequelize");
const app = (0, express_1.default)();
const PORT = parseInt(process.env.PORT ?? '5000', 10);
// ─── Security Middleware ───────────────────────────────────
app.use((0, helmet_1.default)());
app.use((0, cors_1.default)({
    origin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
}));
// ─── Rate Limiting ─────────────────────────────────────────
const limiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many requests, please try again later.' },
});
app.use('/api/', limiter);
const authLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: { success: false, message: 'Too many auth attempts, please try again later.' },
});
app.use('/api/v1/auth', authLimiter);
// ─── General Middleware ────────────────────────────────────
app.use((0, compression_1.default)());
app.use((0, morgan_1.default)(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(express_1.default.json({ limit: '10mb' }));
app.use(express_1.default.urlencoded({ extended: true }));
app.use((0, cookie_parser_1.default)());
// ─── Health Check ──────────────────────────────────────────
app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString(), env: process.env.NODE_ENV });
});
// ─── Uploaded files (PDF assignments, datasets) ────────────
(0, uploads_1.ensureUploadDirs)();
app.use('/uploads', express_1.default.static(path_1.default.join(__dirname, '../uploads')));
// ─── API Routes ────────────────────────────────────────────
app.use('/api/v1', index_1.default);
// ─── 404 Handler ───────────────────────────────────────────
app.use((_req, res) => {
    res.status(404).json({ success: false, message: 'Route not found', code: 'NOT_FOUND' });
});
// ─── Error Handler ─────────────────────────────────────────
app.use(error_middleware_1.errorHandler);
// ─── Start Server ──────────────────────────────────────────
async function startServer() {
    try {
        await sequelize_1.sequelize.authenticate();
        console.log('\u2705 Database connection established via Sequelize');
        app.listen(PORT, () => {
            console.log(`\n\u{1F680} LMS Server running on http://localhost:${PORT}`);
            console.log(`\u{1F4CA} API available at http://localhost:${PORT}/api/v1`);
            console.log(`\u{1F3E5} Health check: http://localhost:${PORT}/health\n`);
        });
    }
    catch (err) {
        console.error('\u274C Failed to connect to database:', err);
        process.exit(1);
    }
}
startServer();
exports.default = app;
//# sourceMappingURL=index.js.map