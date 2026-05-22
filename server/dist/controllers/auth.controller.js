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
exports.register = register;
exports.login = login;
exports.refresh = refresh;
exports.logout = logout;
exports.me = me;
const authService = __importStar(require("../services/auth.service"));
const auth_validator_1 = require("../validators/auth.validator");
const error_middleware_1 = require("../middleware/error.middleware");
async function register(req, res) {
    const parsed = auth_validator_1.registerSchema.safeParse(req.body);
    if (!parsed.success) {
        throw new error_middleware_1.AppError(parsed.error.errors[0].message, 400, 'VALIDATION_ERROR');
    }
    const result = await authService.register(parsed.data);
    res.status(201).json({ success: true, data: result });
}
async function login(req, res) {
    const parsed = auth_validator_1.loginSchema.safeParse(req.body);
    if (!parsed.success) {
        throw new error_middleware_1.AppError(parsed.error.errors[0].message, 400, 'VALIDATION_ERROR');
    }
    const result = await authService.login(parsed.data);
    res.json({ success: true, data: result });
}
async function refresh(req, res) {
    const parsed = auth_validator_1.refreshSchema.safeParse(req.body);
    if (!parsed.success) {
        throw new error_middleware_1.AppError(parsed.error.errors[0].message, 400, 'VALIDATION_ERROR');
    }
    const result = await authService.refresh(parsed.data.refreshToken);
    res.json({ success: true, data: result });
}
async function logout(req, res) {
    if (!req.user)
        throw new error_middleware_1.AppError('Unauthorized', 401, 'UNAUTHORIZED');
    await authService.logout(req.user.userId);
    res.json({ success: true, message: 'Logged out successfully' });
}
async function me(req, res) {
    if (!req.user)
        throw new error_middleware_1.AppError('Unauthorized', 401, 'UNAUTHORIZED');
    const user = await authService.getMe(req.user.userId);
    res.json({ success: true, data: user });
}
//# sourceMappingURL=auth.controller.js.map