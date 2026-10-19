/**
 * The one module that knows the REST envelope.
 *
 * Every success response from the backend is `{ data }`; every list is
 * `{ data, meta: { total, page, limit, totalPages } }`. Every failure is
 * `{ error: { status, message, code, details? } }`. Unwrapping that here means
 * no component ever sees the wrapper, and no component has to remember the
 * shape.
 *
 * Auth is same-origin: the JWT lives in an httpOnly cookie, `proxy.js` lifts it
 * into an `Authorization: Bearer` header, and the request is rewritten to the
 * backend. This module therefore attaches no credentials itself — which is
 * precisely the point, since a token in client JS would be readable by any
 * injected script.
 */

/** Normalized error thrown by every failed request. */
export class ApiError extends Error {
  constructor(message, { status = 0, code = 'UNKNOWN', details = null } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    /** Field-keyed map on 422, directly usable as a form `errors` object. */
    this.details = details;
  }

  /** True when the server rejected field values (HTTP 422). */
  get isValidation() {
    return this.status === 422;
  }

  /** True when the request was rejected for lacking permission (HTTP 403). */
  get isForbidden() {
    return this.status === 403;
  }
}

const UNAUTHORIZED_EVENT = 'flowpilot:session-expired';

/**
 * Announce an expired session exactly once per burst.
 *
 * Every page fires several requests on mount; without this guard a single
 * expired token would dispatch N events and N redirects.
 *
 * Exported so other same-origin clients (e.g. the AI chat client) that do not
 * go through `request()` can reuse the exact same recovery path.
 */
let sessionExpiryHandled = false;

export function notifySessionExpired() {
  if (sessionExpiryHandled) return;
  sessionExpiryHandled = true;
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT));
}

/** Test seam / re-auth entry point: allow a fresh 401 to notify again. */
export function resetSessionExpiryGuard() {
  sessionExpiryHandled = false;
}

/** Subscribe to session expiry. Returns an unsubscribe function. */
export function onSessionExpired(handler) {
  if (typeof window === 'undefined') return () => {};
  const listener = (event) => handler(event?.detail);
  window.addEventListener(UNAUTHORIZED_EVENT, listener);
  return () => window.removeEventListener(UNAUTHORIZED_EVENT, listener);
}

/** Drop empty values so we don't send `?search=&status=all` at the API. */
function buildQuery(query) {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      value.filter((v) => v !== undefined && v !== null && v !== '').forEach((v) => params.append(key, v));
    } else {
      params.set(key, String(value));
    }
  }
  const serialised = params.toString();
  return serialised ? `?${serialised}` : '';
}

/**
 * Perform a request and normalize the outcome.
 *
 * Two responses carry an additive block alongside `data` + `meta`: the product
 * and invoice lists return `counts` (the per-status chip tallies, computed in
 * the same SQL pass as the filter). Those are surfaced as `counts` rather than
 * discarded, so filter chips stop recounting a page of rows.
 *
 * @returns {Promise<{ data: any, meta: object|null, counts: object|null }>}
 * @throws  {ApiError}
 */
async function request(path, { method = 'GET', body, query, signal, headers } = {}) {
  const isAbsolute = /^https?:\/\//i.test(path);
  const url = `${isAbsolute ? path : `/api${path}`}${buildQuery(query)}`;

  let response;
  try {
    response = await fetch(url, {
      method,
      signal,
      // Same-origin; the session cookie rides along automatically.
      credentials: 'same-origin',
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (cause) {
    if (cause?.name === 'AbortError') throw cause;
    throw new ApiError('Cannot reach the FlowPilot API. Is the backend running on port 4000?', {
      status: 0,
      code: 'NETWORK_ERROR',
    });
  }

  // 204 and other empty bodies are legitimate successes.
  if (response.status === 204) return { data: null, meta: null, counts: null };

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const error = payload?.error;
    if (response.status === 401) notifySessionExpired();
    throw new ApiError(error?.message ?? `Request failed with status ${response.status}`, {
      status: response.status,
      code: error?.code ?? 'REQUEST_FAILED',
      details: error?.details ?? null,
    });
  }

  // Every success response in this API is wrapped in `data`.
  return {
    data: payload?.data ?? null,
    meta: payload?.meta ?? null,
    counts: payload?.counts ?? null,
  };
}

/** `GET` — returns `{ data, meta, counts }`. Use `meta.total` for the grand total. */
export const apiGet = (path, options) => request(path, { ...options, method: 'GET' });

/** `POST` — returns `{ data }`. */
export const apiPost = (path, body, options) => request(path, { ...options, method: 'POST', body });

/** `PUT` — returns `{ data }`. */
export const apiPut = (path, body, options) => request(path, { ...options, method: 'PUT', body });

/** `PATCH` — returns `{ data }`. */
export const apiPatch = (path, body, options) => request(path, { ...options, method: 'PATCH', body });

/** `DELETE` — returns `{ data }`. */
export const apiDelete = (path, options) => request(path, { ...options, method: 'DELETE' });
