import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, TokenPayload } from '../lib/jwt';
import { AppError } from './error.middleware';

declare global {
  namespace Express {
    interface Request {
      user?: TokenPayload;
    }
  }
}

export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    throw new AppError('No token provided', 401, 'UNAUTHORIZED');
  }
  const token = authHeader.split(' ')[1];
  const payload = verifyAccessToken(token);
  req.user = payload;
  next();
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
