/**
 * Conversation persistence for the AI assistant page.
 *
 * This is deliberately the ONLY module in the app that writes to `localStorage`.
 * The rest of FlowPilot moved off localStorage because it held *application
 * data* — customers, invoices, stock — where a stale value could silently
 * corrupt business state (see WIRING_PLAN.md). Chat history is different: it is
 * convenience context for the next message, read by exactly one consumer (the
 * chat page), and the worst case of a stale, missing, or tampered entry is a
 * lost conversation — never a wrong invoice or a wrong balance.
 *
 * The session token is NOT here. It stays in the httpOnly cookie where client
 * JavaScript cannot reach it, and every request goes through the BFF.
 *
 * The backend reads only the last 10 turns (`slice(-10)` in ai-backend/server.js),
 * so `toConversation()` trims to that as well — sending more would only widen
 * the prompt-injection surface for no benefit.
 */

const STORAGE_KEY = 'flowpilot_chat_v1';

/** Max rich thread entries kept in storage; the oldest are evicted on save. */
const MAX_ENTRIES = 40;

/** Turns sent to the backend — matches the backend's own `slice(-10)`. */
const CONTEXT_TURNS = 10;

function makeId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Build a thread entry.
 *
 * Shapes by `kind`:
 * - (default)          `{ role, content }` — a plain user or assistant turn
 * - `kind: 'plan'`     adds `{ plan, planStatus }` — a confirmation request
 * - `kind: 'result'`   adds `{ results, success, totalActions }` — execution outcome
 * - `kind: 'error'`    a failed request; kept out of the model's context
 */
export function createEntry(role, content, extra = {}) {
  return {
    id: makeId(),
    role,
    content,
    createdAt: Date.now(),
    ...extra,
  };
}

/**
 * Read the persisted thread.
 *
 * Returns `[]` on any problem — missing key, corrupt JSON, wrong shape —
 * because a chat history is never worth failing a page load for. Entries that
 * do not match the expected shape are dropped rather than repaired.
 */
export function loadThread() {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry) =>
        entry &&
        typeof entry === 'object' &&
        typeof entry.id === 'string' &&
        (entry.role === 'user' || entry.role === 'assistant') &&
        typeof entry.content === 'string'
    );
  } catch {
    return [];
  }
}

/** Persist the thread, evicting the oldest entries beyond `MAX_ENTRIES`. */
export function saveThread(thread) {
  if (typeof window === 'undefined') return;
  try {
    const trimmed = Array.isArray(thread) ? thread.slice(-MAX_ENTRIES) : [];
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // Quota exceeded or storage disabled (private browsing). History is a
    // convenience, not data — losing it must never surface as an error.
  }
}

/** Drop the persisted thread (Clear history button). */
export function clearThread() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to recover from.
  }
}

/**
 * Map the rich thread to the backend's `{ role, content }[]` contract.
 *
 * Error turns are skipped: an internal failure message in the model's context
 * would only confuse intent detection. Plan and result turns are kept — their
 * `content` is the assistant's real reply text, which is exactly the context
 * follow-up questions ("his balance", "that invoice") refer to.
 */
export function toConversation(thread) {
  if (!Array.isArray(thread)) return [];
  return thread
    .filter(
      (entry) =>
        entry?.kind !== 'error' &&
        (entry?.role === 'user' || entry?.role === 'assistant') &&
        typeof entry?.content === 'string' &&
        entry.content.trim() !== ''
    )
    .slice(-CONTEXT_TURNS)
    .map(({ role, content }) => ({ role, content }));
}
