import express from 'express';
import cors from 'cors';
import { config } from './config';
import { initDb } from './db';
import authRoutes from './routes/auth';
import listRoutes from './routes/lists';
import tagRoutes from './routes/tags';
import taskRoutes from './routes/tasks';
import adminRoutes from './routes/admin';

initDb();

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

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
