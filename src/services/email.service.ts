import type {Locale} from '../utils/locale';
import nodemailer from 'nodemailer';
import config from '../config/config';
import appLogger from '../utils/logger';
import { EmailTokenPurpose } from '../models/emailToken.model';

const logger = appLogger.child({ scope: 'email' });

interface AuthEmail {
  locale?: Locale;
  email: string;
  displayName: string;
  purpose: EmailTokenPurpose;
  url: string;
}

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);

export const buildAuthEmailContent = ({ displayName, purpose, url, locale = 'en' }: AuthEmail) => {
  const id = locale === 'id';
  const isVerification = purpose === 'verify-email';
  const subject = isVerification ? (id ? 'Verifikasi email Landly Anda' : 'Verify your Landly email') : (id ? 'Atur ulang kata sandi Landly Anda' : 'Reset your Landly password');
  const action = isVerification ? (id ? 'Verifikasi email' : 'Verify email') : (id ? 'Atur ulang kata sandi' : 'Reset password');
  const safeName = escapeHtml(displayName);
  const safeUrl = escapeHtml(url);
  const intro = isVerification
    ? (id ? 'Konfirmasi alamat email untuk menyelesaikan pembuatan akun Anda.' : 'Confirm your email address to finish setting up your account.')
    : (id ? 'Kami menerima permintaan untuk mengatur ulang kata sandi akun Landly Anda.' : 'We received a request to reset the password for your Landly account.');
  const expiry = id ? 'Tautan ini berlaku selama satu jam. Jika Anda tidak meminta tindakan ini, abaikan email ini.' : 'This link expires in one hour. If you did not request this, you can safely ignore this email.';
  const text = `${id ? 'Halo' : 'Hi'} ${displayName},\n\n${intro}\n\n${action}: ${url}\n\n${expiry}`;
  const html = `<!doctype html>
<html lang="${locale}">
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${subject}</title></head>
  <body style="margin:0;padding:32px 16px;background-color:#eff6ff;color:#303c4b;font-family:Arial,'Helvetica Neue',sans-serif">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;margin:0 auto">
      <tr><td style="padding:8px 0 20px;text-align:center"><span style="color:#3989db;font-size:26px;font-weight:700;letter-spacing:-.5px">Landly</span></td></tr>
      <tr><td style="padding:36px 40px;background:#fff;border:1px solid #dbeafe;border-radius:20px">
        <p style="margin:0 0 8px;color:#64748b;font-size:14px">${id ? 'Keamanan akun' : 'Account security'}</p>
        <h1 style="margin:0 0 20px;color:#243244;font-size:24px;line-height:1.3">${action}</h1>
        <p style="margin:0 0 12px;font-size:15px;line-height:1.7">${id ? 'Halo' : 'Hi'} ${safeName},</p>
        <p style="margin:0 0 26px;color:#526174;font-size:15px;line-height:1.7">${intro}</p>
        <table role="presentation" cellspacing="0" cellpadding="0"><tr><td style="border-radius:10px;background:#3989db">
          <a href="${safeUrl}" style="display:inline-block;padding:13px 22px;color:#fff;font-size:15px;font-weight:700;text-decoration:none;border-radius:10px">${action}</a>
        </td></tr></table>
        <p style="margin:26px 0 8px;color:#64748b;font-size:13px;line-height:1.6">${expiry}</p>
        <p style="margin:0;color:#64748b;font-size:13px;line-height:1.6">${id ? 'Jika tombol tidak berfungsi, salin tautan ini dan buka di browser Anda:' : 'If the button does not work, copy and paste this link into your browser:'}</p>
        <p style="margin:8px 0 0;word-break:break-all;font-size:12px;line-height:1.6"><a href="${safeUrl}" style="color:#2878c7">${safeUrl}</a></p>
      </td></tr>
      <tr><td style="padding:20px 12px;text-align:center;color:#64748b;font-size:12px;line-height:1.6">Landly · ${id ? 'Persiapkan CV untuk peluang berikutnya' : 'CV tools for your next opportunity'}</td></tr>
    </table>
  </body>
</html>`;

  return {subject,text,html};
};

export const sendAuthEmail = async (input: AuthEmail): Promise<void> => {
  const {email,purpose}=input;
  const {subject,text,html}=buildAuthEmailContent(input);
  if (config.auth.emailProvider === 'resend') {
    if (!config.auth.resendApiKey) throw new Error('RESEND_API_KEY is required when EMAIL_PROVIDER=resend');
    if (config.auth.emailFrom.includes('@localhost') || config.auth.emailFrom.includes('@example.com')) {
      throw new Error('Set EMAIL_FROM to an address on a verified Resend domain');
    }

    const response = await fetch(`${config.auth.resendApiUrl}/emails`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.auth.resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: config.auth.emailFrom,
        to: [email],
        subject,
        text,
        html,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const result = (await response.json().catch(() => ({}))) as { message?: unknown };
    if (!response.ok) {
      const message = typeof result.message === 'string' ? result.message : 'Unknown Resend API error';
      throw new Error(`Resend email delivery failed (${response.status}): ${message}`);
    }
    logger.info('Authentication email sent', { provider: 'resend', purpose });
    return;
  }

  if (config.auth.emailProvider !== 'smtp') {
    throw new Error(`Unsupported EMAIL_PROVIDER: ${config.auth.emailProvider}`);
  }

  if (!config.auth.smtpHost) {
    if (config.nodeEnv === 'production') throw new Error('Email delivery is not configured');
    logger.warn('Email not delivered: development SMTP is not configured', { purpose });
    return;
  }

  const transporter = nodemailer.createTransport({
    host: config.auth.smtpHost,
    port: config.auth.smtpPort,
    secure: config.auth.smtpSecure,
    auth: config.auth.smtpUser ? { user: config.auth.smtpUser, pass: config.auth.smtpPassword } : undefined,
  });
  await transporter.sendMail({ from: config.auth.emailFrom, to: email, subject, text, html });
};
