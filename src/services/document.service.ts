import Document, { IDocument } from '../models/document.model';
import { AppError } from '../middlewares/error.middleware';
import appLogger from '../utils/logger';
import path from 'path';

const logger = appLogger.child({ scope: 'documents' });

export class DocumentService {
  async saveDocument(fileData: Express.Multer.File, type: 'cv' | 'project', userId: string, content?: string): Promise<IDocument> {
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
        userId,
        type,
        content,
      });

      await document.save();
      logger.info('Document saved', { documentId: document.id });
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
