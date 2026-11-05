import type { NextFunction, Request, Response } from 'express';
import path from 'path';
import { asyncHandler, AppError } from '../middlewares/error.middleware';
import documentService from '../services/document.service';

export class DocumentController {
  downloadPdf = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    const document = await documentService.getOwnedByFilename(
      req.params.filename,
      req.authUser!.userId,
    );
    if (!document) throw new AppError('Document not found', 404);
    res.sendFile(path.resolve(document.path), (error) => error && next(error));
  });
}

export default new DocumentController();
