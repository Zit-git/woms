import { addRow, updateRow, deleteRow, getAllRows, zcql, callFunction, cachedFetch } from './catalystClient';
import { formatSequentialRef } from './reference';
import { expandLines } from './capacity';
import { claimOutcome } from './allocation';

const TABLES = {
  CUSTOMERS: 'Customers',
  WAREHOUSES: 'Warehouses',
  ZONES: 'Zones',
  AISLES: 'Aisles',
  RACKS: 'Racks',
  STORAGE_LOCATIONS: 'StorageLocations',
  PACKAGE_TYPES: 'PackageTypes',
  INBOUND_ADVICE: 'InboundAdvice',
  CARGO: 'Cargo',
  INBOUND_LINE: 'InboundLine',
  HU_LINE: 'HuLine',
  APP_USERS: 'AppUsers',
  OUTBOUND_REQUEST: 'OutboundRequest',
  PICK_TASK: 'PickTask',
  DISPATCH: 'Dispatch',
  TASKS: 'Tasks',
  VAL_REQUEST: 'VALRequest',
  VAL_TASK: 'VALTask',
  TRANSPORTERS: 'Transporters',
  CONTACTS: 'Contacts',
  SUPPLIERS: 'Suppliers',
  SCAN_HISTORY: 'ScanHistory',
  CARGO_MOVEMENT_LOG: 'CargoMovementLog',
  AUDIT_LOG: 'AuditLog',
};

// Cargo lifecycle: Received -> Stored <-> Retrieved -> Picked -> Dispatched -> Delivered.
// Dispatched/Delivered cargo has left the building; everything else is still
// physically in the warehouse (in a rack, on the floor, or staged for an order).
const GONE_SQL = "status != 'Dispatched' AND status != 'Delivered'";
const goneSql = (alias) => `${alias}.status != 'Dispatched' AND ${alias}.status != 'Delivered'`;

// Warehouse-scoped visibility. System Administrators see everything; every
// other user sees only the warehouses they are assigned to, with their role
// in each: Managers/Supervisors see all of that warehouse's records,
// Operators only the records assigned to them there. A non-admin with no
// assignment sees nothing (fails closed). Returns a " AND ..." fragment to
// append to a WHERE clause, or '' for unrestricted.
const idOnly = (v) => String(v).replace(/\D/g, '');
const sqlText = (v) => String(v).replace(/'/g, "''");
export function visibilityClause(viewer, { warehouseCol, assignedCol } = {}) {
  const active = viewer?.activeWarehouseId ? idOnly(viewer.activeWarehouseId) : '';
  if (viewer?.isAdmin) return active && warehouseCol ? ` AND ${warehouseCol} = ${active}` : '';
  const parts = (viewer?.assignments || [])
    .filter((a) => !active || idOnly(a.warehouseId) === active)
    .map((a) => {
      const inWarehouse = `${warehouseCol} = ${idOnly(a.warehouseId)}`;
      if (a.role === 'Warehouse Operator' && assignedCol && viewer.email) {
        return `(${inWarehouse} AND ${assignedCol} = '${sqlText(viewer.email)}')`;
      }
      return `(${inWarehouse})`;
    });
  if (!warehouseCol || !parts.length) return ' AND 1 = 0';
  return ` AND (${parts.join(' OR ')})`;
}

// Catalyst datetime columns expect "YYYY-MM-DD HH:mm:ss" on insert/update
// (ISO strings and millisecond-precision values are both rejected).
function formatDatetime(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  );
}

// -- Documents & Photos --
export const uploadDocument = (fileBase64, fileName, bucketKey, docType, linkedModule, linkedRecordId, uploadedBy) =>
  callFunction('uploadFile', { fileBase64, fileName, bucketKey, docType, linkedModule, linkedRecordId, uploadedBy });

// An uploaded file, ready to show: resolves to a URL the browser can display
// (a local blob for files returned inline, a signed link for large ones).
// Cached per file so re-renders don't refetch it.
const fileUrlCache = new Map();
export const getFileUrl = (fileId, bucketKey) => {
  const key = `${bucketKey || ''}|${fileId}`;
  if (!fileUrlCache.has(key)) {
    const request = callFunction('getFileUrl', { fileId, bucketKey }).then((r) => {
      if (r.url) return r.url;
      const bytes = Uint8Array.from(atob(r.base64), (ch) => ch.charCodeAt(0));
      return URL.createObjectURL(new Blob([bytes], { type: r.contentType }));
    });
    fileUrlCache.set(key, request);
    request.catch(() => fileUrlCache.delete(key)); // let a failed load be retried
  }
  return fileUrlCache.get(key);
};

export const listDocumentsForRecord = (linkedModule, linkedRecordId) =>
  zcql(
    `SELECT ROWID, doc_type, file_id, uploaded_by, uploaded_date FROM Documents WHERE linked_module = '${linkedModule}' AND linked_record_id = '${linkedRecordId}' ORDER BY CREATEDTIME DESC`
  ).then((rows) => rows.map((r) => r.Documents));

// -- Transporters --
export const listTransporters = () => getAllRows(TABLES.TRANSPORTERS);
export const createTransporter = (row) => addRow(TABLES.TRANSPORTERS, row);
export const editTransporter = (row) => updateRow(TABLES.TRANSPORTERS, row);
export const removeTransporter = (rowId) => deleteRow(TABLES.TRANSPORTERS, rowId);

// -- Customers --
export const listCustomers = () => getAllRows(TABLES.CUSTOMERS);
export const createCustomer = (row) => addRow(TABLES.CUSTOMERS, row);
export const editCustomer = (row) => updateRow(TABLES.CUSTOMERS, row);
export const removeCustomer = (rowId) => deleteRow(TABLES.CUSTOMERS, rowId);
export const removeCustomers = (rowIds) => Promise.all(rowIds.map((id) => deleteRow(TABLES.CUSTOMERS, id)));

export const getCustomerById = (id) =>
  zcql(`SELECT * FROM Customers WHERE ROWID = ${id}`).then((rows) => rows[0]?.Customers || null);

// -- Suppliers (a separate directory from Customers -- who shipped the
// goods to the warehouse, vs. who the goods belong to) --
export const listSuppliers = () => getAllRows(TABLES.SUPPLIERS);
export const createSupplier = (row) => addRow(TABLES.SUPPLIERS, row);
export const editSupplier = (row) => updateRow(TABLES.SUPPLIERS, row);
export const removeSupplier = (rowId) => deleteRow(TABLES.SUPPLIERS, rowId);

// -- Customer Contacts (a customer can have several; one may be marked primary) --
export const listContactsByCustomer = (customerId) =>
  zcql(
    `SELECT ROWID, salutation, first_name, last_name, email, phone, is_primary FROM Contacts WHERE customer_id = ${customerId} ORDER BY is_primary DESC, CREATEDTIME`
  ).then((rows) => rows.map((r) => r.Contacts));
export const createContact = (row) => addRow(TABLES.CONTACTS, row);
export const editContact = (row) => updateRow(TABLES.CONTACTS, row);
export const removeContact = (rowId) => deleteRow(TABLES.CONTACTS, rowId);

// Only one contact per customer can be primary -- clear the others first so
// the "is_primary" flag stays exclusive without needing a DB-level constraint.
export const setPrimaryContact = (customerId, contactId) =>
  listContactsByCustomer(customerId).then((contacts) =>
    Promise.all(
      contacts
        .filter((c) => c.ROWID !== contactId && (c.is_primary === true || c.is_primary === 'true'))
        .map((c) => editContact({ ROWID: c.ROWID, is_primary: false }))
    ).then(() => editContact({ ROWID: contactId, is_primary: true }))
  );

export const getCustomerActivity = (customerId, viewer) =>
  Promise.all([
    zcql(
      `SELECT ROWID, expected_date, status FROM InboundAdvice WHERE customer_id = ${customerId}${visibilityClause(viewer, { warehouseCol: 'warehouse_id' })} ORDER BY CREATEDTIME DESC`
    ).then((rows) => rows.map((r) => r.InboundAdvice)),
    zcql(
      `SELECT ROWID, requested_date, status FROM OutboundRequest WHERE customer_id = ${customerId}${visibilityClause(viewer, { warehouseCol: 'warehouse_id' })} ORDER BY CREATEDTIME DESC`
    ).then((rows) => rows.map((r) => r.OutboundRequest)),
    zcql(`SELECT ROWID, description, qty, unit, status FROM Cargo WHERE customer_id = ${customerId}${visibilityClause(viewer, { warehouseCol: 'warehouse_id' })} ORDER BY CREATEDTIME DESC`).then(
      (rows) => rows.map((r) => r.Cargo)
    ),
  ]).then(([inbound, outbound, cargo]) => ({ inbound, outbound, cargo }));

// -- Warehouses / Zones / Racks / StorageLocations --
export const listWarehouses = () => getAllRows(TABLES.WAREHOUSES);
export const createWarehouse = (row) => addRow(TABLES.WAREHOUSES, row);
export const editWarehouse = (row) => updateRow(TABLES.WAREHOUSES, row);
export const removeWarehouse = (rowId) => deleteRow(TABLES.WAREHOUSES, rowId);

export const listZonesByWarehouse = (warehouseId) =>
  zcql(`SELECT ROWID, name, zone_type, warehouse_id FROM Zones WHERE warehouse_id = ${warehouseId}`).then(
    (rows) => rows.map((r) => r.Zones)
  );
export const createZone = (row) => addRow(TABLES.ZONES, row);
export const editZone = (row) => updateRow(TABLES.ZONES, row);
export const removeZone = (rowId) => deleteRow(TABLES.ZONES, rowId);

export const listAislesByZone = (zoneId) =>
  zcql(`SELECT ROWID, name, zone_id FROM Aisles WHERE zone_id = ${zoneId}`).then((rows) => rows.map((r) => r.Aisles));
export const createAisle = (row) => addRow(TABLES.AISLES, row);
export const removeAisle = (rowId) => deleteRow(TABLES.AISLES, rowId);

export const listRacksByAisle = (aisleId) =>
  zcql(`SELECT ROWID, code, aisle_id FROM Racks WHERE aisle_id = ${aisleId}`).then((rows) => rows.map((r) => r.Racks));
export const createRack = (row) => addRow(TABLES.RACKS, row);
export const editRack = (row) => updateRow(TABLES.RACKS, row);
export const removeRack = (rowId) => deleteRow(TABLES.RACKS, rowId);

export const listLocationsByRack = (rackId) =>
  zcql(
    `SELECT ROWID, location_code, capacity, capacity_unit, location_type, max_weight_kg, length_cm, width_cm, height_cm, occupancy_status, rack_id, bay, rack_level FROM StorageLocations WHERE rack_id = ${rackId}`
  ).then((rows) => rows.map((r) => r.StorageLocations));
export const createLocation = (row) => addRow(TABLES.STORAGE_LOCATIONS, row);
export const editLocation = (row) => updateRow(TABLES.STORAGE_LOCATIONS, row);
export const removeLocation = (rowId) => deleteRow(TABLES.STORAGE_LOCATIONS, rowId);

export const listPackageTypes = () => getAllRows(TABLES.PACKAGE_TYPES);
export const createPackageType = (row) => addRow(TABLES.PACKAGE_TYPES, row);
export const editPackageType = (row) => updateRow(TABLES.PACKAGE_TYPES, row);
export const removePackageType = (rowId) => deleteRow(TABLES.PACKAGE_TYPES, rowId);

// Full zone -> aisle -> rack -> location hierarchy for one warehouse, with
// each location flagged occupied/empty from current Cargo placements.
export const getWarehouseMap = (warehouseId) =>
  Promise.all([
    listZonesByWarehouse(warehouseId),
    zcql(`SELECT current_location_id FROM Cargo WHERE current_location_id IS NOT NULL AND ${GONE_SQL}`).then(
      (rows) => new Set(rows.map((r) => String(r.Cargo.current_location_id)))
    ),
  ]).then(([zones, occupiedIds]) =>
    Promise.all(
      zones.map((zone) =>
        listAislesByZone(zone.ROWID).then((aisles) =>
          Promise.all(
            aisles.map((aisle) =>
              listRacksByAisle(aisle.ROWID).then((racks) =>
                Promise.all(
                  racks.map((rack) =>
                    listLocationsByRack(rack.ROWID).then((locations) => ({
                      rack,
                      locations: locations.map((loc) => ({ ...loc, occupied: occupiedIds.has(String(loc.ROWID)) })),
                    }))
                  )
                ).then((racksWithLocations) => ({ aisle, racks: racksWithLocations }))
              )
            )
          ).then((aislesWithRacks) => ({ zone, aisles: aislesWithRacks }))
        )
      )
    )
  );

// -- Capacity engine (see lib/capacity.js for the math) --
// Flat, per-location rows with capacity typing + the resolved warehouse_id,
// via the full Rack->Aisle->Zone->Warehouse chain (4 joins, right at ZCQL's
// per-query join ceiling -- do not add a 5th join to this query).
export const listCapacityLocations = () =>
  zcql(
    `SELECT StorageLocations.ROWID, StorageLocations.location_code, StorageLocations.capacity, StorageLocations.capacity_unit, StorageLocations.location_type, StorageLocations.occupancy_status, StorageLocations.length_cm, StorageLocations.width_cm, StorageLocations.height_cm, StorageLocations.max_weight_kg, Warehouses.ROWID FROM StorageLocations LEFT JOIN Racks ON StorageLocations.rack_id = Racks.ROWID LEFT JOIN Aisles ON Racks.aisle_id = Aisles.ROWID LEFT JOIN Zones ON Aisles.zone_id = Zones.ROWID LEFT JOIN Warehouses ON Zones.warehouse_id = Warehouses.ROWID`
  ).then((rows) =>
    rows.map((r) => ({
      ROWID: r.StorageLocations.ROWID,
      location_code: r.StorageLocations.location_code,
      capacity: r.StorageLocations.capacity,
      capacity_unit: r.StorageLocations.capacity_unit,
      location_type: r.StorageLocations.location_type,
      occupancy_status: r.StorageLocations.occupancy_status,
      length_cm: r.StorageLocations.length_cm,
      width_cm: r.StorageLocations.width_cm,
      height_cm: r.StorageLocations.height_cm,
      max_weight_kg: r.StorageLocations.max_weight_kg,
      warehouse_id: r.Warehouses?.ROWID,
    }))
  );

// Every still-in-the-building Cargo row with enough context to classify it as
// physically occupying a location, pending put-away, or committed (accepted
// but not yet physically received) -- see computeCapacity in lib/capacity.js.
export const listCapacityCargo = async () => {
  const [huRows, lineRows, packedRows] = await Promise.all([
    zcql(
      `SELECT Cargo.ROWID, Cargo.current_location_id, Cargo.reserved_location_id, Cargo.status, Cargo.unit, Cargo.weight, Cargo.length_cm, Cargo.width_cm, Cargo.height_cm, Cargo.warehouse_id, Cargo.inbound_advice_id, Cargo.customer_id, InboundAdvice.status, InboundAdvice.expected_date, InboundAdvice.storage_start_date, InboundAdvice.storage_end_date FROM Cargo LEFT JOIN InboundAdvice ON Cargo.inbound_advice_id = InboundAdvice.ROWID WHERE ${goneSql('Cargo')} AND Cargo.qr_code IS NOT NULL`
    ),
    zcql(
      `SELECT InboundLine.ROWID, InboundLine.unit, InboundLine.qty, InboundLine.received_qty, InboundLine.weight, InboundLine.length_cm, InboundLine.width_cm, InboundLine.height_cm, InboundLine.customer_id, InboundLine.warehouse_id, InboundLine.inbound_advice_id, InboundAdvice.status, InboundAdvice.expected_date, InboundAdvice.storage_start_date, InboundAdvice.storage_end_date, InboundAdvice.warehouse_id FROM InboundLine LEFT JOIN InboundAdvice ON InboundLine.inbound_advice_id = InboundAdvice.ROWID WHERE InboundAdvice.status = 'Confirmed' OR InboundAdvice.status = 'Received'`
    ),
    // Only a received inbound's remainder is worked out from what is packed, so only its lines are summed.
    zcql(
      `SELECT HuLine.inbound_line_id, SUM(HuLine.qty) FROM HuLine LEFT JOIN InboundLine ON HuLine.inbound_line_id = InboundLine.ROWID LEFT JOIN InboundAdvice ON InboundLine.inbound_advice_id = InboundAdvice.ROWID WHERE InboundAdvice.status = 'Received' GROUP BY HuLine.inbound_line_id`
    ),
  ]);

  const hus = huRows.map((r) => ({
    ROWID: r.Cargo.ROWID,
    current_location_id: r.Cargo.current_location_id,
    reserved_location_id: r.Cargo.reserved_location_id,
    status: r.Cargo.status,
    unit: r.Cargo.unit,
    weight: r.Cargo.weight,
    length_cm: r.Cargo.length_cm,
    width_cm: r.Cargo.width_cm,
    height_cm: r.Cargo.height_cm,
    warehouse_id: r.Cargo.warehouse_id,
    inbound_advice_id: r.Cargo.inbound_advice_id,
    customer_id: r.Cargo.customer_id,
    inbound_status: r.InboundAdvice?.status,
    inbound_expected_date: r.InboundAdvice?.expected_date,
    storage_start_date: r.InboundAdvice?.storage_start_date,
    storage_end_date: r.InboundAdvice?.storage_end_date,
  }));

  // Planned goods that aren't a physical HU yet: an accepted inbound's whole
  // plan is "committed"; a received one's not-yet-packed remainder is the
  // dock backlog ("pending put-away"). Packed quantity is already counted via
  // the HUs above, so it is subtracted here to avoid double counting.
  const packedByLine = new Map();
  packedRows.forEach((r) => {
    const k = String(r.HuLine.inbound_line_id);
    packedByLine.set(k, (packedByLine.get(k) || 0) + (Number(r.HuLine.qty) || 0));
  });
  const planned = lineRows.flatMap((r) => {
    const line = { ...r.InboundLine, qty: Number(r.InboundLine.qty) || 0, received_qty: Number(r.InboundLine.received_qty) || 0 };
    const advice = r.InboundAdvice;
    const packed = packedByLine.get(String(line.ROWID)) || 0;
    const remaining = advice.status === 'Confirmed' ? line.qty : Math.max(line.received_qty - packed, 0);
    return expandLines([line], {
      status: 'Received',
      current_location_id: null,
      reserved_location_id: null,
      warehouse_id: line.warehouse_id || advice.warehouse_id,
      inbound_status: advice.status,
      inbound_expected_date: advice.expected_date,
      storage_start_date: advice.storage_start_date,
      storage_end_date: advice.storage_end_date,
    }, () => remaining);
  });

  return [...hus, ...planned];
};

// Cargo already committed to an accepted-but-not-dispatched OutboundRequest
// (via PickTask), for the "expected outbound release" side of the capacity
// projection. A Cargo row can rarely be linked to PickTasks on more than one
// OutboundRequest (no DB constraint prevents it) -- a known pre-existing gap
// that can make this a slight overcount, not fixed here.
export const listCapacityOutboundCommitments = () =>
  zcql(
    `SELECT Cargo.ROWID, Cargo.unit, Cargo.status, OutboundRequest.warehouse_id, OutboundRequest.requested_date FROM PickTask LEFT JOIN OutboundRequest ON PickTask.outbound_request_id = OutboundRequest.ROWID LEFT JOIN Cargo ON PickTask.cargo_id = Cargo.ROWID WHERE OutboundRequest.status = 'Submitted'`
  ).then((rows) =>
    rows
      .map((r) => ({
        cargo_id: r.Cargo?.ROWID,
        unit: r.Cargo?.unit,
        status: r.Cargo?.status,
        warehouse_id: r.OutboundRequest?.warehouse_id,
        requested_date: r.OutboundRequest?.requested_date,
      }))
      .filter((r) => r.cargo_id && r.status !== 'Dispatched' && r.status !== 'Delivered')
  );

// -- Inbound Operations --
export const listInboundAdvice = (viewer) =>
  zcql(
    `SELECT InboundAdvice.ROWID, InboundAdvice.expected_date, InboundAdvice.transport_details, InboundAdvice.status, InboundAdvice.reference_number, InboundAdvice.inbound_reference, InboundAdvice.destination, InboundAdvice.customer_id, InboundAdvice.expected_colli, Customers.name, Transporters.name FROM InboundAdvice LEFT JOIN Customers ON InboundAdvice.customer_id = Customers.ROWID LEFT JOIN Transporters ON InboundAdvice.transporter_id = Transporters.ROWID WHERE InboundAdvice.ROWID != 0${visibilityClause(viewer, { warehouseCol: 'InboundAdvice.warehouse_id' })} ORDER BY InboundAdvice.CREATEDTIME DESC`
  ).then((rows) =>
    rows.map((r) => ({ ...r.InboundAdvice, customer_name: r.Customers?.name, transporter_name: r.Transporters?.name }))
  );

// Cargo status per inbound, for computing each row's Fulfillment Status in
// the Inbounds list without a per-advice round trip (see fulfillmentStatus.js).
// Counted by the database instead of downloading every Handling Unit (10,000 pallets made this list take 12 s):
// one row per inbound and status, expanded back to one entry per unit for the status calculation.
const expandCounts = (rows, table, build) =>
  rows.flatMap((r) => Array.from({ length: Math.min(Number(r[table].ROWID) || 0, 5000) }, () => build(r)));
export const listCargoStatusForAllAdvices = () =>
  zcql(
    `SELECT Cargo.inbound_advice_id, Cargo.status, COUNT(Cargo.ROWID) FROM Cargo WHERE Cargo.inbound_advice_id IS NOT NULL AND Cargo.qr_code IS NOT NULL GROUP BY Cargo.inbound_advice_id, Cargo.status`
  ).then((rows) => expandCounts(rows, 'Cargo', (r) => ({ inbound_advice_id: r.Cargo.inbound_advice_id, status: r.Cargo.status })));
// Planned vs. received package totals per inbound, for the same list (summed by the database: one row per inbound).
export const listLineTotalsForAllAdvices = () =>
  zcql(
    `SELECT InboundLine.inbound_advice_id, SUM(InboundLine.qty), SUM(InboundLine.received_qty) FROM InboundLine GROUP BY InboundLine.inbound_advice_id`
  ).then((rows) => rows.map((r) => r.InboundLine));
export const createInboundAdvice = (row) => addRow(TABLES.INBOUND_ADVICE, row);
export const editInboundAdvice = (row) => updateRow(TABLES.INBOUND_ADVICE, row);

// Creates a bare draft row and immediately assigns its reference (derived
// from the new ROWID, so it's collision-free without a separate counter),
// ready for the wizard to open straight into Step 1.
export const startNewInboundAdvice = (warehouseId) =>
  createInboundAdvice({ warehouse_id: warehouseId || undefined, status: 'Requested' }).then((created) => {
    if (!created?.ROWID) throw new Error('Could not create the inbound draft.');
    return editInboundAdvice({ ROWID: created.ROWID, inbound_reference: formatSequentialRef('IB', created.ROWID) });
  });

const INBOUND_ADVICE_FIELDS = [
  'ROWID',
  'CREATEDTIME',
  'CREATORID',
  'expected_date',
  'transport_details',
  'status',
  'reference_number',
  'customer_id',
  'transporter_id',
  'warehouse_id',
  'inbound_reference',
  'expected_colli',
  'destination',
  'reference_client',
  'supplier_id',
  'transport_type',
  'cmr_number',
  'warehouse_unloading_date',
  'warehouse_unloading_time',
  'received_piece_count',
  'license_plate',
  'driver_name',
  'adr_status',
  'remarks',
  'rejection_reason',
  'storage_start_date',
  'storage_end_date',
].map((f) => `InboundAdvice.${f}`);

// Supplier reuses the Customers directory, but ZCQL doesn't support
// self-joins with an alias (tried: "Unkown Table Suppliers in SELECT"), so
// its name is resolved client-side from the already-loaded customers list
// (StepGeneral/StepCheck both load listCustomers() anyway for the lookup).
const LEGACY_REQUESTED_STATUSES = ['Pending', 'Submitted'];
export const getInboundAdviceById = (id) =>
  zcql(
    `SELECT ${INBOUND_ADVICE_FIELDS.join(', ')}, Customers.name, Customers.email, Transporters.name FROM InboundAdvice LEFT JOIN Customers ON InboundAdvice.customer_id = Customers.ROWID LEFT JOIN Transporters ON InboundAdvice.transporter_id = Transporters.ROWID WHERE InboundAdvice.ROWID = ${id}`
  ).then((rows) => {
    const row = rows[0];
    if (!row) return null;
    return {
      ...row.InboundAdvice,
      // Inbounds created before the current status model carry "Pending" or
      // "Submitted"; they are requests still awaiting acceptance.
      status: LEGACY_REQUESTED_STATUSES.includes(row.InboundAdvice.status) ? 'Requested' : row.InboundAdvice.status,
      customer_name: row.Customers?.name,
      customer_email: row.Customers?.email,
      transporter_name: row.Transporters?.name,
    };
  });

// Handling Units of one inbound. A Cargo row is an HU once it carries a QR
// (stamped the moment it is created -- see createHandlingUnit); the planned
// goods live in InboundLine instead.
export const listCargoByAdvice = (inboundAdviceId) =>
  zcql(
    `SELECT ROWID, description, qty, received_qty, unit, weight, dimensions, outer_package_no, length_cm, width_cm, height_cm, qr_code, status, current_location_id FROM Cargo WHERE inbound_advice_id = ${inboundAdviceId} AND qr_code IS NOT NULL ORDER BY CREATEDTIME`
  ).then((rows) => rows.map((r) => r.Cargo));

// -- Line items (the plan) and what each Handling Unit contains --
const LINE_NUMERIC = ['qty', 'received_qty', 'weight', 'length_cm', 'width_cm', 'height_cm'];
const normalizeLine = (row) => {
  const out = { ...row };
  LINE_NUMERIC.forEach((f) => {
    out[f] = row[f] === null || row[f] === undefined || row[f] === '' || row[f] === 'null' ? null : Number(row[f]);
  });
  return out;
};

export const listLinesByAdvice = (inboundAdviceId) =>
  zcql(
    `SELECT ROWID, line_no, unit, description, qty, received_qty, weight, length_cm, width_cm, height_cm, customer_id, warehouse_id FROM InboundLine WHERE inbound_advice_id = ${inboundAdviceId} ORDER BY CREATEDTIME`
  ).then((rows) => rows.map((r) => normalizeLine(r.InboundLine)));
export const createLine = (row) => addRow(TABLES.INBOUND_LINE, row).then(normalizeLine);
export const editLine = (row) => updateRow(TABLES.INBOUND_LINE, row);
export const deleteLine = (rowId) => deleteRow(TABLES.INBOUND_LINE, rowId);

// Which lines (and how many of each) sit in which HU, for one inbound.
export const listHuContentsByAdvice = (inboundAdviceId) =>
  zcql(
    `SELECT HuLine.ROWID, HuLine.cargo_id, HuLine.inbound_line_id, HuLine.qty FROM HuLine LEFT JOIN Cargo ON HuLine.cargo_id = Cargo.ROWID WHERE Cargo.inbound_advice_id = ${inboundAdviceId}`
  ).then((rows) => rows.map((r) => ({ ...r.HuLine, qty: Number(r.HuLine.qty) || 0 })));

// Creates one physical Handling Unit holding any mix of lines:
// contents = [{ line, qty }]. The HU is a Cargo row (what Storage, Outbound,
// scans and reports already key off), its QR is stamped immediately, and the
// HuLine rows record the contents. If recording the contents fails, the
// half-built HU is removed so nothing is left behind.
export async function createHandlingUnit({ advice, huNo, unit, weight, length_cm, width_cm, height_cm, contents }) {
  assertId(advice.ROWID);
  const totalQty = contents.reduce((sum, c) => sum + c.qty, 0);
  const description = contents.map((c) => `${c.line.description || c.line.unit || 'Item'} x${c.qty}`).join(', ');
  const row = {
    inbound_advice_id: advice.ROWID,
    customer_id: advice.customer_id,
    warehouse_id: advice.warehouse_id || undefined,
    outer_package_no: String(huNo),
    unit,
    description,
    qty: totalQty,
    received_qty: totalQty,
    status: 'Received',
  };
  // Numeric columns must be omitted when empty (Data Store rejects '').
  [['weight', weight], ['length_cm', length_cm], ['width_cm', width_cm], ['height_cm', height_cm]].forEach(([k, v]) => {
    if (v !== '' && v !== null && v !== undefined) row[k] = Number(v);
  });
  const created = await addRow(TABLES.CARGO, row);
  if (!created?.ROWID) throw new Error('Could not create the Handling Unit.');
  try {
    await generateQRCode(created.ROWID);
    await Promise.all(
      contents.map((c) => addRow(TABLES.HU_LINE, { cargo_id: created.ROWID, inbound_line_id: c.line.ROWID, qty: c.qty }))
    );
  } catch (err) {
    await deleteRow(TABLES.CARGO, created.ROWID).catch(() => {});
    throw err;
  }
  return created.ROWID;
}

// HuLine rows go with it (ON DELETE CASCADE).
export const deleteHandlingUnit = (cargoId) => deleteRow(TABLES.CARGO, cargoId);
export const createCargo = (row) => addRow(TABLES.CARGO, row);
export const editCargo = (row) => updateRow(TABLES.CARGO, row);
export const deleteCargo = (rowId) => deleteRow(TABLES.CARGO, rowId);

// The label payload is deterministic, so no server round-trip is needed; the
// QR image itself is rendered in the browser wherever a label is shown.
export const generateQRCode = (cargoId) => {
  assertId(cargoId);
  const qrPayload = `WOMS-CARGO-${cargoId}`;
  return updateRow(TABLES.CARGO, { ROWID: cargoId, qr_code: qrPayload }).then(() => ({ cargoId, qrPayload }));
};
// -- Goods Receipt Note: generated when an inbound is completed, then verified
// by a manager before the customer confirmation goes out. --
export const getGrnForAdvice = (inboundAdviceId) =>
  zcql(
    `SELECT ROWID, grn_number, generated_date, verified_by, status FROM GRN WHERE inbound_advice_id = ${inboundAdviceId} ORDER BY CREATEDTIME DESC`
  ).then((rows) => rows[0]?.GRN || null);

export async function createGRN(inboundAdviceId, inboundReference, generatedBy) {
  assertId(inboundAdviceId);
  const existing = await getGrnForAdvice(inboundAdviceId);
  if (existing) return existing;
  const row = await addRow('GRN', {
    inbound_advice_id: inboundAdviceId,
    grn_number: `GRN-${inboundReference || inboundAdviceId}`,
    generated_date: formatDatetime(),
    verified_by: '',
    status: 'Generated',
  });
  logAudit({ userId: generatedBy, actionType: 'CREATE_GRN', module: 'Inbound Operations', recordId: inboundAdviceId, details: { grn: row.grn_number } });
  return row;
}

export const verifyGRN = (grnId, inboundAdviceId, verifiedBy) =>
  updateRow('GRN', { ROWID: grnId, status: 'Verified', verified_by: verifiedBy || '' }).then((row) => {
    logAudit({ userId: verifiedBy, actionType: 'VERIFY_GRN', module: 'Inbound Operations', recordId: inboundAdviceId });
    return row;
  });

export const sendInboundConfirmationEmail = (inboundAdviceId, recipientEmail, message) =>
  notifyEvent('INBOUND_COMPLETED', recipientEmail, String(inboundAdviceId), message, 'Inbound Operations');

// -- Storage (put-away / relocation) --
const loadAllStorageLocations = () =>
  zcql(
    `SELECT StorageLocations.ROWID, StorageLocations.location_code, StorageLocations.capacity, StorageLocations.bay, StorageLocations.rack_level, Racks.code, Aisles.name, Zones.name, Warehouses.name FROM StorageLocations LEFT JOIN Racks ON StorageLocations.rack_id = Racks.ROWID LEFT JOIN Aisles ON Racks.aisle_id = Aisles.ROWID LEFT JOIN Zones ON Aisles.zone_id = Zones.ROWID LEFT JOIN Warehouses ON Zones.warehouse_id = Warehouses.ROWID`
  ).then((rows) =>
    rows.map((r) => ({
      ROWID: r.StorageLocations.ROWID,
      location_code: r.StorageLocations.location_code,
      capacity: r.StorageLocations.capacity,
      bay: r.StorageLocations.bay,
      rack_level: r.StorageLocations.rack_level,
      path: [
        r.Warehouses?.name,
        r.Zones?.name,
        r.Aisles?.name,
        r.Racks?.code,
        r.StorageLocations.bay ? `Bay ${r.StorageLocations.bay}` : null,
        r.StorageLocations.rack_level ? `Level ${r.StorageLocations.rack_level}` : null,
      ]
        .filter(Boolean)
        .join(' / '),
    }))
  );

// Used on nearly every page (location labels); rebuilt only when the warehouse layout changes.
// Everything a label shows for these Handling Units, in the order the ids were given (units without a QR code
// are left out: there is nothing to print for them).
export async function listHuLabelsByIds(ids) {
  const wanted = [...new Set((ids || []).map(idOnly).filter(Boolean))].slice(0, 200);
  if (!wanted.length) return [];
  const cargo = [];
  for (const part of chunksOf(wanted, 50)) {
    const rows = await zcql(
      `SELECT ROWID, description, qty, unit, weight, outer_package_no, qr_code, inbound_advice_id, customer_id, current_location_id FROM Cargo WHERE ROWID IN (${part.join(',')}) AND qr_code IS NOT NULL`
    );
    cargo.push(...rows.map((r) => r.Cargo));
  }
  const adviceIds = [...new Set(cargo.map((c) => idOnly(c.inbound_advice_id)).filter(Boolean))];
  const advices = [];
  for (const part of chunksOf(adviceIds, 50)) {
    const rows = await zcql(`SELECT ROWID, inbound_reference FROM InboundAdvice WHERE ROWID IN (${part.join(',')})`);
    advices.push(...rows.map((r) => r.InboundAdvice));
  }
  const [customers, locations] = await Promise.all([listCustomers(), listAllStorageLocations()]);
  const refById = new Map(advices.map((a) => [String(a.ROWID), a.inbound_reference]));
  const customerById = new Map(customers.map((c) => [String(c.ROWID), c.name]));
  const locationById = new Map(locations.map((l) => [String(l.ROWID), l.location_code]));
  const byId = new Map(cargo.map((c) => [String(c.ROWID), c]));
  return wanted
    .map((id) => byId.get(id))
    .filter(Boolean)
    .map((c) => ({
      ...c,
      inbound_reference: refById.get(String(c.inbound_advice_id)) || '',
      customer_name: customerById.get(String(c.customer_id)) || '',
      location_code: locationById.get(String(c.current_location_id)) || '',
    }));
}

export const listAllStorageLocations = () =>
  cachedFetch('allStorageLocations', ['StorageLocations', 'Racks', 'Aisles', 'Zones', 'Warehouses'], loadAllStorageLocations).then((rows) => rows.slice());

const STOCK_COLUMNS =
  'Cargo.ROWID, Cargo.description, Cargo.qty, Cargo.unit, Cargo.weight, Cargo.length_cm, Cargo.width_cm, Cargo.height_cm, Cargo.qr_code, Cargo.status, Cargo.outer_package_no, Cargo.current_location_id, Cargo.reserved_location_id, Cargo.customer_id, Cargo.warehouse_id, Cargo.inbound_advice_id, Customers.name, InboundAdvice.inbound_reference, InboundAdvice.destination';
const STOCK_JOINS =
  'FROM Cargo LEFT JOIN Customers ON Cargo.customer_id = Customers.ROWID LEFT JOIN InboundAdvice ON Cargo.inbound_advice_id = InboundAdvice.ROWID';
const toStockRow = (r) => ({
  ...r.Cargo,
  customer_name: r.Customers?.name,
  inbound_reference: r.InboundAdvice?.inbound_reference,
  destination: r.InboundAdvice?.destination,
});

// The Handling Units sitting in one storage position, for the popup on the warehouse map: what they are,
// whose they are, what is inside them (the line items on each) and since when they have been there.
export const listHusInLocation = async (locationId) => {
  assertId(locationId);
  const hus = (
    await zcql(
      `SELECT ${STOCK_COLUMNS} ${STOCK_JOINS} WHERE Cargo.current_location_id = ${locationId} AND Cargo.qr_code IS NOT NULL ORDER BY Cargo.outer_package_no`
    )
  ).map(toStockRow);
  const ids = hus.map((h) => String(h.ROWID)).filter((id) => /^\d+$/.test(id));
  if (!ids.length) return [];
  const [contents, moves] = await Promise.all([
    zcql(
      `SELECT HuLine.cargo_id, HuLine.qty, InboundLine.description, InboundLine.unit FROM HuLine LEFT JOIN InboundLine ON HuLine.inbound_line_id = InboundLine.ROWID WHERE HuLine.cargo_id IN (${ids.join(', ')})`
    ),
    zcql(
      `SELECT CargoMovementLog.cargo_id, CargoMovementLog.movement_timestamp FROM CargoMovementLog WHERE CargoMovementLog.to_location_id = ${locationId} ORDER BY CargoMovementLog.movement_timestamp DESC`
    ),
  ]);
  const contentsBy = new Map();
  contents.forEach((r) => {
    const k = String(r.HuLine.cargo_id);
    if (!contentsBy.has(k)) contentsBy.set(k, []);
    contentsBy.get(k).push({ description: r.InboundLine?.description, unit: r.InboundLine?.unit, qty: Number(r.HuLine.qty) || 0 });
  });
  const sinceBy = new Map();
  moves.forEach((r) => {
    const k = String(r.CargoMovementLog.cargo_id);
    if (!sinceBy.has(k)) sinceBy.set(k, r.CargoMovementLog.movement_timestamp); // newest first: the latest arrival here
  });
  return hus.map((h) => ({ ...h, contents: contentsBy.get(String(h.ROWID)) || [], since: sinceBy.get(String(h.ROWID)) || null }));
};

// Cargo that is in the building but not in a rack: freshly received (needs
// put-away) or retrieved (taken out of a rack, on the floor). Cargo already
// picked for an outbound order is excluded -- it belongs to that order now.
export const listCargoOutOfRack = (viewer) =>
  zcql(
    `SELECT ${STOCK_COLUMNS} ${STOCK_JOINS} WHERE Cargo.current_location_id IS NULL AND ${goneSql('Cargo')} AND Cargo.status != 'Picked'${visibilityClause(viewer, { warehouseCol: 'Cargo.warehouse_id' })} ORDER BY Cargo.CREATEDTIME`
  ).then((rows) => rows.map(toStockRow));

export const listStoredCargo = (viewer) =>
  zcql(
    `SELECT ${STOCK_COLUMNS} ${STOCK_JOINS} WHERE Cargo.current_location_id IS NOT NULL AND ${goneSql('Cargo')}${visibilityClause(viewer, { warehouseCol: 'Cargo.warehouse_id' })} ORDER BY Cargo.CREATEDTIME DESC`
  ).then((rows) => rows.map(toStockRow));

// -- Delivery: cargo that has left the warehouse (Dispatched = in transit,
// Delivered = handed over), with the outbound order and dispatch it left on. --
// One query joining five tables with many columns is refused by the service once there is real
// volume ("Error occurred during query processing"), so the goods come first and the outbound
// order, dispatch and inbound reference are looked up for just those goods, in small chunks.
// In transit is always complete; delivered history only grows, so it is loaded newest first,
// `deliveredMax` at a time (300 per query is the service's limit).
const chunksOf = (list, size) => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, (i + 1) * size));
const DELIVERY_PAGE = 300;

export const listDeliveryGoods = async (viewer, { deliveredMax = DELIVERY_PAGE } = {}) => {
  const goods = (status) =>
    `SELECT Cargo.ROWID, Cargo.description, Cargo.qty, Cargo.unit, Cargo.weight, Cargo.qr_code, Cargo.status, Cargo.outer_package_no, Cargo.inbound_advice_id, Cargo.MODIFIEDTIME, Customers.name FROM Cargo LEFT JOIN Customers ON Cargo.customer_id = Customers.ROWID WHERE Cargo.status = '${status}'${visibilityClause(viewer, { warehouseCol: 'Cargo.warehouse_id' })} ORDER BY Cargo.MODIFIEDTIME DESC`;

  const inTransit = await zcql(goods('Dispatched'));
  const delivered = [];
  for (let offset = 0; offset < deliveredMax; offset += DELIVERY_PAGE) {
    const page = await zcql(`${goods('Delivered')} LIMIT ${offset + 1}, ${DELIVERY_PAGE}`);
    delivered.push(...page);
    if (page.length < DELIVERY_PAGE) break;
  }
  const moreDelivered = delivered.length >= deliveredMax; // a full last page: there may be older ones
  const cargo = [...inTransit, ...delivered];

  const cargoIds = cargo.map((r) => r.Cargo.ROWID).filter((id) => /^\d+$/.test(String(id)));
  const adviceIds = [...new Set(cargo.map((r) => r.Cargo.inbound_advice_id).filter((id) => /^\d+$/.test(String(id))))];
  const [orderChunks, adviceChunks] = await Promise.all([
    Promise.all(
      chunksOf(cargoIds, 100).map((ids) =>
        zcql(
          `SELECT PickTask.cargo_id, OutboundRequest.ROWID, OutboundRequest.reference_number, Dispatch.vehicle_details, Dispatch.dispatch_date, Dispatch.dispatched_by FROM PickTask LEFT JOIN OutboundRequest ON PickTask.outbound_request_id = OutboundRequest.ROWID LEFT JOIN Dispatch ON Dispatch.outbound_request_id = OutboundRequest.ROWID WHERE PickTask.cargo_id IN (${ids.join(', ')})`
        )
      )
    ),
    Promise.all(chunksOf(adviceIds, 100).map((ids) => zcql(`SELECT ROWID, inbound_reference FROM InboundAdvice WHERE ROWID IN (${ids.join(', ')})`))),
  ]);

  const orderByCargo = new Map();
  orderChunks.flat().forEach((r) => {
    const key = String(r.PickTask.cargo_id);
    if (!orderByCargo.has(key)) orderByCargo.set(key, r); // a pallet with more than one pick record shows its first
  });
  const refById = new Map(adviceChunks.flat().map((r) => [String(r.InboundAdvice.ROWID), r.InboundAdvice.inbound_reference]));

  const rows = cargo.map((r) => {
    const o = orderByCargo.get(String(r.Cargo.ROWID));
    return {
      ...r.Cargo,
      customer_name: r.Customers?.name,
      inbound_reference: refById.get(String(r.Cargo.inbound_advice_id)),
      outbound_request_id: o?.OutboundRequest?.ROWID,
      outbound_reference: o?.OutboundRequest?.reference_number,
      vehicle_details: o?.Dispatch?.vehicle_details,
      dispatch_date: o?.Dispatch?.dispatch_date,
      dispatched_by: o?.Dispatch?.dispatched_by,
    };
  });
  return { rows, moreDelivered };
};

// -- Operational Task Management --
export const listTasks = (viewer) =>
  zcql(
    `SELECT * FROM Tasks WHERE Tasks.ROWID != 0${visibilityClause(viewer, { warehouseCol: 'Tasks.warehouse_id', assignedCol: 'Tasks.assigned_to' })} ORDER BY Tasks.CREATEDTIME DESC`
  ).then((rows) => rows.map((r) => r.Tasks));
export const createTask = (row) => addRow(TABLES.TASKS, row);
export const editTask = (row) => updateRow(TABLES.TASKS, row);

export const listTasksForRecord = (moduleRef, recordRefId) =>
  zcql(
    `SELECT ROWID, task_type, assigned_to, status, task_priority, due_date FROM Tasks WHERE module_ref = '${moduleRef}' AND record_ref_id = '${recordRefId}' ORDER BY CREATEDTIME DESC`
  ).then((rows) => rows.map((r) => r.Tasks));

// -- Value Added Logistics --
export const listValRequests = () =>
  zcql(
    `SELECT VALRequest.ROWID, VALRequest.service_type, VALRequest.status, VALRequest.requested_date, VALRequest.cargo_id, Customers.name, Cargo.description FROM VALRequest LEFT JOIN Customers ON VALRequest.customer_id = Customers.ROWID LEFT JOIN Cargo ON VALRequest.cargo_id = Cargo.ROWID ORDER BY VALRequest.CREATEDTIME DESC`
  ).then((rows) =>
    rows.map((r) => ({ ...r.VALRequest, customer_name: r.Customers?.name, cargo_description: r.Cargo?.description }))
  );
export const createValRequest = (row) => addRow(TABLES.VAL_REQUEST, row);
export const editValRequest = (row) => updateRow(TABLES.VAL_REQUEST, row);

export const listValTasksByRequest = (valRequestId) =>
  zcql(`SELECT ROWID, status, assigned_to, completion_notes FROM VALTask WHERE val_request_id = ${valRequestId} ORDER BY CREATEDTIME`).then(
    (rows) => rows.map((r) => r.VALTask)
  );
export const createValTask = (row) => addRow(TABLES.VAL_TASK, row);
export const editValTask = (row) => updateRow(TABLES.VAL_TASK, row);

export const listCargoForCustomer = (customerId, viewer) =>
  zcql(`SELECT ROWID, description, qty, unit, status FROM Cargo WHERE customer_id = ${customerId}${visibilityClause(viewer, { warehouseCol: 'warehouse_id' })} ORDER BY CREATEDTIME DESC`).then(
    (rows) => rows.map((r) => r.Cargo)
  );

// -- Outbound Operations --
export const listOutboundRequests = (viewer) =>
  zcql(
    `SELECT OutboundRequest.ROWID, OutboundRequest.requested_date, OutboundRequest.status, OutboundRequest.reference_number, OutboundRequest.outbound_reference, OutboundRequest.warehouse_id, OutboundRequest.customer_id, OutboundRequest.arrived_at, Customers.name, Transporters.name FROM OutboundRequest LEFT JOIN Customers ON OutboundRequest.customer_id = Customers.ROWID LEFT JOIN Transporters ON OutboundRequest.transporter_id = Transporters.ROWID WHERE OutboundRequest.ROWID != 0${visibilityClause(viewer, { warehouseCol: 'OutboundRequest.warehouse_id' })} ORDER BY OutboundRequest.CREATEDTIME DESC`
  ).then((rows) =>
    rows.map((r) => ({ ...r.OutboundRequest, customer_name: r.Customers?.name, transporter_name: r.Transporters?.name }))
  );
export const editOutboundRequest = (row) => updateRow(TABLES.OUTBOUND_REQUEST, row);
// Every outbound request gets its own pickup reference (OB-year-number), the
// number printed on the Pickup Pass that the driver presents at the gate.
export const createOutboundRequest = (row) =>
  addRow(TABLES.OUTBOUND_REQUEST, row).then((created) => {
    if (!created?.ROWID) throw new Error('Could not create the outbound request.');
    return editOutboundRequest({ ROWID: created.ROWID, outbound_reference: formatSequentialRef('OB', created.ROWID) }).then(() => created);
  });

// Records the driver arriving for a pickup: who, with what vehicle, when, and who let them in.
export const checkInPickup = (requestId, fields, actor) =>
  editOutboundRequest({
    ROWID: requestId,
    driver_name: fields.driver_name || null,
    driver_id_number: fields.driver_id_number || null,
    driver_phone: fields.driver_phone || null,
    vehicle_plate: fields.vehicle_plate || null,
    trailer_plate: fields.trailer_plate || null,
    arrived_at: formatDatetime(),
    checked_in_by: actor || null,
  }).then(() =>
    logAudit({
      userId: actor,
      actionType: 'PICKUP_CHECK_IN',
      module: 'Outbound Operations',
      recordId: requestId,
      details: { driver: fields.driver_name, plate: fields.vehicle_plate },
    })
  );
export const getOutboundRequestById = (id) =>
  zcql(
    `SELECT OutboundRequest.ROWID, OutboundRequest.CREATEDTIME, OutboundRequest.requested_date, OutboundRequest.status, OutboundRequest.reference_number, OutboundRequest.customer_id, OutboundRequest.transporter_id, OutboundRequest.warehouse_id, OutboundRequest.outbound_reference, OutboundRequest.driver_name, OutboundRequest.driver_id_number, OutboundRequest.driver_phone, OutboundRequest.vehicle_plate, OutboundRequest.trailer_plate, OutboundRequest.arrived_at, OutboundRequest.checked_in_by, OutboundRequest.inbound_advice_id, Customers.name, Customers.email, Transporters.name, Warehouses.name, Warehouses.address FROM OutboundRequest LEFT JOIN Customers ON OutboundRequest.customer_id = Customers.ROWID LEFT JOIN Transporters ON OutboundRequest.transporter_id = Transporters.ROWID LEFT JOIN Warehouses ON OutboundRequest.warehouse_id = Warehouses.ROWID WHERE OutboundRequest.ROWID = ${id}`
  ).then(async (rows) => {
    const row = rows[0];
    if (!row) return null;
    const sourceId = row.OutboundRequest.inbound_advice_id;
    const source = sourceId ? (await zcql(`SELECT inbound_reference FROM InboundAdvice WHERE ROWID = ${idOnly(sourceId)}`))[0]?.InboundAdvice : null;
    return {
      ...row.OutboundRequest,
      customer_name: row.Customers?.name,
      customer_email: row.Customers?.email,
      transporter_name: row.Transporters?.name,
      warehouse_name: row.Warehouses?.name,
      warehouse_address: row.Warehouses?.address,
      source_inbound_reference: source?.inbound_reference || null,
    };
  });

// An outbound created from an inbound (one inbound, many outbounds): the customer asks for goods by the inbound
// or GRN they were given, and the supervisor opens the request from that inbound's page.
export const createOutboundFromInbound = (advice, fields) => {
  const row = {
    customer_id: advice.customer_id,
    warehouse_id: advice.warehouse_id,
    inbound_advice_id: advice.ROWID,
    status: 'Submitted',
  };
  ['transporter_id', 'reference_number', 'requested_date'].forEach((k) => {
    if (fields?.[k]) row[k] = fields[k];
  });
  return createOutboundRequest(row);
};
export const listOutboundsByInbound = (inboundAdviceId) =>
  zcql(
    `SELECT ROWID, outbound_reference, status, requested_date FROM OutboundRequest WHERE inbound_advice_id = ${idOnly(inboundAdviceId)} ORDER BY CREATEDTIME DESC`
  ).then((rows) => rows.map((r) => r.OutboundRequest));

export const listAvailableCargoForCustomer = (customerId, inboundAdviceId) =>
  zcql(
    `SELECT Cargo.ROWID, Cargo.description, Cargo.qty, Cargo.unit, Cargo.status, Cargo.qr_code, Cargo.outer_package_no, StorageLocations.location_code, InboundAdvice.inbound_reference FROM Cargo LEFT JOIN StorageLocations ON Cargo.current_location_id = StorageLocations.ROWID LEFT JOIN InboundAdvice ON Cargo.inbound_advice_id = InboundAdvice.ROWID WHERE Cargo.customer_id = ${customerId}${inboundAdviceId ? ` AND Cargo.inbound_advice_id = ${idOnly(inboundAdviceId)}` : ''} AND ${goneSql('Cargo')} AND Cargo.status != 'Picked' ORDER BY Cargo.CREATEDTIME DESC`
  ).then(async (rows) => {
    // A Handling Unit that is already on any outbound's pick lines belongs to that outbound, so it
    // is not offered to another one (two requests used to be able to claim the same pallet).
    const claimed = new Set((await listClaimedCargoIds(customerId)).map(String));
    return rows
      .filter((r) => !claimed.has(String(r.Cargo.ROWID)))
      .map((r) => ({ ...r.Cargo, location_code: r.StorageLocations?.location_code, inbound_reference: r.InboundAdvice?.inbound_reference }));
  });

// Handling Units of a customer that already sit on some outbound request's pick lines.
const listClaimedCargoIds = (customerId) =>
  zcql(`SELECT PickTask.cargo_id FROM PickTask LEFT JOIN Cargo ON PickTask.cargo_id = Cargo.ROWID WHERE Cargo.customer_id = ${idOnly(customerId)}`).then((rows) =>
    rows.map((r) => r.PickTask.cargo_id)
  );

// Two people acting in the same second each write, then look to see who was first. A write that has just
// finished is not always visible to the other person's look yet, so each side would see only itself and both
// would keep their claim. The look is therefore repeated after short pauses; a claim is kept only if it is still
// first every time. (Without transactions this narrows the gap very far, it cannot close it for certain.)
const SETTLE_MS = 400;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function stillFirstAfterSettling(check) {
  for (let i = 0; i < 2; i++) {
    await pause(SETTLE_MS);
    if (!(await check())) return false;
  }
  return true;
}

// Adds a Handling Unit to an outbound's pick lines, refusing one that another outbound already has
// (checked again here, because the list on screen may be a few seconds old).
export const addPickLine = async (row) => {
  const holders = await zcql(
    `SELECT OutboundRequest.outbound_reference, OutboundRequest.ROWID FROM PickTask LEFT JOIN OutboundRequest ON PickTask.outbound_request_id = OutboundRequest.ROWID WHERE PickTask.cargo_id = ${idOnly(row.cargo_id)}`
  );
  const other = holders.map((h) => h.OutboundRequest).find((o) => String(o?.ROWID) !== String(row.outbound_request_id));
  if (other) throw new Error(`This Handling Unit is already on outbound ${other.outbound_reference || `#${other.ROWID}`}.`);
  if (holders.length) throw new Error('This Handling Unit is already on this outbound.');
  const created = await createPickTask(row);

  // Two people can add the same pallet in the same second and both pass the check above. Look again at who
  // holds it, in order of arrival, and give way if we were second (the same rule as for storage positions).
  let rival = null;
  const stillFirst = async () => {
    const claims = await zcql(
      `SELECT PickTask.ROWID, OutboundRequest.outbound_reference, OutboundRequest.ROWID FROM PickTask LEFT JOIN OutboundRequest ON PickTask.outbound_request_id = OutboundRequest.ROWID WHERE PickTask.cargo_id = ${idOnly(row.cargo_id)} ORDER BY PickTask.CREATEDTIME ASC, PickTask.ROWID ASC`
    );
    const first = claims[0];
    if (!created?.ROWID || !first || String(first.PickTask.ROWID) === String(created.ROWID)) return true;
    rival = first.OutboundRequest;
    return false;
  };
  if (!(await stillFirstAfterSettling(stillFirst))) {
    await removePickTask(created.ROWID);
    throw new Error(`This Handling Unit was just added to outbound ${rival?.outbound_reference || `#${rival?.ROWID}`} by someone else.`);
  }
  return created;
};

export const listPickTasksByRequest = (outboundRequestId) =>
  zcql(
    `SELECT PickTask.ROWID, PickTask.status, PickTask.assigned_to, PickTask.cargo_id, Cargo.description, Cargo.qty, Cargo.unit, Cargo.qr_code, Cargo.status, Cargo.current_location_id, Cargo.outer_package_no, Cargo.inbound_advice_id, InboundAdvice.inbound_reference FROM PickTask LEFT JOIN Cargo ON PickTask.cargo_id = Cargo.ROWID LEFT JOIN InboundAdvice ON Cargo.inbound_advice_id = InboundAdvice.ROWID WHERE PickTask.outbound_request_id = ${outboundRequestId} ORDER BY PickTask.CREATEDTIME`
  ).then((rows) =>
    rows.map((r) => ({
      ...r.PickTask,
      cargo_description: r.Cargo?.description,
      cargo_qty: r.Cargo?.qty,
      cargo_unit: r.Cargo?.unit,
      cargo_qr_code: r.Cargo?.qr_code,
      cargo_status: r.Cargo?.status,
      cargo_location_id: r.Cargo?.current_location_id,
      cargo_hu_no: r.Cargo?.outer_package_no,
      inbound_advice_id: r.Cargo?.inbound_advice_id,
      inbound_reference: r.InboundAdvice?.inbound_reference,
    }))
  );
// Which outbound request (if any) each Handling Unit of an inbound went out on.
export const listOutboundLinksByAdvice = (inboundAdviceId) =>
  zcql(
    `SELECT PickTask.cargo_id, OutboundRequest.ROWID, OutboundRequest.outbound_reference, OutboundRequest.status, OutboundRequest.requested_date FROM PickTask LEFT JOIN OutboundRequest ON PickTask.outbound_request_id = OutboundRequest.ROWID LEFT JOIN Cargo ON PickTask.cargo_id = Cargo.ROWID WHERE Cargo.inbound_advice_id = ${idOnly(inboundAdviceId)}`
  ).then((rows) =>
    rows.map((r) => ({
      cargo_id: r.PickTask.cargo_id,
      outbound_request_id: r.OutboundRequest?.ROWID,
      outbound_reference: r.OutboundRequest?.outbound_reference,
      outbound_status: r.OutboundRequest?.status,
      requested_date: r.OutboundRequest?.requested_date,
    }))
  );
// Pick and Handling Unit status for every outbound, so the list can compute
// each request's Fulfillment Status without a round trip per row.
export const listPickStatusForAllRequests = () =>
  zcql(
    `SELECT PickTask.outbound_request_id, PickTask.status, Cargo.status, COUNT(PickTask.ROWID) FROM PickTask LEFT JOIN Cargo ON PickTask.cargo_id = Cargo.ROWID WHERE PickTask.outbound_request_id IS NOT NULL GROUP BY PickTask.outbound_request_id, PickTask.status, Cargo.status`
  ).then((rows) =>
    expandCounts(rows, 'PickTask', (r) => ({ outbound_request_id: r.PickTask.outbound_request_id, status: r.PickTask.status, cargo_status: r.Cargo?.status }))
  );
export const createPickTask = (row) => addRow(TABLES.PICK_TASK, row);
export const editPickTask = (row) => updateRow(TABLES.PICK_TASK, row);
export const removePickTask = (rowId) => deleteRow(TABLES.PICK_TASK, rowId);

export const listDispatchesByRequest = (outboundRequestId) =>
  zcql(
    `SELECT ROWID, status, dispatched_by, dispatch_date, vehicle_details FROM Dispatch WHERE outbound_request_id = ${outboundRequestId} ORDER BY CREATEDTIME DESC`
  ).then((rows) => rows.map((r) => r.Dispatch));
export const createDispatch = (row) => addRow(TABLES.DISPATCH, { ...row, dispatch_date: formatDatetime() });

// Row IDs here exceed Number.MAX_SAFE_INTEGER, so they must stay strings.
function assertId(id) {
  if (!/^\d+$/.test(String(id))) throw new Error(`Invalid record id: ${id}`);
}

// Best-effort: an audit failure must never block the warehouse action itself.
export function logAudit({ userId, actionType, module, recordId, details }) {
  return addRow(TABLES.AUDIT_LOG, {
    user_id: userId || '',
    action_type: actionType,
    module,
    record_id: String(recordId || ''),
    details: details ? JSON.stringify(details) : '',
    event_timestamp: formatDatetime(),
  }).catch(() => null);
}

const SCAN_TO_STATUS = {
  receiving: 'Received',
  storage: 'Stored',
  relocation: 'Stored',
  retrieval: 'Retrieved',
  pick: 'Picked',
  val: 'In VAL',
  dispatch: 'Dispatched',
  delivery: 'Delivered',
};
// Contexts after which the cargo is no longer sitting in a storage location.
const LEAVES_LOCATION = new Set(['retrieval', 'pick', 'dispatch', 'delivery']);
const MOVEMENT_TYPE = { storage: 'putaway', relocation: 'relocation', retrieval: 'retrieval', pick: 'pick' };

// Logs the scan, moves the cargo to its new status/location, and records
// where it came from and went to -- the "which goods are where" trail.
export async function recordScan(cargoId, scannedBy, scanContext, locationId) {
  assertId(cargoId);
  const newStatus = SCAN_TO_STATUS[scanContext];
  if (!newStatus) throw new Error(`Unknown scan context: ${scanContext}`);
  if ((scanContext === 'storage' || scanContext === 'relocation') && !locationId) {
    throw new Error('Choose a storage location first.');
  }

  let fromLocationId = null;
  let fromStatus = null;
  if (scanContext !== 'receiving') {
    const rows = await zcql(`SELECT current_location_id, status FROM Cargo WHERE ROWID = ${cargoId}`);
    fromLocationId = rows[0]?.Cargo?.current_location_id || null;
    fromStatus = rows[0]?.Cargo?.status || null;
    if (scanContext === 'retrieval' && !fromLocationId) {
      throw new Error('This cargo is not in a storage location, so it cannot be retrieved.');
    }
  }

  const update = { ROWID: cargoId, status: newStatus };
  const placing = scanContext === 'storage' || scanContext === 'relocation';
  if (placing) update.current_location_id = locationId;
  if (LEAVES_LOCATION.has(scanContext)) update.current_location_id = null;
  await updateRow(TABLES.CARGO, update);

  // Someone else may have taken the last space in the same second: look again at who is in the position,
  // in order of arrival, and give way if we were second (see claimOutcome). The look is repeated after short
  // pauses (see stillFirstAfterSettling) so that both people see each other.
  if (placing) {
    assertId(locationId);
    let lastOutcome = { ok: true };
    let positionCode = '';
    const stillMine = async () => {
      const [occupants, place, types] = await Promise.all([
        zcql(`SELECT Cargo.ROWID, Cargo.unit, Cargo.customer_id FROM Cargo WHERE Cargo.current_location_id = ${locationId} AND Cargo.qr_code IS NOT NULL ORDER BY Cargo.MODIFIEDTIME ASC, Cargo.ROWID ASC`),
        zcql(`SELECT location_code, capacity FROM StorageLocations WHERE ROWID = ${locationId}`),
        listPackageTypes(),
      ]);
      positionCode = place[0]?.StorageLocations?.location_code || '';
      lastOutcome = claimOutcome({ cargoId, occupants: occupants.map((r) => r.Cargo), capacity: place[0]?.StorageLocations?.capacity, packageTypes: types });
      return lastOutcome.ok;
    };
    if (!(await stillFirstAfterSettling(stillMine))) {
      await updateRow(TABLES.CARGO, { ROWID: cargoId, current_location_id: fromLocationId, status: fromStatus || 'Received' });
      const code = positionCode || 'That position';
      throw new Error(
        lastOutcome.reason === 'customer'
          ? `${code} was just taken by another customer's goods. Choose another location.`
          : `${code} was just filled by someone else. Choose another location.`
      );
    }
  }

  await addRow(TABLES.SCAN_HISTORY, {
    cargo_id: cargoId,
    scanned_by: scannedBy || '',
    scan_context: scanContext,
    scan_timestamp: formatDatetime(),
  });

  if (MOVEMENT_TYPE[scanContext]) {
    const movement = {
      cargo_id: cargoId,
      moved_by: scannedBy || '',
      movement_type: MOVEMENT_TYPE[scanContext],
      movement_timestamp: formatDatetime(),
    };
    if (locationId && (scanContext === 'storage' || scanContext === 'relocation')) movement.to_location_id = locationId;
    if (fromLocationId) movement.from_location_id = fromLocationId;
    await addRow(TABLES.CARGO_MOVEMENT_LOG, movement);
  }

  logAudit({
    userId: scannedBy,
    actionType: 'RECORD_SCAN',
    module: 'QR Code & Label Management',
    recordId: cargoId,
    details: { scanContext, locationId },
  });

  return { cargoId, scanContext, status: newStatus };
}
export const notifyEvent = (eventType, recipientEmail, recordId, message, module) =>
  callFunction('notifyEvent', { eventType, recipientEmail, recordId, message, module });

// Never rejects: resolves { ok, error } so a mail problem can be reported
// without ever blocking the warehouse action that triggered it.
export const notifySafe = (...args) =>
  notifyEvent(...args)
    .then(() => ({ ok: true }))
    .catch((err) => ({ ok: false, error: err?.error || err?.message || String(err) }));

// -- Dashboard KPIs --
function todayStart() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return formatDatetime(d);
}

// COQL's COUNT(...) response nests the value under whatever field name was
// counted (COUNT(ROWID) -> {ROWID: n}, COUNT(DISTINCT x) -> {x: n}), so pull
// the first value out rather than assuming a fixed key.
// Each count carries a harmless always-true condition with a unique number. Without it, a page
// reloaded while its counts were still running re-sent byte-identical queries, and Catalyst left
// those waiting on the abandoned originals for half a minute or more.
const countOf = (table, expr, where = '') =>
  zcql(`SELECT COUNT(${expr}) FROM ${table} WHERE ${where ? `${where} AND ` : ''}ROWID != ${Date.now()}${Math.floor(Math.random() * 1000)}`).then((rows) => {
    const row = rows[0]?.[table];
    return row ? Object.values(row)[0] : 0;
  });

export const getDashboardStats = (viewer) => {
  const since = todayStart();
  const scope = (warehouseCol, assignedCol) => visibilityClause(viewer, { warehouseCol, assignedCol });
  return Promise.all([
    countOf('Customers', 'ROWID'),
    countOf('StorageLocations', 'ROWID'),
    countOf('Cargo', 'DISTINCT current_location_id', `current_location_id IS NOT NULL${scope('warehouse_id')}`),
    countOf('Cargo', 'ROWID', `${GONE_SQL}${scope('warehouse_id')}`),
    countOf('InboundAdvice', 'ROWID', `CREATEDTIME >= '${since}'${scope('warehouse_id')}`),
    countOf('OutboundRequest', 'ROWID', `CREATEDTIME >= '${since}'${scope('warehouse_id')}`),
    countOf('Tasks', 'ROWID', `status != 'Completed'${scope('warehouse_id', 'assigned_to')}`),
    countOf('VALRequest', 'ROWID', "status != 'Completed'"),
  ]).then(
    ([
      totalCustomers,
      totalLocations,
      occupiedLocations,
      activeCargo,
      todaysInbound,
      todaysOutbound,
      pendingTasks,
      pendingVal,
    ]) => ({
      totalCustomers,
      totalLocations,
      occupiedLocations,
      activeCargo,
      todaysInbound,
      todaysOutbound,
      pendingTasks,
      pendingVal,
    })
  );
};

// -- Reports --
export const listCargoRegister = (viewer) =>
  zcql(
    `SELECT Cargo.ROWID, Cargo.description, Cargo.qty, Cargo.unit, Cargo.status, Cargo.qr_code, Customers.name, StorageLocations.location_code FROM Cargo LEFT JOIN Customers ON Cargo.customer_id = Customers.ROWID LEFT JOIN StorageLocations ON Cargo.current_location_id = StorageLocations.ROWID WHERE Cargo.ROWID != 0${visibilityClause(viewer, { warehouseCol: 'Cargo.warehouse_id' })} ORDER BY Cargo.CREATEDTIME DESC`
  ).then((rows) =>
    rows.map((r) => ({
      ...r.Cargo,
      customer_name: r.Customers?.name,
      location_code: r.StorageLocations?.location_code,
    }))
  );

export const listDispatchReport = (viewer) =>
  zcql(
    `SELECT Dispatch.ROWID, Dispatch.status, Dispatch.dispatched_by, Dispatch.dispatch_date, Dispatch.vehicle_details, OutboundRequest.ROWID, Customers.name FROM Dispatch LEFT JOIN OutboundRequest ON Dispatch.outbound_request_id = OutboundRequest.ROWID LEFT JOIN Customers ON OutboundRequest.customer_id = Customers.ROWID WHERE Dispatch.ROWID != 0${visibilityClause(viewer, { warehouseCol: 'OutboundRequest.warehouse_id' })} ORDER BY Dispatch.CREATEDTIME DESC`
  ).then((rows) =>
    rows.map((r) => ({
      ...r.Dispatch,
      outbound_request_id: r.OutboundRequest?.ROWID,
      customer_name: r.Customers?.name,
    }))
  );

export const getCargoTimeline = (cargoId) =>
  Promise.all([
    zcql(`SELECT * FROM Cargo WHERE ROWID = ${cargoId}`).then((rows) => rows[0]?.Cargo || null),
    zcql(
      `SELECT ROWID, from_location_id, to_location_id, moved_by, movement_type, movement_timestamp FROM CargoMovementLog WHERE cargo_id = ${cargoId} ORDER BY CREATEDTIME`
    ).then((rows) => rows.map((r) => r.CargoMovementLog)),
    zcql(
      `SELECT ROWID, scanned_by, scan_context, scan_timestamp FROM ScanHistory WHERE cargo_id = ${cargoId} ORDER BY CREATEDTIME`
    ).then((rows) => rows.map((r) => r.ScanHistory)),
  ]).then(([cargo, movements, scans]) => ({ cargo, movements, scans }));

export const markCargoDelivered = (cargoIds, deliveredBy) =>
  Promise.all(cargoIds.map((id) => recordScan(id, deliveredBy, 'delivery')));

// -- Business role lookup (AppUsers) --
export const getAppUserByEmail = (email) =>
  zcql(`SELECT ROWID, business_role, warehouse_id, user_status FROM AppUsers WHERE email = '${email}'`).then(
    (rows) => rows[0]?.AppUsers || null
  );

// -- System Administration --
export const listAppUsers = () => getAllRows('AppUsers', 500);

// -- Per-warehouse roles (UserWarehouseRole) --
export const listUserWarehouseRoles = (appUserId) =>
  zcql(`SELECT ROWID, warehouse_id, business_role FROM UserWarehouseRole WHERE app_user_id = ${idOnly(appUserId)}`).then((rows) =>
    rows.map((r) => r.UserWarehouseRole)
  );
export const listAllUserWarehouseRoles = () => getAllRows('UserWarehouseRole', 500);
export const createUserWarehouseRole = (row) => addRow('UserWarehouseRole', row);
export const editUserWarehouseRole = (row) => updateRow('UserWarehouseRole', row);
export const removeUserWarehouseRole = (rowId) => deleteRow('UserWarehouseRole', rowId);
export const editAppUser = (row) => updateRow('AppUsers', row);
export const listRolePermissions = () => getAllRows('RolePermissions', 500);
export const inviteUser = (firstName, lastName, email, businessRole, redirectUrl, assignments) =>
  callFunction('inviteUser', { firstName, lastName, email, businessRole, redirectUrl, assignments });

// -- Audit trail, scoped per module (shown inline on each module's pages) --
export const listAuditLogForModule = (modules, recordId, limit = 50) => {
  const moduleList = Array.isArray(modules) ? modules : [modules];
  const moduleClause = moduleList.map((m) => `module = '${m}'`).join(' OR ');
  const recordClause = recordId != null ? ` AND record_id = '${recordId}'` : '';
  return zcql(
    `SELECT ROWID, user_id, action_type, module, record_id, event_timestamp FROM AuditLog WHERE (${moduleClause})${recordClause} ORDER BY CREATEDTIME DESC`
  ).then((rows) => rows.slice(0, limit).map((r) => r.AuditLog));
};
