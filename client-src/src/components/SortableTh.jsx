export default function SortableTh({ label, sortKey, onSort, arrowFor, ...rest }) {
  return (
    <th className="sortable-th" onClick={() => onSort(sortKey)} {...rest}>
      {label}
      {arrowFor(sortKey)}
    </th>
  );
}
