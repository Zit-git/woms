import { describe, it, expect } from 'vitest';
import { validatePackageType, sameTypeName } from '../packageTypes';

const existing = [
  { ROWID: '1', name: 'Pallet' },
  { ROWID: '2', name: 'Box' },
];

describe('package type validation', () => {
  it('accepts a new, unique type', () => {
    expect(validatePackageType({ name: 'Tote', units_per_item: '0.25' }, existing)).toBe('');
  });
  it('needs a name', () => {
    expect(validatePackageType({ name: '   ', units_per_item: 1 }, existing)).toMatch(/name/);
  });
  it('refuses a name another type has, whatever the capital letters or spaces', () => {
    expect(validatePackageType({ name: ' pallet ', units_per_item: 1 }, existing)).toMatch(/already exists/);
  });
  it('lets a type keep its own name while it is edited', () => {
    expect(validatePackageType({ name: 'Box', units_per_item: 0.3 }, existing, '2')).toBe('');
  });
  it('refuses a name that belongs to another type while editing', () => {
    expect(validatePackageType({ name: 'Pallet', units_per_item: 1 }, existing, '2')).toMatch(/already exists/);
  });
  it('needs units per item above zero', () => {
    for (const bad of ['', '0', '-1', 'abc', null]) {
      expect(validatePackageType({ name: 'Tote', units_per_item: bad }, existing)).toMatch(/Units per item/);
    }
  });
  it('compares names the way goods are matched', () => {
    expect(sameTypeName('Carton ', 'carton')).toBe(true);
    expect(sameTypeName('Carton', 'Cartons')).toBe(false);
  });
});
