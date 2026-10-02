// Greedy size/weight-aware location allocation for the Availability Check.
// Reuses the same flat data (listCapacityLocations/listCapacityCargo/
// listCapacityOutboundCommitments) and unit-matching helpers the Capacity
// Dashboard already relies on (see lib/capacity.js) -- this is a more
// granular, per-location application of the same accounting, not a parallel
// system.
//
// Deliberately not true 3D bin-packing: a location's declared dimensions are
// a per-item fit check (does this one item's box fit inside this location's
// box, in any axis order) separate from the cumulative weight/volume budgets
// tracked below, and its `capacity` count is how many such items it can
// simultaneously hold -- the same pragmatic "good enough" modeling
// `units_per_item` already uses elsewhere in this engine.
//
// Locations are customer-dedicated: once a location holds (or is reserved
// for) one customer's cargo, it's excluded from allocation for any other
// customer until completely empty -- matches how contract 3PL warehouses
// actually run (traceability, pick accuracy, contract terms), not a shared
// bulk-storage model.
import { unitFor, unitsPerItemFor, UNGROUPED, volumeM3 } from './capacity';

function fitsDimensions(item, location) {
  const dims = [location.length_cm, location.width_cm, location.height_cm];
  if (dims.some((d) => d === null || d === undefined || d === '')) return true; // no location dims recorded -- don't block on missing data
  const itemDims = [Number(item.length_cm) || 0, Number(item.width_cm) || 0, Number(item.height_cm) || 0];
  if (itemDims.every((d) => !d)) return true; // no item dims recorded either -- nothing to check
  const locSorted = dims.map(Number).sort((a, b) => a - b);
  const itemSorted = itemDims.sort((a, b) => a - b);
  return itemSorted.every((d, i) => d <= locSorted[i]);
}

function periodsOverlap(aStart, aEnd, bStart, bEnd) {
  // A missing end date means "open-ended" -- treat as extending indefinitely.
  if (aEnd && bStart && aEnd < bStart) return false;
  if (bEnd && aStart && bEnd < aStart) return false;
  return true;
}

// For dispatch-date awareness: a currently-occupied unit whose linked
// OutboundRequest has a scheduled requested_date on/before the new request's
// storageStart is expected to clear in time, so it shouldn't block.
function stillBlocking(cargoRow, requestedDateByCargoId, storageStart) {
  const scheduled = requestedDateByCargoId.get(String(cargoRow.ROWID));
  if (!scheduled) return true; // no known dispatch date yet -- conservative
  return !(storageStart && scheduled <= storageStart);
}

// Whether a cargo row counts as currently consuming its location/reservation
// for the purposes of this allocation run (same inclusion rule used for all
// three tracked resources: units, weight, volume, and customer ownership).
function occupiesForThisWindow(c, requestedDateByCargoId, storageStart, storageEnd, excludeAdviceId) {
  if (c.current_location_id) return stillBlocking(c, requestedDateByCargoId, storageStart) ? c.current_location_id : null;
  if (
    c.reserved_location_id &&
    String(c.inbound_advice_id) !== String(excludeAdviceId) &&
    periodsOverlap(storageStart, storageEnd, c.storage_start_date, c.storage_end_date)
  ) {
    return c.reserved_location_id;
  }
  return null;
}

export function allocateLocations({ cargoRows, locations, allCargo, outboundCommitments, storageStart, storageEnd, excludeAdviceId, customerId, packageTypes }) {
  const packageTypesByName = new Map((packageTypes || []).map((p) => [p.name.trim().toLowerCase(), p]));
  const requestedDateByCargoId = new Map(
    (outboundCommitments || []).filter((r) => r.requested_date).map((r) => [String(r.cargo_id), r.requested_date])
  );

  // Free units/weight/volume per location for the requested period, plus
  // which customer (if any) already occupies it -- starts from each
  // location's totals and subtracts whatever already consumes them.
  const freeUnitsByLocation = new Map((locations || []).map((l) => [String(l.ROWID), Number(l.capacity) || 0]));
  const freeWeightByLocation = new Map((locations || []).map((l) => [String(l.ROWID), l.max_weight_kg == null || l.max_weight_kg === '' ? null : Number(l.max_weight_kg)]));
  const freeVolumeByLocation = new Map((locations || []).map((l) => [String(l.ROWID), volumeM3(l) || null]));
  const customerByLocation = new Map();

  (allCargo || []).forEach((c) => {
    const locId = occupiesForThisWindow(c, requestedDateByCargoId, storageStart, storageEnd, excludeAdviceId);
    if (!locId) return;
    const key = String(locId);
    const units = unitsPerItemFor(c.unit, packageTypesByName);
    if (freeUnitsByLocation.has(key)) freeUnitsByLocation.set(key, freeUnitsByLocation.get(key) - units);
    if (freeWeightByLocation.get(key) != null) freeWeightByLocation.set(key, freeWeightByLocation.get(key) - (Number(c.weight) || 0));
    if (freeVolumeByLocation.get(key) != null) freeVolumeByLocation.set(key, freeVolumeByLocation.get(key) - volumeM3(c));
    if (c.customer_id && !customerByLocation.has(key)) customerByLocation.set(key, String(c.customer_id));
  });

  const results = [];

  (cargoRows || []).forEach((item) => {
    const itemUnits = unitsPerItemFor(item.unit, packageTypesByName);
    const itemVolume = volumeM3(item);
    const itemWeight = Number(item.weight) || 0;
    const itemCapacityUnit = unitFor(item.unit, packageTypesByName);

    const candidate = (locations || []).find((l) => {
      const key = String(l.ROWID);
      if (l.occupancy_status === 'Blocked') return false;
      if ((l.capacity_unit || UNGROUPED) !== itemCapacityUnit) return false;
      if (!fitsDimensions(item, l)) return false;
      const dedicatedTo = customerByLocation.get(key);
      if (dedicatedTo && customerId && dedicatedTo !== String(customerId)) return false;
      if ((freeUnitsByLocation.get(key) || 0) < itemUnits) return false;
      const freeWeight = freeWeightByLocation.get(key);
      if (freeWeight != null && freeWeight < itemWeight) return false;
      const freeVolume = freeVolumeByLocation.get(key);
      if (freeVolume != null && freeVolume < itemVolume) return false;
      return true;
    });

    if (candidate) {
      const key = String(candidate.ROWID);
      freeUnitsByLocation.set(key, freeUnitsByLocation.get(key) - itemUnits);
      if (freeWeightByLocation.get(key) != null) freeWeightByLocation.set(key, freeWeightByLocation.get(key) - itemWeight);
      if (freeVolumeByLocation.get(key) != null) freeVolumeByLocation.set(key, freeVolumeByLocation.get(key) - itemVolume);
      if (customerId && !customerByLocation.has(key)) customerByLocation.set(key, String(customerId));
      results.push({ cargoId: item.ROWID, locationId: candidate.ROWID, locationCode: candidate.location_code });
    } else {
      results.push({ cargoId: item.ROWID, locationId: null, locationCode: null });
    }
  });

  return results;
}

// Runs allocateLocations once per warehouse and ranks them by how much of
// the request it could actually fit -- the "which warehouse should this go
// to" recommendation, not just "does the one already picked have room."
export function recommendWarehouses({ warehouses, cargoRows, allLocations, allCargo, outboundCommitments, storageStart, storageEnd, excludeAdviceId, customerId, packageTypes }) {
  const total = (cargoRows || []).length;
  const results = (warehouses || []).map((warehouse) => {
    const locationsInWarehouse = (allLocations || []).filter((l) => String(l.warehouse_id) === String(warehouse.ROWID));
    const allocation = allocateLocations({
      cargoRows,
      locations: locationsInWarehouse,
      allCargo,
      outboundCommitments,
      storageStart,
      storageEnd,
      excludeAdviceId,
      customerId,
      packageTypes,
    });
    const fitCount = allocation.filter((a) => a.locationId).length;
    return { warehouse, allocation, fitCount, total };
  });
  return results.sort((a, b) => b.fitCount - a.fitCount);
}
