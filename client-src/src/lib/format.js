// How numbers are shown. Decimal values always have exactly two digits, rounded (not cut off).
//   fixed2   always two decimals: computed figures (totals, availability, volume) so a column lines up
//   decimal2 two decimals only when there is a fractional part: entered values (a weight of 228 stays 228,
//            12.5 becomes 12.50) and small ratios (0.1 becomes 0.10)
// Whole-number counts (pieces, colli, pallets) are not passed through either and stay whole.

// Rounds half away from zero at two decimals, correcting binary noise (1.005 is stored as 1.00499...).
export function round2(n) {
  const sign = n < 0 ? -1 : 1;
  const r = (Math.round((Math.abs(n) + Number.EPSILON) * 100) / 100) * sign;
  return r === 0 ? 0 : r; // never "-0.00"
}

const asNumber = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : NaN;
};

export function fixed2(value, empty = '—') {
  const n = asNumber(value);
  if (n === null) return empty;
  if (Number.isNaN(n)) return String(value);
  return round2(n).toFixed(2);
}

export function decimal2(value, empty = '—') {
  const n = asNumber(value);
  if (n === null) return empty;
  if (Number.isNaN(n)) return String(value);
  // a value that is whole (allowing for binary noise like 7.000000000000001) stays whole
  if (Math.abs(n - Math.round(n)) < 1e-9) return String(Math.round(n));
  return round2(n).toFixed(2);
}
