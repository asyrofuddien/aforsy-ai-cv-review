import { AppError } from '../../../middlewares/error.middleware';

const contrastAgainstWhite = (hex: string): number => {
  const channels = hex.slice(1).match(/.{2}/g)!.map((part) => parseInt(part, 16) / 255).map((value) =>
    value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
  );
  const luminance = 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  return 1.05 / (luminance + 0.05);
};

export const validateTemplate = (input: any): void => {
  const layout = input.layout;
  const preview = input.preview;
  if (!input.name?.trim() || !input.description?.trim() || !input.version?.trim()) throw new AppError('Name, description, and version are required', 400);
  if (!layout || layout.columns !== 1 || !['classic', 'modern', 'compact'].includes(layout.variant)) throw new AppError('Template must use a supported single-column layout', 400);
  if (layout.fontFamily !== 'Arial, Helvetica, sans-serif' || !['0.3in', '0.4in', '0.5in'].includes(layout.pageMargin)) throw new AppError('Template font or page margin is not supported', 400);
  if (!['standard', 'compact'].includes(layout.density) || !/^#[0-9a-f]{6}$/i.test(layout.headingColor || '') || !/^#[0-9a-f]{6}$/i.test(layout.accentColor || '')) throw new AppError('Template layout configuration is invalid', 400);
  if (contrastAgainstWhite(layout.headingColor) < 4.5 || contrastAgainstWhite(layout.accentColor) < 4.5) throw new AppError('Template heading and accent colors must have at least 4.5:1 contrast on white', 400);
  if (!preview || !preview.sampleName?.trim() || !preview.sampleRole?.trim() || !preview.summary?.trim()) throw new AppError('A complete sample preview is required before a template can be activated', 400);
  if (input.status === 'active' && !['classic', 'modern', 'compact'].includes(layout.variant)) throw new AppError('The template renderer is unavailable', 400);
};
