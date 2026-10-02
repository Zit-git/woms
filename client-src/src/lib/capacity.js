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

// Real volume in m3, derived straight from L x W x H (cm) -- 0 if any
// dimension is missing, so callers can skip undimensioned rows rather than
// guessing. This is independent of the capacity_unit/units_per_item system:
// it reflects actual recorded dimensions, not a manually-picked count.
export function volumeM3(row) {
  const l = Number(row?.length_cm);
  const w = Number(row?.width_cm);
  const h = Number(row?.height_cm);
  if (!l || !w || !h) return 0;
  return (l * w * h) / 1_000_000;
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

  // Weight and Space are tracked independently of the capacity_unit/
  // units_per_item system -- real numbers (kg, m3) derived straight from
  // max_weight_kg and L x W x H, not a manually-picked count. Only
  // locations that actually have the relevant figure set contribute (a
  // location with no max_weight_kg recorded isn't part of the weight
  // budget; one is in the m3 scope only once all three dims are set).
  const weightLocationIds = new Set(locs.filter((l) => l.max_weight_kg !== null && l.max_weight_kg !== undefined && l.max_weight_kg !== '').map((l) => String(l.ROWID)));
  const spaceLocationIds = new Set(locs.filter((l) => volumeM3(l) > 0).map((l) => String(l.ROWID)));

  const weightTotal = locs.reduce((sum, l) => sum + (weightLocationIds.has(String(l.ROWID)) ? Number(l.max_weight_kg) || 0 : 0), 0);
  const spaceTotal = locs.reduce((sum, l) => sum + volumeM3(l), 0);

  const occupiedCargo = cargo.filter((c) => c.current_location_id);
  const weightOccupied = occupiedCargo
    .filter((c) => weightLocationIds.has(String(c.current_location_id)))
    .reduce((sum, c) => sum + (Number(c.weight) || 0), 0);
  const spaceOccupied = occupiedCargo
    .filter((c) => spaceLocationIds.has(String(c.current_location_id)))
    .reduce((sum, c) => sum + volumeM3(c), 0);

  const weightCommitted = committedCargo.reduce((sum, c) => sum + (Number(c.weight) || 0), 0);
  const spaceCommitted = committedCargo.reduce((sum, c) => sum + volumeM3(c), 0);

  const weight = { total: weightTotal, occupied: weightOccupied, committed: weightCommitted, available: weightTotal - weightOccupied - weightCommitted };
  const space = { total: spaceTotal, occupied: spaceOccupied, committed: spaceCommitted, available: spaceTotal - spaceOccupied - spaceCommitted };

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
    weight,
    space,
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

// How much weight (kg) and space (m3) one inbound's own cargo lines would
// require -- the size/dimensions/weight side of the Availability Check,
// alongside the existing capacity_unit comparison.
export function requiredWeightAndSpace(cargoRows) {
  return (cargoRows || []).reduce(
    (acc, c) => ({ weight: acc.weight + (Number(c.weight) || 0), spaceM3: acc.spaceM3 + volumeM3(c) }),
    { weight: 0, spaceM3: 0 }
  );
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
