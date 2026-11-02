export interface AtsTemplateLayout {
  pageMargin: string;
  headingColor: string;
  accentColor: string;
}

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

export function applyAtsTemplateStyle(
  html: string,
  variant: string,
  layout: AtsTemplateLayout,
): { html: string; pageMargin: string } {
  if (!['classic', 'modern', 'compact'].includes(variant)) {
    throw new Error('Unsupported ATS template layout');
  }
  if (
    !['0.3in', '0.4in', '0.5in'].includes(layout.pageMargin)
    || !/^#[0-9a-f]{6}$/i.test(layout.headingColor)
    || !/^#[0-9a-f]{6}$/i.test(layout.accentColor)
  ) {
    throw new Error('Invalid ATS template layout configuration');
  }

  const styledHtml = html.replace(/<body\b[^>]*>/i, `<body class="ats-template--${variant}">`);
  const configuredStyles = `${atsTemplateStyles}\nbody.ats-template--${variant} h2.section-title { color: ${layout.headingColor}; border-bottom-color: ${layout.accentColor}; }`;
  const result = styledHtml.replace(/<\/head>/i, `<style>${configuredStyles}</style></head>`);
  const hasSemanticHeadings = /<h1\b/i.test(result) && /<h2\b/i.test(result);
  const hasFontAndMargins = /font-family\s*:/i.test(result) && /(?:padding|margin)\s*:/i.test(result);
  const hasUnsupportedLayout = /<(?:table|img)\b/i.test(result);
  const hasUnsafeLinks = [...result.matchAll(/\bhref\s*=\s*["']([^"']*)["']/gi)]
    .some(([, href]) => /^\s*(?:javascript|data):/i.test(href));

  if (!hasSemanticHeadings || !hasFontAndMargins || hasUnsupportedLayout || hasUnsafeLinks) {
    throw new Error('ATS template validation failed');
  }

  return { html: result, pageMargin: variant === 'compact' ? '0.3in' : '0.4in' };
}
