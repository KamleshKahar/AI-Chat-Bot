/**
 * Single source of truth for the AI orchestrator origin.
 *
 * The browser never talks to the AI backend directly. `proxy.js` lifts the
 * httpOnly session cookie into an `Authorization: Bearer` header and
 * `next.config.mjs` forwards `/api/ai/*` here, so the signed-in user's JWT
 * reaches the AI backend without ever being exposed to client JavaScript.
 *
 * Set `AI_ORIGIN` in `.env.local` to point at a different AI backend:
 *   AI_ORIGIN=http://localhost:3000
 */

const DEFAULT_ORIGIN = 'http://localhost:3000';

export function getAiOrigin() {
  return (process.env.AI_ORIGIN || DEFAULT_ORIGIN).replace(/\/+$/, '');
}

export default getAiOrigin;
