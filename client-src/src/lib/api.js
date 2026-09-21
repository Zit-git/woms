import { addRow, updateRow, deleteRow, getAllRows, zcql, callFunction } from './catalystClient';
import { formatSequentialRef } from './reference';

const TABLES = {
  CUSTOMERS: 'Customers',
  WAREHOUSES: 'Warehouses',
  ZONES: 'Zones',
  RACKS: 'Racks',
  STORAGE_LOCATIONS: 'StorageLocations',
  INBOUND_ADVICE: 'InboundAdvice',
  CARGO: 'Cargo',
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

// Tier-based visibility: System Administrator sees everything; Warehouse
// Manager/Supervisor see everything in their own warehouse; Warehouse
// Operator sees only records assigned to them. Returns a " AND ..." clause
// fragment to append to a query's WHERE, or '' for unrestricted (Admin, or
// a viewer with no role/warehouse info yet -- fails open rather than
// hiding everything from a not-yet-fully-loaded session).
function visibilityClause(viewer, { warehouseCol, assignedCol } = {}) {
  if (!viewer || !viewer.businessRole || viewer.businessRole === 'System Administrator') return '';
  if (viewer.businessRole === 'Warehouse Operator' && assignedCol && viewer.email) {
    return ` AND ${assignedCol} = '${viewer.email}'`;
  }
  if (warehouseCol && viewer.warehouseId) {
    return ` AND ${warehouseCol} = ${viewer.warehouseId}`;
  }
  return '';
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

export const getCustomerActivity = (customerId) =>
  Promise.all([
    zcql(
      `SELECT ROWID, expected_date, status FROM InboundAdvice WHERE customer_id = ${customerId} ORDER BY CREATEDTIME DESC`
    ).then((rows) => rows.map((r) => r.InboundAdvice)),
    zcql(
      `SELECT ROWID, requested_date, status FROM OutboundRequest WHERE customer_id = ${customerId} ORDER BY CREATEDTIME DESC`
    ).then((rows) => rows.map((r) => r.OutboundRequest)),
    zcql(`SELECT ROWID, description, qty, unit, status FROM Cargo WHERE customer_id = ${customerId} ORDER BY CREATEDTIME DESC`).then(
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

export const listRacksByZone = (zoneId) =>
  zcql(`SELECT ROWID, code, zone_id FROM Racks WHERE zone_id = ${zoneId}`).then((rows) => rows.map((r) => r.Racks));
export const createRack = (row) => addRow(TABLES.RACKS, row);
export const editRack = (row) => updateRow(TABLES.RACKS, row);
export const removeRack = (rowId) => deleteRow(TABLES.RACKS, rowId);

export const listLocationsByRack = (rackId) =>
  zcql(
    `SELECT ROWID, location_code, capacity, occupancy_status, rack_id FROM StorageLocations WHERE rack_id = ${rackId}`
  ).then((rows) => rows.map((r) => r.StorageLocations));
export const createLocation = (row) => addRow(TABLES.STORAGE_LOCATIONS, row);
export const editLocation = (row) => updateRow(TABLES.STORAGE_LOCATIONS, row);
export const removeLocation = (rowId) => deleteRow(TABLES.STORAGE_LOCATIONS, rowId);

// Full zone -> rack -> location hierarchy for one warehouse, with each
// location flagged occupied/empty from current Cargo placements.
export const getWarehouseMap = (warehouseId) =>
  Promise.all([
    listZonesByWarehouse(warehouseId),
    zcql(`SELECT current_location_id FROM Cargo WHERE current_location_id IS NOT NULL AND ${GONE_SQL}`).then(
      (rows) => new Set(rows.map((r) => String(r.Cargo.current_location_id)))
    ),
  ]).then(([zones, occupiedIds]) =>
    Promise.all(
      zones.map((zone) =>
        listRacksByZone(zone.ROWID).then((racks) =>
          Promise.all(
            racks.map((rack) =>
              listLocationsByRack(rack.ROWID).then((locations) => ({
                rack,
                locations: locations.map((loc) => ({ ...loc, occupied: occupiedIds.has(String(loc.ROWID)) })),
              }))
            )
          ).then((racksWithLocations) => ({ zone, racks: racksWithLocations }))
        )
      )
    )
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
export const listCargoStatusForAllAdvices = () =>
  zcql(`SELECT Cargo.inbound_advice_id, Cargo.status FROM Cargo WHERE Cargo.inbound_advice_id IS NOT NULL`).then(
    (rows) => rows.map((r) => r.Cargo)
  );
export const createInboundAdvice = (row) => addRow(TABLES.INBOUND_ADVICE, row);
export const editInboundAdvice = (row) => updateRow(TABLES.INBOUND_ADVICE, row);

// Creates a bare draft row and immediately assigns its reference (derived
// from the new ROWID, so it's collision-free without a separate counter),
// ready for the wizard to open straight into Step 1.
export const startNewInboundAdvice = (warehouseId) =>
  createInboundAdvice({ warehouse_id: warehouseId || undefined, status: 'Pending' }).then((created) => {
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
].map((f) => `InboundAdvice.${f}`);

// Supplier reuses the Customers directory, but ZCQL doesn't support
// self-joins with an alias (tried: "Unkown Table Suppliers in SELECT"), so
// its name is resolved client-side from the already-loaded customers list
// (StepGeneral/StepCheck both load listCustomers() anyway for the lookup).
export const getInboundAdviceById = (id) =>
  zcql(
    `SELECT ${INBOUND_ADVICE_FIELDS.join(', ')}, Customers.name, Customers.email, Transporters.name FROM InboundAdvice LEFT JOIN Customers ON InboundAdvice.customer_id = Customers.ROWID LEFT JOIN Transporters ON InboundAdvice.transporter_id = Transporters.ROWID WHERE InboundAdvice.ROWID = ${id}`
  ).then((rows) => {
    const row = rows[0];
    if (!row) return null;
    return {
      ...row.InboundAdvice,
      customer_name: row.Customers?.name,
      customer_email: row.Customers?.email,
      transporter_name: row.Transporters?.name,
    };
  });

export const listCargoByAdvice = (inboundAdviceId) =>
  zcql(
    `SELECT ROWID, description, qty, unit, weight, dimensions, outer_package_no, length_cm, width_cm, height_cm, qr_code, status FROM Cargo WHERE inbound_advice_id = ${inboundAdviceId} ORDER BY CREATEDTIME`
  ).then((rows) => rows.map((r) => r.Cargo));
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
export const createGRN = (inboundAdviceId, verifiedBy) => callFunction('createGRN', { inboundAdviceId, verifiedBy });

export const sendInboundConfirmationEmail = (inboundAdviceId, recipientEmail, message) =>
  notifyEvent('INBOUND_COMPLETED', recipientEmail, String(inboundAdviceId), message, 'Inbound Operations');

// -- Storage (put-away / relocation) --
export const listAllStorageLocations = () =>
  zcql(
    `SELECT StorageLocations.ROWID, StorageLocations.location_code, StorageLocations.capacity, Racks.code, Zones.name, Warehouses.name FROM StorageLocations LEFT JOIN Racks ON StorageLocations.rack_id = Racks.ROWID LEFT JOIN Zones ON Racks.zone_id = Zones.ROWID LEFT JOIN Warehouses ON Zones.warehouse_id = Warehouses.ROWID`
  ).then((rows) =>
    rows.map((r) => ({
      ROWID: r.StorageLocations.ROWID,
      location_code: r.StorageLocations.location_code,
      capacity: r.StorageLocations.capacity,
      path: [r.Warehouses?.name, r.Zones?.name, r.Racks?.code].filter(Boolean).join(' / '),
    }))
  );

const STOCK_COLUMNS =
  'Cargo.ROWID, Cargo.description, Cargo.qty, Cargo.unit, Cargo.weight, Cargo.qr_code, Cargo.status, Cargo.outer_package_no, Cargo.current_location_id, Cargo.inbound_advice_id, Customers.name, InboundAdvice.inbound_reference, InboundAdvice.destination';
const STOCK_JOINS =
  'FROM Cargo LEFT JOIN Customers ON Cargo.customer_id = Customers.ROWID LEFT JOIN InboundAdvice ON Cargo.inbound_advice_id = InboundAdvice.ROWID';
const toStockRow = (r) => ({
  ...r.Cargo,
  customer_name: r.Customers?.name,
  inbound_reference: r.InboundAdvice?.inbound_reference,
  destination: r.InboundAdvice?.destination,
});

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
// ZCQL allows at most 4 joins per query, so the inbound reference is looked up
// separately rather than joined.
export const listDeliveryGoods = (viewer) =>
  Promise.all([
    zcql(
      `SELECT Cargo.ROWID, Cargo.description, Cargo.qty, Cargo.unit, Cargo.weight, Cargo.qr_code, Cargo.status, Cargo.outer_package_no, Cargo.inbound_advice_id, Cargo.MODIFIEDTIME, Customers.name, OutboundRequest.ROWID, OutboundRequest.reference_number, Dispatch.vehicle_details, Dispatch.dispatch_date, Dispatch.dispatched_by FROM Cargo LEFT JOIN Customers ON Cargo.customer_id = Customers.ROWID LEFT JOIN PickTask ON PickTask.cargo_id = Cargo.ROWID LEFT JOIN OutboundRequest ON PickTask.outbound_request_id = OutboundRequest.ROWID LEFT JOIN Dispatch ON Dispatch.outbound_request_id = OutboundRequest.ROWID WHERE (Cargo.status = 'Dispatched' OR Cargo.status = 'Delivered')${visibilityClause(viewer, { warehouseCol: 'Cargo.warehouse_id' })} ORDER BY Cargo.MODIFIEDTIME DESC`
    ),
    zcql('SELECT ROWID, inbound_reference FROM InboundAdvice'),
  ]).then(([rows, adviceRows]) => {
    const refById = new Map(adviceRows.map((r) => [String(r.InboundAdvice.ROWID), r.InboundAdvice.inbound_reference]));
    return rows.map((r) => ({
      ...r.Cargo,
      customer_name: r.Customers?.name,
      inbound_reference: refById.get(String(r.Cargo.inbound_advice_id)),
      outbound_request_id: r.OutboundRequest?.ROWID,
      outbound_reference: r.OutboundRequest?.reference_number,
      vehicle_details: r.Dispatch?.vehicle_details,
      dispatch_date: r.Dispatch?.dispatch_date,
      dispatched_by: r.Dispatch?.dispatched_by,
    }));
  });

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

export const listCargoForCustomer = (customerId) =>
  zcql(`SELECT ROWID, description, qty, unit, status FROM Cargo WHERE customer_id = ${customerId} ORDER BY CREATEDTIME DESC`).then(
    (rows) => rows.map((r) => r.Cargo)
  );

// -- Outbound Operations --
export const listOutboundRequests = (viewer) =>
  zcql(
    `SELECT OutboundRequest.ROWID, OutboundRequest.requested_date, OutboundRequest.status, OutboundRequest.reference_number, Customers.name, Transporters.name FROM OutboundRequest LEFT JOIN Customers ON OutboundRequest.customer_id = Customers.ROWID LEFT JOIN Transporters ON OutboundRequest.transporter_id = Transporters.ROWID WHERE OutboundRequest.ROWID != 0${visibilityClause(viewer, { warehouseCol: 'OutboundRequest.warehouse_id' })} ORDER BY OutboundRequest.CREATEDTIME DESC`
  ).then((rows) =>
    rows.map((r) => ({ ...r.OutboundRequest, customer_name: r.Customers?.name, transporter_name: r.Transporters?.name }))
  );
export const createOutboundRequest = (row) => addRow(TABLES.OUTBOUND_REQUEST, row);
export const editOutboundRequest = (row) => updateRow(TABLES.OUTBOUND_REQUEST, row);
export const getOutboundRequestById = (id) =>
  zcql(
    `SELECT OutboundRequest.ROWID, OutboundRequest.requested_date, OutboundRequest.status, OutboundRequest.reference_number, OutboundRequest.customer_id, OutboundRequest.transporter_id, Customers.name, Customers.email, Transporters.name FROM OutboundRequest LEFT JOIN Customers ON OutboundRequest.customer_id = Customers.ROWID LEFT JOIN Transporters ON OutboundRequest.transporter_id = Transporters.ROWID WHERE OutboundRequest.ROWID = ${id}`
  ).then((rows) => {
    const row = rows[0];
    return row
      ? {
          ...row.OutboundRequest,
          customer_name: row.Customers?.name,
          customer_email: row.Customers?.email,
          transporter_name: row.Transporters?.name,
        }
      : null;
  });

export const listAvailableCargoForCustomer = (customerId) =>
  zcql(
    `SELECT Cargo.ROWID, Cargo.description, Cargo.qty, Cargo.unit, Cargo.status, Cargo.qr_code, Cargo.outer_package_no, StorageLocations.location_code, InboundAdvice.inbound_reference FROM Cargo LEFT JOIN StorageLocations ON Cargo.current_location_id = StorageLocations.ROWID LEFT JOIN InboundAdvice ON Cargo.inbound_advice_id = InboundAdvice.ROWID WHERE Cargo.customer_id = ${customerId} AND ${goneSql('Cargo')} AND Cargo.status != 'Picked' ORDER BY Cargo.CREATEDTIME DESC`
  ).then((rows) =>
    rows.map((r) => ({ ...r.Cargo, location_code: r.StorageLocations?.location_code, inbound_reference: r.InboundAdvice?.inbound_reference }))
  );

export const listPickTasksByRequest = (outboundRequestId) =>
  zcql(
    `SELECT PickTask.ROWID, PickTask.status, PickTask.assigned_to, PickTask.cargo_id, Cargo.description, Cargo.qty, Cargo.unit, Cargo.qr_code, Cargo.status FROM PickTask LEFT JOIN Cargo ON PickTask.cargo_id = Cargo.ROWID WHERE PickTask.outbound_request_id = ${outboundRequestId} ORDER BY PickTask.CREATEDTIME`
  ).then((rows) =>
    rows.map((r) => ({
      ...r.PickTask,
      cargo_description: r.Cargo?.description,
      cargo_qty: r.Cargo?.qty,
      cargo_unit: r.Cargo?.unit,
      cargo_qr_code: r.Cargo?.qr_code,
      cargo_status: r.Cargo?.status,
    }))
  );
export const createPickTask = (row) => addRow(TABLES.PICK_TASK, row);
export const editPickTask = (row) => updateRow(TABLES.PICK_TASK, row);

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
  if (scanContext !== 'receiving') {
    const rows = await zcql(`SELECT current_location_id, status FROM Cargo WHERE ROWID = ${cargoId}`);
    fromLocationId = rows[0]?.Cargo?.current_location_id || null;
    if (scanContext === 'retrieval' && !fromLocationId) {
      throw new Error('This cargo is not in a storage location, so it cannot be retrieved.');
    }
  }

  await addRow(TABLES.SCAN_HISTORY, {
    cargo_id: cargoId,
    scanned_by: scannedBy || '',
    scan_context: scanContext,
    scan_timestamp: formatDatetime(),
  });

  const update = { ROWID: cargoId, status: newStatus };
  if (scanContext === 'storage' || scanContext === 'relocation') update.current_location_id = locationId;
  if (LEAVES_LOCATION.has(scanContext)) update.current_location_id = null;
  await updateRow(TABLES.CARGO, update);

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
const countOf = (table, expr, where = '') =>
  zcql(`SELECT COUNT(${expr}) FROM ${table}${where ? ` WHERE ${where}` : ''}`).then((rows) => {
    const row = rows[0]?.[table];
    return row ? Object.values(row)[0] : 0;
  });

export const getDashboardStats = () => {
  const since = todayStart();
  return Promise.all([
    countOf('Customers', 'ROWID'),
    countOf('StorageLocations', 'ROWID'),
    countOf('Cargo', 'DISTINCT current_location_id', 'current_location_id IS NOT NULL'),
    countOf('Cargo', 'ROWID', GONE_SQL),
    countOf('InboundAdvice', 'ROWID', `CREATEDTIME >= '${since}'`),
    countOf('OutboundRequest', 'ROWID', `CREATEDTIME >= '${since}'`),
    countOf('Tasks', 'ROWID', "status != 'Completed'"),
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
export const listCargoRegister = () =>
  zcql(
    `SELECT Cargo.ROWID, Cargo.description, Cargo.qty, Cargo.unit, Cargo.status, Cargo.qr_code, Customers.name, StorageLocations.location_code FROM Cargo LEFT JOIN Customers ON Cargo.customer_id = Customers.ROWID LEFT JOIN StorageLocations ON Cargo.current_location_id = StorageLocations.ROWID ORDER BY Cargo.CREATEDTIME DESC`
  ).then((rows) =>
    rows.map((r) => ({
      ...r.Cargo,
      customer_name: r.Customers?.name,
      location_code: r.StorageLocations?.location_code,
    }))
  );

export const listDispatchReport = () =>
  zcql(
    `SELECT Dispatch.ROWID, Dispatch.status, Dispatch.dispatched_by, Dispatch.dispatch_date, Dispatch.vehicle_details, OutboundRequest.ROWID, Customers.name FROM Dispatch LEFT JOIN OutboundRequest ON Dispatch.outbound_request_id = OutboundRequest.ROWID LEFT JOIN Customers ON OutboundRequest.customer_id = Customers.ROWID ORDER BY Dispatch.CREATEDTIME DESC`
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
export const listRolePermissions = () => getAllRows('RolePermissions', 500);
export const inviteUser = (firstName, lastName, email, businessRole, redirectUrl, warehouseId) =>
  callFunction('inviteUser', { firstName, lastName, email, businessRole, redirectUrl, warehouseId });

// -- Audit trail, scoped per module (shown inline on each module's pages) --
export const listAuditLogForModule = (modules, recordId, limit = 50) => {
  const moduleList = Array.isArray(modules) ? modules : [modules];
  const moduleClause = moduleList.map((m) => `module = '${m}'`).join(' OR ');
  const recordClause = recordId != null ? ` AND record_id = '${recordId}'` : '';
  return zcql(
    `SELECT ROWID, user_id, action_type, module, record_id, event_timestamp FROM AuditLog WHERE (${moduleClause})${recordClause} ORDER BY CREATEDTIME DESC`
  ).then((rows) => rows.slice(0, limit).map((r) => r.AuditLog));
};
