import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// The build does not notice a name that is used but never imported (it only fails when the screen opens),
// which once took the whole Warehouses page down. Check the names the shared pagination pieces bring in.
const walk = (dir) => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? (f === '__tests__' ? [] : walk(join(dir, f))) : [join(dir, f)]));

describe('screens import what they use', () => {
  const files = walk('src').filter((f) => f.endsWith('.jsx'));
  it('imports usePagination wherever it is called', () => {
    for (const f of files) {
      const text = readFileSync(f, 'utf8');
      if (/\busePagination\(/.test(text) && !/import \{[^}]*\busePagination\b[^}]*\} from/.test(text)) throw new Error(`${f} calls usePagination without importing it`);
    }
    expect(files.length).toBeGreaterThan(10);
  });
  it('imports Pagination wherever it is rendered', () => {
    for (const f of files) {
      const text = readFileSync(f, 'utf8');
      if (/<Pagination\b/.test(text) && !/import Pagination from/.test(text)) throw new Error(`${f} renders Pagination without importing it`);
    }
  });
});
