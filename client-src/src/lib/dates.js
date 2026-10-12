// Calendar-date helpers working on "YYYY-MM-DD" strings. Everything is done
// in UTC so results don't shift with the viewer's timezone: building a local
// midnight and reading it back with toISOString() lands on the previous day
// in any timezone ahead of UTC (e.g. India), which made "add 1 day" return
// the same date.
export const todayStr = () => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; // the viewer's local calendar day
};

export function addDays(dateStr, n) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
