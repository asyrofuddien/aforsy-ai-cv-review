import { Request, Response, NextFunction } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import * as Handlebars from 'handlebars';
import puppeteer from 'puppeteer';
import { asyncHandler } from '../middlewares/error.middleware';
import { Resume } from '../types/evaluation.types';
import codeModel from '../models/code.model';
import AtsPdf from '../models/atsPDF.model';
import TemplateModel from '../models/Template.model';
import config from '../config/config';

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

export class CVGeneratorController {
  // Generate CV as PDF
  GenerateCv = asyncHandler(async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    const resumeData: Resume = req.body;
    const baseUrl = config.backendApi;

    const codeData = await codeModel.findOne({ code: resumeData.code });
    const codeId = codeData?._id;

    // Validate required fields
    if (!resumeData.name || !resumeData.email) {
      res.status(400).json({
        success: false,
        message: 'Name and email are required fields',
      });
      return;
    }

    let browser;
    try {
      // Get current date and sanitized name
      const dateStr = getFormattedDate();
      const sanitizedName = sanitizeFilename(resumeData.name);
      const fileName = `ATS_${sanitizedName}_${dateStr}_${resumeData.code}`;

      // Ensure results directory exists
      const resultsDir = path.join(process.cwd(), 'results');
      if (!fs.existsSync(resultsDir)) {
        fs.mkdirSync(resultsDir, { recursive: true });
      }

      const templateData = await TemplateModel.findOne().lean();
      console.log('Using template:', templateData?.name);
      const templateStr = templateData?.content;

      // Compile and render template
      const template = Handlebars.compile(templateStr);
      const html = template(resumeData);

      // Save HTML file
      const htmlPath = path.join(resultsDir, `${fileName}.html`);
      fs.writeFileSync(htmlPath, html);
      console.log(`✅ ${fileName}.html generated`);

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
        console.log('✅ Network monitoring disabled');
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

      console.log(`✅ ${fileName}.pdf generated successfully!`);
      console.log(`📁 Location: ${pdfPath}`);
      console.log(`📅 Generated on: ${dateStr}`);

      // Convert PDF to base64
      const pdfBuffer = fs.readFileSync(pdfPath);
      const pdfBase64 = pdfBuffer.toString('base64');

      await AtsPdf.create({
        file_name: `${fileName}.pdf`,
        pdf_file: pdfBase64,
        html_file: `${baseUrl}/results/${fileName}.html`,
        code_id: codeId,
        html_text: html,
      });

      // Send success response
      res.status(201).json({
        success: true,
        message: 'CV generated successfully',
        data: {
          fileName: `${fileName}.pdf`,
          htmlPath: `/results/${fileName}.html`,
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
    }
  });

  FindAllCv = asyncHandler(async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    const code = req.body.code;
    const codeData = await codeModel.findOne({ code: code });
    const codeId = codeData?._id;
    const atsDatas = await AtsPdf.find({ code_id: codeId }).sort('-createdAt').select('-__v -code_id');
    res.status(201).json({
      success: true,
      message: 'CV generated successfully',
      data: atsDatas,
    });
  });
}

export default new CVGeneratorController();
