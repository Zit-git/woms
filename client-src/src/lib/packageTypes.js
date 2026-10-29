// What a package / Handling-Unit type may be called and how much capacity it uses. Goods are matched to their type
// by name (without regard to capital letters), so a name must be unique and cannot change under goods that use it.
export const CAPACITY_UNITS = ['Pallet Positions', 'Cartons', 'Crates', 'm²', 'm³', 'Other'];

export const sameTypeName = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();

// Returns the first problem as a sentence, or '' when the type can be saved.
// `existing` is every package type; `editingId` is the one being changed (null for a new one).
export function validatePackageType({ name, units_per_item }, existing, editingId = null) {
  if (!String(name || '').trim()) return 'Give the type a name.';
  const clash = (existing || []).find((p) => String(p.ROWID) !== String(editingId) && sameTypeName(p.name, name));
  if (clash) return `A type called "${clash.name}" already exists.`;
  const per = Number(units_per_item);
  if (!Number.isFinite(per) || per <= 0) return 'Units per item must be a number above 0.';
  return '';
}
