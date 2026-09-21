// Maps app routes to the permission "modules" stored in RolePermissions.
// Order matters: the first prefix that matches wins. The dashboard ('/') is
// open to every signed-in user with a role.
const ROUTE_MODULES = [
  ['/customers', 'Customer Management'],
  ['/warehouse', 'Warehouse Management'],
  ['/transporters', 'Warehouse Management'],
  ['/inbound', 'Inbound Operations'],
  ['/print/inbound', 'Inbound Operations'],
  ['/print/putaway', 'Inbound Operations'],
  ['/storage', 'Cargo & Storage Management'],
  ['/cargo', 'Cargo & Storage Management'],
  ['/outbound', 'Outbound Operations'],
  ['/print/outbound', 'Outbound Operations'],
  ['/delivery', 'Outbound Operations'],
  ['/tasks', 'Operational Task Management'],
  ['/val', 'Value Added Logistics'],
  ['/reports', 'Reports & Dashboards'],
  ['/admin', 'System Administration'],
  ['/settings', 'System Administration'],
];

export function moduleForPath(pathname) {
  const match = ROUTE_MODULES.find(([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  return match ? match[1] : null;
}
