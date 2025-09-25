import fs from 'fs/promises';
import pdf from 'pdf-parse';
import mammoth from 'mammoth';
import { AppError } from '../middlewares/error.middleware';
import logger from '../utils/logger';

export class ParserService {
  async parseFile(filePath: string, mimeType: string): Promise<string> {
    try {
      switch (mimeType) {
        case 'application/pdf':
          return await this.parsePDF(filePath);
        case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
          return await this.parseDOCX(filePath);
        case 'text/plain':
          return await this.parseTXT(filePath);
        default:
          throw new AppError('Unsupported file type', 400);
      }
    } catch (error) {
      logger.error('Error parsing file:', error);
      throw new AppError('Failed to parse file', 500);
    }
  }

  private async parsePDF(filePath: string): Promise<string> {
    const dataBuffer = await fs.readFile(filePath);
    const data = await pdf(dataBuffer);
    return data.text;
  }

  private async parseDOCX(filePath: string): Promise<string> {
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value;
  }

  private async parseTXT(filePath: string): Promise<string> {
    return await fs.readFile(filePath, 'utf-8');
  }
}

export default new ParserService();
