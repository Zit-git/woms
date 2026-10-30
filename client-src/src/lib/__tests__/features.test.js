import { describe, it, expect } from 'vitest';
import { resolveFeatures } from '../features';

describe('resolveFeatures', () => {
  it('defaults everything on', () => {
    expect(resolveFeatures([])).toEqual({ multi_warehouse: true, storage_locations: true, visual_map: true, availability: true });
  });
  it('reads stored values', () => {
    const f = resolveFeatures([{ setting_key: 'multi_warehouse', setting_value: 'false' }]);
    expect(f.multi_warehouse).toBe(false);
    expect(f.visual_map).toBe(true);
  });
  it('switches dependents off with Storage Locations', () => {
    const f = resolveFeatures([{ setting_key: 'storage_locations', setting_value: 'false' }]);
    expect(f.visual_map).toBe(false);
    expect(f.availability).toBe(false);
  });
});
