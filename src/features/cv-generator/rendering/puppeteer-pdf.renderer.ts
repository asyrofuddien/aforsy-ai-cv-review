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

export async function renderCvPdf(
  html: string,
  fileName: string,
  options: PdfRenderOptions,
): Promise<Buffer> {
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
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-software-rasterizer',
        ...(config.puppeteer.disableSandbox ? ['--no-sandbox'] : []),
      ],
      timeout: options.timeoutMs,
    });

    const page = await browser.newPage();
    // CV content is user controlled. Keep rendering self-contained so crafted
    // values cannot make Chromium fetch internal services or external URLs.
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      const url = request.url();
      if (url.startsWith('data:') || url === 'about:blank') void request.continue();
      else void request.abort();
    });
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
