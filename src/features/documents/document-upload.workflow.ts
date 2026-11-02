import type { IDocument } from '../../models/document.model';
import fs from 'fs/promises';
import documentService from './document.repository';
import parserService from './parser/document-parser';

/** Parses and persists an uploaded private document for its authenticated owner. */
export async function uploadCv(file: Express.Multer.File, ownerId: string): Promise<IDocument> {
  try {
    const content = await parserService.parseFile(file.path, file.mimetype);
    return await documentService.saveDocument(file, 'cv', ownerId, content);
  } catch (error) {
    await fs.rm(file.path, { force: true }).catch(() => undefined);
    throw error;
  }
}
