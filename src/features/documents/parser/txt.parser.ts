import fs from 'fs/promises';
import { AppError } from '../../../middlewares/error.middleware';
import appLogger from '../../../utils/logger';

const logger = appLogger.child({ scope: 'parser.txt' });

export async function parseTxt(filePath: string): Promise<string> {
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
