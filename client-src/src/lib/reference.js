// Formats a sequential-looking reference from a Catalyst ROWID, which is
// itself monotonically increasing -- avoids a separate counter/lock just to
// get "PREFIX-YEAR-000123"-style numbers.
export function formatSequentialRef(prefix, rowId, date = new Date()) {
  const year = date.getFullYear();
  const seq = String(rowId).slice(-6).padStart(6, '0');
  return `${prefix}-${year}-${seq}`;
}
