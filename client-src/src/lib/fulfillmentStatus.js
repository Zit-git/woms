// Derives a display-only lifecycle status for an inbound from its line items
// and the Handling Units (Cargo rows) already linked to it -- nothing here is stored; it's recomputed
// from Cargo.status (Received -> Stored -> In VAL -> Dispatched -> Delivered)
// every time the list loads, so it can never drift out of sync with the
// underlying scans/dispatches that actually move cargo through the warehouse.
export const FULFILLMENT_STATUSES = [
  'Requested',
  'Partially Received',
  'Received',
  'Partially Stored',
  'Stored',
  'Partially Sent',
  'Sent',
];

const isSent = (status) => status === 'Dispatched' || status === 'Delivered';
const isStoredOrBeyond = (status) =>
  status === 'Stored' || status === 'Retrieved' || status === 'Picked' || status === 'In VAL' || isSent(status);

// lineTotals: { planned, received } summed over the inbound's line items
// (what was announced vs. what has arrived); huRows: its Handling Units
// (Cargo rows), which carry the Stored/Sent progress.
export function computeFulfillmentStatus(lineTotals, huRows) {
  const planned = Number(lineTotals?.planned) || 0;
  const received = Number(lineTotals?.received) || 0;
  const rows = (huRows || []).filter(Boolean);
  const total = rows.length;
  if (total === 0 && received === 0) return 'Requested';

  const fullyReceived = planned > 0 ? received >= planned : true;
  if (total === 0) return fullyReceived ? 'Received' : 'Partially Received';

  const sentCount = rows.filter((r) => isSent(r.status)).length;
  if (sentCount > 0) return sentCount === total && fullyReceived ? 'Sent' : 'Partially Sent';

  const storedCount = rows.filter((r) => isStoredOrBeyond(r.status)).length;
  if (storedCount > 0) return storedCount === total && fullyReceived ? 'Stored' : 'Partially Stored';

  return fullyReceived ? 'Received' : 'Partially Received';
}

export function fulfillmentStatusClass(status) {
  switch (status) {
    case 'Requested':
      return 'status-requested';
    case 'Partially Received':
    case 'Partially Stored':
    case 'Partially Sent':
      return 'status-partial';
    case 'Received':
      return 'status-received';
    case 'Stored':
      return 'status-stored';
    case 'Sent':
      return 'status-sent';
    default:
      return '';
  }
}
