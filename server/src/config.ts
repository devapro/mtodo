import path from 'path';
import dotenv from 'dotenv';

// Load .env from the repository root (one level up from the server folder)
// and also any local .env, so the server works both in Docker and locally.
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config();

const DEFAULT_JWT_SECRET = 'dev-secret-change-me';
const DEFAULT_ADMIN_PASSWORD = 'admin12345';

// Minimum entropy we require from a production JWT secret. 32 chars is a
// reasonable floor for a random/base64 secret.
const MIN_JWT_SECRET_LENGTH = 32;

// Secrets that ship in the repo (.env / .env.example) or are otherwise common
// placeholders. They pass the old "is it the literal default?" check but are
// publicly known, so tokens signed with them are trivially forgeable.
const KNOWN_WEAK_JWT_SECRETS = new Set([
  DEFAULT_JWT_SECRET,
  'super-secret-change-me',
  'change-me',
  'changeme',
  'secret',
  'jwt-secret',
  'your-secret-here',
]);

// Synthetic email domain used for auto-provisioned Telegram-only accounts.
// Reserved: normal signups to this domain are rejected so an attacker cannot
// pre-register a victim's `tg<id>@telegram.local` address and hijack the link.
export const TELEGRAM_SYNTHETIC_EMAIL_DOMAIN = 'telegram.local';

// Comma-separated list of allowed origins for CORS. When empty, every origin is
// reflected back, which keeps the app usable on a plain HTTP LAN server
// (e.g. http://192.168.x.x) without any extra configuration. Lock it down in
// production by listing the exact client origins.
function parseOrigins(value: string | undefined): string[] {
  return (value || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export const config = {
  port: parseInt(process.env.PORT || '4000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction: (process.env.NODE_ENV || 'development') === 'production',
  jwtSecret: process.env.JWT_SECRET || DEFAULT_JWT_SECRET,
  databaseFile: process.env.DATABASE_FILE || './data/mtodo.sqlite',
  // CORS allow-list. Empty array = allow any origin (handy for local/LAN use).
  allowedOrigins: parseOrigins(process.env.ALLOWED_ORIGINS),
  // Trust the X-Forwarded-* headers from a reverse proxy (needed for correct
  // client IPs behind nginx/traefik, and therefore for rate limiting).
  trustProxy: process.env.TRUST_PROXY === 'true' || process.env.TRUST_PROXY === '1',
  // Rate limiting knobs (per IP). Generous defaults so normal use is unaffected.
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || String(15 * 60 * 1000), 10),
    max: parseInt(process.env.RATE_LIMIT_MAX || '600', 10),
    authMax: parseInt(process.env.RATE_LIMIT_AUTH_MAX || '30', 10),
  },
  admin: {
    email: (process.env.ADMIN_EMAIL || 'admin@example.com').toLowerCase(),
    password: process.env.ADMIN_PASSWORD || 'admin12345',
  },
  telegram: {
    // BotFather token. When empty, the Telegram integration stays disabled.
    botToken: process.env.TELEGRAM_BOT_TOKEN || '',
    // Bot username (without @) used to build deep-links and the login widget.
    // Strip a leading "@" and whitespace so a value like "@MyBot" still works —
    // Telegram's login widget and t.me links require the bare username.
    botUsername: (process.env.TELEGRAM_BOT_USERNAME || '').trim().replace(/^@+/, ''),
  },
};

export function isTelegramEnabled(): boolean {
  return Boolean(config.telegram.botToken && config.telegram.botUsername);
}

export function isUsingDefaultJwtSecret(): boolean {
  return config.jwtSecret === DEFAULT_JWT_SECRET;
}

/**
 * A JWT secret is unsafe for production if it is a known placeholder/weak value
 * or too short to provide meaningful entropy. The old check only caught the one
 * literal default, so a still-guessable value like "super-secret-change-me"
 * (shipped in .env) slipped through and allowed token forgery.
 */
export function isUsingWeakJwtSecret(): boolean {
  const secret = config.jwtSecret;
  if (KNOWN_WEAK_JWT_SECRETS.has(secret)) return true;
  if (secret.length < MIN_JWT_SECRET_LENGTH) return true;
  return false;
}

/** True when the admin account still uses the shipped default password. */
export function isUsingDefaultAdminPassword(): boolean {
  return config.admin.password === DEFAULT_ADMIN_PASSWORD;
}
