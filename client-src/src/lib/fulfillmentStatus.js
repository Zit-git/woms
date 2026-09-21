// Derives a display-only lifecycle status for an inbound from the Cargo
// lines already linked to it -- nothing here is stored; it's recomputed
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

export function computeFulfillmentStatus(expectedColli, cargoRows) {
  const rows = (cargoRows || []).filter(Boolean);
  const total = rows.length;
  if (total === 0) return 'Requested';

  const expected = Number(expectedColli) || 0;
  const fullyReceived = expected > 0 ? total >= expected : true;

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
