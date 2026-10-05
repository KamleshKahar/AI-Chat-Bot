// Formatting utilities for FlowPilot (INR Currency, Dates, Numbers)

/**
 * Format a number as Indian Rupee (₹)
 * e.g., 125000 -> "₹1,25,000"
 */
export function formatCurrency(amount, includeDecimals = false) {
  if (amount === undefined || amount === null || isNaN(amount)) {
    return '₹0';
  }

  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: includeDecimals ? 2 : 0,
    minimumFractionDigits: includeDecimals ? 2 : 0,
  }).format(Number(amount));
}

/**
 * Format numbers with Indian digit grouping (1,25,000)
 */
export function formatNumber(number) {
  if (number === undefined || number === null || isNaN(number)) {
    return '0';
  }
  return new Intl.NumberFormat('en-IN').format(Number(number));
}

/**
 * Parse a date input safely.
 * Date-only strings ("2026-10-03") are parsed as local dates to avoid
 * timezone shifting the day backwards.
 */
export function toDate(value) {
  if (!value) return null;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, month - 1, day);
  }
  const date = new Date(value);
  return isNaN(date.getTime()) ? null : date;
}

/**
 * Format a date for display.
 * format: 'short' (04/10/2026) | 'medium' (04 Oct 2026) | 'full' (04 October 2026)
 */
export function formatDate(value, format = 'medium') {
  const date = toDate(value);
  if (!date) return '-';

  if (format === 'short') {
    return date.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  }

  if (format === 'full') {
    return date.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }

  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Format an ISO date string (YYYY-MM-DD)
 */
export function toISODate(date = new Date()) {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60 * 1000).toISOString().split('T')[0];
}

/**
 * Format a percentage value
 */
export function formatPercent(value, decimals = 0) {
  if (value === undefined || value === null || isNaN(value)) return '0%';
  return `${Number(value).toFixed(decimals)}%`;
}