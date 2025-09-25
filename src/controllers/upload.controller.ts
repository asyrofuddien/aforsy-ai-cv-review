import { Request, Response, NextFunction } from 'express';
import { asyncHandler } from '../middlewares/error.middleware';
import documentService from '../services/document.service';
import parserService from '../services/parser.service';
import { SUCCESS_MESSAGES } from '../utils/constants';
import logger from '../utils/logger';

export class UploadController {
  uploadDocuments = asyncHandler(
    async (req: Request, res: Response, next: NextFunction) => {
      const files = req.files as { [fieldname: string]: Express.Multer.File[] };

      if (!files?.cv || !files?.project) {
        console.log('masuk');
        return res.status(400).json({
          success: false,
          message: 'Both CV and project files are required',
        });
      }

      const cvFile = files.cv[0];
      const projectFile = files.project[0];

      // Parse files
      const cvContent = await parserService.parseFile(
        cvFile.path,
        cvFile.mimetype
      );
      const projectContent = await parserService.parseFile(
        projectFile.path,
        projectFile.mimetype
      );

      // Save to database
      const cvDocument = await documentService.saveDocument(
        cvFile,
        'cv',
        cvContent
      );
      const projectDocument = await documentService.saveDocument(
        projectFile,
        'project',
        projectContent
      );

      logger.info(
        `Documents uploaded - CV: ${cvDocument.id}, Project: ${projectDocument.id}`
      );

      res.status(200).json({
        success: true,
        message: SUCCESS_MESSAGES.FILE_UPLOADED,
        data: {
          cvDocumentId: cvDocument.id,
          projectDocumentId: projectDocument.id,
        },
      });
    }
  );
}

export default new UploadController();
