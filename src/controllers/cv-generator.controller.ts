import appLogger from '../utils/logger';
import { Request, Response, NextFunction } from 'express';
import { asyncHandler } from '../middlewares/error.middleware';
import { Resume, ResumeNew } from '../types/evaluation.types';
import { cvDraftService } from '../features/cv-generator/drafts/cv-draft.service';
import { cvGenerationService } from '../features/cv-generator/generation/cv-generation.service';
import { generatedCvResponse } from '../features/cv-generator/generation/cv-generation.response';

const logger = appLogger.child({ scope: 'cv-generator' });

export class CVGeneratorController {
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
  GenerateCv = asyncHandler(async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    const resumeData: Resume = req.body;
    if (!resumeData.name || !resumeData.email) {
      res.status(400).json({ success: false, message: 'Name and email are required fields' });
      return;
    }

    try {
      const result = await cvGenerationService.generateLegacy(resumeData, req.authUser!.userId.toString());
      res.status(201).json(generatedCvResponse(result));
    } catch (error: any) {
      logger.error('Error generating legacy CV PDF', error);
      res.status(500).json({
        success: false,
        message: 'Failed to generate CV',
        error: error.message,
      });
    }
  });

  GenerateCvNew = asyncHandler(async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    const resumeData: ResumeNew = req.body;

    try {
      const result = await cvGenerationService.generateNew(resumeData, req.authUser!.userId.toString());
      res.status(201).json(generatedCvResponse(result));
    } catch (error: any) {
      logger.error('Error generating CV PDF', error);
      res.status(500).json({
        success: false,
        message: 'Failed to generate CV',
        error: error.message,
      });
    }
  });

  FindAllCv = asyncHandler(async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    const atsDatas = await cvGenerationService.findAllForOwner(req.authUser!.userId.toString());
    res.status(201).json({
      success: true,
      message: 'CV generated successfully',
      data: atsDatas,
    });
  });

  GetGeneratedHtml = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const document = await cvGenerationService.findHtmlForOwner(req.params.id, req.authUser!.userId.toString()) as { html_text?: string } | null;
    if (!document) {
      res.status(404).json({ success: false, message: 'Generated CV not found' });
      return;
    }
    res.setHeader('Content-Security-Policy', "sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data:");
    res.type('html').send(document.html_text || '');
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
