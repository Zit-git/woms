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

// A last check before Handling Units are physically stored: what is in a location right now
// (current_location_id set) really occupies it, whatever outbound is planned for it, and goods of
// two customers never share a location. `placements` is [{ cargo, locationId }]; returns readable
// messages, empty when everything may go ahead. Catches an operator's manual choice and two people
// storing into the same last position at once.
export function putawayConflicts({ placements, locations, allCargo, packageTypes, customerId }) {
  const packageTypesByName = new Map((packageTypes || []).map((p) => [p.name.trim().toLowerCase(), p]));
  const locationById = new Map((locations || []).map((l) => [String(l.ROWID), l]));
  const used = new Map();
  const owner = new Map();
  (allCargo || []).forEach((c) => {
    if (!c.current_location_id) return;
    const key = String(c.current_location_id);
    used.set(key, (used.get(key) || 0) + unitsPerItemFor(c.unit, packageTypesByName));
    if (c.customer_id && !owner.has(key)) owner.set(key, String(c.customer_id));
  });

  const messages = new Set();
  (placements || []).forEach(({ cargo, locationId }) => {
    const key = String(locationId);
    const location = locationById.get(key);
    if (!location) return;
    const code = location.location_code || key;
    if (location.occupancy_status === 'Blocked') messages.add(`${code} is blocked.`);
    const need = unitsPerItemFor(cargo.unit, packageTypesByName);
    const free = (Number(location.capacity) || 0) - (used.get(key) || 0);
    if (free < need - 1e-9) messages.add(`${code} is already full.`);
    else used.set(key, (used.get(key) || 0) + need);
    if (customerId) {
      if (owner.has(key) && owner.get(key) !== String(customerId)) messages.add(`${code} holds another customer's goods.`);
      else if (!owner.has(key)) owner.set(key, String(customerId));
    }
  });
  return [...messages];
}

// Two people can store into the last free position at the same moment, and both pass any check made
// beforehand. The database has no transactions, so the rule is applied after writing: everyone now in
// the position is listed in the order they arrived, and the new arrival keeps its place only if it still
// fits when counted after those before it (and no one before it belongs to another customer).
// `occupants` is [{ ROWID, unit, customer_id }] earliest first, and includes the new arrival.
export function claimOutcome({ cargoId, occupants, capacity, packageTypes }) {
  const packageTypesByName = new Map((packageTypes || []).map((p) => [p.name.trim().toLowerCase(), p]));
  let used = 0;
  let owner = null;
  for (const o of occupants || []) {
    const need = unitsPerItemFor(o.unit, packageTypesByName);
    if (String(o.ROWID) === String(cargoId)) {
      if (used + need > (Number(capacity) || 0) + 1e-9) return { ok: false, reason: 'full' };
      if (owner && o.customer_id && String(o.customer_id) !== owner) return { ok: false, reason: 'customer' };
      return { ok: true };
    }
    used += need;
    if (!owner && o.customer_id) owner = String(o.customer_id);
  }
  return { ok: false, reason: 'missing' };
}

// Whether a position can take these Handling Units right now, and if not why -- what the warehouse map shows
// when someone chooses a position by hand. Put-away is physical: what is in a position now occupies it.
// `cargos` are placed together, one after the other (a pallet and the boxes stored with it in one sitting),
// `otherPlacements` ([{ cargo, locationId }]) are units already chosen for positions in the same sitting, and
// `excludeCargoIds` are units that are being moved and so do not count where they stand now.
export function locationFit({ cargos, location, allCargo, packageTypes, customerId, otherPlacements = [], excludeCargoIds = [] }) {
  const packageTypesByName = new Map((packageTypes || []).map((p) => [p.name.trim().toLowerCase(), p]));
  const key = String(location.ROWID);
  if (location.occupancy_status === 'Blocked') return { ok: false, reason: 'Blocked' };

  const skip = new Set((excludeCargoIds || []).map(String));
  const occupants = (allCargo || []).filter((c) => c.current_location_id && String(c.current_location_id) === key && !skip.has(String(c.ROWID)));
  (otherPlacements || []).forEach(({ cargo, locationId }) => {
    if (String(locationId) === key && !skip.has(String(cargo.ROWID))) occupants.push(cargo);
  });

  let units = occupants.reduce((n, c) => n + unitsPerItemFor(c.unit, packageTypesByName), 0);
  let weight = occupants.reduce((n, c) => n + (Number(c.weight) || 0), 0);
  let volume = occupants.reduce((n, c) => n + volumeM3(c), 0);
  let owner = occupants.find((c) => c.customer_id)?.customer_id;
  owner = owner ? String(owner) : null;

  const capacity = Number(location.capacity) || 0;
  const maxWeight = location.max_weight_kg == null || location.max_weight_kg === '' ? null : Number(location.max_weight_kg);
  const space = volumeM3(location);
  const locationUnit = location.capacity_unit || UNGROUPED;

  for (const c of cargos || []) {
    const itemUnit = unitFor(c.unit, packageTypesByName);
    if (locationUnit !== itemUnit) return { ok: false, reason: `Counts in ${locationUnit}, this goes in ${itemUnit}` };
    if (!fitsDimensions(c, location)) return { ok: false, reason: 'Too big for this position' };
    const who = String(c.customer_id || customerId || '');
    if (owner && who && owner !== who) return { ok: false, reason: "Holds another customer's goods" };
    const need = unitsPerItemFor(c.unit, packageTypesByName);
    if (capacity - units < need - 1e-9) return { ok: false, reason: 'Full' };
    const itemWeight = Number(c.weight) || 0;
    if (maxWeight != null && maxWeight - weight < itemWeight - 1e-9) return { ok: false, reason: 'Too heavy for what is left' };
    const itemVolume = volumeM3(c);
    if (space && space - volume < itemVolume - 1e-9) return { ok: false, reason: 'Not enough room left' };
    units += need;
    weight += itemWeight;
    volume += itemVolume;
    if (!owner && who) owner = who;
  }
  return { ok: true, reason: null };
}
