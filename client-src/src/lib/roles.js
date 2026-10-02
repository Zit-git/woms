// Roles allowed to create, confirm, and receive Inbound requests, and to
// verify a GRN before an inbound can be finished. Warehouse Operator is
// deliberately excluded from all of these gates.
export const APPROVER_ROLES = ['System Administrator', 'Warehouse Manager', 'Warehouse Supervisor'];
