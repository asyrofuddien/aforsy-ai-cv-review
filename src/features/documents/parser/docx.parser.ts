import fs from 'fs/promises';
import mammoth from 'mammoth';
import JSZip from 'jszip';
import { DOMParser } from '@xmldom/xmldom';
import { AppError } from '../../../middlewares/error.middleware';
import appLogger from '../../../utils/logger';

const logger = appLogger.child({ scope: 'parser.docx' });
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

export async function parseDocx(filePath: string): Promise<string> {
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
