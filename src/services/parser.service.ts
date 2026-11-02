import fs from 'fs/promises';
import pdf from 'pdf-parse';
import mammoth from 'mammoth';
import JSZip from 'jszip';
import { DOMParser } from '@xmldom/xmldom';
import { AppError } from '../middlewares/error.middleware';
import appLogger from '../utils/logger';

const logger = appLogger.child({ scope: 'parser' });
const WORD_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

function extractVisibleWordText(node: Node): string {
  if (node.nodeType === 3) return node.nodeValue || '';
  if (node.nodeType !== 1) return '';

  const name = (node as Element).localName || node.nodeName.split(':').pop();
  if (name === 't') return node.textContent || '';
  if (name === 'tab') return '\t';
  if (name === 'br' || name === 'cr') return '\n';
  // Do not include tracked deletions or field instruction codes as visible CV text.
  if (name === 'del' || name === 'delText' || name === 'instrText') return '';

  let text = '';
  for (let child = node.firstChild; child; child = child.nextSibling) {
    text += extractVisibleWordText(child);
  }
  return text;
}

async function extractDocxHeaderFooterText(buffer: Buffer): Promise<string> {
  const archive = await JSZip.loadAsync(buffer);
  const partNames = Object.keys(archive.files)
    .filter((name) => /^word\/(?:header|footer)\d+\.xml$/i.test(name))
    .sort();
  const sections: string[] = [];

  for (const name of partNames) {
    const xml = await archive.files[name].async('string');
    const document = new DOMParser().parseFromString(xml, 'application/xml');
    const paragraphs = document.getElementsByTagNameNS(WORD_NS, 'p');
    const paragraphTexts: string[] = [];
    for (let index = 0; index < paragraphs.length; index += 1) {
      const text = extractVisibleWordText(paragraphs.item(index)!).trim();
      if (text) paragraphTexts.push(text);
    }
    const text = paragraphTexts.join('\n');
    if (text) sections.push(text);
  }

  return sections.join('\n');
}

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
        throw new AppError('Could not extract all text from this PDF. Please try another copy of the file.', 422);
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

  private async parseDOCX(filePath: string): Promise<string> {
    try {
      const [buffer, result] = await Promise.all([
        fs.readFile(filePath),
        mammoth.extractRawText({ path: filePath }),
      ]);
      const headerFooterText = await extractDocxHeaderFooterText(buffer);
      const fullText = [result.value.trim(), headerFooterText].filter(Boolean).join('\n\n');
      
      if (!fullText) {
        logger.warn(`DOCX parsed but no text extracted from: ${filePath}`);
        throw new AppError('DOCX contains no readable text', 400);
      }
      
      return fullText;
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
