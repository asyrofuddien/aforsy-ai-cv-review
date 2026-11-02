import * as fs from 'fs';
import * as path from 'path';
import * as Handlebars from 'handlebars';

Handlebars.registerHelper('lookup', (value: Record<string, unknown>, field: string) => value[field]);
Handlebars.registerHelper('eq', (left: unknown, right: unknown) => left === right);
Handlebars.registerHelper('ifEquals', function (
  this: unknown,
  left: unknown,
  right: unknown,
  options: Handlebars.HelperOptions,
) {
  return left === right ? options.fn(this) : options.inverse(this);
});

export function loadCvTemplate(storedContent: string | undefined, relativePath: string): string {
  if (storedContent?.trim()) return storedContent;

  const templatePath = path.join(process.cwd(), relativePath);
  if (!fs.existsSync(templatePath)) {
    throw new Error(`CV template is missing: ${templatePath}`);
  }
  const content = fs.readFileSync(templatePath, 'utf8');
  if (!content.trim()) throw new Error(`CV template is empty: ${templatePath}`);
  return content;
}

export function renderCvTemplate(templateContent: string, data: unknown): string {
  return Handlebars.compile(templateContent)(data);
}
