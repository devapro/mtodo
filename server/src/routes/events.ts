import { Router } from 'express';
import { authRequired } from '../auth';
import { subscribe } from '../events';

/**
 * GET /api/events — Server-Sent Events stream of change notifications for the
 * authenticated user. Each message is `event: change` with a JSON body
 * `{ type: 'tasks' | 'lists' | 'tags' | 'settings', source?: string }`; the
 * client refetches the named resource. A `ready` event is sent on connect so a
 * reconnecting client knows to resync anything it may have missed.
 *
 * Auth uses the normal `Authorization: Bearer <jwt>` header — the web client
 * reads the stream with fetch() rather than EventSource so the token never
 * appears in a URL (and therefore never in proxy access logs).
 */

const HEARTBEAT_MS = 25_000;

const router = Router();

router.get('/', authRequired, (req, res) => {
  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  // Disable response buffering in nginx so events are delivered immediately.
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  req.socket.setTimeout(0);
  req.socket.setNoDelay(true);

  const write = (chunk: string) => {
    if (!res.writableEnded) res.write(chunk);
  };

  // Ask the browser to wait 3s before auto-reconnecting (EventSource clients).
  write('retry: 3000\n');
  write(`event: ready\ndata: {}\n\n`);

  const unsubscribe = subscribe(req.user!.id, (event) => {
    write(`event: change\ndata: ${JSON.stringify(event)}\n\n`);
  });

  // Comment lines keep idle connections open through proxies/load balancers.
  const heartbeat = setInterval(() => write(': ping\n\n'), HEARTBEAT_MS);

  const cleanup = () => {
    clearInterval(heartbeat);
    unsubscribe();
  };
  req.on('close', cleanup);
  res.on('error', cleanup);
});

export default router;
