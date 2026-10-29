import { useEffect, useState } from 'react';

export const PAGE_SIZES = [10, 25, 50, 100];

// The slice of `rows` for the page being viewed. The page number is kept inside the real range and
// goes back to the first page when the number of rows changes (a new filter or search), so nobody is
// left looking at an empty page 7 of a list that now has two pages.
export function sliceRows(rows, page, pageSize) {
  const total = rows.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(Math.max(1, page), pageCount);
  const start = (current - 1) * pageSize;
  return { pageRows: rows.slice(start, start + pageSize), page: current, pageCount, total, from: total ? start + 1 : 0, to: Math.min(total, start + pageSize) };
}

export function usePagination(allRows, initialSize = 25) {
  const rows = allRows || [];
  const [page, setPage] = useState(1);
  const [pageSize, setPageSizeState] = useState(initialSize);
  const total = rows.length;

  useEffect(() => setPage(1), [total]);

  const setPageSize = (n) => {
    setPageSizeState(n);
    setPage(1);
  };

  return { ...sliceRows(rows, page, pageSize), pageSize, setPage, setPageSize };
}
