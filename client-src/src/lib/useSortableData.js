import { useMemo, useState } from 'react';

// Generic client-side sort: returns the sorted array plus a getSortProps(key)
// helper for wiring a <th> up to toggle sort direction on click.
export function useSortableData(items, initialKey = null, initialDir = 'asc') {
  const [sortKey, setSortKey] = useState(initialKey);
  const [sortDir, setSortDir] = useState(initialDir);

  const sorted = useMemo(() => {
    if (!sortKey) return items;
    const copy = [...items];
    copy.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      const an = Number(av);
      const bn = Number(bv);
      const bothNumeric = !Number.isNaN(an) && !Number.isNaN(bn) && av !== '' && bv !== '';
      const cmp = bothNumeric ? an - bn : String(av).localeCompare(String(bv));
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return copy;
  }, [items, sortKey, sortDir]);

  const toggleSort = (key) => {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const arrowFor = (key) => (key !== sortKey ? '' : sortDir === 'asc' ? ' ▲' : ' ▼');

  return { sorted, sortKey, sortDir, toggleSort, arrowFor };
}
