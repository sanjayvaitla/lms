import { Request, Response, NextFunction } from 'express';
import { TokenPayload } from '../lib/jwt';
declare global {
    namespace Express {
        interface User extends TokenPayload {
        }
    }
}
export declare function authenticate(req: Request, _res: Response, next: NextFunction): void;
export declare function requireRole(...roles: string[]): (req: Request, _res: Response, next: NextFunction) => void;
//# sourceMappingURL=auth.middleware.d.ts.map