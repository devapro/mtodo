import path from 'path';
import dotenv from 'dotenv';

// Load .env from the repository root (one level up from the server folder)
// and also any local .env, so the server works both in Docker and locally.
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '4000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-me',
  databaseFile: process.env.DATABASE_FILE || './data/mtodo.sqlite',
  admin: {
    email: (process.env.ADMIN_EMAIL || 'admin@example.com').toLowerCase(),
    password: process.env.ADMIN_PASSWORD || 'admin12345',
  },
};
