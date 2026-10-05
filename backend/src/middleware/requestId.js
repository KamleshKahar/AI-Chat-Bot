import { randomUUID } from 'node:crypto';

/**
 * Attach a request id used in logs and echoed back in a response header, so a
 * user-reported failure can be traced to exact server logs.
 */
export function requestId(req, res, next) {
  const incoming = req.get('x-request-id');
  req.id = incoming && incoming.length <= 64 ? incoming : randomUUID();
  res.setHeader('x-request-id', req.id);
  next();
}