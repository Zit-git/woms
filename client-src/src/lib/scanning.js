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

// What a scanned or typed code means on a pick list: a line still to pick, a line already picked, or nothing on this request.
export function pickLineForCode(pickTasks, code) {
  const task = (pickTasks || []).find((t) => sameCode(t.cargo_qr_code, code));
  if (!task) return { task: null, state: 'none' };
  return { task, state: task.status === 'Picked' ? 'picked' : 'pending' };
}

// A camera that stays open reads the same label many times a second. The gate lets a code through once, only while
// nothing else is being handled, and not again for `holdMs` (the label is still in front of the camera); another label
// goes through at once. `now` is injectable for tests.
export function createScanGate({ holdMs = 2500, now = () => Date.now() } = {}) {
  let busy = false;
  let lastCode = '';
  let lastAt = 0;
  return {
    enter(code) {
      const key = String(code ?? '').trim().toUpperCase();
      if (!key || busy) return false;
      if (key === lastCode && now() - lastAt < holdMs) return false;
      busy = true;
      lastCode = key;
      lastAt = now();
      return true;
    },
    leave() {
      busy = false;
      lastAt = now();
    },
  };
}
