// Display-only lifecycle for an outbound, derived from its pick lines and the
// Handling Units they point at -- the mirror of fulfillmentStatus.js for
// inbounds. Nothing here is stored, so it can't drift from the real scans.
export const OUTBOUND_FULFILLMENT_STATUSES = ['Requested', 'Partially Picked', 'Picked', 'Partially Sent', 'Sent', 'Delivered'];

const isSent = (cargoStatus) => cargoStatus === 'Dispatched' || cargoStatus === 'Delivered';

// pickRows: [{ status (pick line), cargo_status (the HU) }]
export function computeOutboundFulfillment(pickRows) {
  const rows = (pickRows || []).filter(Boolean);
  const total = rows.length;
  if (total === 0) return 'Requested';

  const sent = rows.filter((r) => isSent(r.cargo_status)).length;
  if (sent > 0) {
    if (rows.every((r) => r.cargo_status === 'Delivered')) return 'Delivered';
    return sent === total ? 'Sent' : 'Partially Sent';
  }
  const picked = rows.filter((r) => r.status === 'Picked').length;
  if (picked === total) return 'Picked';
  return picked > 0 ? 'Partially Picked' : 'Requested';
}

export function outboundStatusClass(status) {
  switch (status) {
    case 'Requested':
      return 'status-requested';
    case 'Partially Picked':
    case 'Partially Sent':
      return 'status-partial';
    case 'Picked':
      return 'status-received';
    case 'Sent':
      return 'status-sent';
    case 'Delivered':
      return 'status-completed';
    default:
      return '';
  }
}

// What can be done next on an outbound. Goods, picking and the driver check-in
// can happen in any order before dispatch; `primary` is the one still needed.
export function outboundActions(request, pickRows, dispatched) {
  const rows = (pickRows || []).filter(Boolean);
  const total = rows.length;
  const allPicked = total > 0 && rows.every((r) => r.status === 'Picked');
  const allDelivered = total > 0 && rows.every((r) => r.cargo_status === 'Delivered');
  const checkedIn = Boolean(request?.arrived_at);

  if (dispatched) {
    return { primary: allDelivered ? null : { label: 'Mark Delivered →', popup: 'deliver' }, others: [] };
  }
  let primary;
  if (total === 0) primary = { label: 'Select Goods →', popup: 'goods' };
  else if (!allPicked) primary = { label: 'Pick Goods →', popup: 'pick' };
  else if (!checkedIn) primary = { label: 'Check Driver In →', popup: 'checkin' };
  else primary = { label: 'Dispatch →', popup: 'dispatch' };

  const all = [
    { label: 'Edit Goods', popup: 'goods' },
    { label: 'Pick Goods', popup: 'pick' },
    { label: checkedIn ? 'Edit Driver Check-in' : 'Driver Check-in', popup: 'checkin' },
  ];
  return { primary, others: all.filter((a) => a.popup !== primary.popup) };
}
