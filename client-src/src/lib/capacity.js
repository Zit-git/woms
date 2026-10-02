// Capacity math for the Capacity Dashboard. Takes already-fetched flat data
// (see listCapacityLocations/listCapacityCargo/listCapacityOutboundCommitments
// in lib/api.js) and computes Physical Occupancy / Pending Put-away /
// Committed / Available per warehouse x capacity_unit, plus a date-range
// availability projection.
//
// What's exact vs. estimated:
// - Total capacity, pending put-away, and committed/released *row counts*
//   are exact counts of real location/Cargo rows.
// - Occupied/Committed/Released capacity *amounts* depend on matching each
//   Cargo row's unit (free text) against the PackageTypes master to find how
//   many capacity units it actually consumes (units_per_item) -- an
//   unmatched unit falls back to 1 unit of "Ungrouped" capacity. This is the
//   one estimate in the engine; everything else is exact arithmetic on it.
export const UNGROUPED = 'Ungrouped';

function packageTypeFor(cargoUnit, packageTypesByName) {
  return packageTypesByName.get((cargoUnit || '').trim().toLowerCase());
}
// Exported for lib/allocation.js, which applies this same unit-matching
// logic per-location instead of warehouse-aggregate.
export function unitFor(cargoUnit, packageTypesByName) {
  return packageTypeFor(cargoUnit, packageTypesByName)?.capacity_unit || UNGROUPED;
}
export function unitsPerItemFor(cargoUnit, packageTypesByName) {
  const match = packageTypeFor(cargoUnit, packageTypesByName);
  const n = Number(match?.units_per_item);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

// Cargo whose parent inbound has been accepted but not yet physically
// received -- capacity reserved against an arrival that hasn't happened yet.
const isCommitted = (c) => c.inbound_status === 'Confirmed';

// Cargo that has physically arrived (or has no inbound link at all, e.g.
// older data) but hasn't been shelved in a location yet.
const isPendingPutaway = (c) =>
  !c.current_location_id && (!c.inbound_status || !['Requested', 'Confirmed'].includes(c.inbound_status));

// How much capacity one inbound's own cargo lines would require, grouped by
// capacity_unit -- used by the Availability Check (ConfirmPopup) to compare
// against the warehouse's current Available figures before accepting.
export function requiredCapacityByUnit(cargoRows, packageTypes) {
  const packageTypesByName = new Map((packageTypes || []).map((p) => [p.name.trim().toLowerCase(), p]));
  const byUnit = new Map();
  (cargoRows || []).forEach((c) => {
    const unit = unitFor(c.unit, packageTypesByName);
    byUnit.set(unit, (byUnit.get(unit) || 0) + unitsPerItemFor(c.unit, packageTypesByName));
  });
  return byUnit;
}

export function computeCapacity({ locations, cargoRows, outboundCommitments, packageTypes, warehouseId }) {
  const packageTypesByName = new Map((packageTypes || []).map((p) => [p.name.trim().toLowerCase(), p]));
  const locs = (locations || []).filter((l) => !warehouseId || String(l.warehouse_id) === String(warehouseId));
  const cargo = (cargoRows || []).filter((c) => !warehouseId || String(c.warehouse_id) === String(warehouseId));
  const releases = (outboundCommitments || []).filter((r) => !warehouseId || String(r.warehouse_id) === String(warehouseId));

  // Units of capacity actually consumed at each location, not just a
  // yes/no "has something in it" flag -- several Cargo rows can share one
  // location, and each row can consume more than one unit (e.g. a package
  // type with units_per_item > 1).
  const consumedUnitsByLocation = new Map();
  cargo
    .filter((c) => c.current_location_id)
    .forEach((c) => {
      const key = String(c.current_location_id);
      consumedUnitsByLocation.set(key, (consumedUnitsByLocation.get(key) || 0) + unitsPerItemFor(c.unit, packageTypesByName));
    });

  const byUnit = new Map();
  const unitEntry = (unit) => {
    if (!byUnit.has(unit)) byUnit.set(unit, { capacityUnit: unit, total: 0, occupied: 0, committed: 0, available: 0 });
    return byUnit.get(unit);
  };

  locs.forEach((l) => {
    const unit = l.capacity_unit || UNGROUPED;
    const entry = unitEntry(unit);
    entry.total += Number(l.capacity) || 0;
    entry.occupied += consumedUnitsByLocation.get(String(l.ROWID)) || 0;
  });

  const committedCargo = cargo.filter(isCommitted);
  committedCargo.forEach((c) => {
    unitEntry(unitFor(c.unit, packageTypesByName)).committed += unitsPerItemFor(c.unit, packageTypesByName);
  });

  byUnit.forEach((entry) => {
    entry.available = entry.total - entry.occupied - entry.committed;
  });

  const pendingPutaway = cargo.filter(isPendingPutaway).length;

  const expectedReleaseByUnit = new Map();
  releases.forEach((r) => {
    const unit = unitFor(r.unit, packageTypesByName);
    expectedReleaseByUnit.set(unit, (expectedReleaseByUnit.get(unit) || 0) + unitsPerItemFor(r.unit, packageTypesByName));
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
      .forEach((c) => (ensure(unitFor(c.unit, packageTypesByName)).committedByThen += unitsPerItemFor(c.unit, packageTypesByName)));

    warehouseReleases
      .filter((r) => r.requested_date && r.requested_date <= date)
      .forEach((r) => (ensure(unitFor(r.unit, packageTypesByName)).releasedByThen += unitsPerItemFor(r.unit, packageTypesByName)));

    const byCapacityUnit = [...units.values()]
      .map((u) => ({ ...u, available: u.total - u.occupied - u.committedByThen + u.releasedByThen }))
      .sort((a, b) => a.capacityUnit.localeCompare(b.capacityUnit));

    return { date, byCapacityUnit };
  });
}
