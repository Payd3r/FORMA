import type { NextFunction, Request, Response } from 'express';
// Personal, single-user installation: preserve existing data without an account flow.
export function authMiddleware(req: Request, _res: Response, next: NextFunction) {
  (req as Request & { userId?: string }).userId = 'local-user'; next();
}
