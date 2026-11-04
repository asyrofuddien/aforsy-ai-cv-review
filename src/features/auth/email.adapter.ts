import type {Locale} from '../../utils/locale';
import nodemailer from 'nodemailer';
import config from '../../config/config';
import appLogger from '../../utils/logger';
import { EmailTokenPurpose } from '../../models/emailToken.model';

const logger = appLogger.child({ scope: 'email' });

interface AuthEmail {
  locale?: Locale;
  email: string;
  displayName: string;
  purpose: EmailTokenPurpose;
  url: string;
}

interface ReviewCompleteEmail {
  locale?: Locale;
  email: string;
  displayName: string;
  evaluationId: string;
  candidateName?: string;
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

export const buildReviewCompleteEmailContent = ({ displayName, evaluationId, candidateName, locale = 'en' }: ReviewCompleteEmail) => {
  const id = locale === 'id';
  const url = new URL(`/results/${encodeURIComponent(evaluationId)}`, config.auth.frontendUrl).toString();
  const safeName = escapeHtml(displayName);
  const safeCandidate = escapeHtml(candidateName || (id ? 'CV Anda' : 'your CV'));
  const safeUrl = escapeHtml(url);
  const subject = id ? 'Review CV Anda sudah selesai' : 'Your CV review is ready';
  const greeting = id ? `Halo ${displayName},` : `Hi ${displayName},`;
  const text = `${greeting}\n\nReview untuk ${candidateName || (id ? 'CV Anda' : 'your CV')} sudah selesai. Lihat hasilnya: ${url}`;
  const html = `<!doctype html>
<html lang="${locale}">
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${subject}</title></head>
  <body style="margin:0;padding:32px 16px;background:#f1f7fc;color:#334155;font-family:Arial,'Helvetica Neue',sans-serif">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;margin:0 auto">
      <tr><td style="padding:4px 0 22px;text-align:center"><span style="color:#334155;font-size:25px;font-weight:700;letter-spacing:-.7px">Landly<span style="color:#1e9df1">.</span></span></td></tr>
      <tr><td style="overflow:hidden;background:#fff;border:1px solid #e2eaf1;border-radius:18px;box-shadow:0 8px 30px rgba(51,65,85,.06)">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td style="height:5px;background:#1e9df1;font-size:0;line-height:0">&nbsp;</td></tr></table>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td style="padding:36px 40px 40px">
          <div style="width:44px;height:44px;margin:0 0 22px;border-radius:14px;background:#eaf6ff;color:#1689d7;text-align:center;font-size:24px;font-weight:700;line-height:44px">✓</div>
          <p style="margin:0 0 8px;color:#1689d7;font-size:13px;font-weight:700;letter-spacing:.3px">${id ? 'REVIEW CV SELESAI' : 'CV REVIEW COMPLETE'}</p>
          <h1 style="margin:0 0 18px;color:#243244;font-size:25px;line-height:1.3;letter-spacing:-.4px">${id ? 'Hasil review Anda siap' : 'Your review is ready'}</h1>
          <p style="margin:0 0 10px;font-size:15px;line-height:1.7">${id ? 'Halo' : 'Hi'} ${safeName},</p>
          <p style="margin:0 0 28px;color:#526174;font-size:15px;line-height:1.7">${id ? `Review untuk <strong style="color:#334155">${safeCandidate}</strong> sudah selesai. Buka hasilnya untuk melihat evaluasi dan saran yang dipersonalisasi.` : `The review for <strong style="color:#334155">${safeCandidate}</strong> is complete. Open your results to see your evaluation and personalized suggestions.`}</p>
          <table role="presentation" cellspacing="0" cellpadding="0"><tr><td align="center" style="border-radius:10px;background:#1e9df1"><a href="${safeUrl}" style="display:inline-block;padding:14px 23px;color:#fff;font-size:15px;font-weight:700;text-decoration:none;border-radius:10px">${id ? 'Lihat hasil review' : 'View review results'} &nbsp;→</a></td></tr></table>
          <p style="margin:26px 0 8px;color:#64748b;font-size:13px;line-height:1.6">${id ? 'Tombol tidak berfungsi? Salin tautan berikut ke browser Anda:' : 'Button not working? Copy this link into your browser:'}</p>
          <p style="margin:0;word-break:break-all;font-size:12px;line-height:1.6"><a href="${safeUrl}" style="color:#1689d7">${safeUrl}</a></p>
        </td></tr></table>
      </td></tr>
      <tr><td style="padding:22px 12px;text-align:center;color:#64748b;font-size:12px;line-height:1.7">Landly · ${id ? 'Persiapkan CV untuk peluang berikutnya' : 'CV tools for your next opportunity'}</td></tr>
    </table>
  </body>
</html>`;
  return { subject, text, html };
};

export const sendReviewCompleteEmail = async (input: ReviewCompleteEmail): Promise<void> => {
  const { subject, text, html } = buildReviewCompleteEmailContent(input);
  if (config.auth.emailProvider === 'resend') {
    if (!config.auth.resendApiKey) throw new Error('RESEND_API_KEY is required when EMAIL_PROVIDER=resend');
    const response = await fetch(`${config.auth.resendApiUrl}/emails`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.auth.resendApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: config.auth.emailFrom, to: [input.email], subject, text, html }),
      signal: AbortSignal.timeout(15_000),
    });
    const result = (await response.json().catch(() => ({}))) as { message?: unknown };
    if (!response.ok) throw new Error(`Resend email delivery failed (${response.status}): ${typeof result.message === 'string' ? result.message : 'Unknown Resend API error'}`);
    logger.info('Review completion email sent', { provider: 'resend' });
    return;
  }
  if (config.auth.emailProvider !== 'smtp') throw new Error(`Unsupported EMAIL_PROVIDER: ${config.auth.emailProvider}`);
  if (!config.auth.smtpHost) {
    if (config.nodeEnv === 'production') throw new Error('Email delivery is not configured');
    logger.warn('Review completion email not delivered: development SMTP is not configured');
    return;
  }
  const transporter = nodemailer.createTransport({
    host: config.auth.smtpHost, port: config.auth.smtpPort, secure: config.auth.smtpSecure,
    auth: config.auth.smtpUser ? { user: config.auth.smtpUser, pass: config.auth.smtpPassword } : undefined,
  });
  await transporter.sendMail({ from: config.auth.emailFrom, to: input.email, subject, text, html });
  logger.info('Review completion email sent', { provider: 'smtp' });
};

export const sendPurchaseReceiptEmail = async (input: { email: string; displayName: string; orderNumber: string; packageName: string; amountIdr: number; credits: number; locale?: Locale; isTestPayment?: boolean }): Promise<void> => {
  const id = input.locale === 'id';
  const billingUrl = new URL('/billing', config.auth.frontendUrl).toString();
  const safeUrl = escapeHtml(billingUrl);
  const subject = (input.isTestPayment ? '[TEST] ' : '') + (id ? 'Kredit Landly berhasil ditambahkan' : 'Your Landly credits have been added');
  const testNotice = input.isTestPayment ? (id ? 'Transaksi uji admin: tidak ada uang yang diterima. Kredit ini ditambahkan untuk pengujian.' : 'Admin test transaction: no money was received. These credits were added for testing.') : '';
  const text = id
    ? `${testNotice ? testNotice + "\n\n" : ""}Halo ${input.displayName},\n\nPembayaran ${input.orderNumber} berhasil dan ${input.credits} kredit sudah ditambahkan ke akun Landly Anda.\nPaket: ${input.packageName}\nTotal: Rp${input.amountIdr.toLocaleString('id-ID')}\n\nBuka saldo dan riwayat kredit Anda: ${billingUrl}\n\nSimpan email ini sebagai bukti pembayaran.`
    : `${testNotice ? testNotice + "\n\n" : ""}Hi ${input.displayName},\n\nPayment ${input.orderNumber} was successful and ${input.credits} credits have been added to your Landly account.\nPackage: ${input.packageName}\nTotal: IDR ${input.amountIdr.toLocaleString('en-US')}\n\nView your balance and credit history: ${billingUrl}\n\nKeep this email as your payment receipt.`;
  const html = `<!doctype html><html lang="${id ? 'id' : 'en'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)}</title></head><body style="margin:0;padding:32px 16px;background:#f1f7fc;color:#334155;font-family:Arial,'Helvetica Neue',sans-serif"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;margin:auto"><tr><td style="padding:4px 0 22px;text-align:center"><span style="color:#334155;font-size:25px;font-weight:700">Landly<span style="color:#1e9df1">.</span></span></td></tr><tr><td style="overflow:hidden;background:#fff;border:1px solid #e2eaf1;border-radius:18px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td style="height:5px;background:#1e9df1;font-size:0;line-height:0">&nbsp;</td></tr></table><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td style="padding:36px 40px 40px"><div style="width:44px;height:44px;margin:0 0 22px;border-radius:14px;background:#eaf6ff;color:#1689d7;text-align:center;font-size:24px;font-weight:700;line-height:44px">✓</div><p style="margin:0 0 8px;color:#1689d7;font-size:13px;font-weight:700;letter-spacing:.3px">${id ? 'PEMBAYARAN BERHASIL' : 'PAYMENT SUCCESSFUL'}</p>${testNotice ? `<p style="padding:12px;border:1px solid #e2eaf1;background:#f1f7fc;font-size:14px;line-height:1.6"><strong>TEST</strong> · ${escapeHtml(testNotice)}</p>` : ''}<h1 style="margin:0 0 18px;color:#243244;font-size:25px;line-height:1.3">${id ? 'Kredit sudah ditambahkan' : 'Credits have been added'}</h1><p style="margin:0 0 20px;font-size:15px;line-height:1.7">${id ? 'Halo' : 'Hi'} ${escapeHtml(input.displayName)}, ${id ? 'pembayaran Anda berhasil. Kredit sudah tersedia di akun Landly Anda.' : 'your payment was successful. Your credits are now available in your Landly account.'}</p><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 26px;border:1px solid #e2eaf1;border-radius:12px"><tr><td style="padding:16px"><strong>${escapeHtml(input.packageName)}</strong><br/><span style="color:#526174;font-size:14px">${input.credits} ${id ? 'kredit' : 'credits'} · ${id ? 'Rp' : 'IDR '}${input.amountIdr.toLocaleString(id ? 'id-ID' : 'en-US')}<br/>${id ? 'Nomor pesanan' : 'Order'}: ${escapeHtml(input.orderNumber)}</span></td></tr></table><table role="presentation" cellspacing="0" cellpadding="0"><tr><td align="center" style="border-radius:10px;background:#1e9df1"><a href="${safeUrl}" style="display:inline-block;padding:14px 23px;color:#fff;font-size:15px;font-weight:700;text-decoration:none;border-radius:10px">${id ? 'Buka Billing' : 'Open Billing'} &nbsp;→</a></td></tr></table><p style="margin:24px 0 8px;color:#64748b;font-size:13px;line-height:1.6">${id ? 'Jika tombol tidak berfungsi, buka tautan ini:' : 'If the button does not work, open this link:'}</p><p style="margin:0;word-break:break-all;font-size:12px;line-height:1.6"><a href="${safeUrl}" style="color:#1689d7">${safeUrl}</a></p></td></tr></table></td></tr><tr><td style="padding:22px 12px;text-align:center;color:#64748b;font-size:12px;line-height:1.7">Landly · ${id ? 'Persiapkan CV untuk peluang berikutnya' : 'CV tools for your next opportunity'}</td></tr></table></body></html>`;
  if (config.auth.emailProvider === 'resend') {
    if (!config.auth.resendApiKey) throw new Error('RESEND_API_KEY is required when EMAIL_PROVIDER=resend');
    const response = await fetch(`${config.auth.resendApiUrl}/emails`, { method: 'POST', headers: { Authorization: `Bearer ${config.auth.resendApiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: config.auth.emailFrom, to: [input.email], subject, text, html }), signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error(`Resend purchase receipt failed (${response.status})`);
    logger.info('Purchase confirmation email sent', { provider: 'resend' });
    return;
  }
  if (config.auth.emailProvider !== 'smtp') throw new Error(`Unsupported EMAIL_PROVIDER: ${config.auth.emailProvider}`);
  if (!config.auth.smtpHost) { if (config.nodeEnv === 'production') throw new Error('Email delivery is not configured'); logger.warn('Purchase receipt not delivered: development SMTP is not configured'); return; }
  const transporter = nodemailer.createTransport({ host: config.auth.smtpHost, port: config.auth.smtpPort, secure: config.auth.smtpSecure, auth: config.auth.smtpUser ? { user: config.auth.smtpUser, pass: config.auth.smtpPassword } : undefined });
  await transporter.sendMail({ from: config.auth.emailFrom, to: input.email, subject, text, html });
  logger.info('Purchase confirmation email sent', { provider: 'smtp' });
};
