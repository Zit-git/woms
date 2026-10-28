import { PICKUP_QR_PREFIX } from './reference';

// A code typed by hand is compared without caring about case or stray spaces, so what is read off a label
// or a pass works the same as what the camera decodes.
export function sameCode(a, b) {
  const x = String(a ?? '').trim().toUpperCase();
  return x !== '' && x === String(b ?? '').trim().toUpperCase();
}

// The request id a scanned Pickup Pass points at, or null when the text is not a pass
// (a Handling Unit label, a random QR, a pass with a garbled id).
export function pickupRequestIdFromPass(text) {
  const m = new RegExp(`^${PICKUP_QR_PREFIX}(\\d+)$`).exec(String(text ?? '').trim());
  return m ? m[1] : null;
}

// The outbound request a Pickup Pass points at: its QR text (WOMS-OB-<id>) or, typed by hand, the pickup
// reference printed on it (OB-2026-207030). Only requests in `requests` can match.
export function findRequestIdByPass(requests, text) {
  const id = pickupRequestIdFromPass(text);
  if (id) return id;
  return (requests || []).find((r) => sameCode(r.outbound_reference, text))?.ROWID ?? null;
}

// The open pick line a scanned Handling Unit label belongs to. A line already picked,
// or a label from another request, matches nothing.
export function findPendingPickByCode(pickTasks, code) {
  return (pickTasks || []).find((t) => sameCode(t.cargo_qr_code, code) && t.status !== 'Picked') || null;
}

// Does an inbound match what the customer quoted: its IB reference, the GRN number (GRN-<IB reference>) or the
// customer's own reference? Partial text matches, case and spaces ignored.
export function inboundMatchesQuery(advice, query) {
  const q = String(query ?? '').trim().toUpperCase().replace(/^GRN-/, '');
  if (!q) return true;
  return [advice.inbound_reference, advice.reference_number, advice.reference_client].some((v) => String(v ?? '').toUpperCase().includes(q));
}
