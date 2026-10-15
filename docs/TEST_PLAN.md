# WOMS test plan

Purpose: prove, with realistic client data, that WOMS does what the specification says before a client relies on it. Companion documents: `TEST_JOURNEY.md` (one guided walk-through), `acceptance/*.feature` (Gherkin scenarios), `WOMS-functional-spec.md` (rules, section 15).

## 1. Principles

1. **Test the rules, not the screens.** The business rules (capacity, dates, access, statuses) are listed in the spec; every rule gets at least one passing and one failing case.
2. **Real data, real dates.** Use the client's actual customers, package sizes, pallet counts and storage periods. Dates are always relative to today (today, +1, +7, +30), so the plan can be rerun any day.
3. **Every role, every warehouse.** Each scenario runs as the lowest role that may do it, and again as a role that must be refused.
4. **Automate what is logic; walk through what is a screen.** Rules in `src/lib` get automated tests; end-to-end flows are scripted manual runs now and browser-automated later.
5. **Nothing ships without the smoke test:** sign in, home screen loads, open one inbound, open one outbound.

## 2. Environments and data

| Environment | Use | Data |
|---|---|---|
| Development (Catalyst) | Day-to-day testing | Seeded test data below; reset when needed |
| A second project or the Production environment, later | Client acceptance | Client's real master data only, no test transactions |

**Test dataset (create once, keep in `docs/acceptance/seed`)**
- 3 customers with different habits: **A** pallets only; **B** cartons and boxes (mixed pallets); **C** cold goods (crates) with a long storage period.
- 2 warehouses, e.g. Rotterdam DC2 (ambient + cold zones, 2 aisles x 2 racks x 2 bays x 3 levels) and a small one with 1 zone, to test switching and scoping.
- Package types: Pallet, Carton, Box, Crate, Drum (capacity weights as configured).
- Users: 1 administrator; Manager + Operator in warehouse 1; Operator only in warehouse 2; Manager in warehouse 2; 1 user with no assignment.
- Carriers: 2 client-own, 1 warehouse-contracted.

## 3. Scenario matrix (each row = at least one automated or scripted case)

### 3.1 Dates and storage periods
| ID | Case | Expected |
|---|---|---|
| D1 | ETA yesterday / today / tomorrow | refused / accepted / accepted |
| D2 | Storage start before ETA, equal to ETA, after ETA | refused / accepted / accepted |
| D3 | Storage end before start; end = start; open-ended | refused / accepted / checked for 14 days |
| D4 | Month and year boundaries (31 Oct -> 1 Nov, 31 Dec -> 1 Jan), both timezones (India, Europe) | rows show distinct, rising days |
| D5 | Storage period of 1 day, 30 days, 90 days (over the 60-day table cap) | table truncates with a notice, check still correct |
| D6 | Edit dates on a Requested vs Confirmed inbound | Confirmed returns to Requested for re-check |

### 3.2 Capacity and availability
| ID | Case | Expected |
|---|---|---|
| C1 | Request exactly the free capacity / one pallet more | fits / short, red on the right days |
| C2 | Two accepted inbounds overlapping on the same days | second sees the first as committed |
| C3 | Inbound whose storage starts after another's goods are due to leave | space counted as free on/after the dispatch date |
| C4 | Weight over a location's limit; item taller than the location | allocator refuses that location |
| C5 | Customer dedication: customer B's goods when customer A holds the location | location not offered |
| C6 | Goods received but not yet packed / not yet put away | shown as backlog, not as free |
| C7 | Outbound dispatched | occupancy drops by the HUs that left; Availability tab agrees |
| C8 | Switch warehouse at the availability check | table and warehouse comparison update |
| C9 | Totals: Warehouse Management consolidated view equals sum of per-warehouse views | equal |

### 3.3 Inbound workflow
| ID | Case | Expected |
|---|---|---|
| I1 | Happy path: request -> accept -> receive -> HUs -> put-away -> GRN -> finish | statuses in order, each step role-gated |
| I2 | Expected Colli differs from line total | blocked until equal |
| I3 | Receive fewer than requested; piece count differs | warning, quantities saved, packing limited to received |
| I4 | Pack: combine two lines on one HU; split one line over 3 HUs; try to over-pack | allowed / allowed / blocked |
| I5 | Delete a HU that is not stored; try to delete a stored one | allowed / not offered |
| I6 | Reject with reason; reopen as administrator | reason shown; returns to Requested |
| I7 | Documents: upload photo, PDF, 5 MB photo, file name with spaces and special characters; signature | each previewable after saving |
| I8 | Edit Request at Requested, Confirmed, Received, Completed | allowed / re-check / not offered / administrator only |
| I9 | Two users editing the same inbound | last save wins, no corruption (note the limit) |
| I10 | Legacy inbound with status Pending | behaves as Requested |

### 3.4 Outbound workflow
| ID | Case | Expected |
|---|---|---|
| O1 | Happy path: request -> pick lines -> check-in -> scan-pick -> dispatch -> delivered | statuses in order |
| O2 | List opens on today's pickups; tomorrow; next 7 days; custom range; search by reference | correct requests only |
| O3 | Pick list order and "fetch from" locations | walking order, picked lines last |
| O4 | Two requests, same customer, same day, different drivers | no mix-ups between them |
| O5 | The same HU on two open requests | must be refused (open defect) |
| O6 | Scan a code from another request / a non-pass QR | rejected with a clear message |
| O7 | Dispatch without check-in / with an unpicked line | blocked |
| O8 | Pickup Pass: print, QR scan opens the right request | correct |
| O9 | HU from another customer or another warehouse in the picker | not offered (warehouse filter is an open item) |
| O10 | Mark delivered; delivery page tabs | consistent |

### 3.5 Access
| ID | Case | Expected |
|---|---|---|
| A1 | Manager in W1, Operator in W2: approve in W1 and W2 | allowed in W1, refused in W2 |
| A2 | Operator sees only records assigned to them | yes |
| A3 | Open W3's inbound/outbound by link | no-access message |
| A4 | User with no assignment | no data, clear message |
| A5 | Only administrators configure warehouses; others see Availability only | yes |
| A6 | Sidebar warehouse choice vs Warehouse Management | independent |
| A7 | Remove a user's warehouse | access disappears on next load |

## 4. Non-functional tests

| Area | What | How |
|---|---|---|
| **Security** | Today the warehouse separation lives in the app's queries. Try to read another warehouse's rows with the user's own session; try to write a record directly; check who may call each function; check uploaded files are private; confirm no keys or secrets in the repository | Manual probing with developer tools; scripted calls; secret scan. Result decides whether server-side enforcement is needed before the first client |
| **Data integrity** | HU-to-line quantities always reconcile; occupancy equals HUs in locations; no orphan rows after deletes | SQL-style checks run after each scenario |
| **Concurrency** | Two people scanning the same HU, putting away into the same last slot, or accepting at the same time | Two sessions, scripted |
| **Performance** | Lists and the availability table with 5,000 HUs, 500 inbounds, 90-day range | Seed volume data; time the main screens (target under 3 seconds) |
| **Reliability** | Slow network, offline mid-save, session expiry, double-click on every save button | Browser throttling; each action must show a clear message, never hang |
| **Browsers and devices** | Chrome, Firefox, Safari, Edge, a phone and a tablet (put-away and scanning) | Sign-in plus journey on each |
| **Backup and recovery** | Export data, restore into a clean project | One rehearsal before go-live |
| **Accessibility and usability** | Keyboard use, contrast, message wording | Quick review with a warehouse user watching |

## 5. Automation plan

1. **Now (done):** unit tests for dates, validation, access, visibility, the row loader (`npm run verify`).
2. **Next:** unit tests for the capacity engine and allocator with the seed scenarios (C1 to C9), the HU packing rules, and the status rules.
3. **Then:** a browser-automated smoke test (sign-in, one inbound, one outbound) run after every deploy; it needs a dedicated test user that is created only for the test site.
4. **Always:** the acceptance `.feature` files stay the definition of done; bind them to the checks above.

## 6. Entry and exit criteria

- **Entry:** `npm run verify` passes; seed data loaded; test users created.
- **Exit for a first client:** every scenario above passes or has a recorded, accepted exception; no open defect that affects stock accuracy, access, or sign-in; smoke test passes on Chrome, Firefox and Safari; backup rehearsal done; the client's own sample data run once end to end with the client's staff watching (UAT).

## 7. Reporting

One line per scenario: ID, tester, date, result, defect link. Defects are numbered, reproduced with a screenshot and the exact message, and re-tested before closing.
