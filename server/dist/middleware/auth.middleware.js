"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticate = authenticate;
exports.requireRole = requireRole;
const jwt_1 = require("../lib/jwt");
const error_middleware_1 = require("./error.middleware");
function authenticate(req, _res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
        return next(new error_middleware_1.AppError('No token provided', 401, 'UNAUTHORIZED'));
    }
    const token = authHeader.split(' ')[1];
    try {
        const payload = (0, jwt_1.verifyAccessToken)(token);
        req.user = payload;
        next();
    }
    catch (err) {
        // TokenExpiredError, JsonWebTokenError, etc. — always 401 so client can refresh
        const message = err instanceof Error && err.name === 'TokenExpiredError'
            ? 'Token expired'
            : 'Invalid token';
        next(new error_middleware_1.AppError(message, 401, 'UNAUTHORIZED'));
    }
}
function requireRole(...roles) {
    return (req, _res, next) => {
        if (!req.user)
            throw new error_middleware_1.AppError('Unauthorized', 401, 'UNAUTHORIZED');
        if (!roles.includes(req.user.role)) {
            throw new error_middleware_1.AppError('Forbidden — insufficient role', 403, 'FORBIDDEN');
        }
        next();
    };
}
//# sourceMappingURL=auth.middleware.js.map