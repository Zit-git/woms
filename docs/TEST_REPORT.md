# WOMS test report

Run date: 2026-10-15 · Environment: Development (Catalyst) · Site tested: `/app/` host (legacy web client) · User: System Administrator · Commit: see `git log` (latest fixes in `be99637` and later)

Method: browser tests (Playwright) signed in through a saved session, unit tests (Vitest), direct probing of the functions with `curl`, and request tracing in the browser. Plan: `TEST_PLAN.md`. Guided walk-through: `TEST_JOURNEY.md`.

## 1. Summary

| Area | Result |
|---|---|
| Unit tests (dates, validation, warehouse access, visibility rules, row loader, query sharing) | **16 of 16 pass** |
| Capacity and allocation rules (plan C1 to C9: exact fit, overlapping inbounds, dispatch dates, weight and size limits, one customer per location, dock backlog, warehouses) | **36 of 36 pass** (`capacity.test.js`) |
| Smoke tests (home, Inbounds, Outbounds, Availability) | **4 of 4 pass** |
| Inbound journey (request → availability → accept → receive → Handling Units → put-away → GRN) | **Pass**, 38 s |
| Outbound journey (request → goods → check-in → scan-pick → dispatch → delivered) | **Pass**, 27 s |
| Pickup pass page (rendered) | Skipped here: needs the Slate site (the legacy `/app/` host has no deep links) |
| Double allocation (O5): a Handling Unit on one request is not offered to another | **Pass**, 15 s |
| Whole suite, in order (4 smoke, inbound, outbound, double allocation) | **7 passed, 1 skipped**, 1.7 min |
| Security probes of the three functions | **Fixed**, re-verified from outside |
| Access tests (A1 to A5, second user) | **Written (`e2e/access.spec.js`), not yet run**: waiting for the test user, see `ACCESS_TEST_SETUP.md` |
| Not yet run | A2/A6/A7 by hand, concurrency between two people, performance with volume data, browsers other than Chrome, phones, backup/restore, client trial |

## 2. What each automated test proves

**Inbound journey** (`e2e/inbound.spec.js`)
- New Inbound opens the Request popup by itself; the arrival date in the past is refused; storage cannot start before arrival or end before it starts.
- Three line items; Expected Colli 60 against 70 packages is refused and "Set to 70" fixes it.
- Availability check shows one row per day with 30+ distinct rising dates, then Accept.
- Receive is blocked until required fields and the driver signature are done; a piece count that differs from received quantities warns; the signature, CMR photo and extra photo each show as images right after saving; Mark as Received finishes; the inbound shows 68 pieces (38 + 20 + 10) and previews on its Documents card.
- Handling Units: packing more than was received is refused; one line is split over two pallets; two lines are combined on one pallet.
- Put-away stores all HUs in locations in the new `RT2-…-B…-L…` format; Complete produces the GRN and the status becomes Ready.

**Outbound journey** (`e2e/outbound.spec.js`): new request with reference `OB-…`, two stored HUs selected, pickup pass link, fetch locations shown, scan-pick with progress, driver check-in, dispatch, delivered, and finding the request by its reference.

## 3. Defects found by testing

| ID | Severity | Defect | Status |
|---|---|---|---|
| D-01 | **Critical (security)** | `inviteUser` trusted a request header anyone can forge, so its administrator check could be bypassed (probed with an empty body; nothing was created) | **Fixed.** The caller is now identified by the verified session. Re-verified: anonymous and forged requests are refused |
| D-02 | **High (security)** | `uploadFile` and `getFileUrl` answered without any sign-in | **Fixed.** Both return 401 without a session; real sessions (cookie and token) still work |
| D-03 | **Critical** | After any function call (uploads, file previews) every later data request in that page hung forever: the cause of the "Saving…" and "Loading…" that never finished | **Fixed** by calling functions with the session cookie. Remains on Slate, see O-2 |
| D-04 | High | Identical simultaneous requests were left unanswered (the Receive popup asked for the same documents four times; dashboard counts after a reload) | **Fixed.** Identical in-flight queries share one request |
| D-05 | High | Sign-in loop: the embedded form tried to open the app inside its own frame, and the role list asked for 500 rows where the limit is 300, crashing sign-in | **Fixed** (full-page sign-in, row limit and error handling restored) |
| D-06 | Medium | Add Line refused ("Select a customer…") when clicked just after choosing the customer | **Fixed** |
| D-07 | Medium | Two quick saves to one inbound could finish out of order (an old Expected Colli overwrote the new one) | **Fixed.** Saves to one record now queue in order |
| D-08 | Medium | A received quantity typed in the Receive popup was reset to the planned number by a background refresh | **Fixed** |
| D-09 | Medium | Availability rows all showed the same date in timezones ahead of UTC | **Fixed**, with a unit test |
| D-11 | High | Goods received but not yet put away stopped counting as reserved, so their space showed as free again on the Availability screen and could be promised to other requests | **Fixed** (the dock backlog keeps its capacity, weight and space reserved); found by the new capacity tests |
| D-10 | Low | Uploaded files could not be previewed (file names with special spaces) | **Fixed** (files fetched inline; new names kept to plain characters) |

## 4. Open items

| ID | Severity | Item | Next step |
|---|---|---|---|
| O-1 | High | The same Handling Unit can be added to two open outbound requests | **Fixed** (hidden from other requests and refused again at add time); test O5 passes |
| O-2 | High | The Slate site does not serve `/server/…`, so uploads and previews there use the token route, which can hang later requests (D-03) | Map the functions to the Slate app in the Catalyst console (one-time setting, needs you) |
| O-3 | High | Warehouse separation and business rules are enforced in the browser's queries, not on the server | Server-side enforcement (planned) |
| O-4 | Medium | The functions are not marked "authenticated" in the console (the code-level check now protects them) | Switch it on in the console (defence in depth) |
| O-5 | Low | `npm audit`: two moderate advisories in `react-router` (open redirect, server rendering) | One-line upgrade |
| O-6 | Info | The legacy `/app/` host cannot open deep links (e.g. `/app/print/pickup/…`); Slate can | Use Slate for printing; the pass page is tested on Slate only |

## 5. Test data left behind

The tests create records labelled `AUTOTEST` (inbounds, outbounds, documents, Handling Units) and use the seeded `TEST …` customers and carriers (`docs/acceptance/seed/README.md`). Remove them with a filter on `AUTOTEST` / `TEST` when no longer needed.

## 6. How to rerun

```
cd client-src
npm run verify        # unit tests + build
npm run e2e:login     # once, sign in yourself
npm run e2e           # all browser tests (set WOMS_URL to test another site)
```
