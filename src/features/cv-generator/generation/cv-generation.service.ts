import { randomUUID } from 'crypto';
import pdf from 'pdf-parse';
import { AppError } from '../../../middlewares/error.middleware';
import { Resume, ResumeNew } from '../../../types/evaluation.types';
import { cvGenerationRepository } from './cv-generation.repository';
import { applyAtsTemplateStyle } from '../rendering/ats-template-style';
import { loadCvTemplate, renderCvTemplate } from '../rendering/cv-template.service';
import { renderCvPdf } from '../rendering/puppeteer-pdf.renderer';

const formattedDate = (): string => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
};
const sanitizeFilename = (name: string): string => name.replace(/[^a-zA-Z0-9]/g, '_');

export function createCvGenerationService(
  repository: typeof import('./cv-generation.repository').cvGenerationRepository,
) {
  async function saveGeneratedCv(
    fileName: string,
    pdfBuffer: Buffer,
    html: string,
    ownerId: string,
    dateStr: string,
    sourceData?: ResumeNew,
  ) {
    const generatedRecord = (await repository.createGeneratedCv({
      file_name: `${fileName}.pdf`,
      pdf_file: pdfBuffer.toString('base64'),
      html_file: '',
      userId: ownerId,
      html_text: html,
      source_data: sourceData,
      source_data_available: !!sourceData,
    })) as { id: string; html_file: string; save: () => Promise<unknown> };
    generatedRecord.html_file = `/api/cv-generator/${generatedRecord.id}/html`;
    await generatedRecord.save();
    return {
      fileName: `${fileName}.pdf`,
      htmlPath: generatedRecord.html_file,
      pdfPath: `/results/${fileName}.pdf`,
      generatedAt: dateStr,
    };
  }

  return {
    async generateLegacy(data: Resume, ownerId: string) {
      const dateStr = formattedDate();
      const fileName = `ATS_${sanitizeFilename(data.name)}_${dateStr}_${randomUUID().slice(0, 8)}`;
      const templateData = (await repository.findLegacyTemplate()) as { content?: string } | null;
      const template = loadCvTemplate(
        templateData?.content,
        'src/template-cv/resume_template.html',
      );
      const html = renderCvTemplate(template, data);
      const pdfBuffer = await renderCvPdf(html, fileName, {
        viewport: { width: 1200, height: 1600 },
        margin: '0.4in',
        timeoutMs: 60000,
        protocolTimeoutMs: 300000,
      });
      return saveGeneratedCv(fileName, pdfBuffer, html, ownerId, dateStr);
    },
    async generateNew(data: ResumeNew, ownerId: string) {
      const dateStr = formattedDate();
      const fileName = `ATS_${sanitizeFilename(data.personalInfo.name)}_${dateStr}_${randomUUID().slice(0, 8)}`;
      const selectedTemplate = await repository.findActiveTemplate(data.atsTemplateId || 'classic');
      if (!selectedTemplate)
        throw new AppError(
          'Selected ATS template is unavailable. Choose an active template and try again.',
          400,
        );

      const templateData = (await repository.findNewTemplate()) as { content?: string } | null;
      const template = loadCvTemplate(templateData?.content, 'public/templates/template.html');
      const rendered = applyAtsTemplateStyle(
        renderCvTemplate(template, data),
        selectedTemplate.layout.variant,
        selectedTemplate.layout,
      );
      const pdfBuffer = await renderCvPdf(rendered.html, fileName, {
        viewport: { width: 2480, height: 3508 },
        margin: rendered.pageMargin,
        timeoutMs: 60000,
        protocolTimeoutMs: 300000,
      });
      const parsedPdf = await pdf(pdfBuffer);
      const extractedText = parsedPdf.text.replace(/\s+/g, ' ').trim();
      if (parsedPdf.numpages < 1 || !extractedText.includes(data.personalInfo.name.trim())) {
        throw new Error('Generated PDF failed ATS text extraction validation');
      }
      return saveGeneratedCv(fileName, pdfBuffer, rendered.html, ownerId, dateStr, data);
    },
    findAllForOwner: (ownerId: string, page: number, limit: number) =>
      repository.findAllForOwner(ownerId, page, limit),
    findPdfForOwner: (id: string, ownerId: string) => repository.findPdfForOwner(id, ownerId),
    findHtmlForOwner: (id: string, ownerId: string) => repository.findHtmlForOwner(id, ownerId),
    findSourceForOwner: (id: string, ownerId: string) => repository.findSourceForOwner(id, ownerId),
    findActiveTemplates: () => repository.findActiveTemplates(),
    async getNewTemplateContent(templateId: string) {
      const content = await repository.findNewTemplateContent();
      const template = await repository.findActiveTemplate(templateId);
      if (!template)
        throw new AppError(
          'Selected ATS template is unavailable. Choose an active template and try again.',
          400,
        );
      const source = loadCvTemplate(content, 'public/templates/template.html');
      return applyAtsTemplateStyle(source, template.layout.variant, template.layout).html;
    },
  };
}

export const cvGenerationService = createCvGenerationService(cvGenerationRepository);
