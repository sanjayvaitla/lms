import { Request, Response } from 'express';
export declare function list(req: Request, res: Response): Promise<void>;
export declare function getById(req: Request, res: Response): Promise<void>;
export declare function create(req: Request, res: Response): Promise<void>;
export declare function update(req: Request, res: Response): Promise<void>;
export declare function unarchive(req: Request, res: Response): Promise<void>;
export declare function remove(req: Request, res: Response): Promise<Response<any, Record<string, any>> | undefined>;
//# sourceMappingURL=courses.controller.d.ts.map