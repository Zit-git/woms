import { addRow, updateRow, deleteRow, getAllRows, zcql, callFunction } from './catalystClient';

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
};

// Catalyst datetime columns expect "YYYY-MM-DD HH:mm:ss" on insert/update
// (ISO strings and millisecond-precision values are both rejected).
function formatDatetime(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  );
}

// -- Customers --
export const listCustomers = () => getAllRows(TABLES.CUSTOMERS);
export const createCustomer = (row) => addRow(TABLES.CUSTOMERS, row);
export const editCustomer = (row) => updateRow(TABLES.CUSTOMERS, row);
export const removeCustomer = (rowId) => deleteRow(TABLES.CUSTOMERS, rowId);

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

// -- Inbound Operations --
export const listInboundAdvice = () =>
  zcql(
    `SELECT InboundAdvice.ROWID, InboundAdvice.expected_date, InboundAdvice.transport_details, InboundAdvice.status, Customers.name FROM InboundAdvice LEFT JOIN Customers ON InboundAdvice.customer_id = Customers.ROWID ORDER BY InboundAdvice.CREATEDTIME DESC`
  ).then((rows) => rows.map((r) => ({ ...r.InboundAdvice, customer_name: r.Customers?.name })));
export const createInboundAdvice = (row) => addRow(TABLES.INBOUND_ADVICE, row);
export const editInboundAdvice = (row) => updateRow(TABLES.INBOUND_ADVICE, row);
export const getInboundAdviceById = (id) =>
  zcql(
    `SELECT InboundAdvice.ROWID, InboundAdvice.expected_date, InboundAdvice.transport_details, InboundAdvice.status, InboundAdvice.customer_id, Customers.name FROM InboundAdvice LEFT JOIN Customers ON InboundAdvice.customer_id = Customers.ROWID WHERE InboundAdvice.ROWID = ${id}`
  ).then((rows) => {
    const row = rows[0];
    return row ? { ...row.InboundAdvice, customer_name: row.Customers?.name } : null;
  });

export const listCargoByAdvice = (inboundAdviceId) =>
  zcql(
    `SELECT ROWID, description, qty, unit, weight, dimensions, qr_code, status FROM Cargo WHERE inbound_advice_id = ${inboundAdviceId} ORDER BY CREATEDTIME`
  ).then((rows) => rows.map((r) => r.Cargo));
export const createCargo = (row) => addRow(TABLES.CARGO, row);

export const generateQRCode = (cargoId) => callFunction('generateQRCode', { cargoId });
export const createGRN = (inboundAdviceId, verifiedBy) => callFunction('createGRN', { inboundAdviceId, verifiedBy });

// -- Outbound Operations --
export const listOutboundRequests = () =>
  zcql(
    `SELECT OutboundRequest.ROWID, OutboundRequest.requested_date, OutboundRequest.status, Customers.name FROM OutboundRequest LEFT JOIN Customers ON OutboundRequest.customer_id = Customers.ROWID ORDER BY OutboundRequest.CREATEDTIME DESC`
  ).then((rows) => rows.map((r) => ({ ...r.OutboundRequest, customer_name: r.Customers?.name })));
export const createOutboundRequest = (row) => addRow(TABLES.OUTBOUND_REQUEST, row);
export const editOutboundRequest = (row) => updateRow(TABLES.OUTBOUND_REQUEST, row);
export const getOutboundRequestById = (id) =>
  zcql(
    `SELECT OutboundRequest.ROWID, OutboundRequest.requested_date, OutboundRequest.status, OutboundRequest.customer_id, Customers.name, Customers.email FROM OutboundRequest LEFT JOIN Customers ON OutboundRequest.customer_id = Customers.ROWID WHERE OutboundRequest.ROWID = ${id}`
  ).then((rows) => {
    const row = rows[0];
    return row ? { ...row.OutboundRequest, customer_name: row.Customers?.name, customer_email: row.Customers?.email } : null;
  });

export const listAvailableCargoForCustomer = (customerId) =>
  zcql(
    `SELECT ROWID, description, qty, unit, status, qr_code FROM Cargo WHERE customer_id = ${customerId} AND status != 'Dispatched' ORDER BY CREATEDTIME DESC`
  ).then((rows) => rows.map((r) => r.Cargo));

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

export const recordScan = (cargoId, scannedBy, scanContext, locationId) =>
  callFunction('recordScan', { cargoId, scannedBy, scanContext, locationId });
export const notifyEvent = (eventType, recipientEmail, recordId, message, module) =>
  callFunction('notifyEvent', { eventType, recipientEmail, recordId, message, module });

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
    countOf('Cargo', 'ROWID', "status != 'Dispatched'"),
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

// -- Business role lookup (AppUsers) --
export const getAppUserByEmail = (email) =>
  zcql(`SELECT ROWID, business_role, warehouse_id, user_status FROM AppUsers WHERE email = '${email}'`).then(
    (rows) => rows[0]?.AppUsers || null
  );
