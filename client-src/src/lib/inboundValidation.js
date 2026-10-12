import { todayStr } from './dates';

// Date rules for an inbound request:
//  - the expected arrival can't be in the past (new requests only);
//  - goods can't be in storage before they arrive, so the storage period
//    starts on or after the arrival date (or today, if no arrival is set);
//  - the storage period can't end before it starts.
// Returns { field: message } for each broken rule.
export function validateRequestDates({ expected_date, storage_start_date, storage_end_date }, { allowPast = false } = {}) {
  const errors = {};
  const today = todayStr();
  if (expected_date && !allowPast && expected_date < today) {
    errors.expected_date = 'Expected arrival cannot be in the past.';
  }
  if (storage_start_date) {
    const earliest = expected_date && (allowPast || expected_date >= today) ? expected_date : allowPast ? null : today;
    if (earliest && storage_start_date < earliest) {
      errors.storage_start_date = expected_date
        ? 'Storage cannot start before the expected arrival date.'
        : 'Storage cannot start in the past.';
    }
  }
  if (storage_end_date && storage_start_date && storage_end_date < storage_start_date) {
    errors.storage_end_date = 'Storage period cannot end before it starts.';
  }
  return errors;
}

// Expected Colli is the number of outer packages announced for the whole
// inbound; it must equal the sum of the line items' package quantities.
export function totalPackages(lines) {
  return (lines || []).reduce((sum, l) => sum + (Number(l.qty) || 0), 0);
}
export function colliMismatch(expectedColli, lines) {
  if (expectedColli === null || expectedColli === undefined || expectedColli === '') return null;
  const total = totalPackages(lines);
  return Number(expectedColli) === total ? null : `Expected Colli is ${Number(expectedColli)}, but the line items add up to ${total} package${total === 1 ? '' : 's'}.`;
}
