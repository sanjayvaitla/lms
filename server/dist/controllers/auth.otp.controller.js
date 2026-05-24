"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendOtp = sendOtp;
exports.verifyOtp = verifyOtp;
const otpService = __importStar(require("../services/auth.otp.service"));
const error_middleware_1 = require("../middleware/error.middleware");
const zod_1 = require("zod");
const sendOtpSchema = zod_1.z.object({
    phone: zod_1.z.string().min(8).max(16),
});
const verifyOtpSchema = zod_1.z.object({
    phone: zod_1.z.string().min(8).max(16),
    otp: zod_1.z.string().length(6, 'OTP must be 6 digits'),
    name: zod_1.z.string().min(2).max(100).optional(),
    email: zod_1.z.string().email().optional(),
});
// POST /api/auth/send-otp
async function sendOtp(req, res) {
    const parsed = sendOtpSchema.safeParse(req.body);
    if (!parsed.success) {
        throw new error_middleware_1.AppError(parsed.error.errors[0].message, 400, 'VALIDATION_ERROR');
    }
    const result = await otpService.sendOtp(parsed.data.phone);
    res.json({ success: true, data: result });
}
// POST /api/auth/verify-otp
async function verifyOtp(req, res) {
    const parsed = verifyOtpSchema.safeParse(req.body);
    if (!parsed.success) {
        throw new error_middleware_1.AppError(parsed.error.errors[0].message, 400, 'VALIDATION_ERROR');
    }
    const result = await otpService.verifyOtp(parsed.data.phone, parsed.data.otp, { name: parsed.data.name, email: parsed.data.email });
    res.json({ success: true, data: result });
}
//# sourceMappingURL=auth.otp.controller.js.map