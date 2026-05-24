"use strict";
/**
 * auth.otp.service.ts — MSG91 OTP / MFA
 *
 * Required env vars:
 *   MSG91_API_KEY, MSG91_SENDER_ID, MSG91_TEMPLATE_ID
 *   OTP_EXPIRY_MINUTES  (default: 10)
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MSG91_CONFIGURED = void 0;
exports.sendOtp = sendOtp;
exports.verifyOtp = verifyOtp;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const db_1 = __importDefault(require("../lib/db"));
const jwt_1 = require("../lib/jwt");
const error_middleware_1 = require("../middleware/error.middleware");
exports.MSG91_CONFIGURED = !!(process.env.MSG91_API_KEY);
const OTP_EXPIRY_MIN = parseInt(process.env.OTP_EXPIRY_MINUTES ?? '10', 10);
function generateOtp() {
    return String(Math.floor(100000 + Math.random() * 900000));
}
async function sendViaMSG91(phone, otp) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-explicit-any
    const axios = require('axios');
    try {
        await axios.post('https://api.msg91.com/api/v5/otp', {
            template_id: process.env.MSG91_TEMPLATE_ID,
            mobile: phone.replace(/^\+/, ''),
            authkey: process.env.MSG91_API_KEY,
            otp,
            sender: process.env.MSG91_SENDER_ID ?? 'VTRLMS',
        }, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 8000,
        });
    }
    catch (err) {
        const msg = err.message ?? 'MSG91 request failed';
        throw new error_middleware_1.AppError(`OTP send failed: ${msg}`, 502, 'OTP_SEND_FAILED');
    }
}
async function sendOtp(phone) {
    if (!exports.MSG91_CONFIGURED)
        throw new error_middleware_1.AppError('MSG91 not configured', 501, 'NOT_CONFIGURED');
    if (!/^\+?[1-9]\d{7,14}$/.test(phone))
        throw new error_middleware_1.AppError('Invalid phone format', 400, 'VALIDATION_ERROR');
    const otp = generateOtp();
    const hash = await bcryptjs_1.default.hash(otp, 10);
    const expires = new Date(Date.now() + OTP_EXPIRY_MIN * 60 * 1000);
    await db_1.default.query('DELETE FROM otp_verifications WHERE phone = $1 AND verified = FALSE', [phone]);
    await db_1.default.query('INSERT INTO otp_verifications (phone, otp_hash, expires_at) VALUES ($1, $2, $3)', [phone, hash, expires]);
    await sendViaMSG91(phone, otp);
    const result = {
        message: `OTP sent to ${phone}. Valid for ${OTP_EXPIRY_MIN} minutes.`,
    };
    if (process.env.NODE_ENV === 'development')
        result.dev_otp = otp;
    return result;
}
async function verifyOtp(phone, otp, userData) {
    if (!exports.MSG91_CONFIGURED)
        throw new error_middleware_1.AppError('MSG91 not configured', 501, 'NOT_CONFIGURED');
    const { rows } = await db_1.default.query(`SELECT id, otp_hash, expires_at
     FROM otp_verifications
     WHERE phone = $1 AND verified = FALSE
     ORDER BY created_at DESC LIMIT 1`, [phone]);
    if (!rows.length)
        throw new error_middleware_1.AppError('No OTP found — request a new one', 400, 'OTP_NOT_FOUND');
    const record = rows[0];
    if (new Date(record.expires_at) < new Date())
        throw new error_middleware_1.AppError('OTP expired', 400, 'OTP_EXPIRED');
    const valid = await bcryptjs_1.default.compare(otp, record.otp_hash);
    if (!valid)
        throw new error_middleware_1.AppError('Invalid OTP', 401, 'INVALID_OTP');
    await db_1.default.query('UPDATE otp_verifications SET verified = TRUE WHERE id = $1', [record.id]);
    const existingUser = await db_1.default.query('SELECT id, name, email, role, avatar_url FROM users WHERE phone_number = $1', [phone]);
    let userId;
    let role;
    let userRow;
    if (existingUser.rows.length) {
        userRow = existingUser.rows[0];
        userId = userRow.id;
        role = userRow.role;
        await db_1.default.query('UPDATE users SET is_phone_verified = TRUE, auth_provider = \'PHONE\', updated_at = NOW() WHERE id = $1', [userId]);
    }
    else {
        const name = userData?.name ?? `User_${phone.slice(-4)}`;
        const email = userData?.email ?? null;
        const { rows: newRows } = await db_1.default.query(`INSERT INTO users (name, email, phone_number, is_phone_verified, auth_provider, role, password_hash)
       VALUES ($1, $2, $3, TRUE, 'PHONE', 'STUDENT', NULL)
       RETURNING id, name, email, role, avatar_url`, [name, email, phone]);
        userRow = newRows[0];
        userId = userRow.id;
        role = userRow.role;
    }
    const payload = { userId, role };
    const accessToken = (0, jwt_1.signAccessToken)(payload);
    const refreshToken = (0, jwt_1.signRefreshToken)(payload);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);
    await db_1.default.query('DELETE FROM refresh_tokens WHERE user_id = $1', [userId]);
    await db_1.default.query('INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)', [userId, refreshToken, expiresAt]);
    return {
        user: { id: userId, name: userRow.name, email: userRow.email, role, phoneNumber: phone },
        accessToken,
        refreshToken,
    };
}
//# sourceMappingURL=auth.otp.service.js.map