// Warehouse-module feature switches, set by a System Administrator in Settings. Missing
// settings default to ON so an install that never touched them behaves as before.
export const FEATURES = [
  { key: 'multi_warehouse', label: 'Multiwarehouse', description: 'Manage more than one warehouse and switch between them. Off: a single warehouse.' },
  { key: 'storage_locations', label: 'Storage Locations', description: 'Zones, aisles, racks, storage locations and package types. Off: goods are tracked without a location structure.' },
  { key: 'visual_map', label: 'Visual Map', description: 'The warehouse map tab. Needs Storage Locations.', requires: 'storage_locations' },
  { key: 'availability', label: 'Availability', description: 'Capacity and availability views, and the capacity check when accepting an inbound. Needs Storage Locations.', requires: 'storage_locations' },
];

export const FEATURE_DEFAULTS = Object.fromEntries(FEATURES.map((f) => [f.key, true]));

// rows: AppSettings rows ({ setting_key, setting_value }). A feature that needs another is off when that one is off.
export function resolveFeatures(rows = []) {
  const stored = new Map(rows.map((r) => [r.setting_key, String(r.setting_value).toLowerCase() !== 'false']));
  const out = {};
  FEATURES.forEach((f) => {
    out[f.key] = stored.has(f.key) ? stored.get(f.key) : true;
  });
  FEATURES.forEach((f) => {
    if (f.requires && !out[f.requires]) out[f.key] = false;
  });
  return out;
}
