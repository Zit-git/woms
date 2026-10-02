// Capacity math for the Availability tab (Warehouse Management). Takes
// already-fetched flat data (see listCapacityLocations/listCapacityCargo/
// listCapacityOutboundCommitments in lib/api.js) and computes Physical
// Occupancy / Pending Put-away / Committed / Available / Unclaimed, plus
// Weight and Space, per warehouse x capacity_unit.
//
// Capacity (a location's configured capacity/dimensions/weight) is static
// setup; Availability is the live, time-dependent state computed from it.
// computeCapacity takes an optional `asOfDate` so "Today" and "a future
// date" run through the exact same math instead of two separate code paths
// that could drift apart -- omit it for the real, ground-truth current state;
// pass a date to simulate that same snapshot at a future point: a committed
// (Confirmed) item "arrives" (starts occupying its reserved location) on its
// expected_date, and a physically-occupied item "departs" (stops occupying)
// on its scheduled dispatch date, if either falls on or before asOfDate.
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

const isCommittedStatus = (c) => c.inbound_status === 'Confirmed';

// Cargo that has physically arrived (or has no inbound link at all, e.g.
// older data) but hasn't been shelved in a location yet. Always "today's"
// real backlog -- not projected forward, since whether it's still pending at
// a future date depends on warehouse staff actually doing the put-away, not
// a scheduled event like an arrival or dispatch.
const isPendingPutaway = (c) =>
  !c.current_location_id && (!c.inbound_status || !['Requested', 'Confirmed'].includes(c.inbound_status));

// Classifies one cargo row as of `asOfDate` (or the real current DB state
// when omitted): where does it effectively sit, is it occupying that spot,
// and is it still just "committed" (reserved, not yet arrived)?
function classifyCargo(c, requestedDateByCargoId, asOfDate) {
  if (!asOfDate) {
    return { effectiveLocationId: c.current_location_id || null, isOccupied: Boolean(c.current_location_id), isCommitted: isCommittedStatus(c) };
  }
  if (c.current_location_id) {
    const scheduled = requestedDateByCargoId.get(String(c.ROWID));
    const departed = Boolean(scheduled && scheduled <= asOfDate);
    return { effectiveLocationId: departed ? null : c.current_location_id, isOccupied: !departed, isCommitted: false };
  }
  if (isCommittedStatus(c) && c.reserved_location_id && c.inbound_expected_date && c.inbound_expected_date <= asOfDate) {
    return { effectiveLocationId: c.reserved_location_id, isOccupied: true, isCommitted: false };
  }
  return { effectiveLocationId: null, isOccupied: false, isCommitted: isCommittedStatus(c) };
}

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

export function computeCapacity({ locations, cargoRows, outboundCommitments, packageTypes, warehouseId, asOfDate }) {
  const packageTypesByName = new Map((packageTypes || []).map((p) => [p.name.trim().toLowerCase(), p]));
  const locs = (locations || []).filter((l) => !warehouseId || String(l.warehouse_id) === String(warehouseId));
  const cargo = (cargoRows || []).filter((c) => !warehouseId || String(c.warehouse_id) === String(warehouseId));
  const releases = (outboundCommitments || []).filter((r) => !warehouseId || String(r.warehouse_id) === String(warehouseId));

  const requestedDateByCargoId = new Map(releases.filter((r) => r.requested_date).map((r) => [String(r.cargo_id), r.requested_date]));
  const classified = cargo.map((c) => ({ c, ...classifyCargo(c, requestedDateByCargoId, asOfDate) }));

  // Units of capacity actually consumed at each location, not just a
  // yes/no "has something in it" flag -- several Cargo rows can share one
  // location, and each row can consume more than one unit (e.g. a package
  // type with units_per_item > 1).
  const consumedUnitsByLocation = new Map();
  classified
    .filter((x) => x.isOccupied)
    .forEach(({ c, effectiveLocationId }) => {
      const key = String(effectiveLocationId);
      consumedUnitsByLocation.set(key, (consumedUnitsByLocation.get(key) || 0) + unitsPerItemFor(c.unit, packageTypesByName));
    });

  // Which customer (if any) already dedicates a location -- lib/allocation.js
  // enforces that once a location holds (or is reserved for) one customer's
  // cargo, no other customer's request can use the rest of it, even with
  // room left. "Unclaimed" below reflects that: a location with headroom but
  // already dedicated to someone isn't really available to a new customer.
  const customerByLocation = new Map();
  classified.forEach(({ c, effectiveLocationId }) => {
    if (effectiveLocationId && c.customer_id && !customerByLocation.has(String(effectiveLocationId))) {
      customerByLocation.set(String(effectiveLocationId), String(c.customer_id));
    }
  });

  const byUnit = new Map();
  const unitEntry = (unit) => {
    if (!byUnit.has(unit)) byUnit.set(unit, { capacityUnit: unit, total: 0, occupied: 0, committed: 0, available: 0, unclaimedTotal: 0, unclaimedAvailable: 0 });
    return byUnit.get(unit);
  };

  locs.forEach((l) => {
    const unit = l.capacity_unit || UNGROUPED;
    const entry = unitEntry(unit);
    const cap = Number(l.capacity) || 0;
    const consumed = consumedUnitsByLocation.get(String(l.ROWID)) || 0;
    entry.total += cap;
    entry.occupied += consumed;
    if (!customerByLocation.has(String(l.ROWID))) {
      entry.unclaimedTotal += cap;
      entry.unclaimedAvailable += cap - consumed;
    }
  });

  const committedCargo = classified.filter((x) => x.isCommitted);
  committedCargo.forEach(({ c }) => {
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

  const occupiedEntries = classified.filter((x) => x.isOccupied);
  const weightOccupied = occupiedEntries
    .filter((x) => weightLocationIds.has(String(x.effectiveLocationId)))
    .reduce((sum, x) => sum + (Number(x.c.weight) || 0), 0);
  const spaceOccupied = occupiedEntries
    .filter((x) => spaceLocationIds.has(String(x.effectiveLocationId)))
    .reduce((sum, x) => sum + volumeM3(x.c), 0);

  const weightCommitted = committedCargo.reduce((sum, x) => sum + (Number(x.c.weight) || 0), 0);
  const spaceCommitted = committedCargo.reduce((sum, x) => sum + volumeM3(x.c), 0);

  const weight = { total: weightTotal, occupied: weightOccupied, committed: weightCommitted, available: weightTotal - weightOccupied - weightCommitted };
  const space = { total: spaceTotal, occupied: spaceOccupied, committed: spaceCommitted, available: spaceTotal - spaceOccupied - spaceCommitted };

  const pendingPutaway = cargo.filter(isPendingPutaway).length;

  // Informational only (not part of the Available math above, which already
  // reflects departures via classifyCargo): how much is still scheduled to
  // leave after this snapshot date.
  const expectedReleaseByUnit = new Map();
  releases
    .filter((r) => !asOfDate || !r.requested_date || r.requested_date > asOfDate)
    .forEach((r) => {
      const unit = unitFor(r.unit, packageTypesByName);
      expectedReleaseByUnit.set(unit, (expectedReleaseByUnit.get(unit) || 0) + unitsPerItemFor(r.unit, packageTypesByName));
    });

  return {
    asOfDate: asOfDate || null,
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
        unclaimedTotal: acc.unclaimedTotal + e.unclaimedTotal,
        unclaimedAvailable: acc.unclaimedAvailable + e.unclaimedAvailable,
      }),
      { total: 0, occupied: 0, committed: 0, available: 0, unclaimedTotal: 0, unclaimedAvailable: 0 }
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

// One full computeCapacity snapshot per date -- Today and every future date
// in `dates` all run through the exact same function, just simulated
// forward in time (see classifyCargo). This is the single source of truth
// behind the Availability tab's time selector: pick "Today" or a date range
// and every figure (capacity units, Weight, Space, Unclaimed) updates
// together, instead of only a capacity-unit-only table doing so.
export function projectAvailability({ locations, cargoRows, outboundCommitments, packageTypes, warehouseId, dates }) {
  return (dates || []).map((date) => ({ date, ...computeCapacity({ locations, cargoRows, outboundCommitments, packageTypes, warehouseId, asOfDate: date }) }));
}
