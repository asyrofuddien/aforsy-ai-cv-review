import Document, { IDocument } from '../models/document.model';
import { DOCUMENT_TYPES } from '../utils/constants';
import { AppError } from '../middlewares/error.middleware';
import logger from '../utils/logger';
import path from 'path';

export class DocumentService {
  async saveDocument(fileData: Express.Multer.File, type: 'cv' | 'project', codeId: string, content?: string): Promise<IDocument> {
    try {
      // Ensure we save absolute path for reliable access later
      const absolutePath = path.isAbsolute(fileData.path) 
        ? fileData.path 
        : path.resolve(process.cwd(), fileData.path);

      const document = new Document({
        filename: fileData.filename,
        originalName: fileData.originalname,
        mimeType: fileData.mimetype,
        path: absolutePath,
        size: fileData.size,
        code_id: codeId,
        type,
        content,
      });

      await document.save();
      logger.info(`Document saved: ${document.filename} at ${absolutePath}`);
      return document;
    } catch (error) {
      logger.error('Error saving document:', error);
      throw new AppError('Failed to save document', 500);
    }
  }

  async getDocument(id: string): Promise<IDocument | null> {
    return await Document.findById(id);
  }

  async deleteDocument(id: string): Promise<void> {
    await Document.findByIdAndDelete(id);
  }
}

export default new DocumentService();
