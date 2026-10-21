import { describe, it, expect } from 'vitest';
import { outboundActions, computeOutboundFulfillment } from '../outboundStatus';
import { pickupRequestIdFromPass, findPendingPickByCode } from '../scanning';

const line = (status, cargo_status = 'Stored') => ({ status, cargo_status });
const popup = (a) => a.primary?.popup;

describe('O7 dispatch is only offered when the goods are picked and the driver is checked in', () => {
  const checkedIn = { arrived_at: '2026-10-21 09:00:00' };
  it('no goods yet: select goods first', () => expect(popup(outboundActions({}, [], false))).toBe('goods'));
  it('goods not all picked: pick first, even if the driver is already here', () => {
    expect(popup(outboundActions(checkedIn, [line('Picked'), line('Pending')], false))).toBe('pick');
  });
  it('all picked but driver not checked in: check in, not dispatch', () => {
    expect(popup(outboundActions({}, [line('Picked'), line('Picked')], false))).toBe('checkin');
  });
  it('picked and checked in: dispatch', () => {
    expect(popup(outboundActions(checkedIn, [line('Picked')], false))).toBe('dispatch');
  });
  it('dispatching is never in the secondary actions', () => {
    expect(outboundActions({}, [line('Pending')], false).others.map((a) => a.popup)).not.toContain('dispatch');
  });
  it('after dispatch the only step left is delivery, then nothing', () => {
    expect(popup(outboundActions(checkedIn, [line('Picked', 'Dispatched')], true))).toBe('deliver');
    expect(outboundActions(checkedIn, [line('Picked', 'Delivered')], true).primary).toBeNull();
  });
});

describe('O10 status follows the goods', () => {
  it('requested, partly picked, picked, sent, delivered', () => {
    expect(computeOutboundFulfillment([])).toBe('Requested');
    expect(computeOutboundFulfillment([line('Pending'), line('Pending')])).toBe('Requested');
    expect(computeOutboundFulfillment([line('Picked'), line('Pending')])).toBe('Partially Picked');
    expect(computeOutboundFulfillment([line('Picked'), line('Picked')])).toBe('Picked');
    expect(computeOutboundFulfillment([line('Picked', 'Dispatched'), line('Picked', 'Dispatched')])).toBe('Sent');
    expect(computeOutboundFulfillment([line('Picked', 'Dispatched'), line('Picked', 'Delivered')])).toBe('Sent'); // both have left, not all delivered yet
    expect(computeOutboundFulfillment([line('Picked', 'Dispatched'), line('Picked', 'Stored')])).toBe('Partially Sent');
    expect(computeOutboundFulfillment([line('Picked', 'Delivered'), line('Picked', 'Delivered')])).toBe('Delivered');
  });
});

describe('O6/O8 scanning', () => {
  it('a Pickup Pass opens its own request', () => expect(pickupRequestIdFromPass('WOMS-OB-11648000001234567')).toBe('11648000001234567'));
  it('anything else is not a pass: a Handling Unit label, a web address, an empty scan, a garbled id', () => {
    for (const text of ['WOMS-HU-1234', 'https://example.com', '', null, undefined, 'WOMS-OB-', 'WOMS-OB-abc', 'WOMS-OB-12/../34', 'xWOMS-OB-12']) {
      expect(pickupRequestIdFromPass(text)).toBeNull();
    }
  });
  const tasks = [
    { ROWID: '1', cargo_qr_code: 'HU-AAA', status: 'Pending' },
    { ROWID: '2', cargo_qr_code: 'HU-BBB', status: 'Picked' },
  ];
  it('a label on this request that is still to pick is accepted', () => expect(findPendingPickByCode(tasks, 'HU-AAA')?.ROWID).toBe('1'));
  it('a label already picked is refused (no double pick)', () => expect(findPendingPickByCode(tasks, 'HU-BBB')).toBeNull());
  it('a label from another request or an unknown code is refused', () => {
    expect(findPendingPickByCode(tasks, 'HU-ZZZ')).toBeNull();
    expect(findPendingPickByCode(tasks, '')).toBeNull();
    expect(findPendingPickByCode([], 'HU-AAA')).toBeNull();
  });
});
