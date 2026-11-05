import fs from 'fs/promises';
import { AppError } from '../../../middlewares/error.middleware';
import appLogger from '../../../utils/logger';
import { parsePdf } from './pdf.parser';
import { parseDocx } from './docx.parser';
import { parseTxt } from './txt.parser';

const logger = appLogger.child({ scope: 'parser' });

export class ParserService {
  async parseFile(filePath: string, mimeType: string): Promise<string> {
    try {
      try {
        await fs.access(filePath);
      } catch {
        logger.error(`File not found at path: ${filePath}`);
        throw new AppError(`File not found: ${filePath}`, 404);
      }

      switch (mimeType) {
        case 'application/pdf':
          return await parsePdf(filePath);
        case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
          return await parseDocx(filePath);
        case 'text/plain':
          return await parseTxt(filePath);
        default:
          throw new AppError('Unsupported file type', 400);
      }
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error('Error parsing file:', error);
      throw new AppError('Failed to parse file', 500);
    }
  }
}

export default new ParserService();
