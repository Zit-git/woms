// Summary of one inbound. Line items are the plan (N packages of a type, with
// per-package weight/dimensions); Handling Units are the physical result of
// receiving. Volume in CBM = (L x W x H in cm, per package) / 1,000,000.
export function computeInboundSummary(advice, lines, hus) {
  lines = (lines || []).filter(Boolean);
  hus = (hus || []).filter(Boolean);
  const qtyOf = (l) => Number(l.qty) || 0;
  const volumeOf = (l) => ((Number(l.length_cm) || 0) * (Number(l.width_cm) || 0) * (Number(l.height_cm) || 0)) / 1_000_000;

  const totalOuterPackages = lines.reduce((sum, l) => sum + qtyOf(l), 0);
  const receivedPieces = lines.reduce((sum, l) => sum + (Number(l.received_qty) || 0), 0);
  const totalWeight = lines.reduce((sum, l) => sum + (Number(l.weight) || 0) * qtyOf(l), 0);
  const totalVolume = lines.reduce((sum, l) => sum + volumeOf(l) * qtyOf(l), 0);
  const pallets = lines.filter((l) => (l.unit || '').toLowerCase() === 'pallet').reduce((sum, l) => sum + qtyOf(l), 0);

  return {
    expectedColli: advice?.expected_colli ?? 0,
    receivedPieces,
    totalOuterPackages,
    totalWeight,
    totalVolume,
    pallets,
    items: lines.length,
    handlingUnits: hus.length,
  };
}
