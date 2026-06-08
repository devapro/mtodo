import express from 'express';
import cors, { CorsOptions } from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { config, isUsingDefaultJwtSecret } from './config';
import { initDb } from './db';
import authRoutes from './routes/auth';
import listRoutes from './routes/lists';
import tagRoutes from './routes/tags';
import taskRoutes from './routes/tasks';
import adminRoutes from './routes/admin';
import { startTelegramBot } from './telegram';

initDb();

// Refuse to boot in production with the throwaway dev JWT secret — tokens would
// be trivially forgeable. Local/dev use keeps working with the default.
if (config.isProduction && isUsingDefaultJwtSecret()) {
  // eslint-disable-next-line no-console
  console.error(
    '[security] JWT_SECRET is still the default value. Set a strong JWT_SECRET in production.'
  );
  process.exit(1);
}

if (config.telegram.botToken && !config.telegram.botUsername) {
  // eslint-disable-next-line no-console
  console.warn(
    '[telegram] TELEGRAM_BOT_TOKEN is set but TELEGRAM_BOT_USERNAME is missing. ' +
      'Telegram UI/login/linking will stay disabled until the bot username is configured.'
  );
}

if (!config.telegram.botToken && config.telegram.botUsername) {
  // eslint-disable-next-line no-console
  console.warn(
    '[telegram] TELEGRAM_BOT_USERNAME is set but TELEGRAM_BOT_TOKEN is missing. ' +
      'Telegram integration will stay disabled until the bot token is configured.'
  );
}

const app = express();

// When deployed behind a reverse proxy (nginx, traefik, ngrok), trust the
// forwarded headers so client IPs — and therefore rate limiting — are correct.
if (config.trustProxy) {
  app.set('trust proxy', 1);
}

// Security headers. CSP is left to the static client host; HSTS is disabled so
// the API keeps working over plain HTTP on a LAN (e.g. http://192.168.x.x).
// Resource policy is cross-origin so a separately-hosted client can read it.
app.use(
  helmet({
    contentSecurityPolicy: false,
    hsts: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

// CORS: when ALLOWED_ORIGINS is empty, reflect any origin (zero-config local /
// LAN use). When it is set, only those origins are allowed.
const corsOptions: CorsOptions = {
  origin(origin, callback) {
    if (!origin || config.allowedOrigins.length === 0) {
      callback(null, true);
      return;
    }
    if (config.allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error('Not allowed by CORS'));
  },
};
app.use(cors(corsOptions));

app.use(express.json({ limit: '1mb' }));

// Global, lenient rate limit to blunt abuse without affecting normal usage.
const globalLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please slow down.' },
});
app.use('/api/', globalLimiter);

// Stricter limit on authentication endpoints to throttle credential stuffing.
const authLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.authMax,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: 'Too many attempts, please try again later.' },
});

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

app.use('/api/auth/signin', authLimiter);
app.use('/api/auth/signup', authLimiter);
app.use('/api/auth', authRoutes);
app.use('/api/lists', listRoutes);
app.use('/api/tags', tagRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/admin', adminRoutes);

// Generic error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  // eslint-disable-next-line no-console
  console.error('[error]', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(`[server] mTodo API listening on http://localhost:${config.port}`);
});

startTelegramBot();
