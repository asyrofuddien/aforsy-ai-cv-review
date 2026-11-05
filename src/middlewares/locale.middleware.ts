import { Request, Response, NextFunction } from 'express';
import messages from '../locales/messages.json';
import { requestLocale, Locale } from '../utils/locale';
const catalog = messages as Record<string, { id: string; en: string }>;
export function localizeApiMessage(message: string, locale: Locale, status: number): string {
  if (catalog[message]) return catalog[message][locale];
  if (locale === 'en') return message;
  if (status >= 500) return 'Terjadi kesalahan saat memproses permintaan. Silakan coba lagi.';
  if (status === 401) return 'Silakan masuk untuk melanjutkan.';
  if (status === 403) return 'Anda tidak memiliki izin untuk melakukan tindakan ini.';
  if (status >= 400) return 'Permintaan tidak dapat diproses. Periksa isian Anda lalu coba lagi.';
  return message;
}
export function localeMiddleware(req: Request, res: Response, next: NextFunction) {
  const locale = requestLocale(req),
    json = res.json.bind(res);
  res.setHeader('Content-Language', locale);
  res.vary('Accept-Language');
  res.json = (body: any) => {
    if (body && typeof body === 'object' && !Array.isArray(body)) {
      body = { ...body };
      if (typeof body.message === 'string')
        body.message = localizeApiMessage(body.message, locale, res.statusCode);
      if (typeof body.error === 'string')
        body.error = localizeApiMessage(body.error, locale, res.statusCode);
      else if (body.error && typeof body.error.message === 'string')
        body.error = {
          ...body.error,
          message: localizeApiMessage(body.error.message, locale, res.statusCode),
        };
    }
    return json(body);
  };
  next();
}
