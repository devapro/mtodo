import { NextFunction, Request, Response, Router } from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { authenticateApiToken } from '../services/apiTokens';
import { createMcpServer } from '../mcp/server';

/**
 * POST /api/mcp — Model Context Protocol endpoint (Streamable HTTP, stateless,
 * JSON responses). Authenticate with a personal access token created in
 * Settings → AI agents: `Authorization: Bearer mtd_...`.
 */

const router = Router();

function tokenAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : '';
  const user = token ? authenticateApiToken(token) : null;
  if (!user) {
    res
      .status(401)
      .set('WWW-Authenticate', 'Bearer realm="mtodo-mcp"')
      .json({
        jsonrpc: '2.0',
        error: { code: -32001, message: 'A valid mTodo access token is required' },
        id: null,
      });
    return;
  }
  req.user = user;
  next();
}

router.post('/', tokenAuth, async (req, res) => {
  const server = createMcpServer({ userId: req.user!.id });
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless: every request is self-contained
    enableJsonResponse: true,
  });
  res.on('close', () => {
    transport.close();
    server.close();
  });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[mcp]', err);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: { code: -32603, message: 'Internal server error' },
        id: null,
      });
    }
  }
});

// Stateless server: no server-initiated streams or sessions to terminate.
const methodNotAllowed = (_req: Request, res: Response) => {
  res
    .status(405)
    .set('Allow', 'POST')
    .json({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed' }, id: null });
};
router.get('/', methodNotAllowed);
router.delete('/', methodNotAllowed);

export default router;
