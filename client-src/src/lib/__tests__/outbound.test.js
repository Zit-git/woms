import { describe, it, expect } from 'vitest';
import { outboundActions, computeOutboundFulfillment } from '../outboundStatus';
import { ginNumber, ginStatus } from '../documents';
import { pickLineForCode, createScanGate } from '../scanning';
import { huNumber, idsFromQuery, labelsPath, locationQr, locationIdFromCode, findLocationByCode, locationLabelsPath } from '../labels';
import { pickupRequestIdFromPass, findPendingPickByCode, findRequestIdByPass, sameCode, inboundMatchesQuery } from '../scanning';

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

describe('scanning by hand: a typed code works like a scanned one', () => {
  const requests = [{ ROWID: '7', outbound_reference: 'OB-2026-207030' }, { ROWID: '8', outbound_reference: 'OB-2026-207031' }];
  it('codes match whatever the case and spaces', () => {
    expect(sameCode(' womS-cargo-123 ', 'WOMS-CARGO-123')).toBe(true);
    expect(sameCode('WOMS-CARGO-123', 'WOMS-CARGO-124')).toBe(false);
    expect(sameCode('', '')).toBe(false);
    expect(sameCode(null, undefined)).toBe(false);
  });
  it('a Handling Unit code typed in lower case still finds its pick line', () => {
    expect(findPendingPickByCode([{ ROWID: '1', cargo_qr_code: 'WOMS-CARGO-9', status: 'Pending' }], ' woms-cargo-9 ')?.ROWID).toBe('1');
  });
  it('a pass is found by its scanned QR or by the printed pickup reference', () => {
    expect(findRequestIdByPass(requests, 'WOMS-OB-99')).toBe('99');
    expect(findRequestIdByPass(requests, 'ob-2026-207031')).toBe('8');
    expect(findRequestIdByPass(requests, 'OB-2026-000000')).toBeNull();
    expect(findRequestIdByPass(requests, '')).toBeNull();
    expect(findRequestIdByPass([], 'OB-2026-207030')).toBeNull();
  });
});

describe('finding an inbound from what the customer quotes', () => {
  const advice = { inbound_reference: 'IB-2026-243231', reference_number: 'ACF001', reference_client: null };
  it('by the IB reference, whole or partial, in any case', () => {
    expect(inboundMatchesQuery(advice, 'IB-2026-243231')).toBe(true);
    expect(inboundMatchesQuery(advice, ' ib-2026-2432 ')).toBe(true);
  });
  it('by the GRN number, which is GRN- plus the IB reference', () => {
    expect(inboundMatchesQuery(advice, 'GRN-IB-2026-243231')).toBe(true);
    expect(inboundMatchesQuery(advice, 'grn-ib-2026-999999')).toBe(false);
  });
  it('by the customer\'s own reference', () => expect(inboundMatchesQuery(advice, 'acf001')).toBe(true));
  it('an empty search matches everything, a different number nothing', () => {
    expect(inboundMatchesQuery(advice, '')).toBe(true);
    expect(inboundMatchesQuery(advice, 'IB-2026-000000')).toBe(false);
  });
});

describe('Handling Unit labels', () => {
  it('the HU number is the inbound reference plus the package number', () => {
    expect(huNumber('IB-2026-243231', 4)).toBe('IB-2026-243231-004');
    expect(huNumber('IB-2026-243231', '12')).toBe('IB-2026-243231-012');
    expect(huNumber('', 4)).toBe('4');
  });
  it('ids in a print link are digits only, without repeats, in order', () => {
    expect(idsFromQuery('11648000001243237,11648000001243239, 11648000001243237,x,<script>')).toEqual(['11648000001243237', '11648000001243239']);
    expect(idsFromQuery(null)).toEqual([]);
  });
  it('the link carries only the ids', () => {
    expect(labelsPath('/app/', new Set(['1', '2']))).toBe('/app/print/labels?ids=1,2');
    expect(labelsPath('/', ['9"><b>'])).toBe('/print/labels?ids=9');
  });
});

describe('scanning a whole pick list with the camera left on', () => {
  const tasks = [
    { ROWID: '1', cargo_qr_code: 'WOMS-CARGO-1', status: 'Assigned' },
    { ROWID: '2', cargo_qr_code: 'WOMS-CARGO-2', status: 'Picked' },
  ];
  it('a code is a line to pick, a line already picked, or not on this list', () => {
    expect(pickLineForCode(tasks, 'woms-cargo-1')).toMatchObject({ state: 'pending', task: { ROWID: '1' } });
    expect(pickLineForCode(tasks, 'WOMS-CARGO-2').state).toBe('picked');
    expect(pickLineForCode(tasks, 'WOMS-CARGO-9')).toEqual({ task: null, state: 'none' });
    expect(pickLineForCode(tasks, '').state).toBe('none');
  });
  it('the same label held in front of the camera is handled once, the next label at once', () => {
    let t = 0;
    const gate = createScanGate({ holdMs: 2500, now: () => t });
    expect(gate.enter('A')).toBe(true);
    gate.leave();
    t = 100;
    expect(gate.enter('A')).toBe(false); // still the same label, 10 frames a second
    expect(gate.enter('B')).toBe(true); // another label goes through
    gate.leave();
    t = 3000;
    expect(gate.enter('A')).toBe(true); // shown again later, e.g. after a failed save
  });
  it('nothing new is handled while the last code is still being worked on', () => {
    const gate = createScanGate({ now: () => 0 });
    expect(gate.enter('A')).toBe(true);
    expect(gate.enter('B')).toBe(false); // A is not finished
    gate.leave();
    expect(gate.enter('B')).toBe(true);
  });
  it('an empty code is never handled', () => expect(createScanGate().enter('  ')).toBe(false));
});

describe('Goods Issue Note', () => {
  it('its number is GIN- plus the pickup reference, like GRN- plus the inbound reference', () => {
    expect(ginNumber('OB-2026-207030')).toBe('GIN-OB-2026-207030');
    expect(ginNumber('')).toBe('');
    expect(ginNumber(null)).toBe('');
  });
  it('it is a draft until the outbound is dispatched', () => {
    expect(ginStatus(false)).toMatch(/Draft/);
    expect(ginStatus(true)).toBe('Issued');
  });
});

describe('storage position labels', () => {
  const locations = [
    { ROWID: '11648000001205071', location_code: 'RT2-A2-R01-B1-L2' },
    { ROWID: '11648000001205072', location_code: 'RT2-A2-R01-B1-L3' },
  ];
  it('the QR text is WOMS-LOC- plus the position id, and reads back', () => {
    expect(locationQr('11648000001205071')).toBe('WOMS-LOC-11648000001205071');
    expect(locationIdFromCode(' woms-loc-11648000001205071 ')).toBe('11648000001205071');
    for (const t of ['WOMS-CARGO-1', 'WOMS-LOC-', 'WOMS-LOC-12x', '', null]) expect(locationIdFromCode(t)).toBeNull();
  });
  it('a position is found by its QR text or by its typed code, in any case', () => {
    expect(findLocationByCode(locations, 'WOMS-LOC-11648000001205072').location_code).toBe('RT2-A2-R01-B1-L3');
    expect(findLocationByCode(locations, 'rt2-a2-r01-b1-l2').ROWID).toBe('11648000001205071');
    expect(findLocationByCode(locations, 'RT2-A9-R01-B1-L1')).toBeNull();
    expect(findLocationByCode(locations, '')).toBeNull();
  });
  it('the print link names the warehouse and optionally one rack or position', () => {
    expect(locationLabelsPath('/app/', { warehouse: '1' })).toBe('/app/print/locations?warehouse=1');
    expect(locationLabelsPath('/', { warehouse: '1', rack: '2', position: '3' })).toBe('/print/locations?warehouse=1&rack=2&position=3');
  });
});
