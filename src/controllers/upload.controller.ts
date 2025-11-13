import { Request, Response, NextFunction } from 'express';
import { asyncHandler } from '../middlewares/error.middleware';
import documentService from '../services/document.service';
import parserService from '../services/parser.service';
import { SUCCESS_MESSAGES } from '../utils/constants';
import logger from '../utils/logger';
import codeModel from '../models/code.model';

export class UploadController {
  uploadDocuments = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    const files = req.files as { [fieldname: string]: Express.Multer.File[] };
    const { code } = req.body;

    if (!code) {
      throw new Error('Code Required!');
    }

    const codeData = await codeModel.findOne({ code: code }).lean().select('_id');
    const codeId = codeData?._id;

    if (!files?.cv) {
      return res.status(400).json({
        success: false,
        message: 'CV files are required',
      });
    }

    const cvFile = files.cv[0];

    // Parse files
    const cvContent = await parserService.parseFile(cvFile.path, cvFile.mimetype);

    // Save to database
    const cvDocument = await documentService.saveDocument(cvFile, 'cv', codeId, cvContent);

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
