import { Request, Response } from 'express';
import { asyncHandler } from '../middlewares/error.middleware';
import { uploadCv } from '../features/documents/document-upload.workflow';
import { SUCCESS_MESSAGES } from '../utils/constants';
import appLogger from '../utils/logger';

const logger = appLogger.child({ scope: 'upload' });

export class UploadController {
  uploadDocuments = asyncHandler(async (req: Request, res: Response) => {
    const files = req.files as { [fieldname: string]: Express.Multer.File[] };
    if (!files?.cv) {
      return res.status(400).json({
        success: false,
        message: 'CV files are required',
      });
    }

    const cvFile = files.cv[0];

    // Parse files
    const cvDocument = await uploadCv(cvFile, req.authUser!.userId);

    logger.info(`Documents uploaded - CV: ${cvDocument.id}`);

    res.status(200).json({
      success: true,
      message: SUCCESS_MESSAGES.FILE_UPLOADED,
      data: {
        cvDocumentId: cvDocument.id,
      },
    });
  });
}

export default new UploadController();
