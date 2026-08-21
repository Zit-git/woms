// Volume in CBM = (L x W x H in cm, per outer package) / 1,000,000.
export function computeInboundSummary(advice, cargoRows) {
  cargoRows = (cargoRows || []).filter(Boolean);
  const totalOuterPackages = cargoRows.length;
  const totalInnerPieces = cargoRows.reduce((sum, c) => sum + (Number(c.qty) || 0), 0);
  const totalWeight = cargoRows.reduce((sum, c) => sum + (Number(c.weight) || 0), 0);
  const totalVolume = cargoRows.reduce((sum, c) => {
    const l = Number(c.length_cm) || 0;
    const w = Number(c.width_cm) || 0;
    const h = Number(c.height_cm) || 0;
    return sum + (l * w * h) / 1_000_000;
  }, 0);
  const pallets = cargoRows.filter((c) => (c.unit || '').toLowerCase() === 'pallet').length;

  return {
    expectedColli: advice?.expected_colli ?? 0,
    receivedPieces: totalInnerPieces,
    totalOuterPackages,
    totalWeight,
    totalVolume,
    pallets,
    items: totalOuterPackages,
  };
}
