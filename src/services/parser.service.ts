import fs from 'fs/promises';
import pdf from 'pdf-parse';
import mammoth from 'mammoth';
import { AppError } from '../middlewares/error.middleware';
import logger from '../utils/logger';
import path from 'path';

export class ParserService {
  async parseFile(filePath: string, mimeType: string): Promise<string> {
    try {
      // Check if file exists before parsing
      try {
        await fs.access(filePath);
      } catch (error) {
        logger.error(`File not found at path: ${filePath}`);
        throw new AppError(`File not found: ${filePath}`, 404);
      }

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
      if (error instanceof AppError) {
        throw error;
      }
      logger.error('Error parsing file:', error);
      throw new AppError('Failed to parse file', 500);
    }
  }

  private async parsePDF(filePath: string): Promise<string> {
    try {
      const dataBuffer = await fs.readFile(filePath);
      const data = await pdf(dataBuffer);
      
      if (!data.text || data.text.trim().length === 0) {
        logger.warn(`PDF parsed but no text extracted from: ${filePath}`);
        throw new AppError('PDF contains no readable text', 400);
      }

      // Clean up the text to help AI parsing
      let cleanedText = data.text;
      
      // Remove excessive whitespace and normalize line breaks
      cleanedText = cleanedText
        .replace(/\r\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .replace(/[ \t]{2,}/g, ' ')
        .trim();

      logger.info(`Extracted ${cleanedText.length} characters from PDF`);
      
      // Log first 200 chars to help debug name extraction
      const preview = cleanedText.substring(0, 200).replace(/\n/g, ' ');
      logger.info(`PDF preview: ${preview}...`);
      
      return cleanedText;
    } catch (error) {
      logger.error(`Error parsing PDF at ${filePath}:`, error);
      throw error;
    }
  }

  private async parseDOCX(filePath: string): Promise<string> {
    try {
      const result = await mammoth.extractRawText({ path: filePath });
      
      if (!result.value || result.value.trim().length === 0) {
        logger.warn(`DOCX parsed but no text extracted from: ${filePath}`);
        throw new AppError('DOCX contains no readable text', 400);
      }
      
      return result.value;
    } catch (error) {
      logger.error(`Error parsing DOCX at ${filePath}:`, error);
      throw error;
    }
  }

  private async parseTXT(filePath: string): Promise<string> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      
      if (!content || content.trim().length === 0) {
        logger.warn(`TXT file is empty: ${filePath}`);
        throw new AppError('TXT file is empty', 400);
      }
      
      return content;
    } catch (error) {
      logger.error(`Error parsing TXT at ${filePath}:`, error);
      throw error;
    }
  }
}

export default new ParserService();
