import { UserRole } from '../models/user.model';

declare global {
  namespace Express {
    interface Request {
      authUser?: { userId: string; email: string; displayName: string; role: UserRole };
      authSession?: { id: string; csrfHash: string; expiresAt: Date; createdAt: Date };
    }
  }
}

export {};
