// Greedy size/weight-aware location allocation for the Availability Check.
// Reuses the same flat data (listCapacityLocations/listCapacityCargo/
// listCapacityOutboundCommitments) and unit-matching helpers the Capacity
// Dashboard already relies on (see lib/capacity.js) -- this is a more
// granular, per-location application of the same accounting, not a parallel
// system.
//
// Deliberately not true 3D bin-packing: a location's declared dimensions are
// a per-item fit check (does this one item's box fit inside this location's
// box, in any axis order), and its `capacity` count is how many such items
// it can simultaneously hold -- the same pragmatic "good enough" modeling
// `units_per_item` already uses elsewhere in this engine. max_weight_kg is
// treated as a per-item limit, not a summed total.
import { unitFor, unitsPerItemFor, UNGROUPED } from './capacity';

function fitsDimensions(item, location) {
  const dims = [location.length_cm, location.width_cm, location.height_cm];
  if (dims.some((d) => d === null || d === undefined || d === '')) return true; // no location dims recorded -- don't block on missing data
  const itemDims = [Number(item.length_cm) || 0, Number(item.width_cm) || 0, Number(item.height_cm) || 0];
  if (itemDims.every((d) => !d)) return true; // no item dims recorded either -- nothing to check
  const locSorted = dims.map(Number).sort((a, b) => a - b);
  const itemSorted = itemDims.sort((a, b) => a - b);
  return itemSorted.every((d, i) => d <= locSorted[i]);
}

function fitsWeight(item, location) {
  if (location.max_weight_kg === null || location.max_weight_kg === undefined || location.max_weight_kg === '') return true;
  const w = Number(item.weight);
  if (!w) return true;
  return w <= Number(location.max_weight_kg);
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

export function allocateLocations({ cargoRows, locations, allCargo, outboundCommitments, storageStart, storageEnd, excludeAdviceId, packageTypes }) {
  const packageTypesByName = new Map((packageTypes || []).map((p) => [p.name.trim().toLowerCase(), p]));
  const requestedDateByCargoId = new Map(
    (outboundCommitments || []).filter((r) => r.requested_date).map((r) => [String(r.cargo_id), r.requested_date])
  );

  // Free capacity per location right now, for the requested period -- starts
  // from each location's total capacity and subtracts whatever already
  // consumes it during that window.
  const freeByLocation = new Map((locations || []).map((l) => [String(l.ROWID), Number(l.capacity) || 0]));

  (allCargo || []).forEach((c) => {
    const units = unitsPerItemFor(c.unit, packageTypesByName);
    if (c.current_location_id && stillBlocking(c, requestedDateByCargoId, storageStart)) {
      const key = String(c.current_location_id);
      if (freeByLocation.has(key)) freeByLocation.set(key, freeByLocation.get(key) - units);
    } else if (
      c.reserved_location_id &&
      !c.current_location_id &&
      String(c.inbound_advice_id) !== String(excludeAdviceId) &&
      periodsOverlap(storageStart, storageEnd, c.storage_start_date, c.storage_end_date)
    ) {
      const key = String(c.reserved_location_id);
      if (freeByLocation.has(key)) freeByLocation.set(key, freeByLocation.get(key) - units);
    }
  });

  const locationsById = new Map((locations || []).map((l) => [String(l.ROWID), l]));
  const results = [];

  (cargoRows || []).forEach((item) => {
    const itemUnits = unitsPerItemFor(item.unit, packageTypesByName);
    const itemCapacityUnit = unitFor(item.unit, packageTypesByName);
    const candidate = (locations || []).find((l) => {
      if (l.occupancy_status === 'Blocked') return false;
      if ((l.capacity_unit || UNGROUPED) !== itemCapacityUnit) return false;
      if (!fitsDimensions(item, l)) return false;
      if (!fitsWeight(item, l)) return false;
      return (freeByLocation.get(String(l.ROWID)) || 0) >= itemUnits;
    });

    if (candidate) {
      freeByLocation.set(String(candidate.ROWID), freeByLocation.get(String(candidate.ROWID)) - itemUnits);
      results.push({ cargoId: item.ROWID, locationId: candidate.ROWID, locationCode: candidate.location_code });
    } else {
      results.push({ cargoId: item.ROWID, locationId: null, locationCode: null });
    }
  });

  return results;
}
