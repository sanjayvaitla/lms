"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.register = register;
exports.login = login;
exports.refresh = refresh;
exports.logout = logout;
exports.getMe = getMe;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const db_1 = __importDefault(require("../lib/db"));
const jwt_1 = require("../lib/jwt");
const error_middleware_1 = require("../middleware/error.middleware");
const SALT_ROUNDS = 12;
function sanitize(u) {
    return {
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        avatarUrl: u.avatar_url,
        createdAt: u.created_at,
    };
}
async function register(input) {
    const existing = await db_1.default.query('SELECT id FROM users WHERE email = $1', [input.email]);
    if (existing.rowCount && existing.rowCount > 0) {
        throw new error_middleware_1.AppError('Email already registered', 409, 'DUPLICATE');
    }
    const passwordHash = await bcryptjs_1.default.hash(input.password, SALT_ROUNDS);
    const { rows } = await db_1.default.query(`INSERT INTO users (name, email, password_hash, role)
     VALUES ($1, $2, $3, $4)
     RETURNING *`, [input.name, input.email, passwordHash, input.role ?? 'STUDENT']);
    const user = rows[0];
    const payload = { userId: user.id, role: user.role };
    const accessToken = (0, jwt_1.signAccessToken)(payload);
    const refreshToken = (0, jwt_1.signRefreshToken)(payload);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);
    await db_1.default.query(`INSERT INTO refresh_tokens (user_id, token, expires_at)
     VALUES ($1, $2, $3)`, [user.id, refreshToken, expiresAt]);
    return { user: sanitize(user), accessToken, refreshToken };
}
async function login(input) {
    const { rows } = await db_1.default.query('SELECT * FROM users WHERE email = $1', [input.email]);
    const user = rows[0];
    if (!user)
        throw new error_middleware_1.AppError('Invalid email or password', 401, 'INVALID_CREDENTIALS');
    const valid = await bcryptjs_1.default.compare(input.password, user.password_hash);
    if (!valid)
        throw new error_middleware_1.AppError('Invalid email or password', 401, 'INVALID_CREDENTIALS');
    const payload = { userId: user.id, role: user.role };
    const accessToken = (0, jwt_1.signAccessToken)(payload);
    const refreshToken = (0, jwt_1.signRefreshToken)(payload);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);
    // Rotate: delete old tokens, insert new
    await db_1.default.query('DELETE FROM refresh_tokens WHERE user_id = $1', [user.id]);
    await db_1.default.query(`INSERT INTO refresh_tokens (user_id, token, expires_at)
     VALUES ($1, $2, $3)`, [user.id, refreshToken, expiresAt]);
    return { user: sanitize(user), accessToken, refreshToken };
}
async function refresh(token) {
    const payload = (0, jwt_1.verifyRefreshToken)(token);
    const { rows } = await db_1.default.query('SELECT * FROM refresh_tokens WHERE token = $1', [token]);
    const stored = rows[0];
    if (!stored || new Date(stored.expires_at) < new Date()) {
        throw new error_middleware_1.AppError('Refresh token invalid or expired', 401, 'UNAUTHORIZED');
    }
    const accessToken = (0, jwt_1.signAccessToken)({ userId: payload.userId, role: payload.role });
    return { accessToken };
}
async function logout(userId) {
    await db_1.default.query('DELETE FROM refresh_tokens WHERE user_id = $1', [userId]);
}
async function getMe(userId) {
    const { rows } = await db_1.default.query('SELECT * FROM users WHERE id = $1', [userId]);
    const user = rows[0];
    if (!user)
        throw new error_middleware_1.AppError('User not found', 404, 'NOT_FOUND');
    return sanitize(user);
}
//# sourceMappingURL=auth.service.js.map