import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import puppeteer from 'puppeteer';
import config from '../../../config/config';
import appLogger from '../../../utils/logger';

const logger = appLogger.child({ scope: 'cv-generator/pdf-renderer' });

export interface PdfRenderOptions {
  viewport: { width: number; height: number };
  margin: string;
  timeoutMs: number;
  protocolTimeoutMs: number;
}

export async function renderCvPdf(html: string, fileName: string, options: PdfRenderOptions): Promise<Buffer> {
  const resultsDir = path.join(process.cwd(), 'results');
  const temporaryId = randomUUID();
  const htmlPath = path.join(resultsDir, `${fileName}-${temporaryId}.html`);
  const pdfPath = path.join(resultsDir, `${fileName}-${temporaryId}.pdf`);
  const temporaryFiles = [htmlPath, pdfPath];
  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | undefined;

  try {
    fs.mkdirSync(resultsDir, { recursive: true });
    fs.writeFileSync(htmlPath, html);

    browser = await puppeteer.launch({
      executablePath: config.puppeteer.executablePath,
      headless: true,
      protocolTimeout: options.protocolTimeoutMs,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-software-rasterizer',
        '--no-zygote',
        '--single-process',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process,NetworkService',
      ],
      timeout: options.timeoutMs,
    });

    const page = await browser.newPage();
    try {
      const client = await page.target().createCDPSession();
      await client.send('Network.disable');
    } catch (error) {
      logger.warn('Could not disable browser network monitoring', error);
    }

    await page.setRequestInterception(false);
    await page.setViewport(options.viewport);
    await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: options.timeoutMs });
    await page.evaluateHandle('document.fonts.ready');
    await page.pdf({
      path: pdfPath,
      format: 'A4',
      printBackground: true,
      margin: {
        top: options.margin,
        right: options.margin,
        bottom: options.margin,
        left: options.margin,
      },
      timeout: options.timeoutMs,
    });

    return fs.readFileSync(pdfPath);
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch (error) {
        logger.error('Error closing PDF browser', error);
      }
    }
    for (const filePath of temporaryFiles) {
      try {
        fs.unlinkSync(filePath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          logger.error('Error removing temporary CV file', error);
        }
      }
    }
  }
}
