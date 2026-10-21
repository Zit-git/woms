import { PICKUP_QR_PREFIX } from './reference';

// The request id a scanned Pickup Pass points at, or null when the text is not a pass
// (a Handling Unit label, a random QR, a pass with a garbled id).
export function pickupRequestIdFromPass(text) {
  const m = new RegExp(`^${PICKUP_QR_PREFIX}(\\d+)$`).exec(String(text ?? '').trim());
  return m ? m[1] : null;
}

// The open pick line a scanned Handling Unit label belongs to. A line already picked,
// or a label from another request, matches nothing.
export function findPendingPickByCode(pickTasks, code) {
  const wanted = String(code ?? '').trim();
  if (!wanted) return null;
  return (pickTasks || []).find((t) => t.cargo_qr_code === wanted && t.status !== 'Picked') || null;
}
