/**
 * Single source of truth for the upstream REST API origin.
 *
 * `serverRuntimeConfig` and `publicRuntimeConfig` were removed in Next 16, so an
 * environment variable is the only supported mechanism. This module is the one
 * place that reads it, which keeps `next.config.mjs`, `proxy.js` and the route
 * handlers from drifting apart.
 *
 * Set `API_ORIGIN` in `.env.local` to point at a different backend:
 *   API_ORIGIN=http://localhost:4000
 */

const DEFAULT_ORIGIN = 'http://localhost:4000';

export function getApiOrigin() {
  return (process.env.API_ORIGIN || DEFAULT_ORIGIN).replace(/\/+$/, '');
}

export default getApiOrigin;
