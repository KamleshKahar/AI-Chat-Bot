'use client';

import React from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Loader2 } from 'lucide-react';

/**
 * Server-driven data table.
 *
 * This component used to sort and slice internally (`DataTable.js:28-45`), which
 * meant every page sorted twice — once in its own `useMemo` and again here — and
 * paginated over an already-filtered array. Now the rows it receives *are* the
 * current page, and paging/sorting is expressed as a query the page sends
 * upstream.
 *
 * Column definitions are unchanged: they remain pure renderers, which is what
 * made this conversion cheap.
 */

/** Must match the backend's `DEFAULT_LIMIT` in `lib/pagination.js`. */
export const DEFAULT_PER_PAGE = 10;

/** How many numbered page buttons to show around the current page. */
const PAGE_WINDOW = 2;

/**
 * First, last, and a sliding window around the current page. Rendering every
 * button breaks down once a collection runs to hundreds of rows.
 */
function pageWindow(currentPage, totalPages) {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);

  const pages = new Set([1, totalPages]);
  for (
    let offset = 1;
    offset <= PAGE_WINDOW;
    offset += 1
  ) {
    if (currentPage - offset > 1) pages.add(currentPage - offset);
    if (currentPage + offset < totalPages) pages.add(currentPage + offset);
  }

  return [...pages].sort((a, b) => a - b);
}

export function DataTable({
  columns,
  data,
  getRowId = (row, index) => row.id || index,
  onRowClick,
  emptyState,
  className = '',
  // --- server-driven state ---
  page = 1,
  perPage = DEFAULT_PER_PAGE,
  total,
  onPageChange,
  sortKey,
  sortOrder = 'asc',
  onSortChange,
  loading = false,
}) {
  const rowCount = data.length;
  const totalRows = typeof total === 'number' ? total : rowCount;
  const totalPages = Math.max(1, Math.ceil(totalRows / perPage));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const isServerDriven = typeof onPageChange === 'function';

  const firstRowIndex = totalRows === 0 ? 0 : (currentPage - 1) * perPage + 1;
  const lastRowIndex = totalRows === 0 ? 0 : Math.min(currentPage * perPage, totalRows);

  const handleSort = (key) => {
    if (!onSortChange) return;
    // Two states, not three. The old tri-state cycle (asc → desc → unsorted)
    // had no server equivalent, and "unsorted" is reachable by picking the
    // default sort in the page's own control.
    onSortChange(key, sortKey === key && sortOrder === 'asc' ? 'desc' : 'asc');
  };

  const pages = pageWindow(currentPage, totalPages);
  const showPageButtons = totalPages > 1;

  return (
    <div className={`overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-2xs ${className}`}>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm min-w-[640px]">
          <thead className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            <tr>
              {columns.map((col) => {
                const sortAccessor = col.accessor || col.key;
                const isSorted = sortKey === sortAccessor;
                return (
                  <th
                    key={col.key}
                    scope="col"
                    className={`px-4 py-3 whitespace-nowrap ${col.headerClass || ''}`}
                    style={col.width ? { width: col.width } : undefined}
                    aria-sort={
                      isSorted ? (sortOrder === 'asc' ? 'ascending' : 'descending') : undefined
                    }
                  >
                    {col.sortable !== false && col.accessor && onSortChange ? (
                      <button
                        type="button"
                        onClick={() => handleSort(sortAccessor)}
                        className="inline-flex items-center gap-1 hover:text-slate-700 transition-colors"
                      >
                        {col.header}
                        <span className="text-[10px] text-slate-400" aria-hidden="true">
                          {isSorted ? (sortOrder === 'asc' ? '▲' : '▼') : '↕'}
                        </span>
                      </button>
                    ) : (
                      col.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody className={`divide-y divide-slate-100 ${loading ? 'opacity-60' : ''}`}>
            {rowCount === 0 ? (
              <tr>
                <td colSpan={columns.length} className="p-0">
                  {loading ? (
                    <div className="flex items-center justify-center gap-2 p-10 text-sm text-slate-500">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading…
                    </div>
                  ) : (
                    emptyState
                  )}
                </td>
              </tr>
            ) : (
              data.map((row, index) => {
                const rowId = getRowId(row, index);
                return (
                  <tr
                    key={rowId}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    className={`transition-colors ${
                      onRowClick ? 'cursor-pointer hover:bg-slate-50' : 'hover:bg-slate-50/60'
                    }`}
                  >
                    {columns.map((col) => (
                      <td
                        key={col.key}
                        className={`px-4 py-3 align-middle ${col.cellClass || ''}`}
                      >
                        {col.render ? col.render(row) : row[col.key]}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination — totals come from the server, not from rows in hand. */}
      {totalRows > 0 && (showPageButtons || isServerDriven) && (
        <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-4 py-3">
          <p className="text-xs text-slate-500">
            Showing{' '}
            <span className="font-semibold text-slate-700">{firstRowIndex}</span> –{' '}
            <span className="font-semibold text-slate-700">{lastRowIndex}</span> of{' '}
            <span className="font-semibold text-slate-700">{totalRows}</span>
          </p>

          {isServerDriven && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => onPageChange(1)}
                disabled={currentPage === 1}
                className="rounded-lg border border-slate-300 p-1.5 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
                aria-label="First page"
              >
                <ChevronsLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => onPageChange(currentPage - 1)}
                disabled={currentPage === 1}
                className="rounded-lg border border-slate-300 p-1.5 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
                aria-label="Previous page"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>

              {pages.map((pageNumber, index) => (
                <React.Fragment key={pageNumber}>
                  {index > 0 && pageNumber - pages[index - 1] > 1 && (
                    <span className="px-1 text-xs text-slate-400">…</span>
                  )}
                  <button
                    type="button"
                    onClick={() => onPageChange(pageNumber)}
                    aria-current={currentPage === pageNumber ? 'page' : undefined}
                    className={`h-8 min-w-8 rounded-lg px-2 text-xs font-semibold transition ${
                      currentPage === pageNumber
                        ? 'bg-indigo-600 text-white'
                        : 'border border-slate-300 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {pageNumber}
                  </button>
                </React.Fragment>
              ))}

              <button
                type="button"
                onClick={() => onPageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="rounded-lg border border-slate-300 p-1.5 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
                aria-label="Next page"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => onPageChange(totalPages)}
                disabled={currentPage === totalPages}
                className="rounded-lg border border-slate-300 p-1.5 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
                aria-label="Last page"
              >
                <ChevronsRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
