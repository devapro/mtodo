/**
 * Error thrown by the service layer. Express turns it into `{ error }` with the
 * given status (see the error handler in index.ts); the MCP layer turns it into
 * a tool error result.
 */
export class ServiceError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = 'ServiceError';
  }
}

export const notFound = (what: string) => new ServiceError(404, `${what} not found`);
export const forbidden = (message: string) => new ServiceError(403, message);
export const badRequest = (message: string) => new ServiceError(400, message);
