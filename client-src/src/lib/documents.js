// The Goods Issue Note (GIN) is the outbound counterpart of the Goods Receipt Note: the document that says which
// Handling Units left the warehouse, for whom, with which driver and vehicle. Its number is the pickup reference
// with a prefix (GRN-IB-2026-243231 for an inbound, GIN-OB-2026-207030 for an outbound), so it needs no record of
// its own: the note exists as soon as the outbound is dispatched, and shows "Draft" before that.
export function ginNumber(outboundReference) {
  return outboundReference ? `GIN-${outboundReference}` : '';
}

export function ginStatus(dispatched) {
  return dispatched ? 'Issued' : 'Draft (not dispatched yet)';
}
