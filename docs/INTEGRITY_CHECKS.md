# Data integrity checks

Run these in the Catalyst console (Data Store → ZCQL) or through the MCP query tool after a test cycle, a release or a data import. Every "must be" row should hold; a miss means stock records no longer agree with each other.

| # | What must be true | Query | Must be |
|---|---|---|---|
| 1 | Every Handling Unit line points to a real Handling Unit | `SELECT COUNT(HuLine.ROWID) FROM HuLine LEFT JOIN Cargo ON HuLine.cargo_id = Cargo.ROWID WHERE Cargo.ROWID IS NULL` | 0 |
| 2 | Every Handling Unit line points to a real line item | `SELECT COUNT(HuLine.ROWID) FROM HuLine LEFT JOIN InboundLine ON HuLine.inbound_line_id = InboundLine.ROWID WHERE InboundLine.ROWID IS NULL` | 0 |
| 3 | Every line item belongs to a real inbound | `SELECT COUNT(InboundLine.ROWID) FROM InboundLine LEFT JOIN InboundAdvice ON InboundLine.inbound_advice_id = InboundAdvice.ROWID WHERE InboundAdvice.ROWID IS NULL` | 0 |
| 4 | Every Handling Unit belongs to a real inbound | `SELECT COUNT(Cargo.ROWID) FROM Cargo LEFT JOIN InboundAdvice ON Cargo.inbound_advice_id = InboundAdvice.ROWID WHERE Cargo.qr_code IS NOT NULL AND InboundAdvice.ROWID IS NULL` | 0 |
| 5 | Every pick line points to a real Handling Unit and a real outbound | the two `PickTask LEFT JOIN … IS NULL` queries | 0 and 0 |
| 6 | No line has more packed than received | `SELECT InboundLine.ROWID, InboundLine.received_qty, SUM(HuLine.qty) FROM InboundLine JOIN HuLine ON HuLine.inbound_line_id = InboundLine.ROWID GROUP BY InboundLine.ROWID, InboundLine.received_qty` | packed ≤ received on every row |
| 7 | No location holds more than its capacity | `SELECT Cargo.current_location_id, StorageLocations.capacity, COUNT(Cargo.ROWID) FROM Cargo JOIN StorageLocations ON Cargo.current_location_id = StorageLocations.ROWID WHERE Cargo.qr_code IS NOT NULL GROUP BY Cargo.current_location_id, StorageLocations.capacity` | count × units per item ≤ capacity |
| 8 | A Handling Unit is on one open pick list at a time | `SELECT PickTask.cargo_id, COUNT(PickTask.ROWID) FROM PickTask GROUP BY PickTask.cargo_id` | 1 per open outbound |
| 9 | Goods that have left have no location | `SELECT COUNT(Cargo.ROWID) FROM Cargo WHERE (Cargo.status = 'Dispatched' OR Cargo.status = 'Delivered') AND Cargo.current_location_id IS NOT NULL` | 0 |

## Result of 2026-10-23 (Development)

| # | Result |
|---|---|
| 1 to 5 | **0 rows.** No orphans (47 Handling Unit lines checked). |
| 6 | **Pass.** Packed equals received on every one of 41 lines (including the partial 38 of 40). |
| 7 | **Fail.** 3 positions of capacity 1 each held 2 pallets (`RT2-A1-R01-B1-L1`, `RT2-A1-R01-B2-L1`, `RT2-A1-R02-B1-L1`). Cause: put-away treated a pallet planned to leave today as already gone. **Fixed** in the app (defect D-14); the three leftover positions are test data. |
| 8 | **2 Handling Units on several pick lists** (3 and 2 lists): all created on 2026-10-15 13:15 to 13:20, before the double-allocation fix (O-1). None since. Leftover test data. |
| 9 | **Pass.** |

Other states seen and expected: delivered goods and goods on the dock (HU created, not yet stored) have no location; 3 picked units remain from test runs that stopped before dispatch.

Re-check after the fix (same day, after a full journey run): a new pallet was stored in an empty position (`RT2-A1-R01-B2-L2`); the three over-full positions were unchanged. They hold test pallets; clear them by dispatching those pallets or removing the `AUTOTEST` data.

Repeat after the concurrency fix (2026-10-23): positions of capacity 1 never hold two pallets from two people acting together, and a pallet is never on two pick lists from simultaneous adds (`e2e/concurrency.spec.js`).
