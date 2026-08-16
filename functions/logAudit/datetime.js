// Catalyst datetime columns expect "YYYY-MM-DD HH:mm:ss" on insert/update
// (no milliseconds -- the ":SSS" suffix seen on CREATEDTIME/MODIFIEDTIME is
// output-only and rejected as input).
function formatDatetime(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  );
}

module.exports = { formatDatetime };
