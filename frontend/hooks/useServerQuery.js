'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiGet } from '@/lib/apiClient';

/**
 * Hooks for reading server-owned state.
 *
 * The whole point of moving off `localStorage` is that filtering, sorting,
 * pagination, search and aggregation now happen in SQL. A page cannot own that
 * state locally any more — it owns *query parameters* and renders whatever the
 * server returns. These two hooks make that a one-liner.
 *
 * Both abort in-flight requests when the query changes, so a fast typist in the
 * search box cannot have an earlier response overwrite a later one.
 */

const EMPTY_META = { total: 0, page: 1, limit: 10, totalPages: 0 };

/**
 * Delay a rapidly-changing value — used to keep search off every keystroke.
 *
 * Accepts primitives *and* objects. An object argument is compared by its JSON
 * serialization rather than by reference, because callers legitimately pass an
 * inline literal:
 *
 *   useDebouncedValue({ from, to }, 250)
 *
 * A fresh literal is a new object identity on every render, so keying the effect
 * on `[value]` alone re-armed the timer on every single render, and calling
 * `setDebounced` with a new object each time made that a render loop — React
 * bailed out with "Too many re-renders" before the page ever painted.
 */
export function useDebouncedValue(value, delay = 300) {
  // Stable identity for structurally-equal objects, so the effect below only
  // re-arms when the *contents* actually change.
  const key = useMemo(
    () => (value !== null && typeof value === 'object' ? JSON.stringify(value) : null),
    [value]
  );
  const isObject = key !== null;

  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
    // `key` stands in for `value` when it is an object; for primitives the
    // identity comparison React already does is correct.
  }, [isObject ? key : value, delay, isObject]);

  return debounced;
}

/** Shared fetch + abort machinery. */
function useServerFetch({ path, query, enabled, select, refreshKey }) {
  const [result, setResult] = useState({ data: null, meta: null, counts: null, error: null });
  const [isLoading, setIsLoading] = useState(Boolean(enabled));
  const [reloadToken, setReloadToken] = useState(0);

  // Serialize so callers can pass an inline object literal without causing a
  // refetch on every render. Key order is fixed by construction order.
  const queryKey = useMemo(() => JSON.stringify(query ?? {}), [query]);

  const latestQuery = useRef(query);
  latestQuery.current = query;

  useEffect(() => {
    if (!enabled || !path) {
      setIsLoading(false);
      return undefined;
    }

    const controller = new AbortController();
    let cancelled = false;
    setIsLoading(true);

    apiGet(path, { query: latestQuery.current, signal: controller.signal })
      .then(({ data, meta, counts }) => {
        if (cancelled) return;
        setResult({
          data: select ? select(data) : data,
          meta: meta ?? EMPTY_META,
          counts,
          error: null,
        });
      })
      .catch((err) => {
        if (cancelled || err?.name === 'AbortError') return;
        setResult({ data: null, meta: EMPTY_META, counts: null, error: err });
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
    // `queryKey` stands in for `query`; `select` is a stable caller-supplied fn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, queryKey, enabled, reloadToken, select, refreshKey]);

  const refresh = useCallback(() => setReloadToken((n) => n + 1), []);

  return { ...result, isLoading, refresh };
}

const asList = (data) => (Array.isArray(data) ? data : data == null ? [] : [data]);

/**
 * A server-paginated collection.
 *
 * @returns rows, `meta` (`{ total, page, limit, totalPages }`), the additive
 *          `counts` block where the endpoint provides one, plus loading/error
 *          state and a `refresh()` to re-pull after a mutation.
 */
export function useServerList({ path, query, enabled = true, refreshKey }) {
  const select = useCallback(asList, []);
  const { data, meta, counts, isLoading, error, refresh } = useServerFetch({
    path,
    query,
    enabled,
    select,
    refreshKey,
  });

  return {
    rows: data ?? [],
    meta: meta ?? EMPTY_META,
    counts,
    isLoading,
    error,
    refresh,
  };
}

/** A single server-owned object (company profile, dashboard summary, …). */
export function useServerResource({ path, query, enabled = true, initialData = null, refreshKey }) {
  const { data, isLoading, error, refresh } = useServerFetch({ path, query, enabled, refreshKey });

  return { data: data ?? initialData, isLoading, error, refresh };
}

export { EMPTY_META };
