# WOMS test report

Run date: 2026-10-15 · Environment: Development (Catalyst) · Site tested: `/app/` host (legacy web client) · User: System Administrator · Commit: see `git log` (latest fixes in `be99637` and later)

Method: browser tests (Playwright) signed in through a saved session, unit tests (Vitest), direct probing of the functions with `curl`, and request tracing in the browser. Plan: `TEST_PLAN.md`. Guided walk-through: `TEST_JOURNEY.md`.

## 1. Summary

| Area | Result |
|---|---|
| Unit tests (dates, validation, warehouse access, visibility rules, row loader, query sharing) | **104 of 104 pass** (all unit files; `core.test.js` now also the direct data calls, id protection and the token exchange: now also every-row paging, form refresh, newest-answer-only) |
| Concurrency rules (who keeps the last position or pallet when two people act in the same second) | **8 of 8 pass** (`claimOutcome` in `capacity.test.js`) |
| Two real users at the same moment (administrator + staff): last free position, same pallet on two outbounds, two edits to one request (`concurrency.spec.js`) | **3 of 3 pass**, stable over 3 runs; the loser is told |
| Outbound rules (dispatch only after pick and check-in, status follows the goods, scanning accepts only the right passes and labels) | **12 of 12 pass** (`outbound.test.js`) |
| Capacity and allocation rules (plan C1 to C9: exact fit, overlapping inbounds, dispatch dates, weight and size limits, one customer per location, dock backlog, warehouses) | **45 of 45 pass** (`capacity.test.js`, includes the put-away checks) |
| Smoke tests (home, Inbounds, Outbounds, Availability) | **4 of 4 pass** |
| Inbound journey (request → availability → accept → receive → Handling Units → put-away → GRN) | **Pass**, 38 s |
| Outbound journey (request → goods → check-in → scan-pick → dispatch → delivered) | **Pass**, 27 s |
| Pickup pass page (rendered) | Skipped here: needs the Slate site (the legacy `/app/` host has no deep links) |
| Double allocation (O5): a Handling Unit on one request is not offered to another | **Pass**, 15 s |
| Whole browser suite (access, concurrency, inbound, outbound, double allocation, rules, map, number formats, smoke, phone/tablet/laptop audit), run 2026-10-26 on the final build | **36 passed, 0 failed, 3 skipped** (2 Slate-only, 1 on-request volume timing), 13.4 min |
| Same journeys with the Slate function route forced on `/app/` (`WOMS_TOKEN_ROUTE=1`): inbound to GRN, outbound to delivery, double allocation, the three rules tests | **All pass** (the Slate address itself still needs one signed-in run) |
| Data integrity (orphans, packed vs received, positions over capacity, double pick lists; `INTEGRITY_CHECKS.md`) | **Checked 2026-10-23**: no orphans, packing reconciles; one defect found (D-14, fixed); leftover test data only |
| Security probes of the three functions | **Fixed**, re-verified from outside |
| Inbound rules: reject needs a reason, reopen, accept, editing an accepted request returns it for a new check (I6, I8, D6) | **Pass**, 17.5 s |
| Two pickups, one customer, one day: own driver, vehicle and reference (O4) | **Pass**, 20.7 s |
| Access tests (second user: Supervisor in Hamburg DC, Operator in Rotterdam DC2, nothing in Antwerp DC) | **5 of 5 pass** on `/app/`; the direct-link test (A3) is Slate-only and skipped here |
| Volume (84, 384 and 1,084 inbounds; 10,000 pallets; see section 7) | **Done 2026-10-23**: three defects found and fixed; test data removed |
| Number formatting: decimals shown with two digits, rounded (`format.js`; `format.spec.js` checks the availability figures, inbound totals and that no screen shows a long decimal tail) | **Pass**: 6 unit tests, 1 browser test |
| Warehouse map: levels stacked upwards as angled cards, a position opens its Handling Units (`map.spec.js`) | **Pass**, 3 of 3 runs |
| Phones and tablets: every menu screen and the key popups at 390x844, 360x640, 768x1024, 1024x768 and 1280x720 (`devices.spec.js`, now also the warehouse map and a check that tabs do not overlap; screenshots in `e2e/results/devices/`) | **15 of 15 pass** (Chromium emulation of screen size, touch and mobile mode) |
| Not yet run | Firefox and Safari (this machine has only Chromium; do them on real devices), A2/A6/A7 by hand, the direct-link and printed-pass tests on Slate (needs a Slate sign-in), backup and restore rehearsal, client trial with their own data |

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
| D-12 | Medium | In a warehouse where the user may not create inbounds, **+ New Inbound** stayed enabled and would have created the inbound in a different warehouse (the user's only approving one) without saying so | **Fixed** (button disabled with a message); found by the access tests |
| D-13 | Low | A scanned Pickup Pass with a garbled id (`WOMS-OB-abc`) would open a broken page instead of being refused | **Fixed** (only a numeric id is accepted); found while writing the scanning tests |
| D-14 | High | Put-away could place a second pallet in a one-pallet position: it assumed a pallet planned to leave today had already left, and nothing checked a manual choice. 3 positions held 2 pallets each | **Fixed**: what is physically in a position occupies it, and storing is refused when the position is full, blocked or another customer's (re-read at the moment of storing). Re-verified live: a new inbound's pallet went to an empty position, nothing added to the 3 full ones |
| D-15 | **High** | Every list silently stopped at 300 rows: with 384 inbounds the Inbounds list showed "300 of 300" (older records invisible; stock-based figures could be incomplete). Found by the volume test | **Fixed**: queries are fetched page by page until complete (tested with 384, 300 and 12 rows) |
| D-16 | High | Deliveries failed ("Error occurred during query processing") once there were about 3,000 delivered pallets: the one query joining five tables was refused | **Fixed**: goods first, orders/dispatches/references looked up in small chunks; delivered history loads newest first, 300 at a time ("Load 300 older") |
| D-17 | Medium | Lists, Storage and Availability slowed in step with the data (12 to 15 s at 1,084 inbounds / 10,000 pallets) because they downloaded every pallet and pick line to compute a status | **Fixed**: the database now counts and sums; 2 to 6 s at the same volume |
| D-18 | **High** | Two people storing into the last free position in the same second both succeeded: a one-pallet position held 2 pallets (the check before storing passes for both) | **Fixed**: after writing, everyone in the position is listed in order of arrival and the later arrival undoes its placement and is told ("just filled by someone else"); the same rule for relocation. Found by `concurrency.spec.js` |
| D-19 | **High** | Two outbounds adding the same pallet in the same second both got it (the earlier double-allocation fix only covered people acting one after the other) | **Fixed**: same write-then-verify rule; the second adder's line is removed and they are told ("just added to outbound OB-…") |
| D-20 | Medium | On a tablet held sideways (1024 px) and similar widths, the Customers table and the Deliveries filter bar were wider than the space beside the sidebar and made the whole page scroll sideways | **Fixed**: wide tables scroll inside themselves at 769 to 1100 px, the filter bar wraps |
| D-21 | Medium | On a phone, the work lists were awkward: the put-away location dropdown was cut off at the right edge, the pick list's "Fetch from" location had scrolled off the left, and the handling-unit counts needed sideways scrolling | **Fixed**: put-away, picking and packing lists show each row as a card with labelled values (location first, full-width dropdown, full-width Scan & Pick) |
| D-22 | **High** | Typing in the Request and Receive forms could be lost: every save re-read the record and reset the whole form, wiping what was typed in another field and not yet saved (Expected Colli ended up empty in the database). Found as one failure of an otherwise passing test | **Fixed**: only fields that really changed on the server are taken over (`formSync.js`, unit-tested); the forms' tests passed 3 of 3 afterwards |
| D-23 | Medium | Switching warehouse quickly in Warehouse Management could show the previous warehouse's map under the new name (a slow answer arrived last and replaced the new one) | **Fixed**: only the newest request may fill the screen (`latest.js`, unit-tested) |
| D-24 | Medium | On a phone, the eight tabs of Warehouse Management were squeezed into one row and overlapped, so the Map tab could not be tapped | **Fixed**: the tabs are a strip that swipes sideways; the phone audit now fails when tabs overlap |
| D-25 | Medium | Closing the Request popup right after typing the last field of a line item showed a stale page: the page re-read the lines before that last save finished and never refreshed, so the inbound looked incomplete (volume 0, "Continue Request" instead of "Availability Check") until reloaded. The data itself was saved. Caused two failures in full runs | **Fixed**: closing a popup now waits for saves still in progress, then refreshes. A new test holds every line save back 3 s so the race happens every time: it fails without the fix (seen) and passes with it |
| D-26 | **Critical on Slate** | On the Slate address, receiving failed: "Could not save the received quantities: The server did not respond while updating InboundLine" and the signature "The server did not respond". Cause (reproduced in a clean browser): after the page asked Catalyst's web library for a function token (any upload, photo or signature on Slate), the library stops sending **any** data request, so every later save hangs; a second token request hangs too. All earlier testing was on the `/app/` address, which does not take that route, so it passed there | **Fixed**: data requests and the function token no longer go through the library (only sign-in and sign-out do). The app calls the data service directly with the session, and exchanges the token itself (cached, no cookies). Row ids that arrive as bare 17-digit numbers are kept exact. A test switch (`WOMS_TOKEN_ROUTE=1`) makes `/app/` behave like Slate; the inbound and outbound journeys, the rules tests pass that way, and the inbound test checks the token exchange really happened. **Still to confirm with a signed-in run on Slate itself** |
| D-28 | **Critical on Slate** | After D-26's fix went to Slate, sign-in looped ("Your access could not be loaded after sign-in: The http request method is not a valid one"). Slate only passes a `/baas/` request to the Catalyst service when it carries `CATALYST-COMPONENT: true` (the web library adds it; my direct calls did not); otherwise Slate answers with its own page, and its cache (`x-nimbus-cache: HIT`) keeps that wrong answer for everyone for a few minutes, so one request without the header could break all users. The sign-in page's own session check had the same flaw. `/app/` does not need the header, so every test there passed | **Fixed**: one shared set of headers (`apiHeaders.js`) for every direct call, including the session check. New guards: a smoke test fails if the app makes any data request without the header (seen failing on the old build, naming the requests), a routing test checks any address (run against Slate after each push: `WOMS_URL=... npx playwright test routing`), and unit tests cover every request type |
| D-29 | Medium | A visitor who had not signed in yet saw a red "Last sign-in problem: Checking the signed-in user failed: Some network issue occured!" on the sign-in page (from the second load on), so a working sign-in looked broken on Slate. The web library fails instead of answering "nobody" when asked who is signed in; the app wrote that down as an error | **Fixed**: the app asks the service directly; "not signed in" (401) is a normal answer with no message, and real failures are still recorded. New test `visitor.spec.js` (no sign-in needed, runs on any address): seen failing on Slate's old code with exactly this message, passing on the new build |
| D-27 | Medium | The two-people-at-once checks (last position, same pallet) could let both keep their claim when a write was not yet visible to the other person's check (failed once in a full run after D-26's change) | **Hardened**: each claim is checked twice after short pauses and kept only if still first both times. 18 of 18 in six rounds. Cannot be made certain without database transactions (see O-3) |
| D-10 | Low | Uploaded files could not be previewed (file names with special spaces) | **Fixed** (files fetched inline; new names kept to plain characters) |

## 4. Open items

| ID | Severity | Item | Next step |
|---|---|---|---|
| O-1 | High | The same Handling Unit can be added to two open outbound requests | **Fixed** (hidden from other requests and refused again at add time); test O5 passes |
| O-2 | High | The Slate site does not serve `/server/…`, so uploads and previews there use the token route, which can hang later requests (D-03) | The Slate deployment record shows `is_function_mapped: false`, so a function-mapping option exists, but Catalyst's public documentation does not describe it. Look in the console under Slate, app woms-kyhn, deployment woms-app. Check by calling `/server/uploadFile/` on the Slate address (it answers 405 while unmapped). Also make sure the Slate address is whitelisted with CORS on (Authentication, Whitelisting). Then run the browser suite on Slate |
| O-3 | High | Warehouse separation and business rules are enforced in the browser's queries, not on the server. The capacity and double-allocation rules now also hold when two people act at once (D-18, D-19), but they still run in the browser, so a modified client could bypass them | Server-side enforcement (planned) |
| O-4 | Medium | The functions are not marked "authenticated" in the console (the code-level check now protects them) | Switch it on in the console (defence in depth) |
| O-5 | Low | `npm audit`: two moderate advisories in `react-router` (open redirect, server rendering) | One-line upgrade |
| O-6 | Info | The legacy `/app/` host cannot open deep links (e.g. `/app/print/pickup/…`); Slate can | Use Slate for printing; the pass page is tested on Slate only |

## 5. Test data left behind

On 2026-10-25 the 14 `AUTOTEST` inbounds left open by the first debugging runs (15 and 16 October; 9 accepted, 5 received) were closed (status Rejected, reason "Test leftover from early test runs"; nothing deleted, each can be reopened). Rotterdam DC2 availability went from -46.40 to 64.00 and Space from -27.02 to 57.98 m³.

On 2026-10-25 the 22 stored `AUTOTEST` pallets were taken out of their positions and marked Delivered (nothing deleted), so the warehouse map no longer shows over-full test positions. The two real pallets (Acme Freight, "Spare parts" at `A-01-01` and the walkthrough pallet at `RT2-A1-R01-B1-L2`) were left alone.

The access tests leave three empty `Requested` inbounds per run (one per warehouse, no customer, so they cannot be labelled). The tests create records labelled `AUTOTEST` (inbounds, outbounds, documents, Handling Units) and use the seeded `TEST …` customers and carriers (`docs/acceptance/seed/README.md`). Remove them with a filter on `AUTOTEST` / `TEST` when no longer needed.

## 7. Volume results

Data added by `e2e/volume/seed.mjs` (tagged `VOLTEST`, removed again by `cleanup.mjs`; ids recorded in a manifest so only those rows go). Seconds until a screen has settled (no "Loading", no request in flight), measured with `VOLUME=1 npx playwright test volume`.

| Screen | 84 inbounds | 384 inbounds, 3,000 pallets | 1,084 inbounds, 10,000 pallets, before the fix | same, after the fix |
|---|---|---|---|---|
| Dashboard | 4.2 | 4.1 | 4.2 | 4.1 |
| Inbounds list | 3.4 | 5.2 | 12.5 | **6.0** |
| Outbounds list | 1.7 | 5.5 | 14.7 | **4.9** |
| Storage | 2.5 | 5.2 | 12.8 | **2.2** |
| Availability | 2.2 | 5.6 | 12.9 | **2.0** |
| Deliveries | 1.6 | failed, then 3.4 | 3.5 | 5.3 |
| Inbound detail | 3.2 | 6.3 | 14.7 | **6.3** |

Reading: every screen now settles within about 6 s at 1,000 inbounds. The Inbounds and Outbounds lists still load every record (13 and 9 requests), so they grow with the data; beyond a few thousand inbounds they need server-side filtering (for example a default date window). The Dashboard has a fixed cost.

## 6. How to rerun

```
cd client-src
npm run verify        # unit tests + build
npm run e2e:login     # once, sign in yourself
npm run e2e           # all browser tests (set WOMS_URL to test another site)
VOLUME=1 npx playwright test volume   # screen timings; add data first with: N=300 node e2e/volume/seed.mjs, remove with: node e2e/volume/cleanup.mjs
```
