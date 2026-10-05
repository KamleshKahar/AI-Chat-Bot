/**
 * Pagination helpers. Every list endpoint is paginated — no endpoint in this
 * API returns an unbounded collection.
 */
export const DEFAULT_LIMIT = 10;
export const MAX_LIMIT = 100;

export function parsePaging(query = {}) {
  const rawPage = Number.parseInt(query.page, 10);
  const rawLimit = Number.parseInt(query.limit ?? query.pageSize, 10);

  const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
  const limit = Number.isFinite(rawLimit) && rawLimit > 0
    ? Math.min(rawLimit, MAX_LIMIT)
    : DEFAULT_LIMIT;

  return { page, limit, skip: (page - 1) * limit, take: limit };
}

/** Standard list envelope: { data, meta }. */
export function paginate(data, total, { page, limit }) {
  return {
    data,
    meta: {
      total,
      page,
      limit,
      totalPages: limit > 0 ? Math.ceil(total / limit) : 0,
    },
  };
}

/** Standard `order` / `sort` guard. */
export function parseOrder(value) {
  const order = String(value ?? '').toLowerCase();
  return order === 'desc' ? 'desc' : 'asc';
}