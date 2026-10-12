// Per-warehouse access. A "viewer" is built once in AuthContext:
//   { isAdmin, email, assignments: [{ warehouseId, role }], activeWarehouseId }
// System Administrators see every warehouse; everyone else only the warehouses
// they are assigned to, each with its own role (a user can be a Manager in
// one warehouse and an Operator in another).
export const ADMIN_ROLE = 'System Administrator';
export const STAFF_LEVEL = 'Warehouse Staff'; // global level of non-admin users
export const WAREHOUSE_ROLES = ['Warehouse Manager', 'Warehouse Supervisor', 'Warehouse Operator'];
const APPROVING_ROLES = ['Warehouse Manager', 'Warehouse Supervisor'];

const sameId = (a, b) => String(a) === String(b);

export function accessibleWarehouseIds(viewer) {
  if (!viewer || viewer.isAdmin) return null; // null = all
  return viewer.assignments.map((a) => String(a.warehouseId));
}

export function canAccessWarehouse(viewer, warehouseId) {
  if (!viewer) return false;
  if (viewer.isAdmin) return true;
  if (!warehouseId) return false; // records with no warehouse are admin-only
  return viewer.assignments.some((a) => sameId(a.warehouseId, warehouseId));
}

export function roleIn(viewer, warehouseId) {
  if (!viewer) return null;
  if (viewer.isAdmin) return ADMIN_ROLE;
  return viewer.assignments.find((a) => sameId(a.warehouseId, warehouseId))?.role || null;
}

export function canApproveIn(viewer, warehouseId) {
  if (!viewer) return false;
  if (viewer.isAdmin) return true;
  return APPROVING_ROLES.includes(roleIn(viewer, warehouseId));
}

export function canApproveAnywhere(viewer) {
  return Boolean(viewer && (viewer.isAdmin || viewer.assignments.some((a) => APPROVING_ROLES.includes(a.role))));
}

export function warehousesWhereCanApprove(viewer, warehouses) {
  return (warehouses || []).filter((w) => canApproveIn(viewer, w.ROWID));
}

// Warehouses a viewer may see (optionally narrowed by the header selector).
export function accessibleWarehouses(viewer, warehouses) {
  const list = (warehouses || []).filter((w) => canAccessWarehouse(viewer, w.ROWID));
  return viewer?.activeWarehouseId ? list.filter((w) => sameId(w.ROWID, viewer.activeWarehouseId)) : list;
}

// Capacity inputs (locations, cargo, outbound commitments) restricted to the
// warehouses the viewer can see. Rows with no warehouse are admin-only.
export function scopeByWarehouse(viewer, rows) {
  if (!viewer || (viewer.isAdmin && !viewer.activeWarehouseId)) return rows;
  const ids = viewer.activeWarehouseId ? [String(viewer.activeWarehouseId)] : accessibleWarehouseIds(viewer);
  return (rows || []).filter((r) => r.warehouse_id && ids.includes(String(r.warehouse_id)));
}

// Short text for the sidebar: "System Administrator" or "Manager · Rotterdam DC2, Operator · Hamburg DC".
export function describeAccess(viewer, warehouses) {
  if (!viewer) return '';
  if (viewer.isAdmin) return ADMIN_ROLE;
  const name = (id) => warehouses?.find((w) => sameId(w.ROWID, id))?.name || 'Warehouse';
  return viewer.assignments.map((a) => `${a.role.replace('Warehouse ', '')} · ${name(a.warehouseId)}`).join(', ');
}
