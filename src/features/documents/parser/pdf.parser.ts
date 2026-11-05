import fs from 'fs/promises';
import pdf from 'pdf-parse';
import { AppError } from '../../../middlewares/error.middleware';
import appLogger from '../../../utils/logger';

const logger = appLogger.child({ scope: 'parser.pdf' });

export async function parsePdf(filePath: string): Promise<string> {
  try {
    const dataBuffer = await fs.readFile(filePath);
    const failedPages: number[] = [];
    const data = await pdf(dataBuffer, {
      max: 0,
      pagerender: async (pageData: any) => {
        const pageNumber = Number.isInteger(pageData.pageNumber)
          ? pageData.pageNumber
          : Number.isInteger(pageData.pageIndex)
            ? pageData.pageIndex + 1
            : failedPages.length + 1;
        try {
          const content = await pageData.getTextContent({
            normalizeWhitespace: false,
            disableCombineTextItems: false,
          });
          let text = '';
          let previousY: number | undefined;
          for (const item of content.items) {
            if (typeof item.str !== 'string') continue;
            const y = item.transform?.[5];
            if (previousY !== undefined && y !== undefined && previousY !== y) text += '\n';
            text += item.str;
            if (y !== undefined) previousY = y;
          }
          return text;
        } catch {
          // pdf-parse otherwise swallows page rendering errors and returns partial text.
          failedPages.push(pageNumber);
          return '';
        }
      },
    });

    if (data.numrender !== data.numpages || failedPages.length > 0) {
      const pages = [...new Set(failedPages)].sort((a, b) => a - b);
      logger.warn('PDF text extraction failed on one or more pages', {
        pageCount: data.numpages,
        renderedPages: data.numrender,
        failedPages: pages,
      });
      throw new AppError(
        'Could not extract all text from this PDF. Please try another copy of the file.',
        422,
      );
    }

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

    logger.debug(`Extracted ${cleanedText.length} characters from PDF`);

    return cleanedText;
  } catch (error) {
    logger.error(`Error parsing PDF at ${filePath}:`, error);
    throw error;
  }
}
