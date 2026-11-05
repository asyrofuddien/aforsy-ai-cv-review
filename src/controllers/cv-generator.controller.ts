import appLogger from '../utils/logger';
import { Request, Response, NextFunction } from 'express';
import { AppError, asyncHandler } from '../middlewares/error.middleware';
import { Resume, ResumeNew } from '../types/evaluation.types';
import { cvDraftService } from '../features/cv-generator/drafts/cv-draft.service';
import { cvGenerationService } from '../features/cv-generator/generation/cv-generation.service';
import { generatedCvResponse } from '../features/cv-generator/generation/cv-generation.response';
import { savedCvDraftService } from '../features/cv-generator/drafts/saved-cv-draft.service';

const logger = appLogger.child({ scope: 'cv-generator' });

const parsePositiveInteger = (value: unknown, fallback: number, maximum: number): number | null => {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed <= maximum ? parsed : null;
};

export class CVGeneratorController {
  ListSavedDrafts = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const drafts = await savedCvDraftService.list(req.authUser!.userId.toString());
    res.json({ success: true, data: drafts });
  });

  GetSavedDraft = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const draft = await savedCvDraftService.get(req.authUser!.userId.toString(), req.params.id);
    res.json({ success: true, data: draft });
  });

  CreateSavedDraft = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (
      !req.body ||
      typeof req.body.data !== 'object' ||
      req.body.data === null ||
      Array.isArray(req.body.data) ||
      JSON.stringify(req.body.data).length > 250_000
    ) {
      res
        .status(400)
        .json({ success: false, message: 'Draft data must be an object no larger than 250 KB.' });
      return;
    }
    const draft = await savedCvDraftService.create(
      req.authUser!.userId.toString(),
      req.body.name,
      req.body.data,
    );
    res.status(201).json({ success: true, data: draft });
  });

  UpdateSavedDraft = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const data = req.body?.data;
    if (
      data !== undefined &&
      (typeof data !== 'object' ||
        data === null ||
        Array.isArray(data) ||
        JSON.stringify(data).length > 250_000)
    ) {
      res
        .status(400)
        .json({ success: false, message: 'Draft data must be an object no larger than 250 KB.' });
      return;
    }
    const draft = await savedCvDraftService.update(req.authUser!.userId.toString(), req.params.id, {
      name: req.body?.name,
      data,
    });
    res.json({ success: true, data: draft });
  });

  DeleteSavedDraft = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    await savedCvDraftService.delete(req.authUser!.userId.toString(), req.params.id);
    res.json({ success: true, message: 'Draft deleted.' });
  });

  GetDraft = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const draft = await cvDraftService.getDraft(req.authUser!.userId.toString());
    res.json({ success: true, data: draft?.data || null, updatedAt: draft?.updatedAt || null });
  });

  SaveDraft = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      res.status(400).json({ success: false, message: 'Draft data must be an object' });
      return;
    }
    if (JSON.stringify(req.body).length > 250_000) {
      res.status(413).json({ success: false, message: 'Draft is too large' });
      return;
    }
    const draft = await cvDraftService.saveDraft(
      req.authUser!.userId.toString(),
      typeof req.query.ownerId === 'string' ? req.query.ownerId : undefined,
      req.body,
    );
    res.json({ success: true, data: draft.data, updatedAt: draft.updatedAt });
  });

  DeleteDraft = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    await cvDraftService.deleteDraft(req.authUser!.userId.toString());
    res.json({ success: true, message: 'Draft deleted' });
  });

  // Generate CV as PDF
  GenerateCv = asyncHandler(
    async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
      const resumeData: Resume = req.body;
      if (!resumeData.name || !resumeData.email) {
        res.status(400).json({ success: false, message: 'Name and email are required fields' });
        return;
      }

      try {
        const result = await cvGenerationService.generateLegacy(
          resumeData,
          req.authUser!.userId.toString(),
        );
        res.status(201).json(generatedCvResponse(result));
      } catch (error: any) {
        logger.error('Error generating legacy CV PDF', error);
        res.status(500).json({
          success: false,
          message: 'Failed to generate CV',
        });
      }
    },
  );

  GenerateCvNew = asyncHandler(
    async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
      const resumeData: ResumeNew = req.body;

      try {
        const result = await cvGenerationService.generateNew(
          resumeData,
          req.authUser!.userId.toString(),
        );
        res.status(201).json(generatedCvResponse(result));
      } catch (error: any) {
        logger.error('Error generating CV PDF', error);
        res.status(500).json({
          success: false,
          message: 'Failed to generate CV',
        });
      }
    },
  );

  FindAllCv = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const page = parsePositiveInteger(req.query.page, 1, 10_000);
    const limit = parsePositiveInteger(req.query.limit, 20, 100);
    if (page === null || limit === null) {
      res.status(400).json({
        success: false,
        message: 'Page must be between 1 and 10000; limit must be between 1 and 100.',
      });
      return;
    }

    const result = await cvGenerationService.findAllForOwner(
      req.authUser!.userId.toString(),
      page,
      limit,
    );
    res.status(200).json({
      success: true,
      data: result.records,
      pagination: {
        page,
        limit,
        total: result.total,
        totalPages: Math.ceil(result.total / limit),
      },
    });
  });

  GetGeneratedPdf = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const document = (await cvGenerationService.findPdfForOwner(
      req.params.id,
      req.authUser!.userId.toString(),
    )) as { pdf_file?: string } | null;
    if (!document?.pdf_file) {
      res.status(404).json({ success: false, message: 'Generated CV not found' });
      return;
    }

    const pdfBuffer = Buffer.from(document.pdf_file, 'base64');
    if (!pdfBuffer.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
      throw new AppError('Generated CV PDF is invalid.', 500);
    }
    res.setHeader('Content-Disposition', 'inline; filename="generated-cv.pdf"');
    res.type('application/pdf').send(pdfBuffer);
  });

  GetGeneratedHtml = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const document = (await cvGenerationService.findHtmlForOwner(
      req.params.id,
      req.authUser!.userId.toString(),
    )) as { html_text?: string } | null;
    if (!document) {
      res.status(404).json({ success: false, message: 'Generated CV not found' });
      return;
    }
    res.setHeader(
      'Content-Security-Policy',
      "sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data:",
    );
    res.type('html').send(document.html_text || '');
  });

  GetGeneratedSource = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const document = (await cvGenerationService.findSourceForOwner(
      req.params.id,
      req.authUser!.userId.toString(),
    )) as { source_data?: Record<string, unknown> } | null;
    if (!document?.source_data) {
      res
        .status(404)
        .json({ success: false, message: 'Editable data is unavailable for this CV.' });
      return;
    }
    res.json({ success: true, data: document.source_data });
  });

  ListAtsTemplates = asyncHandler(async (_req: Request, res: Response): Promise<void> => {
    const templates = await cvGenerationService.findActiveTemplates();
    res.json({ success: true, data: templates });
  });

  GetNewTemplateContent = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const templateId = typeof req.query.templateId === 'string' ? req.query.templateId : 'classic';
    res.type('html').send(await cvGenerationService.getNewTemplateContent(templateId));
  });
}

export default new CVGeneratorController();
