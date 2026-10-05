/**
 * Minimal structured logger. Deliberately dependency-free: morgan handles HTTP
 * access logs, this handles application events.
 */
const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const active = LEVELS[process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'test' ? 'error' : 'info')];

function emit(level, args) {
  if (LEVELS[level] > active) return;
  const stamp = new Date().toISOString();
  const line = `${stamp} [${level.toUpperCase()}]`;
  const target = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  target(line, ...args);
}

export const logger = {
  error: (...args) => emit('error', args),
  warn: (...args) => emit('warn', args),
  info: (...args) => emit('info', args),
  debug: (...args) => emit('debug', args),
};