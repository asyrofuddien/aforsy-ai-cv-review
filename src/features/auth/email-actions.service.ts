import { randomBytes } from 'crypto';
import EmailToken, { EmailTokenPurpose } from '../../models/emailToken.model';
import User, { IUser } from '../../models/user.model';
import config from '../../config/config';
import type { Locale } from '../../utils/locale';
import { sendAuthEmail } from './email.adapter';
import { hashOpaqueToken } from './credentials.crypto';

const EMAIL_TOKEN_TTL_MS = 60 * 60 * 1000;

export async function createEmailAction(user: IUser, purpose: EmailTokenPurpose, locale: Locale = 'en'): Promise<void> {
  await EmailToken.deleteMany({ userId: user._id, purpose, usedAt: { $exists: false } });
  const rawToken = randomBytes(32).toString('base64url');
  await EmailToken.create({
    userId: user._id,
    tokenHash: hashOpaqueToken(rawToken),
    purpose,
    expiresAt: new Date(Date.now() + EMAIL_TOKEN_TTL_MS),
  });
  const url = new URL(purpose === 'verify-email' ? '/verify-email' : '/reset-password', config.auth.frontendUrl);
  url.searchParams.set('token', rawToken);
  url.searchParams.set('lang', locale);
  await sendAuthEmail({ locale, email: user.email, displayName: user.displayName, purpose, url: url.toString() });
}

export async function consumeEmailAction(rawToken: string, purpose: EmailTokenPurpose) {
  const token = await EmailToken.findOne({
    tokenHash: hashOpaqueToken(rawToken), purpose, usedAt: { $exists: false }, expiresAt: { $gt: new Date() },
  }).select('+tokenHash');
  if (!token) return null;
  token.usedAt = new Date();
  await token.save();
  return User.findById(token.userId).select('+passwordHash +googleSub');
}
