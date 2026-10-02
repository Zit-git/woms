// Capacity math for the Capacity Dashboard. Takes already-fetched flat data
// (see listCapacityLocations/listCapacityCargo/listCapacityOutboundCommitments
// in lib/api.js) and computes Physical Occupancy / Pending Put-away /
// Committed / Available per warehouse x capacity_unit, plus a date-range
// availability projection.
//
// What's exact vs. estimated:
// - Total capacity, physical occupancy, pending put-away, and committed
//   counts are exact counts of real location/Cargo rows.
// - Only the *capacity_unit grouping* of committed/release cargo is an
//   estimate, since it depends on matching Cargo.unit (free text) against
//   the PackageTypes master -- an unmatched unit is grouped as "Ungrouped".
const UNGROUPED = 'Ungrouped';

function unitFor(cargoUnit, packageTypesByName) {
  const match = packageTypesByName.get((cargoUnit || '').trim().toLowerCase());
  return match?.capacity_unit || UNGROUPED;
}

// Cargo whose parent inbound has been accepted but not yet physically
// received -- capacity reserved against an arrival that hasn't happened yet.
const isCommitted = (c) => c.inbound_status === 'Confirmed';

// Cargo that has physically arrived (or has no inbound link at all, e.g.
// older data) but hasn't been shelved in a location yet.
const isPendingPutaway = (c) =>
  !c.current_location_id && (!c.inbound_status || !['Requested', 'Confirmed'].includes(c.inbound_status));

export function computeCapacity({ locations, cargoRows, outboundCommitments, packageTypes, warehouseId }) {
  const packageTypesByName = new Map((packageTypes || []).map((p) => [p.name.trim().toLowerCase(), p]));
  const locs = (locations || []).filter((l) => !warehouseId || String(l.warehouse_id) === String(warehouseId));
  const cargo = (cargoRows || []).filter((c) => !warehouseId || String(c.warehouse_id) === String(warehouseId));
  const releases = (outboundCommitments || []).filter((r) => !warehouseId || String(r.warehouse_id) === String(warehouseId));

  const occupiedLocationIds = new Set(cargo.filter((c) => c.current_location_id).map((c) => String(c.current_location_id)));

  const byUnit = new Map();
  const unitEntry = (unit) => {
    if (!byUnit.has(unit)) byUnit.set(unit, { capacityUnit: unit, total: 0, occupied: 0, committed: 0, available: 0 });
    return byUnit.get(unit);
  };

  locs.forEach((l) => {
    const unit = l.capacity_unit || UNGROUPED;
    const entry = unitEntry(unit);
    entry.total += Number(l.capacity) || 0;
    if (occupiedLocationIds.has(String(l.ROWID))) entry.occupied += 1;
  });

  const committedCargo = cargo.filter(isCommitted);
  committedCargo.forEach((c) => {
    unitEntry(unitFor(c.unit, packageTypesByName)).committed += 1;
  });

  byUnit.forEach((entry) => {
    entry.available = entry.total - entry.occupied - entry.committed;
  });

  const pendingPutaway = cargo.filter(isPendingPutaway).length;

  const expectedReleaseByUnit = new Map();
  releases.forEach((r) => {
    const unit = unitFor(r.unit, packageTypesByName);
    expectedReleaseByUnit.set(unit, (expectedReleaseByUnit.get(unit) || 0) + 1);
  });

  return {
    byCapacityUnit: [...byUnit.values()].sort((a, b) => a.capacityUnit.localeCompare(b.capacityUnit)),
    pendingPutaway,
    expectedReleaseByUnit,
    totals: [...byUnit.values()].reduce(
      (acc, e) => ({
        total: acc.total + e.total,
        occupied: acc.occupied + e.occupied,
        committed: acc.committed + e.committed,
        available: acc.available + e.available,
      }),
      { total: 0, occupied: 0, committed: 0, available: 0 }
    ),
  };
}

// Projected availability per capacity_unit for a list of dates (YYYY-MM-DD),
// relative to today's actual occupancy. Committed inbounds "arrive" (start
// consuming capacity) on their expected_date; outbound commitments "release"
// capacity on their requested_date. Both are already-accepted/committed
// records, not merely requested/submitted-for-review ones.
export function projectAvailability({ locations, cargoRows, outboundCommitments, packageTypes, warehouseId, dates }) {
  const base = computeCapacity({ locations, cargoRows, outboundCommitments: [], packageTypes, warehouseId });
  const packageTypesByName = new Map((packageTypes || []).map((p) => [p.name.trim().toLowerCase(), p]));
  const warehouseCargo = (cargoRows || []).filter((c) => !warehouseId || String(c.warehouse_id) === String(warehouseId));
  const warehouseReleases = (outboundCommitments || []).filter((r) => !warehouseId || String(r.warehouse_id) === String(warehouseId));
  const committedCargo = warehouseCargo.filter(isCommitted);

  const totalByUnit = new Map(base.byCapacityUnit.map((e) => [e.capacityUnit, e.total]));
  const occupiedByUnit = new Map(base.byCapacityUnit.map((e) => [e.capacityUnit, e.occupied]));

  return dates.map((date) => {
    const units = new Map();
    const ensure = (unit) => {
      if (!units.has(unit)) {
        units.set(unit, {
          capacityUnit: unit,
          total: totalByUnit.get(unit) || 0,
          occupied: occupiedByUnit.get(unit) || 0,
          committedByThen: 0,
          releasedByThen: 0,
        });
      }
      return units.get(unit);
    };
    [...totalByUnit.keys()].forEach(ensure);

    committedCargo
      .filter((c) => c.inbound_expected_date && c.inbound_expected_date <= date)
      .forEach((c) => (ensure(unitFor(c.unit, packageTypesByName)).committedByThen += 1));

    warehouseReleases
      .filter((r) => r.requested_date && r.requested_date <= date)
      .forEach((r) => (ensure(unitFor(r.unit, packageTypesByName)).releasedByThen += 1));

    const byCapacityUnit = [...units.values()]
      .map((u) => ({ ...u, available: u.total - u.occupied - u.committedByThen + u.releasedByThen }))
      .sort((a, b) => a.capacityUnit.localeCompare(b.capacityUnit));

    return { date, byCapacityUnit };
  });
}
