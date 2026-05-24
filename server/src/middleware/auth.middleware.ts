import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, TokenPayload } from '../lib/jwt';
import { AppError } from './error.middleware';

declare global {
  namespace Express {
    interface User extends TokenPayload {}
  }
}

export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return next(new AppError('No token provided', 401, 'UNAUTHORIZED'));
  }
  const token = authHeader.split(' ')[1];
  try {
    const payload = verifyAccessToken(token);
    req.user = payload;
    next();
  } catch (err: unknown) {
    // TokenExpiredError, JsonWebTokenError, etc. — always 401 so client can refresh
    const message =
      err instanceof Error && err.name === 'TokenExpiredError'
        ? 'Token expired'
        : 'Invalid token';
    next(new AppError(message, 401, 'UNAUTHORIZED'));
  }
}

export function requireRole(...roles: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
    if (!roles.includes(req.user.role)) {
      throw new AppError('Forbidden — insufficient role', 403, 'FORBIDDEN');
    }
    next();
  };
}
