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
};

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

// -- Business role lookup (AppUsers) --
export const getAppUserByEmail = (email) =>
  zcql(`SELECT ROWID, business_role, warehouse_id, user_status FROM AppUsers WHERE email = '${email}'`).then(
    (rows) => rows[0]?.AppUsers || null
  );
