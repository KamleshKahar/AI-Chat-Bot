/**
 * Client for the AI chat orchestrator.
 *
 * The browser calls the same-origin BFF path `/api/ai/*`. `proxy.js` lifts the
 * httpOnly session cookie into an `Authorization: Bearer` header and
 * `next.config.mjs` rewrites the request to the AI backend, so the signed-in
 * user's JWT is attached automatically and never touches client JavaScript.
 *
 * This mirrors `lib/apiClient.js` (same-origin, normalized `ApiError`, one
 * session-expiry event per burst) but the AI backend has its own response
 * envelope — `{ success, executed, reply, plan, results }` — so the payload is
 * returned as-is rather than unwrapped as `{ data }`.
 */

import { ApiError, notifySessionExpired } from './apiClient';

const CHAT_PATH = '/api/ai/chat';
const EXECUTE_PATH = '/api/ai/execute';

async function post(path, body) {
  let response;
  try {
    response = await fetch(path, {
      method: 'POST',
      // Same-origin; the session cookie rides along and the BFF turns it into
      // the bearer header the AI backend forwards to FlowPilot.
      credentials: 'same-origin',
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body ?? {}),
    });
  } catch (cause) {
    if (cause?.name === 'AbortError') throw cause;
    throw new ApiError('Cannot reach the FlowPilot AI backend.', {
      status: 0,
      code: 'NETWORK_ERROR',
    });
  }

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    // `error` is an object on the authentication paths and a plain string on
    // validation/execution failures; normalize both.
    const error = payload?.error;
    const message = typeof error === 'string' ? error : error?.message;
    const code = (error && typeof error === 'object' && error.code) || 'REQUEST_FAILED';

    // A 401 means the session is gone; reuse the app-wide recovery path so the
    // user is signed out and returned to `/login` exactly once.
    if (response.status === 401) notifySessionExpired();

    throw new ApiError(message ?? `AI request failed with status ${response.status}`, {
      status: response.status,
      code,
    });
  }

  return payload;
}

/**
 * Send a natural-language message to the AI orchestrator.
 *
 * @param {string} message                  the user's request
 * @param {object} [options]
 * @param {Array}  [options.conversation]   prior `{ role, content }` turns
 * @param {boolean}[options.confirmed]      true to execute a pending action
 * @returns {Promise<object>} the AI backend's `{ success, executed, reply, plan, results }`
 */
export function sendChatMessage(message, { conversation, confirmed } = {}) {
  return post(CHAT_PATH, { message, conversation, confirmed });
}

/**
 * Execute a previously returned plan after the user confirms it.
 *
 * @param {object} plan        the `plan` object from a `sendChatMessage` reply
 * @param {object} [options]
 * @param {boolean}[options.confirmed]
 * @returns {Promise<object>} the AI backend's execution result envelope
 */
export function executePlan(plan, { confirmed = true } = {}) {
  return post(EXECUTE_PATH, { plan, confirmed });
}

export default sendChatMessage;
