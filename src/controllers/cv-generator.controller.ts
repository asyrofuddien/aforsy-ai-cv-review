import { Request, Response, NextFunction } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import * as Handlebars from 'handlebars';
import puppeteer from 'puppeteer';
import pdf from 'pdf-parse';
import { randomUUID } from 'crypto';
import { asyncHandler, AppError } from '../middlewares/error.middleware';
import { Resume, ResumeNew } from '../types/evaluation.types';
import AtsPdf from '../models/atsPDF.model';
import TemplateModel from '../models/Template.model';
import CvDraft from '../models/cvDraft.model';
import AtsTemplate from '../models/atsTemplate.model';
import { getActiveAtsTemplate } from '../services/atsTemplate.service';

// Register Handlebars helper (register once, outside the class)
Handlebars.registerHelper('lookup', function (obj: Record<string, any>, field: string): any {
  return obj[field];
});

// Utility functions
const getFormattedDate = (): string => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');

  return `${year}-${month}-${day}-${hours}${minutes}`;
};

const sanitizeFilename = (name: string): string => {
  return name.replace(/[^a-zA-Z0-9]/g, '_');
};

const loadTemplate = (storedContent: string | undefined, relativePath: string): string => {
  if (storedContent?.trim()) return storedContent;

  const templatePath = path.join(process.cwd(), relativePath);
  if (!fs.existsSync(templatePath)) {
    throw new Error(`CV template is missing: ${templatePath}`);
  }
  const content = fs.readFileSync(templatePath, 'utf8');
  if (!content.trim()) throw new Error(`CV template is empty: ${templatePath}`);
  return content;
};

const atsTemplateStyles = `
  body.ats-template--modern { font-family: Arial, Helvetica, sans-serif; color: #172033; }
  body.ats-template--modern .personal-info { text-align: left; border-bottom: 2px solid #2563eb; padding-bottom: 12px; }
  body.ats-template--modern .personal-info h1, body.ats-template--modern h2.section-title { color: #1e3a8a; }
  body.ats-template--modern h2.section-title { border-bottom-color: #2563eb; letter-spacing: .5px; }
  body.ats-template--compact { font-size: 9pt; line-height: 1.28; padding: 28px 38px; }
  body.ats-template--compact .personal-info { margin-bottom: 12px; }
  body.ats-template--compact .personal-info h1 { font-size: 23pt; }
  body.ats-template--compact .section { margin-bottom: 9px; }
  body.ats-template--compact .entry { margin-bottom: 7px; }
  body.ats-template--compact h2.section-title { font-size: 10.5pt; margin-bottom: 5px; }
  body.ats-template--compact li, body.ats-template--compact .entry-description, body.ats-template--compact .simple-text { font-size: 8.5pt; line-height: 1.25; }
`;

const applyAtsTemplateStyle = (html: string, variant: string, layout: { pageMargin: string; headingColor: string; accentColor: string }): { html: string; pageMargin: string } => {
  if (!['classic', 'modern', 'compact'].includes(variant)) throw new Error('Unsupported ATS template layout');
  if (!['0.3in', '0.4in', '0.5in'].includes(layout.pageMargin) || !/^#[0-9a-f]{6}$/i.test(layout.headingColor) || !/^#[0-9a-f]{6}$/i.test(layout.accentColor)) throw new Error('Invalid ATS template layout configuration');
  const selectedStyle = variant;
  const styledHtml = html.replace(/<body\b[^>]*>/i, `<body class="ats-template--${selectedStyle}">`);
  const configuredStyles = `${atsTemplateStyles}\nbody.ats-template--${selectedStyle} h2.section-title { color: ${layout.headingColor}; border-bottom-color: ${layout.accentColor}; }`;
  const result = styledHtml.replace(/<\/head>/i, `<style>${configuredStyles}</style></head>`);
  const hasSemanticHeadings = /<h1\b/i.test(result) && /<h2\b/i.test(result);
  const hasFontAndMargins = /font-family\s*:/i.test(result) && /(?:padding|margin)\s*:/i.test(result);
  const hasUnsupportedLayout = /<(?:table|img)\b/i.test(result);
  const hasUnsafeLinks = [...result.matchAll(/\bhref\s*=\s*["']([^"']*)["']/gi)].some(([, href]) => /^\s*(?:javascript|data):/i.test(href));
  if (!hasSemanticHeadings || !hasFontAndMargins || hasUnsupportedLayout || hasUnsafeLinks) {
    throw new Error('ATS template validation failed');
  }
  return { html: result, pageMargin: selectedStyle === 'compact' ? '0.3in' : '0.4in' };
};

export class CVGeneratorController {
  GetDraft = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const draft = await CvDraft.findOne({ userId: req.authUser!.userId }).lean();
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
    const draft = await CvDraft.findOneAndUpdate(
      { userId: req.authUser!.userId },
      { $set: { data: req.body }, $setOnInsert: { userId: req.authUser!.userId } },
      { upsert: true, new: true, runValidators: true },
    );
    res.json({ success: true, data: draft.data, updatedAt: draft.updatedAt });
  });

  DeleteDraft = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    await CvDraft.deleteOne({ userId: req.authUser!.userId });
    res.json({ success: true, message: 'Draft deleted' });
  });

  // Generate CV as PDF
  GenerateCv = asyncHandler(async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    const resumeData: Resume = req.body;

    // Validate required fields
    if (!resumeData.name || !resumeData.email) {
      res.status(400).json({
        success: false,
        message: 'Name and email are required fields',
      });
      return;
    }

    let browser;
    let temporaryFiles: string[] = [];
    try {
      // Get current date and sanitized name
      const dateStr = getFormattedDate();
      const sanitizedName = sanitizeFilename(resumeData.name);
      const fileName = `ATS_${sanitizedName}_${dateStr}_${randomUUID().slice(0, 8)}`;

      // Ensure results directory exists
      const resultsDir = path.join(process.cwd(), 'results');
      if (!fs.existsSync(resultsDir)) {
        fs.mkdirSync(resultsDir, { recursive: true });
      }

      const templateData = await TemplateModel.findOne().lean();
      const templateStr = loadTemplate(templateData?.content, 'src/template-cv/resume_template.html');

      // Compile and render template
      const template = Handlebars.compile(templateStr);
      const html = template(resumeData);

      // Save HTML file
      const htmlPath = path.join(resultsDir, `${fileName}.html`);
      temporaryFiles.push(htmlPath);
      fs.writeFileSync(htmlPath, html);

      // Generate PDF with optimized settings
      browser = await puppeteer.launch({
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
        headless: true,
        protocolTimeout: 300000, // Increased to 5 minutes
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--disable-software-rasterizer',
          '--no-zygote',
          '--single-process',
          '--disable-web-security',
          '--disable-features=IsolateOrigins,site-per-process,NetworkService', // Added NetworkService
        ],
        timeout: 60000, // Browser launch timeout
      });

      const page = await browser.newPage();

      // 🔥 DISABLE NETWORK MONITORING HERE 🔥
      try {
        const client = await page.target().createCDPSession();
        await client.send('Network.disable');
      } catch (err: any) {
        console.warn('⚠️ Could not disable network:', err.message);
      }

      // Disable request interception as additional safety
      await page.setRequestInterception(false);

      // Set viewport for consistent rendering
      await page.setViewport({ width: 1200, height: 1600 });

      // Use setContent instead of goto for inline HTML
      // Remove 'networkidle0' since there are no network requests
      await page.setContent(html, {
        waitUntil: 'domcontentloaded', // Changed from 'networkidle0'
        timeout: 60000,
      });

      // Wait a bit for any fonts or styles to load
      await page.evaluateHandle('document.fonts.ready');

      const pdfPath = path.join(resultsDir, `${fileName}.pdf`);
      temporaryFiles.push(pdfPath);
      await page.pdf({
        path: pdfPath,
        format: 'A4',
        printBackground: true,
        margin: {
          top: '0.4in',
          right: '0.4in',
          bottom: '0.4in',
          left: '0.4in',
        },
        timeout: 60000, // Add PDF generation timeout
      });

      await browser.close();
      browser = null; // Clear reference

      // Convert PDF to base64
      const pdfBuffer = fs.readFileSync(pdfPath);
      const pdfBase64 = pdfBuffer.toString('base64');

      const generatedRecord = await AtsPdf.create({
        file_name: `${fileName}.pdf`,
        pdf_file: pdfBase64,
        html_file: '',
        userId: req.authUser!.userId,
        html_text: html,
      });
      generatedRecord.html_file = `/api/cv-generator/${generatedRecord.id}/html`;
      await generatedRecord.save();

      // Send success response
      res.status(201).json({
        success: true,
        message: 'CV generated successfully',
        data: {
          fileName: `${fileName}.pdf`,
          htmlPath: generatedRecord.html_file,
          pdfPath: `/results/${fileName}.pdf`,
          generatedAt: dateStr,
        },
      });
    } catch (error: any) {
      console.error('❌ Error generating PDF:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to generate CV',
        error: error.message,
      });
    } finally {
      // Always close browser in finally block
      if (browser) {
        try {
          await browser.close();
        } catch (e) {
          console.error('Error closing browser:', e);
        }
      }
      for (const filePath of temporaryFiles) {
        try { fs.unlinkSync(filePath); } catch (error: any) {
          if (error.code !== 'ENOENT') console.error('Error removing temporary CV file:', error);
        }
      }
    }
  });

  GenerateCvNew = asyncHandler(async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    const resumeData: ResumeNew = req.body;

    Handlebars.registerHelper('eq', function (a, b) {
      return a === b;
    });

    Handlebars.registerHelper(
      'ifEquals',
      function (
        this: any, // 👈 FIX
        arg1: unknown,
        arg2: unknown,
        options: Handlebars.HelperOptions,
      ) {
        return arg1 === arg2 ? options.fn(this) : options.inverse(this);
      },
    );
    let browser;
    let temporaryFiles: string[] = [];
    try {
      // Get current date and sanitized name
      const dateStr = getFormattedDate();
      const sanitizedName = sanitizeFilename(resumeData.personalInfo.name);
      const fileName = `ATS_${sanitizedName}_${dateStr}_${randomUUID().slice(0, 8)}`;

      // Ensure results directory exists
      const resultsDir = path.join(process.cwd(), 'results');
      if (!fs.existsSync(resultsDir)) {
        fs.mkdirSync(resultsDir, { recursive: true });
      }

      const templateId = resumeData.atsTemplateId || 'classic';
      const selectedAtsTemplate = await getActiveAtsTemplate(templateId);
      if (!selectedAtsTemplate) throw new AppError('Selected ATS template is unavailable. Choose an active template and try again.', 400);

      const templateData = await TemplateModel.findOne({ name: 'new_template' }).lean();

      const templateStr = loadTemplate(templateData?.content, 'public/templates/template.html');

      // Compile and render template
      const template = Handlebars.compile(templateStr);
      const renderedTemplate = applyAtsTemplateStyle(template(resumeData), selectedAtsTemplate.layout.variant, selectedAtsTemplate.layout);
      const html = renderedTemplate.html;

      // Save HTML file
      const htmlPath = path.join(resultsDir, `${fileName}.html`);
      temporaryFiles.push(htmlPath);
      fs.writeFileSync(htmlPath, html);

      // Generate PDF with optimized settings
      browser = await puppeteer.launch({
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
        headless: true,
        protocolTimeout: 300000, // Increased to 5 minutes
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--disable-software-rasterizer',
          '--no-zygote',
          '--single-process',
          '--disable-web-security',
          '--disable-features=IsolateOrigins,site-per-process,NetworkService', // Added NetworkService
        ],
        timeout: 60000, // Browser launch timeout
      });

      const page = await browser.newPage();

      // 🔥 DISABLE NETWORK MONITORING HERE 🔥
      try {
        const client = await page.target().createCDPSession();
        await client.send('Network.disable');
      } catch (err: any) {
        console.warn('⚠️ Could not disable network:', err.message);
      }

      // Disable request interception as additional safety
      await page.setRequestInterception(false);

      // Set viewport for consistent rendering
      await page.setViewport({ width: 2480, height: 3508 });

      // Use setContent instead of goto for inline HTML
      // Remove 'networkidle0' since there are no network requests
      await page.setContent(html, {
        waitUntil: 'domcontentloaded', // Changed from 'networkidle0'
        timeout: 60000,
      });

      // Wait a bit for any fonts or styles to load
      await page.evaluateHandle('document.fonts.ready');

      const pdfPath = path.join(resultsDir, `${fileName}.pdf`);
      temporaryFiles.push(pdfPath);
      await page.pdf({
        path: pdfPath,
        format: 'A4',
        printBackground: true,
        margin: {
          top: renderedTemplate.pageMargin,
          right: renderedTemplate.pageMargin,
          bottom: renderedTemplate.pageMargin,
          left: renderedTemplate.pageMargin,
        },
        timeout: 60000, // Add PDF generation timeout
      });

      await browser.close();
      browser = null; // Clear reference

      // Convert PDF to base64
      const pdfBuffer = fs.readFileSync(pdfPath);
      const parsedPdf = await pdf(pdfBuffer);
      const extractedText = parsedPdf.text.replace(/\s+/g, ' ').trim();
      if (parsedPdf.numpages < 1 || !extractedText.includes(resumeData.personalInfo.name.trim())) {
        throw new Error('Generated PDF failed ATS text extraction validation');
      }
      const pdfBase64 = pdfBuffer.toString('base64');

      const generatedRecord = await AtsPdf.create({
        file_name: `${fileName}.pdf`,
        pdf_file: pdfBase64,
        html_file: '',
        userId: req.authUser!.userId,
        html_text: html,
      });
      generatedRecord.html_file = `/api/cv-generator/${generatedRecord.id}/html`;
      await generatedRecord.save();

      // Send success response
      res.status(201).json({
        success: true,
        message: 'CV generated successfully',
        data: {
          fileName: `${fileName}.pdf`,
          htmlPath: generatedRecord.html_file,
          pdfPath: `/results/${fileName}.pdf`,
          generatedAt: dateStr,
        },
      });
    } catch (error: any) {
      console.error('❌ Error generating PDF:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to generate CV',
        error: error.message,
      });
    } finally {
      // Always close browser in finally block
      if (browser) {
        try {
          await browser.close();
        } catch (e) {
          console.error('Error closing browser:', e);
        }
      }
      for (const filePath of temporaryFiles) {
        try { fs.unlinkSync(filePath); } catch (error: any) {
          if (error.code !== 'ENOENT') console.error('Error removing temporary CV file:', error);
        }
      }
    }
  });

  FindAllCv = asyncHandler(async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    const atsDatas = await AtsPdf.find({ userId: req.authUser!.userId }).sort('-createdAt').select('-__v -code_id');
    res.status(201).json({
      success: true,
      message: 'CV generated successfully',
      data: atsDatas,
    });
  });

  GetGeneratedHtml = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const document = await AtsPdf.findOne({ _id: req.params.id, userId: req.authUser!.userId }).select('html_text');
    if (!document) {
      res.status(404).json({ success: false, message: 'Generated CV not found' });
      return;
    }
    res.setHeader('Content-Security-Policy', "sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data:");
    res.type('html').send(document.html_text || '');
  });

  ListAtsTemplates = asyncHandler(async (_req: Request, res: Response): Promise<void> => {
    const templates = await AtsTemplate.find({ status: 'active' }).select('id name description version status layout preview').sort({ name: 1 }).lean();
    res.json({ success: true, data: templates });
  });
}

export default new CVGeneratorController();
