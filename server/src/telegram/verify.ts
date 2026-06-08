import crypto from 'crypto';
import { config } from '../config';
import { TelegramLoginData } from '../types';

/**
 * Verify the payload produced by the Telegram Login Widget.
 *
 * Algorithm (https://core.telegram.org/widgets/login#checking-authorization):
 *  - build a data-check-string from all fields except `hash`, sorted by key,
 *    formatted as `key=value` and joined with "\n"
 *  - secret = SHA256(bot_token)
 *  - expected = HMAC_SHA256(data_check_string, secret)
 *  - the payload is authentic when `expected === hash`
 */
export function verifyTelegramLogin(data: TelegramLoginData): boolean {
  const token = config.telegram.botToken;
  if (!token || !data || !data.hash) return false;

  const { hash, ...fields } = data as unknown as Record<string, unknown> & {
    hash: string;
  };

  const dataCheckString = Object.keys(fields)
    .filter((k) => fields[k] !== undefined && fields[k] !== null)
    .sort()
    .map((k) => `${k}=${fields[k]}`)
    .join('\n');

  const secret = crypto.createHash('sha256').update(token).digest();
  const expected = crypto
    .createHmac('sha256', secret)
    .update(dataCheckString)
    .digest('hex');

  if (expected.length !== hash.length) return false;
  const ok = crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(hash));
  if (!ok) return false;

  // Reject stale logins (older than 24h) to limit replay attacks.
  const authDate = Number(data.auth_date);
  if (!Number.isFinite(authDate)) return false;
  const ageSeconds = Math.floor(Date.now() / 1000) - authDate;
  return ageSeconds < 24 * 60 * 60;
}

/** Generate a short, human-friendly one-time code for bot-based linking. */
export function generateLinkCode(): string {
  return crypto.randomBytes(5).toString('hex').toUpperCase();
}
