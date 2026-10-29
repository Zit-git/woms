import { PAGE_SIZES } from '../lib/usePagination';

// Controls under a table: which rows are showing, previous/next, and how many per page.
// Hidden while everything fits on the smallest page, so short lists look exactly as before.
export default function Pagination({ pager }) {
  const { page, pageCount, total, from, to, pageSize, setPage, setPageSize } = pager;
  if (total <= PAGE_SIZES[0]) return null;
  return (
    <div className="pagination" role="navigation" aria-label="Pagination">
      <div className="pagination-info">
        <span className="muted small pagination-count">
          {from}–{to} of {total}
        </span>
        <label className="muted small pagination-size">
          Rows
          <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} aria-label="Rows per page">
            {PAGE_SIZES.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="pagination-controls">
        <button type="button" className="btn secondary pagination-edge" onClick={() => setPage(1)} disabled={page <= 1} aria-label="First page">
          «
        </button>
        <button type="button" className="btn secondary" onClick={() => setPage(page - 1)} disabled={page <= 1}>
          Previous
        </button>
        <span className="small pagination-page">
          Page {page} of {pageCount}
        </span>
        <button type="button" className="btn secondary" onClick={() => setPage(page + 1)} disabled={page >= pageCount}>
          Next
        </button>
        <button type="button" className="btn secondary pagination-edge" onClick={() => setPage(pageCount)} disabled={page >= pageCount} aria-label="Last page">
          »
        </button>
      </div>
    </div>
  );
}
