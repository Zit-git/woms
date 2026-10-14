# WOMS: Functional Specification

**Product:** Warehouse Operations Management System (WOMS), a multi-warehouse, multi-customer **space-time-cost** (3PL) warehouse system, with a mobile PWA and invoicing through Zoho Books.
**Version:** 2.0, final draft, 2026-10-14. Platform-neutral.
**Purpose:** a complete description of the business requirements, data model, workflows, users, roles and permissions, journeys, features, user interfaces, mobile app, notifications, billing and integration, known limitations and the development backlog, so a team can build WOMS on any platform (for example Appwrite, or a conventional web API with a SQL database).
**Basis:** the behaviour, data model and seed data of the working reference application, the product-definition documents *WOMS Product Definition – Development Master v1.0* and *WOMS Product Master v1.2*, and the requirements added for billing, mobile and accounting integration.

**Legend.** Status of each capability: **Built** (works as described in the reference application), **Partial** (built with limits), **Planned** (specified here, not built), **Future** (beyond this scope). Requirement identifiers (BR-, BB-, F-, J-, M-, R-, D-, L-) allow tracing into tests and tickets.

### How this document maps to the requested topics
| Topic | Where |
|---|---|
| Business requirement (space-time-cost, not SKU) | §1 |
| Data model (relationships, flows) | §9 |
| Workflows | §7 (with derived statuses in §8) |
| Users | §2 |
| Roles and permissions | §3 |
| Journeys | §4 |
| Features | §5 (catalogue), §6 (master data) |
| User interfaces (detailed views, filters, sorting) | §10 |
| PWA, mobile app and mobile workflows | §11 |
| Invoicing integration with Zoho Books (part of Settings) | §13 (Settings §13.1, Zoho Books §13.6) |
| Known limitations | §17 |
| Features for development | §18 |


## 1. Business requirements

### 1.1 Positioning: a space-time-cost warehouse, not a SKU warehouse
WOMS is the operating system of a **3PL / contract warehouse** that sells **space, for a period of time, at a price**, plus the handling and value-added services performed on its customers' cargo. It is deliberately **not an inventory (SKU) system**:

| A SKU-based WMS asks | WOMS asks |
|---|---|
| *How many units of item X do we hold, in which lot, valued at what cost?* | *What physical units (pallets, cartons, crates) of which customer occupy which space, since when, and what must we bill for it?* |
| Product master, batches, serials, expiry, stock valuation | **Handling Unit (HU)** identity, owner customer's reference, dimensions, weight, location, history |
| Order fulfilment, replenishment, wave picking | Receiving, put-away, relocation, value-added work, release on pickup |
| Revenue is the customer's sale | **Revenue is the warehouse's own: space × time × rate, plus handling and services** |

Cargo contents are *descriptive* (a free-text description per line and per HU), never a managed catalogue. The questions WOMS must answer reliably are: **What arrived? Where is it? For how long has it been there? What happened to it? What left? What do we bill for it?**

### 1.2 The space-time-cost model
Everything the system records serves one of three dimensions.

| Dimension | Meaning | How WOMS captures it |
|---|---|---|
| **Space** | The physical capacity consumed: pallet positions, cartons, crates, m², m³, kg. | Warehouse → zone → aisle → rack → **location** with capacity, capacity unit, dimensions and max weight; **package types** that say how much capacity one HU consumes (units per item); each HU's length, width, height and weight; the capacity engine (§7.2 of the workflows) for occupied / committed / available space. |
| **Time** | How long space is occupied or reserved. | Requested storage period (from/to) on the inbound; ETA, pickup and delivery dates; **timestamped scans** for every move (received, stored, relocated, retrieved, picked, dispatched, delivered); the movement and scan history. The interval *put-away scan → dispatch scan* is an HU's **occupancy interval**. |
| **Cost** | What the customer pays. | **Rate cards** per customer / warehouse / zone / capacity unit; **charge events** (storage days, receiving, dispatch, labels, value-added services, surcharges); **invoice proposals** reviewed by finance and **pushed to Zoho Books** (§13). |

**Revenue model** (all amounts net of tax; tax is applied in the accounting system):

```
Revenue(customer, period) =
    Σ over HUs, Σ over days in period [ units occupied by the HU that day × storage rate(unit, zone, customer, day) ]
  + Σ over handling events [ events × handling fee(event type, HU type, customer) ]
  + Σ over value-added tasks [ quantity × service price(service type, customer) ]
  + Σ surcharges and fixed fees (dangerous goods, temperature zone, oversize, documents, minimum charges)
  − discounts / free days / contract adjustments
```

**Capacity side of the same model** (what the warehouse can still sell):

```
Available space(day) = Total capacity − Physically occupied − Committed (accepted, not yet arrived) [+ scheduled releases]
Utilisation(day)     = Occupied / Total        Sellable space = Available (per capacity unit, per warehouse, per day)
```
Because occupancy is **derived from confirmed HU-to-location states**, the same data that drives operations drives billing: nothing is typed twice.

### 1.3 Explicitly out of scope
SKU / batch / serial / expiry management; stock valuation; order management or parcel fulfilment; transport planning; ERP-style accounting (the accounting system, Zoho Books, remains the system of record for invoices, tax and payments); warehouse automation/robotics.

### 1.4 Business objectives
| ID | Objective | Measured by |
|---|---|---|
| BO-1 | Always know what is where, and since when. | Locate accuracy (scan vs record), % HUs with a confirmed location |
| BO-2 | **Bill every space-day and every handling event, accurately and on time.** | Unbilled occupancy (HU-days occupied but not invoiced), invoice cycle time |
| BO-3 | Sell space forward with confidence. | Forecast availability by day; occupancy %; commitments accepted vs capacity |
| BO-4 | Remove paper and spreadsheets from receiving, hand-over and dispatch. | % inbounds/outbounds with GRN, signature, photos |
| BO-5 | Give customers timely, trustworthy information. | Notification coverage; time from event to customer message |
| BO-6 | Keep the floor fast: minimal typing, scan-first. | Time to receive/put-away/pick; error rate |
| BO-7 | Protect accountability. | Audit completeness; verified GRNs |

### 1.5 Key performance indicators
Occupancy % (by warehouse, zone, capacity unit); revenue per occupied position-day; average dwell time (days in storage); **billable-vs-occupied variance**; inbound-to-stored lead time; receiving accuracy (received vs expected); dispatch on-time %; value-added task turnaround; invoice cycle time (period end → invoice sent); days sales outstanding (read back from the accounting system); unbilled revenue.

### 1.6 Business requirements register
Priority: **M** must, **S** should, **C** could. Status of the reference build: **Built**, **Partial**, **Not built**, **Future**.

| ID | Requirement | Pri | Status |
|---|---|:-:|---|
| BR-01 | Track every item of cargo as a Handling Unit with its own identity and QR; no SKU master. | M | Built |
| BR-02 | Know each HU's location and the **time-stamped history** of every move. | M | Built (occupancy intervals derivable from scans) |
| BR-03 | Describe space in capacity units, m², m³ and kg; describe each HU's footprint and weight. | M | Built |
| BR-04 | Check availability for a requested storage period before accepting cargo; project availability by day. | M | Built |
| BR-05 | Dedicate storage to a customer (a location holds one customer's cargo at a time). | S | Built |
| BR-06 | Accept or reject inbound requests after a capacity decision; record the reason for rejection. | M | Built |
| BR-07 | **Rate cards** by customer, warehouse, zone, capacity unit and effective dates. | M | Not built |
| BR-08 | Produce a **daily occupancy record per HU** (customer, location, zone, units, weight, volume, date) as the basis of storage billing. | M | Not built |
| BR-09 | **Calculate storage charges** = space × time × rate with free days, minimum periods and billing cycles. | M | Not built |
| BR-10 | Calculate **handling charges** per event (receiving, HU creation/labelling, put-away, pick, dispatch, relocation). | M | Not built |
| BR-11 | Calculate **value-added service charges** per task (fixed, per unit, per hour, materials). | S | Not built |
| BR-12 | Apply **surcharges** (dangerous goods, temperature zone, oversize/overweight, after-hours) and fixed/minimum fees. | S | Not built |
| BR-13 | Review and approve **invoice proposals** before sending; lock invoiced usage; handle corrections. | M | Not built |
| BR-14 | **Push approved invoices to Zoho Books** and read back status and payments. | M | Not built |
| BR-15 | Give the customer a **usage statement** explaining each charge. | S | Not built |
| BR-16 | Reports for utilisation, revenue, unbilled occupancy and invoice pipeline. | S | Not built |
| BR-17 | Several warehouses, several customers, per-warehouse roles and visibility. | M | Built |
| BR-18 | **Mobile-first floor operations** delivered as an installable PWA with scanning and offline tolerance (§11). | M | Not built (responsive pages only) |
| BR-19 | Evidence and audit: photos, documents, signatures, GRN, audit trail. | M | Built / Partial |
| BR-20 | Notify internal staff and customers by email on the 14 defined events. | S | Partial (3 of 14) |
| BR-21 | Support several currencies and tax regimes through the accounting system. | S | Not built |
| BR-22 | **Configurable verification workflows** (goods receipt, VAL, dispatch, task, incident). | S | Partial (GRN verification only) |
| BR-23 | Several physical receipts per inbound, each with its own GRN; partial dispatch. | M | Not built (partial dispatch via HUs only) |
| BR-24 | Customer portal with read-only status and documents. | C | Future |

### 1.7 Billing business rules (proposed; confirm against the operator's customer contracts)
These rules define how space-time-cost becomes money. They are **requirements to be validated commercially**; each is configurable in the rate card or the billing settings (§13) rather than hard-coded.

- **BB-1 When occupancy starts and stops.** Storage billing for an HU starts at its confirmed **put-away scan** and stops at its **dispatch scan**. Time on the dock (Received but not stored) is billed at a configurable *dock rate* (default: free for 1 day, then the floor rate). *Retrieved* (taken out of a rack but still in the building) and *Picked* (staged for an outbound) HUs **keep occupying** until dispatch is confirmed.
- **BB-2 Day counting.** Default: a calendar day is billable when the HU is in the warehouse at the **end-of-day snapshot** (configurable cut-off, warehouse local time), so the day of put-away counts and the day of dispatch does not. Alternatives: *any presence*, *24-hour blocks*, *weekly*, *monthly period*.
- **BB-3 Billing basis.** Rate per **capacity unit** consumed (the same `units per item` used by the capacity engine), per **HU**, per **m³**, per **m²** or per **kg**; one basis per rate-card line.
- **BB-4 Free days and minimums.** First *N* days free per HU or per inbound; **minimum storage period** per HU/inbound (for example 7 days); **minimum monthly charge** per customer.
- **BB-5 Committed space (take-or-pay).** A customer may commit *N* units for a period; the commitment is billed whether or not it is used, and usage above it is billed at the normal rate (optional, per contract).
- **BB-6 Partial dispatch and relocation.** Billing stops per HU at its own dispatch. Relocation inside the warehouse does not change the charge unless the target zone has a different rate; the rate of the **zone the HU is in at the snapshot** applies.
- **BB-7 Handling charges** are event-based and priced per HU (or per package): receiving/unloading, HU creation + label, put-away, pick, dispatch/loading, relocation, document handling; each with its own fee and optional minimum per event.
- **BB-8 Value-added work** is priced per service type (fixed price, per unit, per hour) plus materials; the completed VAL task is the billable event.
- **BB-9 Surcharges** are triggered by data already captured: dangerous goods flag, zone/location type (for example cold storage), oversize or overweight thresholds, urgent/after-hours handling flag.
- **BB-10 Invoice grain.** One invoice per **customer** per **billing period** (monthly by default) per **billing entity**; lines grouped by charge type with an attached usage statement showing HU, interval, units and rate.
- **BB-11 Locking and corrections.** Once an invoice is approved, its usage records are **locked**. Errors are corrected by an *adjustment line* in the next period or a *credit note* in the accounting system, never by editing history.
- **BB-12 Tax and currency.** WOMS supplies **net amounts** and the mapped tax/item codes; tax calculation, rounding, currency conversion and legal numbering stay in Zoho Books.
- **BB-13 Disputes.** A charge can be flagged *disputed* and excluded from the invoice run until resolved; the flag and reason are audited.

### 1.8 Assumptions and constraints
- Customers are businesses contracted by the operator; there is no consumer billing.
- A warehouse's local time zone determines day boundaries; all timestamps are stored in UTC.
- The accounting system remains authoritative for invoice numbers, tax and payment status; WOMS never edits an invoice after it has been pushed.
- Rates, free days and minimums come from contracts and are maintained by authorised finance/administration users, with effective dates and an audit trail.
- The physical truth is the scan: if the system and the floor disagree, a cycle-count/adjustment process (with audit) corrects the system; it must never silently rewrite billed history.

## 2. Users and personas

### 2.1 Who uses WOMS
| Persona | Type | Role in WOMS | Main goals | Main device | Key screens |
|---|---|---|---|---|---|
| **System Administrator** | Internal | *System Administrator* (global) | Set up warehouses, users, rate cards, integrations; keep data clean; edit completed records | Desktop | Warehouse Management, Users, Settings, Billing setup, everything else |
| **Warehouse Manager** | Internal | *Warehouse Manager* (per warehouse) | Accept or reject requests against capacity, verify GRNs, oversee all activity in the warehouse(s), approve invoices if delegated | Desktop, tablet | Dashboard, Inbounds, Availability, Outbounds, Reports, Customers, Billing review |
| **Office / customer-service coordinator** | Internal | Manager or Supervisor (Customer Management granted by role) | Register inbound requests and outbound pickups for customers, keep customer data, answer "where is my cargo?" | Desktop | Customers, Inbound list, Outbound list, Deliveries |
| **Warehouse Supervisor** | Internal | *Warehouse Supervisor* | Run the shift: request/accept inbounds, assign tasks, check progress | Desktop, tablet, phone | Dashboard, Inbounds, Storage, Tasks, VAL |
| **Warehouse Operator** | Internal (floor) | *Warehouse Operator* | Receive, label, put away, relocate, pick, load; capture photos and signatures; with minimal typing | **Phone / handheld (PWA)** | Mobile dashboard, Receive, Put-away, Pick, Gate check-in, Tasks |
| **Billing Officer** *(new)* | Internal (finance) | *Billing Officer* (proposed role) | Maintain rates, review usage, produce and approve invoices, reconcile with the accounting system | Desktop | Billing & Invoicing, Customers (read), Reports |
| **Customer contact** | External | none today (portal is future) | Be told when goods arrive, are ready, leave; receive GRN and invoice documents | Email (later: portal) | Notifications, documents |
| **Carrier driver** | External | none | Collect or deliver cargo at the gate with the right paperwork | Paper Pickup Pass + phone | Pickup Pass (QR), signature capture |
| **Accounting system (Zoho Books)** | System | integration | Issue and track invoices, tax and payments | — | Receives invoices from WOMS (§13) |

### 2.2 What each persona needs from the product
- **Administrators** need control and safety: nothing destructive without a clear warning; every change audited.
- **Managers/supervisors** need *decision data*: availability by day, what is waiting for them (to accept, to verify), exceptions.
- **Operators** need **speed on the floor**: scan-first, big touch targets, one action per screen, work that survives poor Wi-Fi.
- **Finance** needs *trust in the numbers*: every billed amount traceable to HUs, days and rates; nothing billed twice; nothing missed.
- **Customers** need *certainty*: confirmation that goods arrived (GRN), clear status, an invoice they can understand.

### 2.3 Account lifecycle
1. An administrator **invites** a person by email (access level; for staff: warehouse + role per warehouse).
2. The person receives an invitation email, sets a password, signs in (email + password or one-time code).
3. The administrator can add, change or remove warehouse access at any time; a user can hold a different role in each warehouse.
4. A user's status can be *Active* or *Inactive* (inactive = no access; history is preserved). *The reference build has the field but no screen to change it.*
5. Sign-out ends the session on the device; sessions expire after inactivity (configurable; mobile sessions last longer, §11).

## 3. Roles and permissions

### 3.1 Role model
Two levels:

| Level (`AppUsers.business_role`) | Meaning |
|---|---|
| **System Administrator** | Global. Sees every warehouse and every module; configures the system; invites users; edits completed inbounds and reopens rejected ones; manages billing configuration and integrations. |
| **Warehouse Staff** | No global rights. Gets **one role per warehouse** from `UserWarehouseRole`. |

Per-warehouse roles: **Warehouse Manager**, **Warehouse Supervisor**, **Warehouse Operator**, and (proposed, for finance) **Billing Officer**. A user can be a Manager in one warehouse and an Operator in another; one role per warehouse per user. Role names are data (`RolePermissions.role`), so a rebuild may add roles without code changes.

**Approver roles** (may create/accept inbound requests, verify a GRN, confirm dispatch): System Administrator, Warehouse Manager, Warehouse Supervisor, evaluated **per warehouse**. Operators are never approvers.

The original client brief used the labels *Admin*, *Office* (read/write, no admin), *Warehouse employee* (floor workflow only) and *Client* (portal, read-only). They map to: Admin → System Administrator; Office → Warehouse Manager or Supervisor with Customer Management; Warehouse employee → Warehouse Operator; Client → future portal user (§1.6, BR-24).

### 3.2 Module permissions (`RolePermissions`)
A user may open a module if **any** role they hold grants it (System Administrator: all). ✔ = full access, **R** = read-only, blank = none. Rows marked **new** are additions to the reference build.

| Module | Sys. Admin | Manager | Supervisor | Operator | Billing Officer *(new)* |
|---|:-:|:-:|:-:|:-:|:-:|
| Customer Management | ✔ | ✔ | | | R |
| Warehouse Management | ✔ | ✔ | ✔ | | |
| Inbound Operations | ✔ | ✔ | ✔ | ✔ | R |
| Cargo & Storage Management | ✔ | ✔ | ✔ | ✔ | R |
| QR Code & Label Management | ✔ | ✔ | ✔ | ✔ | |
| Operational Task Management | ✔ | ✔ | ✔ | ✔ | |
| Value Added Logistics | ✔ | ✔ | ✔ | ✔ | R |
| Outbound Operations | ✔ | ✔ | ✔ | ✔ | R |
| Reports & Dashboards | ✔ | ✔ | ✔ | | ✔ |
| **Billing & Invoicing** *(new)* | ✔ | ✔ | | | ✔ |
| **Settings & Integrations** *(new; split from System Administration)* | ✔ | | | | |
| System Administration (users, access) | ✔ | | | | |

The seeded reference data covers the first ten rows for the first four roles (34 role-module rows). "QR Code & Label Management" has no screen of its own (labels are printed from Inbound). Permissions are configurable at **module, function and warehouse** level per the client brief; the function level is the action matrix below.

**Route-to-module mapping** (first matching prefix wins): `/customers`→Customer Management; `/warehouse`, `/transporters`→Warehouse Management; `/inbound`, `/print/inbound`, `/print/grn`, `/print/putaway`→Inbound Operations; `/storage`, `/cargo`→Cargo & Storage Management; `/outbound`, `/print/outbound`, `/print/pickup`, `/delivery`→Outbound Operations; `/tasks`→Operational Task Management; `/val`→Value Added Logistics; `/reports`→Reports & Dashboards; `/billing`→Billing & Invoicing; `/settings`→Settings & Integrations; `/admin`→System Administration. The dashboard (`/`) is open to every user with an active role. Navigation hides entries the user cannot open; a direct URL shows "No access".

### 3.3 Action-level permissions (function level)
✔ allowed, — not allowed, **R** read-only. The last column says how the **reference build** differs (it gated only inbound request/accept/receive/GRN-verify and admin actions; everything else was open to any user with the module). The matrix is the **target**; items marked ⚑ are recommendations needing a business decision.

| Area / action | Admin | Mgr | Sup | Oper | Billing | Reference build |
|---|:-:|:-:|:-:|:-:|:-:|---|
| **Customers and masters** | | | | | | |
| View customers, contacts | ✔ | ✔ | R | R | R | module-gated |
| Create/edit customers, contacts | ✔ | ✔ | — | — | — | same |
| Delete customer (cascades history) | ✔ | — | — | — | — | module-gated ⚑ restrict |
| Add supplier inline on a request | ✔ | ✔ | ✔ | — | — | open |
| Manage transporters | ✔ | ✔ | R | — | — | module-gated |
| **Warehouse structure** | | | | | | |
| View Availability / capacity | ✔ | ✔ | ✔ | — | — | same |
| Edit warehouses, zones, aisles, racks, locations, package types | ✔ | — | — | — | — | admin only |
| **Inbound** | | | | | | |
| View inbound list and record | ✔ | ✔ | ✔ | ✔ | R | same |
| Create/edit request, set expected data | ✔ | ✔ | ✔ | ⚑ | — | approvers only |
| Availability check; accept; reject | ✔ | ✔ | ✔ | — | — | approvers only |
| Edit an accepted request (returns it to Requested) | ✔ | ✔ | ✔ | — | — | approvers only |
| Mark as received (unloading, signature, photos) | ✔ | ✔ | ✔ | ⚑ ✔ | — | approvers only |
| Create Handling Units, print labels | ✔ | ✔ | ✔ | ✔ | — | open |
| Put away to locations | ✔ | ✔ | ✔ | ✔ | — | open |
| Complete inbound (generate GRN) | ✔ | ✔ | ✔ | ✔ | — | open |
| **Verify GRN** | ✔ | ✔ | ✔ | — | — | approvers only |
| Finish inbound (send customer email) | ✔ | ✔ | ✔ | ⚑ — | — | open |
| Edit a Completed inbound; reopen a Rejected one | ✔ | — | — | — | — | admin only |
| **Storage** | | | | | | |
| View stock by location/customer | ✔ | ✔ | ✔ | ✔ | R | same |
| Relocate, retrieve, put back (scan) | ✔ | ✔ | ✔ | ✔ | — | open |
| **Outbound and deliveries** | | | | | | |
| View outbound list/record | ✔ | ✔ | ✔ | ✔ | R | same |
| Create outbound request | ✔ | ✔ | ✔ | ⚑ — | — | open |
| Select goods; remove unpicked lines | ✔ | ✔ | ✔ | ✔ | — | open |
| Pick (scan) | ✔ | ✔ | ✔ | ✔ | — | open |
| Driver check-in | ✔ | ✔ | ✔ | ✔ | — | open |
| **Confirm dispatch** | ✔ | ✔ | ✔ | ⚑ — | — | open |
| Mark delivered | ✔ | ✔ | ✔ | — | — | open |
| **VAL and tasks** | | | | | | |
| Create VAL request; assign | ✔ | ✔ | ✔ | — | — | open |
| Execute VAL (start/complete) | ✔ | ✔ | ✔ | ✔ | — | open |
| Create tasks; see all tasks of the warehouse | ✔ | ✔ | ✔ | — | — | open |
| See and work **own** assigned tasks | ✔ | ✔ | ✔ | ✔ | — | operators see only theirs |
| **Reports and audit** | | | | | | |
| Operational reports and dashboards | ✔ | ✔ | ✔ | — | ✔ | same |
| View audit trail on a record | ✔ | ✔ | ✔ | R | R | open |
| **Billing and invoicing** *(new)* | | | | | | |
| View usage, charges, invoice proposals | ✔ | ✔ | — | — | ✔ | — |
| Maintain rate cards and charge items | ✔ | R | — | — | ✔ | — |
| Generate invoice proposals; flag/dispute a charge | ✔ | ✔ | — | — | ✔ | — |
| **Approve** an invoice proposal | ✔ | ✔ | — | — | ✔ | — |
| Push approved invoice to Zoho Books; retry failures | ✔ | — | — | — | ✔ | — |
| Void/credit (adjustment records) | ✔ | — | — | — | — | — |
| **Settings and administration** | | | | | | |
| Configure Zoho Books connection and mappings | ✔ | — | — | — | — | — |
| System settings (numbering, notifications, labels) | ✔ | — | — | — | — | — |
| Invite users; manage warehouse access; deactivate users | ✔ | — | — | — | — | admin only (no deactivate screen) |

### 3.4 Warehouse scoping and record visibility
- **System Administrator:** sees all warehouses.
- **Other users:** only warehouses in their assignments. A user with no assignments sees nothing.
- **Working-warehouse selector** (shown when the user has more than one warehouse): "All my warehouses (view only)" or one warehouse. Selecting one narrows every list to it and decides where new inbounds/outbounds are created. With "All" selected, creation is disabled ("Choose a warehouse first"). The choice is remembered per browser/device.
- Every list query carries a warehouse filter **on the server**. Opening a record from another warehouse is refused ("You don't have access to this warehouse's records."). Records without a warehouse are administrator-only.
- **Operators** additionally see only **tasks assigned to them** (by email).
- **Billing Officers** see billing data for the warehouses they are assigned to.
- Warehouse Management is split: administrators see all tabs; others with the module see only **Availability**.

### 3.5 Segregation of duties and verification workflows
The client brief requires **configurable verification workflows** for: goods-receipt verification, value-added-logistics verification, dispatch verification, task-completion verification and incident-resolution verification.

Requirement: for each activity type and warehouse an administrator can set **required (yes/no)**, **verifier role** (Manager / Supervisor / any approver) and **verifier must differ from the performer**. An unverified activity stays in a *Pending verification* state (visible on the dashboard and notified) and blocks the next step where configured. The reference build implements only **GRN verification** (mandatory, by an approver; the inbound cannot be completed until verified). Data: a `VerificationPolicy` entity (activity type, warehouse, required, verifier role, different-user flag) and a `verified_by/verified_at` pair on each verifiable record (§9.7).

### 3.6 User administration (System Administration → Users)
- **Invite User:** first name, last name (optional), email, access level (*Warehouse staff* or *System Administrator*). For staff: one or more rows of *warehouse + role* (at least one; each warehouse once). The invite operation creates the account and sends the invitation email, creates the profile (status Active) and one per-warehouse role row per assignment, and writes an audit entry.
- **Users table:** email, access summary, status, "Manage access".
- **Manage access** (per staff user): change role per warehouse, remove a warehouse, add another warehouse. Required (not in the reference build): **deactivate/reactivate** a user and **revoke sessions**.
- The page also shows the role × module permission matrix (read from `RolePermissions`) and the audit trail for the module "System Administration".

## 4. User journeys

Each journey follows one person from trigger to outcome. Device: **D** desktop, **M** mobile/handheld (PWA, §11). Screen names refer to §10.

### J1. The life of a customer's cargo (end to end)
*Persona: customer contact, seen through the warehouse's eyes. Trigger: the customer wants goods stored and later collected.*

| # | Step | Who / device | System behaviour |
|---|---|---|---|
| 1 | Customer announces an inbound (PO, expected colli, ETA, storage period). | Office coordinator, D | Request created, reference `IB-…`, status **Requested** (J2). |
| 2 | Warehouse checks space for the whole period and accepts. | Manager, D | Availability by day; status **Confirmed**; space is *committed* (J3). |
| 3 | Truck arrives; goods are counted, signed for, photographed. | Operator, M | Status **Received**; CMR, photos, signature stored (J4). |
| 4 | Goods are packed into HUs; labels printed and stuck. | Operator, M | HUs created with QR; status **HU Created** (J5). |
| 5 | HUs are scanned into racks. | Operator, M | Locations set, occupancy starts, status **Put Away** (J5). |
| 6 | GRN generated, verified; customer is told. | Operator → Manager, D | GRN **Verified**; email to customer; status **Completed**. |
| 7 | Storage days accrue; VAL work may be requested. | System / Supervisor | Daily occupancy records; VAL tasks (J-VAL). |
| 8 | Customer books a pickup. | Office, D | Outbound request, pickup reference `OB-…`, Pickup Pass printed (J6). |
| 9 | Driver collects; goods leave; customer is told. | Operator/Supervisor, M | HUs **Dispatched**; occupancy ends; email (J6, J7). |
| 10 | At period end, usage is priced and invoiced. | Billing Officer, D | Invoice in Zoho Books; customer receives statement (J8). |

### J2. Office coordinator registers an inbound request
*Trigger: a customer emails a shipment notice. Goal: a complete, valid request in minutes.*

| # | Step | Screen | System behaviour |
|---|---|---|---|
| 1 | Open Inbounds → **+ New Inbound** (working warehouse chosen). | Inbound list | Draft created (status Requested), reference assigned, request form opens. |
| 2 | Fill customer, destination, ETA, expected colli, supplier (add inline if new), carrier, CMR number, storage period, remarks. | Request form | Autosave on each field; date rules shown inline (R-I1, R-I2). |
| 3 | Add line items: type, description, packages, weight/package, L×W×H. | Request form → lines | Totals update; "Expected Colli ≠ lines total" error with one-click fix (R-I3). |
| 4 | Click **Done**. | Inbound record | Record shows lines, status Requested, **Availability Check** and **Edit Request** buttons. |
| 5 | Optionally attach documents/tasks. | Inbound record | Documents and tasks linked to the inbound. |

*Success:* request complete and ready for acceptance. *Design note:* never lose input; every field autosaves; validations explain themselves.

### J3. Manager decides: availability check and acceptance
*Trigger: a Requested inbound waits for a decision (dashboard counter and notification).*

| # | Step | Screen | System behaviour |
|---|---|---|---|
| 1 | Open the inbound → **Availability Check**. | Availability popup | One row per day of the requested period vs required space/weight/volume. |
| 2 | Compare warehouses; optionally switch warehouse. | Comparison table | Shows fit per warehouse and how many packages physically fit. |
| 3 | **Accept** (or **Reject** with a reason). | Popup | Status **Confirmed**/**Rejected**; space committed; audit written; customer/coordinator informed. |
| 4 | If the customer changes the plan later, **Edit Request**. | Inbound record | Returns to Requested; the check is repeated. |

### J4. Dock operator receives goods on a handheld
*Trigger: a truck is at the dock. Device: M. Goal: receive with minimal typing, with evidence.*

| # | Step | Mobile screen | System behaviour |
|---|---|---|---|
| 1 | Open **Inbound**, find today's accepted inbound (list "Arriving today"; or scan the paperwork QR). | Inbound list (M) | Only accepted inbounds for the working warehouse. |
| 2 | **Arrival**: confirm unloading date/time (prefilled "now"), enter plate, driver, counted pieces. | Receive step 1 | Counted-pieces vs expected shown. |
| 3 | **Cargo**: per line, enter the received quantity (steppers). | Receive step 2 | Differences highlighted. |
| 4 | **Photos & documents**: take cargo photos, scan CMR and papers to PDF, take damage photos if needed. | Receive step 3 | Files queue locally if offline; thumbnails appear at once. |
| 5 | **Check**: review summary. | Receive step 4 | Warns about differences. |
| 6 | **Driver signs** on the screen; **Mark as Received**. | Receive step 5 | Status **Received**; GRN draft prepared. |

### J5. Operator creates HUs, labels and puts away
*Device: M plus a label printer. Goal: every HU labelled and shelved, with scan proof.*

| # | Step | Mobile screen | System behaviour |
|---|---|---|---|
| 1 | Open the received inbound → **Create Handling Units**. | HU builder (M) | Lines show received / left to pack. |
| 2 | Choose **one HU per package** or build combined/split HUs. | HU builder | HUs created with unique QR (R-I9). |
| 3 | **Print labels** (Bluetooth/network printer or PDF). | Print | One label per HU: QR + `IB-…-001` + description. |
| 4 | Stick labels; **Put-away**: scan the HU → system proposes a location → confirm (or scan the location QR). | Put-away | `storage` scan; HU status Stored; occupancy recorded. |
| 5 | Repeat until all HUs are placed. | Put-away | Status **Put Away**. |

### J6. Outbound: from pickup request to dispatch
*Personas: office coordinator (D), operator (M), supervisor (D/M).*

| # | Step | Who / device | System behaviour |
|---|---|---|---|
| 1 | Create the outbound request (customer, carrier, pickup date, PO). | Coordinator, D | Status Submitted; reference `OB-…`; **Pickup Pass** printed or emailed to the customer's carrier. |
| 2 | Select goods: pick HUs from the customer's stock. | Coordinator/Operator | Pick lines created. |
| 3 | Pick: the list is in **walking order**; scan each HU. | Operator, M | `pick` scan; HU leaves its location in the system; progress "n of N picked". |
| 4 | Driver arrives; scan the Pickup Pass QR at the gate. | Operator, M | Request opens; **check-in** with driver, ID, phone, plates, arrival time. |
| 5 | Load; driver signs; **Confirm Dispatch**. | Supervisor, M/D | HUs **Dispatched**; Dispatch Note printed; customer emailed; occupancy ends. |
| 6 | After delivery is confirmed, **Mark Delivered**. | Supervisor, D | HUs **Delivered**; Deliveries list updated. |

### J7. Carrier driver collects cargo
| # | Step | System behaviour |
|---|---|---|
| 1 | Driver receives the Pickup Pass (QR + reference + goods list) from the customer. | Pass generated from the outbound request. |
| 2 | At the gate shows pass and photo ID. | Operator scans the QR; request opens. |
| 3 | Operator records driver, vehicle, trailer; goods are loaded. | Check-in stored with time and who admitted. |
| 4 | Driver signs the handover on the operator's device and receives the Dispatch Note. | Signature stored; note printed. |

### J8. Finance: month-end invoice run *(new)*
| # | Step | Screen | System behaviour |
|---|---|---|---|
| 1 | Period ends; daily occupancy records and handling/VAL charge events already exist. | — | Nothing to key in. |
| 2 | Open **Billing → Invoice runs → New run**: choose period, customer(s), warehouse(s). | Invoice run | System prices usage with the effective rate cards and lists proposals. |
| 3 | Review each proposal: lines by charge type, drill into HU/day detail, flag disputes, add adjustments. | Proposal detail | Variances vs last period and unbilled occupancy highlighted. |
| 4 | **Approve** proposals. | Proposal | Usage records locked; status Approved. |
| 5 | **Push to Zoho Books** (draft or sent). | Invoice run | Invoice created in Zoho Books; number and link stored; failures listed for retry (§13). |
| 6 | Payments and status flow back; overdue items reported. | Invoices list | Status Paid/Overdue visible next to the operational record. |

### J9. Administrator onboards a warehouse
| # | Step | Screen |
|---|---|---|
| 1 | Create warehouse; define zones, aisles, racks and locations (capacity unit, dimensions, max weight, bay/level). | Warehouse Management |
| 2 | Review package types (units per item). | Package Types |
| 3 | Create customers (and contacts); set billing details and rate card. | Customers; Billing |
| 4 | Invite staff with warehouse and role. | Users |
| 5 | Connect Zoho Books; map items, taxes, customers. | Settings → Billing & Invoicing |
| 6 | Print location QR labels *(planned)*; run an acceptance scenario (Appendix C). | Warehouse Management |

### J10. Customer is kept informed *(notifications now, portal later)*
Customer receives: goods-received confirmation with GRN, ready-for-dispatch notice, dispatch confirmation, exception notice, VAL completion, invoice and usage statement (§12). A future portal gives read-only status, documents and invoices (BR-24).

### J11. Value-added task on the floor
Supervisor creates a VAL request for HUs → assigns → operator (M) starts, performs, adds photos/notes, completes → supervisor/manager verifies (if the policy requires) → charge event created → customer notified.

## 5. Feature catalogue

Status of the reference build: **Built**, **Partial**, **Planned** (specified here, not built), **Future** (beyond this scope). "Roles" lists who may use the feature (§3.3). Section references point to where each feature is specified in detail.

### 5.1 Access and administration
| ID | Feature | Description | Roles | Status | § |
|---|---|---|---|---|---|
| F-A1 | Invitation-only sign-in | Email + password/one-time code; no public sign-up | all | Built | 3, 16.3 |
| F-A2 | Two-level roles, per-warehouse roles | System Administrator; Manager/Supervisor/Operator (+ Billing Officer) per warehouse | Admin | Built (Billing Officer planned) | 3.1 |
| F-A3 | Module permission matrix | Role × module grants, data-driven | Admin | Built | 3.2 |
| F-A4 | Action-level permissions | Function-level control inside modules | Admin | Planned | 3.3 |
| F-A5 | Warehouse scoping | Users see only their warehouses; working-warehouse selector | all | Built | 3.4 |
| F-A6 | User management | Invite, manage warehouse access | Admin | Built | 3.6 |
| F-A7 | Deactivate users, revoke sessions | Disable access without deleting history | Admin | Planned | 3.6 |
| F-A8 | Verification workflows | Configurable verification per activity (GRN, VAL, dispatch, task, incident) | Admin | Partial (GRN only) | 3.5 |
| F-A9 | Audit trail | Who did what, when, to which record; panel on records | Admin/Mgr/Sup | Built | 7.10 |

### 5.2 Customers and master data
| ID | Feature | Description | Roles | Status | § |
|---|---|---|---|---|---|
| F-M1 | Customers | Name, email, phone, address, status; activity history | Admin/Mgr | Built | 6.1 |
| F-M2 | Customer contacts | Several contacts, salutation, primary flag | Admin/Mgr | Built | 6.1 |
| F-M3 | Customer operating instructions | Free-text handling instructions shown on inbound/outbound | Admin/Mgr | Planned | 6.1 |
| F-M4 | Suppliers | Directory with inline add from the request form | Admin/Mgr/Sup | Built | 6.2 |
| F-M5 | Transporters | Carrier directory | Admin/Mgr | Built | 6.3 |
| F-M6 | Package types | Capacity unit, units per item, standard size/weight | Admin | Built | 6.5 |
| F-M7 | Customer billing profile | Billing contact, payment terms, rate card, accounting-system link | Admin/Billing | Planned | 13.3 |

### 5.3 Warehouse structure and capacity
| ID | Feature | Description | Roles | Status | § |
|---|---|---|---|---|---|
| F-W1 | Warehouse → zone → aisle → rack → location | Configurable hierarchy with type, capacity, unit, size, max weight, bay, level | Admin | Built | 6.4 |
| F-W2 | Warehouse map | Tree with occupied/empty locations | Admin | Built | 6.4 |
| F-W3 | Capacity and availability engine | Total/occupied/pending/committed/available, weight and space; date-range projection | Admin/Mgr/Sup | Built | 7.2 |
| F-W4 | Customer-dedicated locations | A location holds one customer's cargo at a time | system | Built | 7.3 |
| F-W5 | Location allocation suggestion | Size/weight/dimension/customer-aware suggestion per HU; warehouse recommendation | Mgr/Sup/Oper | Built | 7.3 |
| F-W6 | **Permanent location QR labels** | Printed per location; scan to confirm "where" | Admin | Planned | 11.4 |
| F-W7 | Cycle count / stock check | Scan a location, confirm contents, record discrepancies | Sup/Oper | Planned | 11.4 |

### 5.4 Inbound
| ID | Feature | Description | Roles | Status | § |
|---|---|---|---|---|---|
| F-I1 | Inbound request | Customer, destination, ETA, expected colli, supplier, carrier, CMR, storage period, lines, ADR | Admin/Mgr/Sup | Built | 7.1 |
| F-I2 | Line items | Type, description, packages, weight, dimensions; totals | Admin/Mgr/Sup | Built | 7.1 |
| F-I3 | Availability check and accept/reject | Day-by-day capacity check; reasoned rejection | Admin/Mgr/Sup | Built | 7.1.3 |
| F-I4 | Receiving | Unloading data, received quantities, driver signature, CMR/photos | Approvers (target: + Oper) | Built | 7.1.4 |
| F-I5 | Handling Unit creation | Combine/split lines; unique QR per HU; labels | Mgr/Sup/Oper | Built | 7.1.5 |
| F-I6 | Put-away with suggestions | Suggested location per HU, overridable | Mgr/Sup/Oper | Built | 7.1.6 |
| F-I7 | GRN | Generated at completion; verified by an approver | Mgr/Sup | Built (record + print) | 7.1.7 |
| F-I8 | Finish and customer email | GRN verified → completion email | Mgr/Sup | Built (text only) | 7.1.8 |
| F-I9 | **Multiple receipts per inbound** | Several arrivals, a GRN each, running remaining totals | Mgr/Sup/Oper | Planned | 18 |
| F-I10 | Receiving exceptions | Damage/condition capture, shortages, exception notice | Oper/Sup | Planned | 18 |
| F-I11 | Customs status / MRN | Free circulation or T1 with MRN and document | Mgr/Sup | Planned | 18 |
| F-I12 | Per-line hazardous data | IMO class, UN number | Mgr/Sup | Planned | 18 |
| F-I13 | Excel import of lines | Bulk upload with validation | Mgr/Sup | Planned | 18 |
| F-I14 | Inbound list filters and fulfillment status | Arriving today/tomorrow/7 days/range, customer, status | all | Built | 10.7 |

### 5.5 Storage
| ID | Feature | Description | Roles | Status | § |
|---|---|---|---|---|---|
| F-S1 | Stock by location and customer | In Storage / Awaiting Put-away / Retrieved tabs; search; group by | Mgr/Sup/Oper | Built | 7.4 |
| F-S2 | Put-away, relocate, retrieve, put back | Single and bulk; scan history; movement log | Mgr/Sup/Oper | Built | 7.4 |
| F-S3 | QR scanning | Camera scan of HU QR | Mgr/Sup/Oper | Built | 7.4 |
| F-S4 | HU lifecycle timeline | Merged scans and movements per HU | all | Built | 14.3 |
| F-S5 | Scan-the-location confirmation | Scan HU then location QR | Oper | Planned | 11.4 |

### 5.6 Outbound and deliveries
| ID | Feature | Description | Roles | Status | § |
|---|---|---|---|---|---|
| F-O1 | Outbound request | Customer, carrier, pickup date, PO; pickup reference | Mgr/Sup (+Oper?) | Built | 7.5 |
| F-O2 | Select goods | HUs of the customer not already committed | Mgr/Sup/Oper | Built | 7.5 |
| F-O3 | Pick by scan, walking order | Location-ordered list; scan confirmation | Oper | Built | 7.5 |
| F-O4 | Pickup Pass with QR | Printable; gate scan opens the request | Mgr/Sup | Built | 14.1 |
| F-O5 | Driver check-in | Driver, ID, phone, plates, arrival time, admitter | Mgr/Sup/Oper | Built | 7.5 |
| F-O6 | Dispatch | Documents, photos, signature, vehicle, confirm; customer email | Mgr/Sup | Built | 7.5 |
| F-O7 | Dispatch Note | Printable hand-over with pick list and signature lines | Mgr/Sup | Built | 14.1 |
| F-O8 | Deliveries | In-transit/delivered tracking, bulk mark delivered | Mgr/Sup | Built | 7.6 |
| F-O9 | **Partial dispatch inside a request** | Dispatch some lines now, the rest later | Mgr/Sup | Planned | 18 |
| F-O10 | Outbound list filters and fulfillment status | Pickup date chips, search, scan pass, customer, status | all | Built | 10.8 |

### 5.7 Value-added logistics and tasks
| ID | Feature | Description | Roles | Status | § |
|---|---|---|---|---|---|
| F-T1 | VAL requests | Inspection, repacking, relabelling, kitting, quality check; assign → start → complete | Mgr/Sup/Oper | Built (flawed) | 7.7 |
| F-T2 | VAL ↔ HU status, photos, notes, billing event | Link to the HU; completion report; billable | Sup/Oper | Planned | 7.7 |
| F-T3 | Tasks | Assignment, priority, due date, status; attach to any record | Mgr/Sup/Oper | Built | 7.8 |
| F-T4 | Task reminders and mobile task queue | Notification and "my tasks" list | Oper | Planned | 11.4 |

### 5.8 Documents, labels, notifications
| ID | Feature | Description | Roles | Status | § |
|---|---|---|---|---|---|
| F-E1 | Document and photo upload | Linked to any record; private storage | all with module | Built | 7.9 |
| F-E2 | Driver signatures | Captured on screen; stored as a document | Oper/Sup | Built | 7.9 |
| F-E3 | QR labels | One per HU, printable sheet | Mgr/Sup/Oper | Built | 14.1 |
| F-E4 | Generated PDFs | GRN, dispatch confirmation, VAL report, movement report | system | Planned | 14.1 |
| F-N1 | Email notifications | 14 events defined, 3 sent | system | Partial | 12 |
| F-N2 | In-app notification centre / bell | Unread count, list | all | Planned | 12 |
| F-N3 | Web push notifications | Mobile alerts for tasks and exceptions | Oper/Sup | Planned | 11.5 |

### 5.9 Reports and dashboards
| ID | Feature | Description | Roles | Status | § |
|---|---|---|---|---|---|
| F-R1 | Dashboard | Occupancy, today's inbound/outbound, cargo, tasks, VAL, customers | all | Built | 14.2 |
| F-R2 | Stage dashboards | Counts per workflow stage; employee workload; KPIs | Mgr/Sup | Planned | 14.2 |
| F-R3 | Cargo Register, Dispatch Report | Operational reports | Mgr/Sup | Built | 14.3 |
| F-R4 | Seven further reports | Goods Receipt, Cargo Location, Occupancy, Movement History, VAL Summary, Task Report, Customer Activity | Mgr/Sup/Billing | Planned | 14.3 |
| F-R5 | Export (CSV/Excel/PDF) | From every list and report | Mgr/Billing | Planned | 10.1 |

### 5.10 Billing and integrations *(new)*
| ID | Feature | Description | Roles | Status | § |
|---|---|---|---|---|---|
| F-B1 | Rate cards | Per customer/warehouse/zone/unit with effective dates | Admin/Billing | Planned | 13.2 |
| F-B2 | Daily occupancy records | One record per HU per day (units, weight, volume, zone) | system | Planned | 13.4 |
| F-B3 | Charge events | Handling and VAL events priced at occurrence | system | Planned | 13.4 |
| F-B4 | Invoice runs and proposals | Pricing, review, adjustments, disputes, approval | Billing/Mgr | Planned | 13.5 |
| F-B5 | Usage statement | Customer-readable breakdown | Billing | Planned | 13.5 |
| F-B6 | **Zoho Books integration** | Connection in Settings; customer/item/tax mapping; push invoices; read back status/payments | Admin/Billing | Planned | 13.6 |
| F-B7 | Billing reports | Utilisation, revenue, unbilled, pipeline, aging | Billing/Mgr | Planned | 14.3 |
| F-G1 | Settings module | Organisation, numbering, notifications, labels, billing & integrations | Admin | Planned (static page today) | 13.1 |

### 5.11 Mobile
| ID | Feature | Description | Roles | Status | § |
|---|---|---|---|---|---|
| F-P1 | Installable PWA | Home-screen install, full-screen, offline shell | all | Planned | 11 |
| F-P2 | Mobile workflows | Receive, HU/label, put-away, pick, gate, tasks, count | Oper/Sup | Planned (responsive pages today) | 11.4 |
| F-P3 | Offline queue and sync | Scans, photos, signatures survive poor connectivity | Oper | Planned | 11.3 |
| F-P4 | Hardware scanner support | Keyboard-wedge/DataWedge handhelds; camera scanning | Oper | Partial (camera) | 11.2 |
| F-P5 | Mobile label printing | Bluetooth/network label printer or PDF share | Oper | Planned | 11.4 |

## 6. Master data

### 6.1 Customers (`Customers`, `Contacts`)
- **Fields:** name* (unique), email, phone, address, status (Active/Inactive).
- **Screens:** list (sortable; add form; select several and bulk delete; row click opens detail); detail page (editable info card, **Contacts**, then three read-only activity tables: Inbound advices, Outbound requests, Cargo, each limited to the viewer's warehouses).
- **Contacts:** a customer can have several: salutation, first name, last name, email, phone, **primary** flag (only one primary: setting one clears the others). Added from the customer detail page; deleting a customer cascades to its contacts.
- **Use of data:** the customer's `email` is the default recipient for inbound-completion and dispatch emails. Contacts are not used for notifications.
- After creating a customer the app opens its detail page so contacts can be added.

### 6.2 Suppliers (`Suppliers`)
A directory separate from customers (who shipped the goods vs. whose goods they are). Fields: name* (unique), email, phone, address, status. There is **no standalone Suppliers screen**: suppliers are chosen, or created inline ("+ Add new supplier…"), from the inbound request form.

### 6.3 Transporters (`Transporters`)
Fields: name*, contact person, phone, vehicle registration, status. List with add/edit; sortable. Used as carrier on inbound and outbound requests.

### 6.4 Warehouses and storage structure (Warehouse Management, administrators)
Hierarchy: **Warehouse → Zone → Aisle → Rack → Storage Location**. Uniqueness: warehouse names, customer names, supplier names, transporter names and storage `location_code`s are each unique across the system (`location_code` globally, not per warehouse).
- **Warehouse:** name* (unique), address, status (Active/Inactive, default Active; no screen changes it). Create, edit, delete.
- **Zone:** name*, zone type (free text, e.g. Ambient/Cold), belongs to a warehouse.
- **Aisle:** name* within a zone.
- **Rack:** code* within an aisle.
- **Storage Location:** `location_code`* (convention `RT2-A1-R01-B1-L2` = warehouse-aisle-rack-bay-level), location type (free text, e.g. Pallet Rack), **capacity** (number) and **capacity unit**, optional **max weight (kg)**, optional **length/width/height (cm)**, **bay** (position along the rack), **rack level** (1 = floor), occupancy status override (Available/Reserved/Blocked). Bay/level are editable in place.
- Deleting a parent cascades down the hierarchy.
- **Map tab:** per warehouse, the full tree with each location shown occupied/empty.
- **Availability tab:** the capacity dashboard (§7.2); visible to every role with Warehouse Management access *and* to non-admin staff.

### 6.5 Package Types (`PackageTypes`)
Name*, **capacity unit consumed**, **units per item** (e.g. a Carton consumes 0.1 of a Pallet Position), optional standard weight/dimensions, compatible location types, status. Seeded values are in Appendix A. Matching is by name, case-insensitive; an unmatched unit counts as 1 unit of an "Ungrouped" capacity. Package types feed the unit drop-down of line items and Handling Units. Add and delete from the *Package Types* tab.


## 7. Workflows

### 7.1 Inbound (the core workflow)

#### 7.1.1 Status model (`InboundAdvice.status`)
```
Requested ──(Availability Check: Accept)──► Confirmed ──(Mark as Received)──► Received
    │                                           │                                │
    └──(Reject, reason required)──► Rejected     └─(Edit Request: back to Requested)   (Create Handling Units)
          (admin: Reopen → Requested)                                               ▼
                                                                              HU Created ──(Put away all)──► Put Away
                                                                                                                │
                                              Completed ◄──(Finish: GRN verified + email)── Ready ◄──(Complete Inbound: GRN generated)
                                              (admin: Edit)
```
Legacy values `Pending` and `Submitted` (from earlier versions) are displayed and treated as **Requested**.

The Inbound Master page always shows a read-only record view plus **one contextual primary action**, computed from status and role:

| Status | Primary button | Opens | Who |
|---|---|---|---|
| Requested, request incomplete | Continue Request → | Request popup | approver in the warehouse |
| Requested, request complete | Availability Check → | Availability Check popup | approver |
| Confirmed | Mark as Received → | Receive popup | approver |
| Received | Create Handling Units → | HU popup | anyone with Inbound access |
| HU Created | Put Away → | Put-away popup | anyone |
| Put Away | Complete Inbound → | Check popup | anyone |
| Ready | Finish → | Finish popup | anyone (verify needs approver) |
| Completed | Edit | Request popup | System Administrator |
| Rejected | Reopen Request | sets Requested, opens Request popup | System Administrator |

Secondary: **Edit Request** is available on Requested and Confirmed inbounds (approvers). Editing a *Confirmed* inbound first asks for confirmation and returns it to *Requested* so the availability check is run again against the changed plan.

#### 7.1.2 Stage 1: Request (status Requested)
"+ New Inbound" (inbound list; approvers only; needs a chosen working warehouse) creates an empty draft immediately (status Requested, reference assigned, warehouse = working warehouse) and opens the **Request popup**. All fields **autosave** on blur/selection; the popup's "Done" just closes it.

Fields:
- *Shipment details:* **Expected Colli*** (integer, total packages announced), **Destination (country)*** (picklist + Other), **Expected arrival (ETA)***.
- *Customer & reference:* **Customer***, customer reference / PO number, reference client.
- *Supplier & transport:* supplier (picklist + inline add), carrier/transporter, CMR (freight document) number, transport type, remarks.
- *Expected storage period:* from, to (optional; needed for a meaningful availability check; open-ended "to" is allowed).
- **Line items** (a customer must be chosen first): per line **unit type*** (from Package Types; default Box), **description***, **quantity (number of packages)*** (default 1), **weight per package (kg)***, **length/width/height (cm)***. Add/delete lines. Under the table: remarks and **ADR (dangerous goods)** Yes/No, plus a summary strip (expected colli, received pieces, total packages, total weight, total volume m³).

Validation (see §15): R-I1…R-I5. A request is "complete" (so the primary action advances to Availability Check) only when the four required general fields exist, there is at least one line, every line is fully filled with qty > 0, the date rules hold and Expected Colli equals the lines' package total. A one-click "Set to N" fixes a colli mismatch.

#### 7.1.3 Stage 2: Availability Check and acceptance (Requested → Confirmed | Rejected)
Shown to approvers. Purpose: decide whether the chosen warehouse can hold this request for its whole storage period, then accept or reject.
- Shows customer, destination/ETA, supplier/transporter, summary.
- **Warehouse selector** ("Store this request in"): the approver's own decision; changing it re-assigns all lines (and the advice) to that warehouse. Only warehouses the user can access are offered.
- **Availability table:** one row per day of the storage period (from the start date to the end date; an open-ended period is checked for 14 days; maximum 60 days; with no start date only "Today"). Columns: one per capacity unit the request needs, plus Weight (kg) and Space (m³). A top "Required" row shows what the request needs; each day row shows what is still free that day; cells where required > free are red. The *lowest* free figure over the whole period decides "fits".
- **Warehouse comparison:** for each accessible warehouse: does it fit the whole interval, how many packages physically fit (size/weight/dimension/customer-dedication allocation), with a "Use this warehouse" action.
- A shortage is **a warning, not a block** (the approver may still accept).
- **Accept** → status Confirmed; audit `INBOUND_CONFIRMED`. **Reject** (reason required) → status Rejected, `rejection_reason` stored; audit `INBOUND_REJECTED`. No email is sent on either.
- Accepting does **not** reserve a specific location; the location is chosen at put-away.

#### 7.1.4 Stage 3: Receive (Confirmed → Received)
Physical arrival. Fields: **warehouse unloading date***, **unloading time***, **received piece count***, **licence plate***, **driver name***, per-line **received quantity** (defaults to the requested qty), **driver signature*** (drawn on a canvas, stored as a document of type *Driver Signature (Receiving)*), **CMR photo** and optional **additional photos**.
- "Mark as Received" is enabled only when all starred items and the signature exist. A hint appears if the piece count differs from the sum of received quantities.
- Saves changed received quantities one by one, then sets status Received.

#### 7.1.5 Stage 4: Create Handling Units (Received → HU Created)
Turns received packages into physical HUs. Table of lines shows *Received*, *On HUs* and *Left to pack*. To build an HU: choose **HU type** (from Package Types), enter quantities for one or more lines in "Put on new HU" (combine lines on one HU, or split a line across several), weight (prefilled from line weight × qty), dimensions (prefilled from the first line), and **"create this many identical HUs"**. Shortcut **"One HU per package (all lines)"** creates one HU per remaining package with that line's own type, weight and size.
- Each HU gets the next HU number, the `Cargo` row (status Received, `received_qty` = packed qty, description = "<line description> ×qty, …"), its **QR stamped immediately** (`WOMS-CARGO-<id>`), and `HuLine` rows recording contents. If the contents fail to save, the half-built HU is deleted.
- Rule: you cannot pack more than "left to pack" for any line. An HU can be deleted while it has no location; deleting cascades its `HuLine` rows.
- **Print Labels** opens the QR label sheet. "Continue to Put-away" is enabled only when nothing is left to pack and at least one HU exists → status HU Created.

#### 7.1.6 Stage 5: Put-away (HU Created → Put Away)
Shows the warehouse's current availability (per capacity unit, plus weight and space) and a table of this inbound's HUs. Each unplaced HU gets a **suggested location** from the allocation algorithm (§7.3, "today" mode); the operator can override with any location of that warehouse; HUs with no suitable location are flagged and need a manual choice. "Store N of M" records a `storage` scan for each chosen HU (§7.4). It can be run in several sittings; when every HU is placed the status becomes Put Away.

#### 7.1.7 Stage 6: Complete Inbound (Put Away → Ready)
Final review (customer, supplier, destination, transport info, totals, line table with requested vs received, remarks/ADR, tasks, audit trail). "Complete Inbound" creates the **GRN** if none exists (idempotent, one per inbound; number `GRN-<reference>`, status *Generated*; audit `CREATE_GRN`) and sets status Ready.

#### 7.1.8 Stage 7: Finish (Ready → Completed)
- Shows the GRN with status. **Verify GRN** (approvers only) → GRN status *Verified*, `verified_by` stored (audit `VERIFY_GRN`). Non-approvers see "Waiting for a manager to verify."
- **Both completion buttons require: GRN verified and a recipient email** (prefilled from the customer's email). "Complete Inbound + New" or "Complete Inbound + Return to Dashboard": set status Completed, then send the customer confirmation email (§12). If sending fails the inbound stays Completed and the user may **Send again** or **Continue without email**. "+ New" starts a fresh inbound in the same warehouse.
- Links to the Inbound Summary and Label Overview prints. (The screen text lists "Signed CMR, Photos, Inbound Summary, Label Overview" as attachments, but **no attachments are actually sent**: see §17.)

#### 7.1.9 Inbound record page
Header: reference and, for editable states, the buttons above. Read-only blocks: Customer; Supplier; Destination; Transport information (type, carrier, CMR, ETA); Warehouse & Storage (warehouse, storage period, ADR); Receiving (unloading date/time, plate, driver, pieces counted); **GRN** (number, status, verified by, link to print); **Linked Outbounds** (each outbound this inbound's HUs left on, with "n of N HUs" and Open/Dispatched); summary strip; Line Items table (requested vs received); Handling Units table (HU label, type, contents, weight, size, QR thumbnail, location code/path, outbound link per HU); Documents (thumbnails, lazy-loaded); Tasks; Audit trail. Sidebar: Status card, Inbound Summary (expected colli, received pieces, total packages, total weight, total volume, HUs, pallets, items), Quick actions (Reprint Labels from HU Created onward, Save as Draft, Cancel; the latter two only navigate back, since everything autosaves).

### 7.2 Capacity and availability engine
Used by the Availability tab, the Availability Check, and put-away. Inputs: every storage location (capacity, capacity unit, type, max weight, L/W/H, status, warehouse), every HU still in the building, planned lines of Confirmed/Received inbounds, outbound commitments (HUs on *Submitted* outbound requests with a requested date), and the Package Types master.

Definitions (per warehouse × capacity unit; `asOfDate` optional):
- **Total** = Σ location `capacity`.
- **Occupied** = Σ over HUs sitting in a location (units consumed = `units_per_item` of the HU's type, default 1; unmatched type → "Ungrouped").
- **Committed** = units of lines/HUs belonging to inbounds in status **Confirmed** (accepted, not yet arrived).
- **Available** = Total − Occupied − Committed.
- **Pending put-away** = count of HUs with no location whose inbound is neither Requested nor Confirmed (already physically here).
- **Unclaimed** = capacity of locations *not yet dedicated* to a customer (locations are customer-dedicated: once a location holds or is reserved for one customer, others cannot use the remainder).
- **Weight** = Σ `max_weight_kg` of locations that have it; occupied/committed = Σ HU weights. **Space (m³)** = Σ L×W×H/1,000,000 of locations that have all three dimensions; occupied/committed likewise from HU dimensions.
- **Date projection** (`asOfDate`): a HU physically in a location *leaves* on its outbound request's requested date if that date ≤ asOfDate; a Confirmed HU with a reserved location *arrives* on the inbound's expected date; otherwise unchanged. The Availability tab's "Date range" view runs this per day (From date + number of days, max 60). Today and future run the same function.
- Planned lines are expanded to one row per package, capped at 2,000 per line.
The Availability tab shows consolidated or per-warehouse figures, by capacity unit, with weight and space, for Today or a date range.

### 7.3 Location allocation (suggestion algorithm)
Greedy, per item, in order, for one warehouse:
1. Start each location with free units = capacity, free weight = max weight (if set), free volume = L×W×H (if set); subtract everything already occupying it during the requested window (HUs in it unless their outbound leaves on/before the start date; reservations overlapping the window).
2. Record which customer each location is dedicated to.
3. For each item pick the **first** location that: is not Blocked; has the same capacity unit as the item's package type; fits the item's dimensions (item sorted dims ≤ location sorted dims, any orientation; missing dimensions don't block); is not dedicated to a *different* customer; has free units ≥ item units; has free weight ≥ item weight and free volume ≥ item volume where those are tracked.
4. Reduce that location's free figures and dedicate it to the customer.
It is not true 3-D bin packing. **Warehouse recommendation** runs the allocation per warehouse and ranks by how many items fit. Put-away reuses it for the real HUs with "today" as the window.

### 7.4 Storage operations and the scan model
`Cargo.status` lifecycle: **Received → Stored ⇄ Retrieved → Picked → Dispatched → Delivered** (also *In VAL*, defined but not set by the current VAL screen).

All movements go through one operation, *record scan* (cargo, user, context, optional location):

| Scan context | New status | Location effect | Movement log type |
|---|---|---|---|
| receiving | Received | none | none |
| storage (put-away) | Stored | `current_location_id` = chosen location (**required**) | putaway |
| relocation | Stored | set to the new location (**required**) | relocation |
| retrieval | Retrieved | cleared (must currently be in a location) | retrieval |
| pick | Picked | cleared | pick |
| val | In VAL | unchanged | none |
| dispatch | Dispatched | cleared | none |
| delivery | Delivered | cleared | none |

Every scan writes a `ScanHistory` row (cargo, who, context, time), moves the HU, writes a `CargoMovementLog` row for movement types above (from/to location, who, when) and an audit entry `RECORD_SCAN`. The per-HU lifecycle timeline (merged scans + movements) is shown on `/cargo/:id`.

**Storage page** (Cargo & Storage Management): three tabs: **In Storage** (HUs in locations), **Awaiting Put-away** (HUs with no location, not Retrieved, not Picked), **Retrieved** (taken out of a rack, on the floor). Summary strip (counts). Filters: search (goods, customer, reference, QR, location), customer, location (In Storage tab), group by none/customer/location. Row actions: In Storage → *Relocate*, *Retrieve*; others → *Put away* / *Put back*. Multi-select with bulk put-away/relocate to one chosen location. A put-away picker pre-selects the allocation suggestion. **Scan QR** (camera) opens the matching HU: if out of rack → put-away picker; if in a rack → choose relocate/retrieve. Successful/failed counts are reported (partial failures list the first error).

### 7.5 Outbound
Mirror of Inbound: a read-only record page with one contextual action opening a stage popup.

#### 7.5.1 Request
"+ New Outbound Request" (outbound list; needs a working warehouse): **customer***, transporter (optional), customer reference/PO (optional), requested (pickup) date. Created with status **Submitted** and reference `OB-<year>-<n>` (the *pickup reference*).

#### 7.5.2 Stages (any order before dispatch, except dispatch itself)
| Stage / popup | What happens | Rule |
|---|---|---|
| **Select Goods** | Add/remove HUs of this customer (those not Dispatched/Delivered/Picked and not already on this request), each shown with description, HU no., type, qty, inbound reference and location (or status). Creates `PickTask` (status *Assigned*, assigned_to = current user). | Picked lines cannot be removed. |
| **Pick Goods** | Lines are listed **in walking order** (unpicked first, sorted by location code, "not in a rack: at the dock" last, picked last). **Scan & Pick** (button or camera scan matching the HU QR) performs a `pick` scan and sets the PickTask *Picked*. "n of N picked". | A scan that matches no pending line shows an error. |
| **Driver Check-in** | Records driver name*, driver ID number, phone, vehicle plate*, trailer plate, **arrival time**, and the staff member who checked them in; audit `PICKUP_CHECK_IN`. Editable until dispatch. | Check the driver's ID and Pickup Pass first (instruction on screen). |
| **Dispatch** | Documents and Dispatch Photos upload, driver handover signature (*Driver Signature (Handover)*), vehicle details (default: plate / trailer), **Confirm Dispatch**: a `dispatch` scan per HU (→ Dispatched), a `Dispatch` row (vehicle details, dispatched by, time, status Dispatched), request status → **Dispatched**, audit `DISPATCH_CONFIRMED`, customer email (§12). | **All lines must be picked and the driver checked in.** The email never blocks dispatch; a failure is shown as a warning. |
| **Mark Delivered** | A `delivery` scan for every HU (→ Delivered); audit `DELIVERY_CONFIRMED`. | Only after dispatch. |

The primary action is derived (no stored stage): no lines → *Select Goods*; unpicked lines → *Pick Goods*; all picked, not checked in → *Check Driver In*; checked in → *Dispatch*; dispatched and not all delivered → *Mark Delivered*; all delivered → none. Before dispatch the other stages remain available as secondary buttons (*Edit Goods*, *Pick Goods*, *Driver Check-in*).

#### 7.5.3 Outbound record page
Pickup reference, customer, pickup date/carrier/from-warehouse, driver check-in block, dispatch block, **Linked Inbounds** (inbounds the HUs came from, "n HUs", linked), Goods table (HU, cargo, from inbound (link), location, qty, QR, pick status, HU status), Documents, Tasks, Audit trail. Sidebar: fulfillment status, pickup number/date/created, summary (HUs, picked, sent, delivered x of N), Quick actions: **Print Pickup Pass**, **Print Dispatch Note**, Back to list.

#### 7.5.4 Outbound list
Columns: pickup ref, customer ref, customer, transporter, requested date, **fulfillment status**. Filters: **pickup date chips** (Today (default), Tomorrow, Next 7 days, All dates, Pick dates range), **search** (pickup ref, customer ref, customer, id; searching ignores the date filter so a driver arriving on the wrong day is still found), **Scan pass** (camera; reads `WOMS-OB-<id>` and opens the request; anything else: "is not a Pickup Pass code"), customer, status. Sortable columns.

### 7.6 Deliveries
HUs that have left (status Dispatched or Delivered) with their customer, outbound order, dispatch vehicle/date/by. Tabs **In Transit** / **Delivered**, search, customer filter, dispatched-from/to dates, group by none/customer/order, bulk select on In Transit and **Mark delivered** (delivery scan). The delivered date shown is the HU's last-modified date.

### 7.7 Value-added logistics (VAL)
- **New VAL request:** customer*, cargo* (the customer's HUs), service type* (Inspection, Repacking, Relabelling, Kitting, Quality Check), requested date. Status **Submitted**.
- **Advance button** per row: *Assign* (creates a `VALTask` assigned to the current user, status Assigned; request → Assigned) → *Start* (→ In Progress) → *Complete* (→ Completed).
- Dashboard "Pending VAL" counts requests not Completed. VAL requests are **not warehouse-scoped**. Completing VAL does not change the HU's status or send a notification (see §17). `VALTask.completion_notes` exists but the screen never edits it.

### 7.8 Operational tasks
- **Standalone** (Tasks page): task type/description*, assigned-to (free text, an email), priority (Low/Medium/High, default Medium), due date. Tabs Open / All. Advance: Assigned → *Start* → In Progress → *Complete* → Completed.
- **Attached to a record** (Inbound and Outbound pages): same form, stored with `module_ref` (e.g. "Inbound Operations") and `record_ref_id`. If *assigned-to* is filled, a **TASK_ASSIGNMENT** email is sent to that address (best-effort).
- Visibility: warehouse-scoped; operators see only tasks assigned to their email. Tasks created from the UI **do not set `warehouse_id`**, so non-administrators do not see them (§17).

### 7.9 Documents, photos and signatures
- **Upload:** the client sends the file (limit ≈ 15 MB) with storage area (documents or photos), file name, doc type, linked module, linked record id and uploader email (see *Upload file*, §16.4). The server stores it under a safe unique name, creates a `Documents` record (`linked_module`, `linked_record_id` as text, `doc_type`, `file_id` = storage key, `uploaded_by`, `uploaded_date`) and writes an audit entry.
- **Tiles:** *CMR upload* (camera photo or file/PDF), *Additional photos* (multiple; camera or file), generic uploader with doc-type drop-down (CMR, Packing List, Delivery Note, Bill of Lading, Commercial Invoice, Photo, Operational Attachment).
- **Signatures:** a 400×150 canvas (mouse or touch) saved as a PNG document of type *Driver Signature (Receiving)* or *(Handover)*; "Re-capture" replaces the view (older rows remain).
- **Display:** images appear inline as thumbnails via the *Get file for display* operation (§16.4); PDFs open in a viewer/link.
- `linked_module` values in use: `Inbound Operations`, `Inbound Operations Photos`, `Outbound Operations`, `Outbound Operations Photos`, `GRN`.

### 7.10 Audit trail
Rows in `AuditLog` (user, action type, module, record id, JSON details, timestamp) are written by the scan operation, GRN create/verify, accept/reject, pickup check-in, dispatch, delivery, user invitation, uploads and notifications. A reusable **Audit Trail** panel (last 50, newest first) is shown on inbound, outbound and administration pages. Writes are best-effort: an audit failure never blocks the business action. Action types: `RECORD_SCAN`, `CREATE_GRN`, `VERIFY_GRN`, `INBOUND_CONFIRMED`, `INBOUND_REJECTED`, `PICKUP_CHECK_IN`, `DISPATCH_CONFIRMED`, `DELIVERY_CONFIRMED`, `INVITE_USER`, `UPLOAD_DOCUMENT`, `NOTIFY_EVENT`, `GENERATE_QR_CODE`.


## 8. Derived ("fulfillment") statuses
Computed on the fly when lists load; never stored.

### 8.1 Inbound fulfillment status
Inputs: line totals (planned = Σ line qty, received = Σ `received_qty`) and the inbound's HU statuses.
```
if no HUs and received == 0                     → Requested
fullyReceived = planned>0 ? received >= planned : true
if no HUs                                       → fullyReceived ? Received : Partially Received
sent   = HUs with status Dispatched|Delivered
if sent > 0     → (sent == total && fullyReceived) ? Sent    : Partially Sent
stored = HUs with status Stored|Retrieved|Picked|In VAL|Dispatched|Delivered
if stored > 0   → (stored == total && fullyReceived) ? Stored : Partially Stored
otherwise                                       → fullyReceived ? Received : Partially Received
```
Values: Requested, Partially Received, Received, Partially Stored, Stored, Partially Sent, Sent. Shown beside the inbound's workflow **Stage** in the inbound list, with a status filter.

### 8.2 Outbound fulfillment status
From the pick lines and their HUs: none → *Requested*; if any HU is Dispatched/Delivered: all Delivered → *Delivered*, all sent → *Sent*, else *Partially Sent*; else all lines Picked → *Picked*; some → *Partially Picked*; none → *Requested*.

### 8.3 Where each status shows
Inbound list: Stage (stored status) + Fulfillment; inbound sidebar: Stage; outbound list/sidebar: fulfillment; storage and delivery pages: HU status badges; customer detail: raw statuses.


## 9. Data model

The model has two parts: the **operational model** (28 entities, built) and the **billing and integration model** (proposed, §9.7). Types are generic: `string(n)`, `text`, `integer`, `decimal`, `boolean`, `date`, `datetime`, `reference → Entity`. Every entity also has an implicit primary key `id` plus `createdAt`, `updatedAt`, `createdBy`. "Cascade" means deleting the referenced record deletes this record too; "set null" clears the reference.

### 9.1 Conceptual model (relationships)
```
                    ┌─────────────── SPACE ───────────────┐
Warehouses ─< Zones ─< Aisles ─< Racks ─< StorageLocations (capacity, unit, size, max weight, [location QR])
     │                                          ▲
     │                                          │ current_location_id (null when not in a rack)
     ├─< InboundAdvice >─ Customers ─< Contacts │
     │        │   └─ Suppliers, Transporters    │
     │        ├─< InboundLine (the PLAN) ─┐      │
     │        ├─< GRN                     │ HuLine (many-to-many: which line, how many, in which HU)
     │        └─< Cargo = HANDLING UNIT ──┘──────┘
     │                 │   ├─< ScanHistory, CargoMovementLog   ◄── TIME: every scan is timestamped
     │                 │   ├─< PickTask >─ OutboundRequest ─< Dispatch
     │                 │   └─< VALRequest ─< VALTask
     ├─< OutboundRequest >─ Customers, Transporters
     └─< Tasks (generic; attach to any record via module_ref + record_ref_id)

Documents (linked_module + linked_record_id)   AuditLog (module + record_id)   PackageTypes (units per item)
AppUsers ─< UserWarehouseRole >─ Warehouses    RolePermissions (role × module)

                    ┌─────────────── COST (proposed, §9.7) ───────────────┐
RateCard ─< RateCardLine        BillingSettings
Cargo (HU) ─< OccupancyDay (one row per HU per day: units, weight, volume, zone)   ──┐
Inbound/Outbound/VALTask events ─< ChargeEvent (handling, VAL, surcharges)           ──┼─> InvoiceRun ─< InvoiceProposal ─< InvoiceLine
Customers ── ZohoCustomerMap      charge types ── ZohoItemMap       ZohoBooksConnection │            └─> Zoho Books invoice (id, number, status, payments)
IntegrationLog (every call to/from the accounting system)                              ┘
```
The entity `Cargo` is the **Handling Unit**; a rebuild may name it `HandlingUnit`.

### 9.2 Relationship catalogue
Cardinality reads parent → child. "Required" means the child cannot exist without the parent.

| Parent | Child (field) | Cardinality | Required | On parent delete | Meaning |
|---|---|---|:-:|---|---|
| Warehouses | Zones (`warehouse_id`) | 1 → many | yes | cascade | A warehouse is divided into zones |
| Zones | Aisles (`zone_id`) | 1 → many | yes | cascade | |
| Aisles | Racks (`aisle_id`) | 1 → many | | cascade | |
| Racks | StorageLocations (`rack_id`) | 1 → many | yes | cascade | A location is a slot on a rack (bay, level) |
| Warehouses | InboundAdvice, InboundLine, Cargo, OutboundRequest, Tasks, AppUsers (`warehouse_id`) | 1 → many | | set null | Operational records belong to one warehouse (drives scoping) |
| Customers | Contacts (`customer_id`) | 1 → many | yes | cascade | A customer has several contacts |
| Customers | InboundAdvice, InboundLine, Cargo, OutboundRequest, VALRequest (`customer_id`) | 1 → many | mostly | **cascade** | Whose goods; deleting a customer deletes its history (to be reconsidered) |
| Suppliers | InboundAdvice (`supplier_id`) | 1 → many | | set null | Who shipped the goods |
| Transporters | InboundAdvice, OutboundRequest (`transporter_id`) | 1 → many | | set null | Carrier |
| InboundAdvice | InboundLine (`inbound_advice_id`) | 1 → many | yes | cascade | The planned lines |
| InboundAdvice | GRN (`inbound_advice_id`) | 1 → 1 (many allowed for multi-receipt) | yes | cascade | Goods Receipt Note |
| InboundAdvice | Cargo (`inbound_advice_id`) | 1 → many | | cascade | HUs created from this inbound |
| Cargo (HU) | HuLine (`cargo_id`) | 1 → many | yes | cascade | Contents of the HU |
| InboundLine | HuLine (`inbound_line_id`) | 1 → many | yes | cascade | Which line fills which HU (many-to-many via HuLine) |
| StorageLocations | Cargo (`current_location_id`, `reserved_location_id`) | 1 → many | | set null | Where the HU is now (a location may hold several HUs) |
| Cargo | ScanHistory, CargoMovementLog (`cargo_id`) | 1 → many | yes | cascade | Time-stamped history |
| StorageLocations | CargoMovementLog (`from_/to_location_id`) | 1 → many | | set null | |
| OutboundRequest | PickTask (`outbound_request_id`) | 1 → many | yes | cascade | Pick lines |
| Cargo | PickTask (`cargo_id`) | 1 → many (should be at most one open) | yes | cascade | An HU leaves on a request |
| OutboundRequest | Dispatch (`outbound_request_id`) | 1 → many | yes | cascade | Dispatch record(s) |
| Cargo | VALRequest (`cargo_id`) | 1 → many | yes | cascade | Value-added work on an HU |
| VALRequest | VALTask (`val_request_id`) | 1 → many | yes | cascade | Work assignments |
| AppUsers | UserWarehouseRole (`app_user_id`) | 1 → many | yes | cascade | Per-warehouse role |
| Warehouses | UserWarehouseRole, RolePermissions (`warehouse_id`) | 1 → many | | cascade | |
| (any record) | Documents, AuditLog, Tasks | many → 1 (by module + record id, no database FK) | | none | Polymorphic links by `linked_module`/`module_ref` + record id |

### 9.3 Data flows
**What each business event writes, and what is derived from it.** The *derived* column is never typed in: it is calculated from the records.

| Business event | Trigger | Records created or changed | Derived from it |
|---|---|---|---|
| Inbound requested | Coordinator | InboundAdvice (Requested), InboundLine × n, reference assigned | Expected colli and totals |
| Request accepted / rejected | Approver | InboundAdvice.status, `rejection_reason`, AuditLog | **Committed space**, availability by day |
| Goods received | Operator | InboundLine.received_qty, receiving fields, Documents (CMR, photos, signature), status Received | Fulfillment status, dock backlog ("pending put-away") |
| HU created | Operator | Cargo (status Received, QR), HuLine × n | Labels; units per HU from package types |
| **Put-away** | Operator scan | ScanHistory(storage), CargoMovementLog(putaway), Cargo (status Stored, `current_location_id`), AuditLog | **Occupancy starts**; capacity occupied; first OccupancyDay |
| Relocation / retrieval | Operator scan | ScanHistory, CargoMovementLog, Cargo (location, status Stored/Retrieved) | Zone-dependent rate from the next snapshot |
| GRN generated / verified | Operator / Approver | GRN (Generated → Verified), AuditLog | Completion gate |
| Inbound finished | Approver | InboundAdvice.status Completed, notification | Customer email, "In stock" |
| Outbound requested | Coordinator | OutboundRequest (Submitted), PickTask × n | **Expected release** in capacity projection |
| Pick | Operator scan | ScanHistory(pick), CargoMovementLog(pick), Cargo (Picked, location cleared), PickTask (Picked) | Fulfillment status |
| Driver check-in | Operator | OutboundRequest (driver, plates, arrival time, admitter), AuditLog | Prerequisite for dispatch |
| **Dispatch** | Supervisor | ScanHistory(dispatch) per HU, Dispatch, OutboundRequest.status, AuditLog | **Occupancy ends**; capacity released; handling-out charge |
| Delivery | Supervisor | ScanHistory(delivery), Cargo (Delivered) | Deliveries list |
| VAL completed | Operator | VALTask/VALRequest status *(planned: ChargeEvent)* | VAL charge |
| **Nightly snapshot** *(planned)* | Scheduler | OccupancyDay for every HU in the building | Storage charge basis |
| **Invoice run** *(planned)* | Billing Officer | InvoiceRun, InvoiceProposal, InvoiceLine; OccupancyDay/ChargeEvent locked; IntegrationLog | Invoice in Zoho Books; status/payment read back |

**Flow from floor to money** *(the space-time-cost chain)*:
```
 scans (put-away … dispatch) ──► CargoMovementLog / ScanHistory   (TIME)
 HU footprint + location     ──► capacity units, weight, volume    (SPACE)
        │                              │
        └────────── nightly ───────────┴─► OccupancyDay (HU × day)
 receiving / dispatch / VAL events ─────────► ChargeEvent
                                              │
 RateCard (customer, zone, unit, dates) ──────┤  price                                (COST)
                                              ▼
                              InvoiceRun ─► InvoiceProposal (review, dispute, adjust) ─► approve (lock)
                                              ▼
                              Zoho Books invoice ─► sent / viewed / paid / overdue ─► status shown in WOMS
```

### 9.4 Status vocabularies stored in the data
| Column | Allowed values |
|---|---|
| `InboundAdvice.status` | Requested, Confirmed, Rejected, Received, HU Created, Put Away, Ready, Completed (legacy: Pending, Submitted → read as Requested) |
| `Cargo.status` | Received, Stored, Retrieved, Picked, In VAL, Dispatched, Delivered (default Received) |
| `OutboundRequest.status` | Submitted, Dispatched |
| `PickTask.status` | Assigned, Picked |
| `Dispatch.status` | Dispatched |
| `GRN.status` | Generated, Verified |
| `VALRequest.status` | Submitted → Assigned → In Progress → Completed |
| `VALTask.status`, `Tasks.status` | Assigned, In Progress, Completed |
| `Customers / Suppliers / Transporters / PackageTypes.status`, `AppUsers.user_status` | Active, Inactive |
| `StorageLocations.occupancy_status` | Available, Reserved, Blocked (a manual override; "occupied" is computed) |
| `CargoMovementLog.movement_type` | putaway, relocation, retrieval, pick |
| `ScanHistory.scan_context` | receiving, storage, relocation, retrieval, pick, val, dispatch, delivery |
| `AppUsers.business_role` | System Administrator, Warehouse Staff |
| `UserWarehouseRole.business_role` | Warehouse Manager, Warehouse Supervisor, Warehouse Operator |

### 9.5 Notes on specific columns
- `InboundAdvice`: `reference_number` = the customer's PO/reference; `reference_client` = a second client-side reference; `inbound_reference` = WOMS reference (`IB-…`); `expected_colli` = total packages announced; `received_piece_count` = pieces counted at the dock (a manual figure checked against received quantities); `storage_start_date/storage_end_date` = expected storage period; `adr_status` = dangerous-goods flag (Yes/No); `rejection_reason` is set on reject. `transport_details` is a legacy free-text field.
- `InboundLine.qty` = number of **packages** (not inner pieces); `received_qty` = packages actually received.
- `Cargo` (HU): `outer_package_no` is the HU number within its inbound; `qty`/`received_qty` = packages packed in it; `unit` = HU type; `current_location_id` = where it is now (null when not in a rack); `reserved_location_id` exists but is **no longer written**; `dimensions` is a legacy display string; `description` is generated from contents.
- `Documents.file_id` holds the **storage key**; the reference build did not record which storage area (documents or photos) held the file, so retrieval tried both. A rebuild should record the area.
- `AuditLog.details` is a JSON string. `Tasks.assigned_to` is free text (an email by convention).
- Unused or legacy columns: `AppUsers.warehouse_id` (superseded by `UserWarehouseRole`), `RolePermissions.function_name` and `.warehouse_id` (the matrix is module-level only), `GRN.document_id`, `VALTask.completion_notes`.
- **Delete behaviour to preserve or reconsider:** deleting a **Customer** cascades to its contacts, inbounds, lines, HUs, outbounds, pick tasks and VAL requests. Deleting a **Warehouse** cascades to zones → aisles → racks → locations and to `UserWarehouseRole`, and sets `warehouse_id` to null on operational records. Deleting an HU cascades to its `HuLine` rows. Deleting a location nulls HU `current_location_id`.

### 9.6 Entity definitions (operational model)

#### `Aisles`

| Field | Type | Required | Unique | Notes |
|---|---|---|---|---|
| `name` | string(200) | yes |  |  |
| `zone_id` | reference → Zones | yes |  | cascade delete |

#### `AppUsers`

| Field | Type | Required | Unique | Notes |
|---|---|---|---|---|
| `business_role` | string(50) | yes |  |  |
| `account_id` | string(100) | yes | yes |  |
| `email` | string(200) | yes | yes |  |
| `user_status` | string(30) | yes |  | default `Active` |
| `warehouse_id` | reference → Warehouses |  |  | set null on delete |

#### `AuditLog`

| Field | Type | Required | Unique | Notes |
|---|---|---|---|---|
| `action_type` | string(100) | yes |  |  |
| `details` | text |  |  |  |
| `event_timestamp` | datetime |  |  |  |
| `module` | string(100) | yes |  |  |
| `record_id` | string(100) |  |  |  |
| `user_id` | string(100) |  |  |  |

#### `Cargo`

| Field | Type | Required | Unique | Notes |
|---|---|---|---|---|
| `current_location_id` | reference → StorageLocations |  |  | set null on delete |
| `customer_id` | reference → Customers | yes |  | cascade delete |
| `description` | text |  |  |  |
| `dimensions` | string(100) |  |  |  |
| `height_cm` | decimal(4 places) |  |  |  |
| `inbound_advice_id` | reference → InboundAdvice |  |  | cascade delete |
| `length_cm` | decimal(4 places) |  |  |  |
| `outer_package_no` | string(20) |  |  |  |
| `qr_code` | string(100) |  | yes |  |
| `qty` | integer |  |  |  |
| `received_qty` | decimal(4 places) |  |  |  |
| `reserved_location_id` | reference → StorageLocations |  |  | set null on delete |
| `status` | string(30) | yes |  | default `Received` |
| `unit` | string(30) |  |  |  |
| `warehouse_id` | reference → Warehouses |  |  | set null on delete |
| `weight` | decimal(4 places) |  |  |  |
| `width_cm` | decimal(4 places) |  |  |  |

#### `CargoMovementLog`

| Field | Type | Required | Unique | Notes |
|---|---|---|---|---|
| `cargo_id` | reference → Cargo | yes |  | cascade delete |
| `from_location_id` | reference → StorageLocations |  |  | set null on delete |
| `moved_by` | string(100) |  |  |  |
| `movement_timestamp` | datetime |  |  |  |
| `movement_type` | string(30) | yes |  |  |
| `to_location_id` | reference → StorageLocations |  |  | set null on delete |

#### `Contacts`

| Field | Type | Required | Unique | Notes |
|---|---|---|---|---|
| `customer_id` | reference → Customers | yes |  | cascade delete |
| `email` | string(200) |  |  |  |
| `first_name` | string(100) | yes |  |  |
| `is_primary` | boolean | yes |  | default `false` |
| `last_name` | string(100) | yes |  |  |
| `phone` | string(50) |  |  |  |
| `salutation` | string(10) |  |  |  |

#### `Customers`

| Field | Type | Required | Unique | Notes |
|---|---|---|---|---|
| `address` | text |  |  |  |
| `contact_person` | string(200) |  |  |  |
| `email` | string(200) |  |  |  |
| `name` | string(200) | yes | yes |  |
| `operational_preferences` | text |  |  |  |
| `phone` | string(50) |  |  |  |
| `status` | string(30) | yes |  | default `Active` |

#### `Dispatch`

| Field | Type | Required | Unique | Notes |
|---|---|---|---|---|
| `confirmation_document_id` | string(200) |  |  |  |
| `dispatch_date` | datetime |  |  |  |
| `dispatched_by` | string(100) |  |  |  |
| `outbound_request_id` | reference → OutboundRequest | yes |  | cascade delete |
| `status` | string(30) | yes |  | default `Pending` |
| `vehicle_details` | text |  |  |  |

#### `Documents`

| Field | Type | Required | Unique | Notes |
|---|---|---|---|---|
| `doc_type` | string(100) | yes |  |  |
| `file_id` | string(200) |  |  |  |
| `linked_module` | string(100) | yes |  |  |
| `linked_record_id` | string(100) | yes |  |  |
| `uploaded_by` | string(100) |  |  |  |
| `uploaded_date` | datetime |  |  |  |

#### `GRN`

| Field | Type | Required | Unique | Notes |
|---|---|---|---|---|
| `document_id` | string(200) |  |  |  |
| `generated_date` | datetime |  |  |  |
| `grn_number` | string(100) | yes | yes |  |
| `inbound_advice_id` | reference → InboundAdvice | yes |  | cascade delete |
| `status` | string(30) | yes |  | default `Pending` |
| `verified_by` | string(100) |  |  |  |

#### `HuLine`

| Field | Type | Required | Unique | Notes |
|---|---|---|---|---|
| `cargo_id` | reference → Cargo | yes |  | cascade delete |
| `inbound_line_id` | reference → InboundLine | yes |  | cascade delete |
| `qty` | decimal(4 places) |  |  |  |

#### `InboundAdvice`

| Field | Type | Required | Unique | Notes |
|---|---|---|---|---|
| `adr_status` | string(10) |  |  |  |
| `cmr_number` | string(50) |  |  |  |
| `customer_id` | reference → Customers |  |  | cascade delete |
| `destination` | string(150) |  |  |  |
| `driver_name` | string(100) |  |  |  |
| `expected_colli` | integer |  |  |  |
| `expected_date` | date |  |  |  |
| `inbound_reference` | string(30) |  | yes |  |
| `license_plate` | string(30) |  |  |  |
| `received_piece_count` | integer |  |  |  |
| `reference_client` | string(100) |  |  |  |
| `reference_number` | string(100) |  |  |  |
| `rejection_reason` | text |  |  |  |
| `remarks` | text |  |  |  |
| `status` | string(30) | yes |  | default `Submitted` |
| `storage_end_date` | date |  |  |  |
| `storage_start_date` | date |  |  |  |
| `supplier_id` | reference → Suppliers |  |  | set null on delete |
| `transport_details` | text |  |  |  |
| `transport_type` | string(50) |  |  |  |
| `transporter_id` | reference → Transporters |  |  | set null on delete |
| `warehouse_id` | reference → Warehouses |  |  | set null on delete |
| `warehouse_unloading_date` | date |  |  |  |
| `warehouse_unloading_time` | string(10) |  |  |  |

#### `InboundLine`

| Field | Type | Required | Unique | Notes |
|---|---|---|---|---|
| `customer_id` | reference → Customers |  |  | cascade delete |
| `description` | text |  |  |  |
| `height_cm` | decimal(4 places) |  |  |  |
| `inbound_advice_id` | reference → InboundAdvice | yes |  | cascade delete |
| `length_cm` | decimal(4 places) |  |  |  |
| `line_no` | string(20) |  |  |  |
| `qty` | decimal(4 places) |  |  |  |
| `received_qty` | decimal(4 places) |  |  |  |
| `unit` | string(30) |  |  |  |
| `warehouse_id` | reference → Warehouses |  |  | set null on delete |
| `weight` | decimal(4 places) |  |  |  |
| `width_cm` | decimal(4 places) |  |  |  |

#### `OutboundRequest`

| Field | Type | Required | Unique | Notes |
|---|---|---|---|---|
| `arrived_at` | datetime |  |  |  |
| `checked_in_by` | string(150) |  |  |  |
| `customer_id` | reference → Customers | yes |  | cascade delete |
| `driver_id_number` | string(60) |  |  |  |
| `driver_name` | string(100) |  |  |  |
| `driver_phone` | string(40) |  |  |  |
| `outbound_reference` | string(30) |  | yes |  |
| `reference_number` | string(100) |  |  |  |
| `requested_date` | date |  |  |  |
| `status` | string(30) | yes |  | default `Submitted` |
| `trailer_plate` | string(30) |  |  |  |
| `transporter_id` | reference → Transporters |  |  | set null on delete |
| `vehicle_plate` | string(30) |  |  |  |
| `warehouse_id` | reference → Warehouses |  |  | set null on delete |

#### `PackageTypes`

| Field | Type | Required | Unique | Notes |
|---|---|---|---|---|
| `capacity_unit` | string(50) |  |  |  |
| `compatible_location_types` | string(255) |  |  |  |
| `name` | string(100) | yes | yes |  |
| `standard_height_cm` | decimal(4 places) |  |  |  |
| `standard_length_cm` | decimal(4 places) |  |  |  |
| `standard_weight_kg` | decimal(4 places) |  |  |  |
| `standard_width_cm` | decimal(4 places) |  |  |  |
| `status` | string(30) | yes |  | default `Active` |
| `units_per_item` | decimal(4 places) |  |  | default `1.0000` |

#### `PickTask`

| Field | Type | Required | Unique | Notes |
|---|---|---|---|---|
| `assigned_to` | string(100) |  |  |  |
| `cargo_id` | reference → Cargo | yes |  | cascade delete |
| `outbound_request_id` | reference → OutboundRequest | yes |  | cascade delete |
| `status` | string(30) | yes |  | default `Assigned` |

#### `Racks`

| Field | Type | Required | Unique | Notes |
|---|---|---|---|---|
| `aisle_id` | reference → Aisles |  |  | cascade delete |
| `code` | string(100) | yes |  |  |

#### `RolePermissions`

| Field | Type | Required | Unique | Notes |
|---|---|---|---|---|
| `function_name` | string(100) |  |  |  |
| `module` | string(100) | yes |  |  |
| `role` | string(100) | yes |  |  |
| `warehouse_id` | reference → Warehouses |  |  | cascade delete |

#### `ScanHistory`

| Field | Type | Required | Unique | Notes |
|---|---|---|---|---|
| `cargo_id` | reference → Cargo | yes |  | cascade delete |
| `scan_context` | string(30) | yes |  |  |
| `scan_timestamp` | datetime |  |  |  |
| `scanned_by` | string(100) |  |  |  |

#### `StorageLocations`

| Field | Type | Required | Unique | Notes |
|---|---|---|---|---|
| `bay` | integer |  |  |  |
| `capacity` | integer |  |  |  |
| `capacity_unit` | string(50) |  |  | default `Pallet Positions` |
| `height_cm` | decimal(4 places) |  |  |  |
| `length_cm` | decimal(4 places) |  |  |  |
| `location_code` | string(100) | yes | yes |  |
| `location_type` | string(100) |  |  |  |
| `max_weight_kg` | decimal(4 places) |  |  |  |
| `occupancy_status` | string(30) | yes |  | default `Empty` |
| `rack_id` | reference → Racks | yes |  | cascade delete |
| `rack_level` | integer |  |  |  |
| `width_cm` | decimal(4 places) |  |  |  |

#### `Suppliers`

| Field | Type | Required | Unique | Notes |
|---|---|---|---|---|
| `address` | text |  |  |  |
| `email` | string(200) |  |  |  |
| `name` | string(200) | yes | yes |  |
| `phone` | string(50) |  |  |  |
| `status` | string(30) | yes |  | default `Active` |

#### `Tasks`

| Field | Type | Required | Unique | Notes |
|---|---|---|---|---|
| `assigned_to` | string(100) |  |  |  |
| `due_date` | datetime |  |  |  |
| `module_ref` | string(100) |  |  |  |
| `record_ref_id` | string(100) |  |  |  |
| `status` | string(30) | yes |  | default `Assigned` |
| `task_priority` | string(30) |  |  |  |
| `task_type` | string(100) | yes |  |  |
| `warehouse_id` | reference → Warehouses |  |  | set null on delete |

#### `Transporters`

| Field | Type | Required | Unique | Notes |
|---|---|---|---|---|
| `contact_person` | string(150) |  |  |  |
| `name` | string(200) | yes | yes |  |
| `phone` | string(40) |  |  |  |
| `status` | string(30) | yes |  | default `Active` |
| `vehicle_registration` | string(40) |  |  |  |

#### `UserWarehouseRole`

| Field | Type | Required | Unique | Notes |
|---|---|---|---|---|
| `app_user_id` | reference → AppUsers | yes |  | cascade delete |
| `business_role` | string(50) | yes |  |  |
| `warehouse_id` | reference → Warehouses | yes |  | cascade delete |

#### `VALRequest`

| Field | Type | Required | Unique | Notes |
|---|---|---|---|---|
| `cargo_id` | reference → Cargo | yes |  | cascade delete |
| `customer_id` | reference → Customers | yes |  | cascade delete |
| `requested_date` | date |  |  |  |
| `service_type` | string(30) | yes |  |  |
| `status` | string(30) | yes |  | default `Requested` |

#### `VALTask`

| Field | Type | Required | Unique | Notes |
|---|---|---|---|---|
| `assigned_to` | string(100) |  |  |  |
| `completion_notes` | text |  |  |  |
| `status` | string(30) | yes |  | default `Assigned` |
| `val_request_id` | reference → VALRequest | yes |  | cascade delete |

#### `Warehouses`

| Field | Type | Required | Unique | Notes |
|---|---|---|---|---|
| `address` | text |  |  |  |
| `name` | string(200) | yes | yes |  |
| `status` | string(30) | yes |  | default `Active` |
| `timezone` | string(50) |  |  |  |

#### `Zones`

| Field | Type | Required | Unique | Notes |
|---|---|---|---|---|
| `name` | string(200) | yes |  |  |
| `warehouse_id` | reference → Warehouses | yes |  | cascade delete |
| `zone_type` | string(100) |  |  |  |


### 9.7 Proposed entities (billing, integration and planned operational features)
All of these are **specified, not built**. Field lists are the minimum a rebuild needs. `ref → X` is a reference to entity X.

#### Billing configuration
**`RateCard`** — a priced agreement.
| Field | Type | Notes |
|---|---|---|
| name* | string(120) | e.g. "Standard 2026", "ACME contract" |
| customer | ref → Customers | empty = default card for all customers |
| warehouse | ref → Warehouses | empty = all warehouses |
| currency* | string(3) | ISO code; must match the accounting-system currency for the customer |
| effective_from*, effective_to | date | the card applies to usage whose date is in range; cards must not overlap for the same customer + warehouse |
| status* | string | Draft, Active, Retired |
| notes | text | |

**`RateCardLine`** — one priced rule on a card.
| Field | Type | Notes |
|---|---|---|
| rate_card* | ref → RateCard | cascade delete |
| charge_type* | string | `STORAGE`, `DOCK_STORAGE`, `RECEIVING`, `HU_LABEL`, `PUTAWAY`, `PICK`, `DISPATCH`, `RELOCATION`, `VAL_<service>`, `SURCHARGE_ADR`, `SURCHARGE_COLD`, `SURCHARGE_OVERSIZE`, `FIXED_FEE`, `MINIMUM_CHARGE` |
| basis* | string | `PER_UNIT_DAY`, `PER_HU_DAY`, `PER_M3_DAY`, `PER_M2_DAY`, `PER_KG_DAY`, `PER_EVENT`, `PER_HU`, `PER_HOUR`, `FLAT_PERIOD` |
| unit_price* | decimal(4) | in the card's currency |
| capacity_unit, package_type, zone_type or zone | string / refs | restrict the rule (for example storage in Cold zones only) |
| service_type | string | for VAL lines |
| condition | string | structured predicate, e.g. `adr = Yes`, `weight_kg > 1000` |
| free_days, min_days | integer | per HU (or per inbound) |
| min_charge | decimal(2) | minimum per event/period |
| zoho_item | string | optional override of the item mapping (§13.6) |
| priority | integer | when several lines match, the most specific / lowest number wins |

**`BillingSettings`** (one row) — day cut-off time (default 23:59 warehouse local), day rule (*end-of-day snapshot* / *any presence* / *24-hour blocks*), dock free hours, billing period (monthly/weekly), invoice grouping, default payment terms (days), rounding mode, approval required (yes/no) and amount threshold, default invoice mode (*draft* or *send*), time zone.

#### Usage and charges
**`OccupancyDay`** — the storage billing basis, **one row per HU per day**.
| Field | Type | Notes |
|---|---|---|
| date* | date | the warehouse-local calendar day |
| warehouse*, customer*, cargo* (HU), inbound_advice | refs | |
| location, zone | refs | where it was at the snapshot (drives zone-based rates) |
| hu_status | string | Stored, Retrieved, Picked, Received (dock) |
| capacity_unit, units | string, decimal | `units per item` × quantity, same maths as the capacity engine |
| weight_kg, volume_m3 | decimal | from the HU |
| day_number | integer | day count since put-away (for free days / minimums) |
| billable, free_reason | boolean, string | false for free days, disputed, waived |
| invoice_line | ref → InvoiceLine | set when locked |
Unique on (`date`, `cargo`). Created by a **scheduled snapshot job** after the cut-off; never edited once invoiced.

**`ChargeEvent`** — handling, VAL and fixed charges at the moment they happen.
| Field | Type | Notes |
|---|---|---|
| occurred_at*, warehouse*, customer* | datetime, refs | |
| charge_type*, quantity*, source_module*, source_record* | string, decimal, string, string | e.g. `RECEIVING`, 8 HUs, "Inbound Operations", inbound id |
| unit_price, amount | decimal | priced at invoicing from the effective rate card (or snapshotted) |
| status* | string | Open, Disputed, Waived, Invoiced |
| dispute_reason | text | |
| invoice_line | ref → InvoiceLine | |

#### Invoicing
**`InvoiceRun`** — period, scope (customers, warehouses), status (Draft, In review, Approved, Pushed, Partially failed), created by/at.
**`InvoiceProposal`** — per customer per run: customer, warehouse, currency, subtotal, status (Draft, Approved, Pushed, Failed, Void), `approved_by/at`, `statement_file` (usage statement document), and the **accounting link**: `zoho_invoice_id`, `zoho_invoice_number`, `zoho_status` (draft, sent, viewed, unpaid, overdue, partially_paid, paid, void), `zoho_url`, `pushed_at`, `error_message`.
**`InvoiceLine`** — proposal, charge_type, description, quantity, unit, unit_price, amount, `zoho_item_id`, `tax_code`, source (occupancy / event / adjustment), period from/to, link to the detail rows.

#### Accounting integration
**`ZohoBooksConnection`** (one row; secrets never exposed to the browser) — data center, organisation id, OAuth client id, **encrypted** refresh token and client secret held server-side, granted scopes, status (Connected / Needs re-authorisation / Error), connected_by/at, last_sync_at, default tax, default payment terms, invoice mode, webhook secret.
**`ZohoCustomerMap`** — customer ↔ Zoho Books contact id, sync status, last synced.
**`ZohoItemMap`** — charge type (optionally zone/service) ↔ Zoho Books item id, tax id, name snapshot.
**`IntegrationLog`** — every outbound/inbound call: timestamp, direction, entity, record id, idempotency key, HTTP status, Zoho error code, message, retry count, status.

#### Planned operational additions
- **`Receipt`** (multi-receipt, BR-23): inbound, receipt number, arrival date/time, plate, driver, counted pieces, condition/exception notes, signature, GRN reference. `InboundLine.received_qty` becomes the sum of receipts.
- **`StorageLocations.qr_code`**: permanent location label payload `WOMS-LOC-<id>`.
- **`VerificationPolicy`** (§3.5): warehouse, activity type, required, verifier role, verifier must differ from performer; plus `verified_by`/`verified_at` on verifiable records.
- **`Notification`** (in-app): user, event type, title, body, record link, created, read_at, channel, delivery status; **`PushSubscription`** (§11.5).
- **`Setting`** (key/value): numbering sequences, label templates, notification toggles, customer-facing texts.
- **`CountSession` / `CountLine`**: cycle-count sessions per location with expected vs counted and resolution.

## 10. User interfaces

Conventions: **Current** = behaviour of the reference build; **Required** = what a rebuild must provide. Where the two differ the text says so. Mobile variants are specified in §11.

### 10.1 Design principles and shared components

**Layout.** Desktop: a fixed left navigation (grouped: Dashboard; Masters; Operations; Insights; Administration), a content area (max ≈ 1,180 px) and, on record pages, a 300 px right sidebar. Footer of the navigation: working-warehouse switcher, user chip (avatar initial, email, access summary), Sign out. Narrow screens: top bar with menu button; bottom tab bar (Dashboard, Inbounds, Storage, Outbounds, More).

**Record pages** (inbound, outbound, customer, HU). Header = reference (large) + one **primary action** (the contextual next step) and secondary actions; below it read-only blocks; right sidebar = status, summary, quick actions. Data entry happens in **stage popups** (wide modal) that autosave field by field and close with *Done*; the page never mixes viewing with editing.

**Lists.** Every list screen must provide:
| Capability | Requirement |
|---|---|
| **Sorting** | Click a column header to sort ascending, again for descending (arrow shown); sorting numeric/date columns correctly; a default sort stated per screen. *Current: only Customers, Transporters, Inbounds and Outbounds are sortable.* |
| **Filtering** | Quick filters as chips/dropdowns above the table; a count line ("n of N, date range"); **Clear filters**; filters survive navigation to a record and back (kept in the URL). |
| **Search** | One search box matching the key identifiers shown in the table. |
| **Paging** | Server-side paging and sorting beyond 200 rows (page size 25/50/100). *Current: loads up to 200 rows per table.* |
| **Columns** | Row click opens the record; an explicit "Open" action for keyboard users; column visibility configurable *(planned)*. |
| **Export** | CSV/Excel of the filtered result *(planned, F-R5)*. |
| **States** | Loading skeleton, empty state with next-step hint ("No inbounds match the current filters"), error banner with retry. |
| **Bulk actions** | Checkbox column where bulk actions exist (Storage, Deliveries, Customers). |

**Status badges.** Rounded badge with a leading dot; colour by meaning — grey *Requested/Open*, amber *Partial*, blue *Received/Picked/Confirmed*, teal *Stored/Delivered*, violet *Sent/Dispatched*, green *Ready/Completed*, red *Rejected/Error*.

**Forms.** Required fields marked *; dates use a native date picker; numbers numeric keyboards on mobile; autosave on blur for record popups; inline validation messages next to the field; destructive actions ask for confirmation naming the consequence.

**Accessibility.** Keyboard operable, visible focus, labels bound to inputs, colour never the only signal (badges carry text), minimum 4.5:1 contrast for text, touch targets ≥ 44 px on mobile.

**Localisation.** English first; dates shown in the user's locale; numbers with locale separators; weights kg, dimensions cm, volume m³; currency per customer (billing).

### 10.2 Dashboard (`/`)
- **Greeting** with first name and role line.
- **Cards** (each opens its module; shown only if the user can open it): Warehouse Occupancy (% of locations in use, "x of y"), Today's Inbound, Today's Outbound, Cargo In Warehouse, Pending Tasks, Pending VAL, Customers. Counts are warehouse-scoped except Customers and VAL.
- **Required additions:** stage tiles for inbound (New, Unloading, In process, Action required, Waiting review) and outbound (Picking, Packing, Ready to ship); Employee workload; Operational KPIs; "Awaiting your decision" (requests to accept, GRNs to verify, invoices to approve); notification bell with unread count.
- No sorting or filtering; the warehouse selector drives the figures.

### 10.3 Customers list (`/customers`)
- **Columns:** Name, Email, Phone, Status (all sortable; default Name ascending). Checkbox column.
- **Filters (required):** search (name, email), status.
- **Actions:** **+ Add Customer** (inline form: name*, email, phone, address, status), bulk **Delete Selected** (confirm), row click → detail; per-row Delete. After creating, open the new customer's detail so contacts can be added.

### 10.4 Customer detail (`/customers/:id`)
- **Info card** (name, email, phone, address, status) with **Edit**.
- **Contacts panel:** table with salutation + first/last name, email, phone, **Primary** badge; add, inline edit, **Set primary** (exclusive), delete.
- **Activity (read-only, warehouse-scoped):** Inbound advices (reference, ETA, status), Outbound requests (pickup ref, date, status), Cargo (description, qty/unit, status); each row links to its record.
- **Required additions:** operating instructions; **Billing profile** (billing contact, payment terms, rate card, Zoho Books link/status, last invoice); storage in use and space-days this month; statements and invoices tab.

### 10.5 Transporters (`/transporters`)
- **Columns:** Name, Contact, Phone, Vehicle reg., Status (all sortable). **Actions:** + Add, inline Edit/Delete. **Filters:** search, status.

### 10.6 Warehouse Management (`/warehouse`)
Tabs (administrators; others see **Availability** only). Each tab has the warehouse/zone/aisle/rack drill-down selectors it needs.

| Tab | Columns | Create / edit |
|---|---|---|
| **Warehouses** | Name, Address, Status | name*, address; inline edit |
| **Zones** | Name, Type | warehouse*, name*, type (free text) |
| **Aisles** | Name | warehouse*, zone*, name* |
| **Racks** | Code | warehouse*, zone*, aisle*, code* |
| **Storage Locations** | Location code, Bay, Level, Type, Capacity (+unit), Dimensions L×W×H cm, Max weight (kg), status (Available/Reserved/Blocked) | rack*, code*, type, capacity, unit (Pallet Positions, Cartons, Crates, m², m³, Other), max weight, L/W/H, bay, level; bay/level/status editable in place; sorted by bay then level |
| **Package Types** | Name, capacity unit, units per item | name*, unit*, units per item* |
| **Map** | Tree zone → aisle → rack → location, each location shown occupied/empty | read-only |
| **Availability** | Table per capacity unit: Total, Occupied, Committed (est.), Available, Unclaimed, Expected release (est.); plus Weight and Space rows | *View*: Today or **Date range** (From date, Days 1–60); *Warehouse*: consolidated or one; date-range view lists a row per day |

**Required additions:** bulk generate locations for a rack (bays × levels with a code pattern); import locations; location QR label sheet; location type picklist.

### 10.7 Inbound list (`/inbound`)
- **Header:** "Inbound Operations" + **+ New Inbound** (approvers; needs a working warehouse).
- **Columns:** Reference, Customer, Destination, Expected date, Transporter, **Stage** (workflow status), **Fulfillment Status** (derived) — all sortable. Default sort: newest first.
- **Filters:** **Arriving** chips — Today, Tomorrow, Next 7 days, All dates (default), Pick dates (from/to); **Customer**; **Status** (fulfillment); Clear filters; count line "n of N inbounds · date range". **Required additions:** search (reference, customer ref, CMR, plate), Stage filter, warehouse filter, "needs my action" quick filter.
- **Row click** opens the record.

### 10.8 Outbound list (`/outbound`)
- **Header:** "Outbound Operations" + **+ New Outbound Request**.
- **Columns:** Pickup ref, Customer ref, Customer, Transporter, Requested date, Fulfillment Status — all sortable.
- **Filters:** **Pickups** chips — Today (default), Tomorrow, Next 7 days, All dates, Pick dates; **search** (pickup ref, customer ref, customer, id — ignores the date chips); **Scan pass** (camera; reads `WOMS-OB-<id>`); Customer; Status; count line.

### 10.9 Inbound record (`/inbound/:id`)
- **Header:** reference + subtitle "Inbound record"; **primary action** (§7.1.1 table), **Edit Request** when allowed; "← Back to Inbound Operations".
- **Read-only blocks** (grid): Customer (+ reference), Supplier, Destination, Transport information (type, carrier, CMR, ETA), Warehouse & Storage (warehouse, storage period, goods standard/ADR), Receiving (unloading date/time, plate, driver, pieces counted), Goods Receipt Note (number, status, verified by, view link), **Linked Outbounds** (reference, "n of N HUs", open/dispatched).
- **Summary strip:** expected colli, received pieces, total packages, total weight, total volume m³.
- **Line items table:** #, unit, description, requested qty, received qty, weight/pkg, L×W×H.
- **Handling Units table:** HU label, type, contents (lines × qty), weight, size, QR thumbnail, location code/path, outbound link(s).
- **Documents** (thumbnails/links, lazy), **Tasks** (add/advance), **Audit trail** (last 50, lazy).
- **Sidebar:** Status card (stage badge, inbound number, created on); Inbound Summary (expected colli, received, packages, weight, volume, HUs, pallets, items); Quick actions (Reprint Labels from *HU Created* onwards; Save as Draft; Cancel — both only navigate back because everything autosaves).

### 10.10 Inbound stage popups (wide modals)
| Popup | Content | Primary button |
|---|---|---|
| **Request** | Sections: Shipment details, Customer & reference, Supplier & transport, Arrival & remarks, Expected storage period, Line items editor (add/delete, totals, remarks, ADR) | Done |
| **Availability Check** | Customer/ETA/supplier summary; warehouse selector; availability table (day rows × units/weight/space, red where short); warehouse comparison; reject reason box | Accept / Reject |
| **Receive** | Unloading date/time, counted pieces, plate, driver; received quantity per line; driver signature pad; CMR upload; extra photos | Mark as Received (disabled until complete) |
| **Create Handling Units** | Lines table (received / on HUs / left to pack / put on new HU); new-HU form (type, weight, L/W/H, identical copies); HU table with delete; Print Labels | Continue to Put-away |
| **Put-away** | Availability snapshot; HU table with suggested location selector, "no suitable location" warning | Store N of M |
| **Complete Inbound (Check)** | Review of all blocks; line table; tasks; audit | Complete Inbound |
| **Finish** | GRN card (generate/verify), email recipient, attachments note, remarks | Complete Inbound + New / + Return to Dashboard |

### 10.11 Outbound record (`/outbound/:id`)
Header with pickup reference; secondary buttons *Edit Goods / Pick Goods / Driver Check-in*; primary per §7.5.2. Blocks: Customer, Pickup (date, carrier, collect-from), Driver check-in, Dispatch, **Linked Inbounds**. Goods table (HU, cargo, from inbound (link), location, qty, QR, pick status, HU status), Documents, Tasks, Audit. Sidebar: fulfillment badge; pickup number/date/created; summary (HUs, picked, sent, delivered "x of N"); Quick actions: Print Pickup Pass, Print Dispatch Note, Back to list.

### 10.12 Outbound stage popups
**Select Goods** (picker of available HUs with description, HU no., type, qty, inbound reference, location; list of selected with Remove); **Pick Goods** (walking-order table: fetch-from location/path, cargo, qty, QR, pick status, Scan & Pick; Scan to Pick camera; progress); **Driver Check-in** (driver name*, ID, phone, vehicle plate*, trailer plate); **Dispatch** (documents, photos, driver signature, vehicle details, Confirm Dispatch; warnings if lines unpicked or no check-in); **Mark Delivered** (confirmation).

### 10.13 Storage (`/storage`)
- **Tabs:** In Storage, Awaiting Put-away, Retrieved; summary strip with counts; **Scan QR**.
- **Columns:** (checkbox), Customer, Goods (+ package no.), Qty / Weight, Inbound (+ destination), Location (In Storage tab: code + path), Status, actions (*Relocate*, *Retrieve* or *Put away*/*Put back*).
- **Filters:** search (goods, customer, reference, QR, location), **Customer**, **Location** (In Storage tab), **Group by** none / customer / location (group headers show counts).
- **Sorting (required):** by customer, goods, location, status, age (days in place). *Current: grouped, not column-sortable.*
- **Bulk:** select several → put away/relocate to one chosen location (picker prefilled with the allocation suggestion); outcome message reports successes and the first error.

### 10.14 Deliveries (`/delivery`)
Tabs **In Transit** / **Delivered** with counts. **Columns:** (checkbox), Customer, Goods, Qty / Weight, Order, Vehicle, Dispatched (date/by), Status. **Filters:** search (goods, customer, order, vehicle, QR), Customer, Dispatched from / to, **Group by** none / customer / order. **Bulk:** Mark delivered (In Transit tab). Required: column sorting; delivered date column.

### 10.15 Value-added logistics (`/val`)
**Columns:** Customer, Cargo, Service, Status, next-action button (*Assign → Start → Complete*). **Create:** customer*, cargo* (that customer's HUs), service type*, requested date. **Required:** filters (status, service, customer, assignee), sorting, link to the HU, notes/photos on completion, verification step, billing event.

### 10.16 Tasks (`/tasks`)
Tabs **Open / All**. **Columns:** Task, Assigned to, Priority, Due date, Status, action (*Start/Complete*). **Create:** task type*, assigned to (email), priority, due date. **Required:** filters (assignee, priority, due), sorting by due date/priority, warehouse assignment, "My tasks" for operators, overdue highlighting, reminder notifications.

### 10.17 Reports (`/reports`) and HU timeline (`/cargo/:id`)
Tabs **Cargo Register** (Customer, Description, Qty, Status, Location, QR; row → timeline) and **Dispatch Report** (Outbound request, Customer, Vehicle, Dispatched by, Dispatch date, Status). **Required:** date and customer filters, sorting and export on every report; the seven further reports (§14.3). The **HU timeline** shows the HU's data and a chronological table of scans and movements (when, event, who, from/to location).

### 10.18 Billing & Invoicing (`/billing`) *(planned)*
| Screen | Purpose | Columns / content | Filters / sorting |
|---|---|---|---|
| **Rate cards** | Maintain prices | List: name, customer, warehouse, currency, effective from/to, status. Detail: lines table (charge type, basis, unit, price, restrictions, free days, minimums); clone card; overlap warning | filter by customer, status, date; sort by name/effective date |
| **Occupancy (usage explorer)** | See what will be billed | Rows per HU-day or grouped by HU/customer/zone: date, customer, HU, location/zone, unit, units, weight, volume, billable/free | filters: period, customer, warehouse, zone, capacity unit, billable; sort any column; export |
| **Charge events** | Handling/VAL/fees | occurred_at, customer, charge type, quantity, source (link), amount, status | filters: period, customer, type, status (Open/Disputed/Waived/Invoiced); actions: dispute, waive, add manual charge |
| **Invoice runs** | Period processing | run list: period, scope, status, totals, created by | filter by status/period |
| **Run detail / proposals** | Review and approve | one row per customer: lines by charge type, subtotal, variance vs last period, unbilled occupancy flag; drill-down to HU-day/events; add adjustment; dispute; **Approve**; **Push to Zoho Books** | sort by customer/amount/variance |
| **Invoices** | Track what was issued | proposal, Zoho invoice number/link, status (draft, sent, viewed, unpaid, overdue, partially_paid, paid, void), amount, due date, last sync | filters: status, customer, overdue; sort by due date/amount |
| **Statements** | Customer-readable usage | per customer and period: storage by inbound/HU with start/end and units, handling events, services | download PDF/CSV; email to customer |

### 10.19 Users (`/admin`)
Users table (email, access summary, status, Manage access); Invite User form; per-user access editor (role per warehouse, add/remove warehouse); permission matrix; module audit trail. Required: filters (role, warehouse, status), deactivate/reactivate, resend invitation, last sign-in.

### 10.20 Settings (`/settings`) *(currently a static info card)*
Sections (administrators): **Organisation** (name, logo, address, time zone, default language), **Numbering** (prefixes and per-year sequences for inbound, outbound, GRN), **Labels and documents** (label size/template, printed-document header/footer), **Notifications** (event toggles, sender address, templates, recipients), **Warehouses** (link), **Billing & Invoicing** (billing settings; **Zoho Books integration**, §13.6), **Security** (session timeout, password rules).

### 10.21 Printed documents
Inbound Receiving Advice / GRN, Handling Unit Labels, Dispatch Note, Pickup Pass (§14.1). Required: A4 and label (e.g., 100×150 mm) templates, print preview, "download PDF", company header from Settings.

### 10.22 Notification centre *(planned)*
Bell with unread count in the header; panel listing events (title, record link, time), mark read/all read, filter by type; mirrors email events (§12).

### 10.23 Navigation map and routes
Sidebar groups (entries hidden if the role lacks the module): **Dashboard**; **Masters** (Customers, Warehouses, Transporters); **Operations** (Inbounds, Storage, Outbounds, Deliveries, VAL, Tasks); **Insights** (Reports); **Administration** (Users, Settings). Footer: working-warehouse switcher (if more than one), user chip (email, access summary), Sign out. On narrow screens: top bar with menu, bottom bar (Dashboard, Inbounds, Storage, Outbounds, More).

| Route | Screen | Module |
|---|---|---|
| `/` | Dashboard | any role |
| `/customers`, `/customers/:id` | Customer list, detail + contacts + activity | Customer Management |
| `/warehouse` | Warehouse Management (8 tabs; non-admins: Availability only) | Warehouse Management |
| `/transporters` | Transporters | Warehouse Management |
| `/inbound`, `/inbound/:id` | Inbound list, Inbound record + stage popups | Inbound Operations |
| `/storage` | Storage (put-away/relocate/retrieve) | Cargo & Storage |
| `/outbound`, `/outbound/:id` | Outbound list, Outbound record + stage popups | Outbound Operations |
| `/delivery` | Deliveries | Outbound Operations |
| `/tasks` | Tasks | Operational Task Mgmt |
| `/val` | VAL | Value Added Logistics |
| `/reports`, `/cargo/:id` | Reports, HU lifecycle timeline | Reports / Cargo & Storage |
| `/admin` | Users and permission matrix | System Administration |
| `/settings` | Settings (static system info card) | System Administration |
| `/print/inbound/:id`, `/print/grn/:id`, `/print/putaway/:id` | Inbound summary / GRN / HU labels | Inbound Operations |
| `/print/outbound/:id`, `/print/pickup/:id` | Dispatch Note / Pickup Pass | Outbound Operations |

**Inbound list:** columns Reference, Customer, Destination, Expected date, Transporter, Stage, Fulfillment Status; filter chips **Arriving: Today / Tomorrow / Next 7 days / All dates (default) / Pick dates**; Customer and Status (fulfillment) filters; Clear filters; count line ("n of N inbounds · date range"); sortable columns; row opens the record.


## 11. Mobile application (Progressive Web App)

**Status: planned.** The reference build is a responsive website; it has no install, offline, push or handheld-specific screens. This section specifies the mobile product.

### 11.1 Goals and principles
- **One codebase, two experiences:** the same web application, with a mobile-first set of **floor workflows** delivered as an installable **PWA**, so there is no app-store release cycle and updates reach every device on next launch.
- **Scan-first, type-last.** Everything that can be scanned, picked from a list, or defaulted is not typed. Large touch targets, one primary action per screen, numeric steppers instead of keyboards.
- **Works on a warehouse network.** Poor Wi-Fi, dead spots, and dock doors are normal: work is **queued locally and synchronised**; the user is never blocked by a spinner.
- **Evidence by default.** Photos, document scans and signatures are first-class steps, not attachments afterwards.
- **Same rules as desktop.** The mobile client calls the same server API; no business rule is weaker on a phone.
- **Role-aware.** Operators see only floor tasks; supervisors additionally see approvals and exceptions; the navigation adapts.

### 11.2 Technical requirements
| Area | Requirement |
|---|---|
| **Installability** | Web app manifest (name, short name, icons 192/512 + maskable, `display: standalone`, theme/background colour, start URL = mobile dashboard, orientation any); served over HTTPS; passes the browser installability checks; in-app "Install" prompt. |
| **Service worker** | Precache the application shell and static assets (versioned, hashed); runtime caching for reference data (§11.3); **never cache authenticated API responses beyond their stated lifetime**; update flow: new version downloads in the background, the user is offered "Update ready — reload" at a safe moment (never mid-scan). |
| **Offline** | Offline-capable operations and their rules are in §11.3; an **outbox** (IndexedDB) stores pending actions with idempotency keys; a visible **sync indicator** (online / syncing n / offline / n failed). |
| **Background sync** | Use background sync where supported; always also sync on app start, on regaining connectivity and on a manual "Sync now". |
| **Camera and scanning** | Camera access for QR/barcode scanning (native `BarcodeDetector` where available, otherwise a JavaScript decoder) with torch toggle, focus/zoom, beep + vibration + colour flash on success/failure; photo capture with client-side compression (target ≤ 1 MB, long edge ≤ 2,000 px, EXIF orientation applied); **document scan to PDF** (edge detection and de-skew; multi-page). |
| **Hardware scanners** | Support **keyboard-wedge handheld scanners** (rugged devices with built-in imagers and Bluetooth ring/gun scanners): a persistent hidden scan field keeps focus, accepts the scanner's suffix (Enter/Tab), recognises the `WOMS-CARGO-`, `WOMS-LOC-` and `WOMS-OB-` payloads and routes them by screen context. |
| **Printing** | Label printing to a network or Bluetooth label printer (vendor print service or the platform share sheet) with the label template from Settings; fallback: generate a PDF and hand it to the OS print/share dialog. |
| **Push** | Web Push (VAPID) for task assignments, approvals waiting, exceptions and dispatch-ready; per-user and per-event opt-in; deep links open the right record; email remains the fallback. iOS requires the app to be installed to the home screen and the user to grant permission. |
| **Location (optional)** | Optional geolocation stamp on receiving and dispatch events if the operator enables it; never required. |
| **Performance budget** | First meaningful screen < 3 s on mid-range Android over 4G; interactive after repeat visits < 1 s; list screens render ≤ 100 rows without jank; scan-to-feedback < 300 ms; JavaScript for the mobile shell ≤ 250 kB gzip (lazy-load the camera and PDF modules). |
| **Browser/device support** | Current Chrome/Edge on Android 10+; Safari on iOS/iPadOS 16.4+ (for push); rugged handhelds with Chromium; screen widths 320–820 px portrait and landscape. |
| **Security** | Sign-in once, long-lived session on registered devices (idle lock after N minutes with PIN/biometric via the platform where available); tokens in secure storage, never in the URL; remote **session revoke** and device list for admins; outbox contents encrypted at rest where the platform allows; no secrets or integration keys on the device; all uploads over TLS. |
| **Accessibility and ergonomics** | One-handed use (primary actions in the bottom 40% of the screen), text ≥ 16 px (prevents input zoom), high-contrast and "sunlight" theme, large-glove mode (bigger targets), haptics. |
| **Telemetry** | Anonymous usage and error reporting (scan failures, sync failures, queue length) to support the pilot; no personal data in logs. |

### 11.3 Offline and synchronisation model
**Cached for offline use** (refreshed on start and every 15 minutes while online; shown with an "as of" time): the user's warehouses, locations (code, path, type, customer dedication), package types, customers (names), today's and tomorrow's accepted inbounds with their lines, outbound requests due in the next 7 days with their pick lines and locations, the user's tasks, and the HUs in the user's current working lists.

**Operations and offline behaviour**
| Operation | Offline? | Rule |
|---|---|---|
| View lists, HUs, locations, inbounds, pick lists | Yes (cached) | Banner "Offline — data as of 09:41" |
| Receive goods (quantities, counts, plate, driver) | **Yes** | Queued; the inbound shows *Received (pending sync)* |
| Photos, document scans, signatures | **Yes** | Stored locally, uploaded in the background with retry/resume; thumbnails shown immediately |
| Create HUs and print labels | Yes | HU ids/QR payloads are reserved in blocks from the server before going offline, so labels can be printed offline; if reservation is exhausted the app asks to go online |
| Put-away, relocation, retrieval, pick scans | **Yes** | Scans queued in order with the device timestamp and the location; the server applies them in order and validates |
| Driver check-in | Yes | Queued |
| Confirm dispatch, mark delivered | **Online only** | They release goods and trigger customer emails and billing events |
| Accept/reject a request, verify GRN, approve invoices | **Online only** | Approvals need current data |
| Create inbound/outbound requests | Yes (draft) | Drafts sync later; submission needs the server |
| Sign-in, user administration, billing, settings | Online only | |

**Synchronisation rules**
- Every queued action carries a **client-generated idempotency key**, the device id, the user and the device timestamp; the server never applies one twice.
- Actions sync **in the order they were made**. A failure stops the dependent actions for that record, shows a clear message, and offers *Retry*, *Edit* or *Discard*.
- **Conflicts** (for example the HU was moved by someone else meanwhile): the server applies the rule "the latest *confirmed physical scan* wins" for locations, rejects impossible transitions (for example putting away an HU already dispatched) and returns a readable reason; the user resolves it from the *Sync issues* list.
- The **device timestamp** is stored with every scan (and the server receipt time too) so storage-day billing (§1.7) uses the real time of the event even when sync is late.
- The outbox survives app restarts and device reboots; its size is shown; a hard limit (for example 500 photos) blocks new captures with a message.

### 11.4 Mobile workflows
Screens are described as they appear on a phone in portrait. Header pattern: back arrow, title, subtitle "Step n of N – name", *Save as draft*, help; sticky bottom bar with **Back** and the primary button; step indicator (numbered circles; completed steps show a tick).

#### M-1 Sign-in and mobile dashboard
1. Sign in (email + password or one-time code); on a registered device the session persists.
2. **Warehouse dashboard** for the working warehouse (switcher in the menu): header shows warehouse name/address and a bell with unread count.
3. **Tiles** (tap opens the filtered list): *Inbound* — New, Unloading, In process, Action required, Waiting review; *Outbound* — Picking, Packing, Ready to ship; *Tasks* — open tasks; *VAL* — open activities.
4. **Bottom tabs:** Dashboard, Inbound, Outbound, VAL, Tasks. A floating **Scan** button (centre) opens the universal scanner: scanning an HU opens the HU card (where it is, status, actions); a location QR shows its contents; a Pickup Pass opens the outbound.

#### M-2 Receive an inbound (5 steps)
| Step | Screen content | Rules |
|---|---|---|
| **1. Arrival details** | Inbound reference (read-only), customer, expected colli, ETA; confirm/edit unloading date and time (default now), carrier/plate (scan or type), driver name, counted pieces | Required: plate, driver, counted pieces. *Save as draft* keeps progress. |
| **2. Cargo details** | Cargo lines as cards: description, unit type, expected qty with **− / +** stepper for received qty, optional weight/dimension correction; running totals (received pieces, weight, volume); ADR toggle | Differences from expected highlighted; "received 0" requires a reason. |
| **3. Photos & documents** | Large buttons: **Take photo (cargo/general)** (multiple), **Scan document (to PDF)** (CMR, packing lists, certificates; multiple), **Take photo (damage)** (red, multiple), remarks (≤ 500 characters); "View all photos (n)" | CMR scan or photo is required; damage photos create an **exception** flag for the supervisor. |
| **4. Check** | Summary of arrival, quantities, differences, documents; warnings | The user confirms the figures. |
| **5. Finalize** | Driver signs on the screen; **Mark as Received**; success screen lists reference, date/time, status, "customer notified", labels to create; buttons *Create handling units*, *Return to dashboard*, *Create new inbound* | Works offline; status shows *pending sync* until uploaded. |

#### M-3 Create handling units and print labels
1. From the received inbound tap **Create handling units**. Lines show *received / packed / left*.
2. **One HU per package** (default for uniform lines) or **Custom HU**: choose type (picker with icons), tap the lines and quantities to include (combine/split), weight and dimensions prefilled, "identical copies" stepper.
3. Each creation shows the new HU label number (`IB-…-001`) and its QR.
4. **Print labels:** select all/new, choose the printer (remembered), print; reprint available any time. If no printer is connected the app produces a PDF to share/print later.
5. **Continue to put-away** appears when nothing is left to pack.

#### M-4 Put-away (scan-confirmed)
1. **Put-away queue:** the inbound's unplaced HUs (or "all awaiting put-away" for the warehouse) sorted by suggested zone/location; each row shows the suggested location and why (size, weight, customer).
2. **Scan the HU label.** The card shows description, customer, weight, suggested location and path (zone → aisle → rack → bay → level).
3. **Scan the location QR** physically at the rack. Match → green confirmation, HU moves to *Stored*; different location → prompt "Store here instead?" with the capacity/dedication check (a location dedicated to another customer is refused with the reason).
4. Continue to the next HU; progress "n of N stored"; when the last HU is stored the inbound moves to *Put Away*.
5. Offline: scans queue; capacity checks use cached data and are re-validated on sync.

#### M-5 Where is it? Relocate, retrieve, return
- **Find:** scan an HU or type/scan a customer/inbound reference → the HU list with location chips; tap to see the **timeline** (every scan and move).
- **Relocate:** scan HU → scan destination location QR → confirm.
- **Retrieve (take down):** scan HU → status *Retrieved* (still counted in the building); **Put back:** same as put-away.
- **Cycle count (planned):** choose a location or rack → scan the location QR → scan every HU found → the app shows *missing* and *unexpected* HUs → submit; discrepancies create tasks for the supervisor.

#### M-6 Pick an outbound
1. **Outbound list:** tabs *Today / Tomorrow / All*; badge per request (pickup reference, customer, carrier, time).
2. Open a request → **Pick list in walking order** (nearest location first); each line shows location code and path, HU, description, qty, a status chip.
3. **Scan the HU** at the rack: correct HU → line turns green and the HU leaves its location in the system; wrong HU → red with "this HU is not on this request"; HU in another location than recorded → warns and offers a correction.
4. A progress bar shows "n of N picked"; picked HUs can be staged to a *dock/staging* location by scanning it (optional).
5. When all lines are picked the primary button becomes **Gate check-in / Dispatch**.

#### M-7 Gate check-in and dispatch
1. **Scan the Pickup Pass QR** (or type the pickup reference) → the request opens.
2. **Check-in:** driver name*, ID number (scan the ID barcode if present), phone, vehicle plate* (camera OCR optional), trailer plate; arrival time stamped; photo of the vehicle/ID optional.
3. **Load and verify:** scan each HU as it is loaded (optional "verify load" mode); mismatches are flagged.
4. **Handover:** driver signs; supervisor taps **Confirm dispatch** (online); Dispatch Note is shown/printed/shared; customer is notified.
5. Delivery confirmation (when the carrier reports) is a supervisor action on the same record.

#### M-8 Tasks and value-added work
- **My tasks:** list sorted by due date and priority; overdue in red; push notification on assignment.
- **Task detail:** description, related record (tap to open), due date; **Start** → **Complete** with note and photos; **VAL task** shows service type, HUs (scan to confirm each), materials used (stepper), time spent; completion triggers verification if required and creates the billable event.

#### M-9 Exceptions
From any record tap **Report exception**: type (damage, shortage, wrong goods, labelling, temperature), HU/line, photos, note. It becomes a task for the supervisor, shows as *Action required* on the dashboard and can notify the customer.

#### M-10 Notifications and sync status
- **Bell/Notifications:** newest first, tap to deep-link; mark all read; per-event settings.
- **Sync status:** online/offline, last sync, queued actions with state (waiting, uploading, failed + reason), **Sync now**, **Sync issues** list (retry/edit/discard), storage used by the outbox.

### 11.5 Mobile notifications (push)
| Event | Recipients | Link |
|---|---|---|
| Task assigned / reminder / overdue | assignee | task |
| Inbound accepted for arrival today | operators of the warehouse | inbound receive |
| Exception reported | supervisors | exception task |
| GRN awaiting verification | approvers | inbound finish |
| Dispatch ready / driver checked in | supervisors | outbound |
| Request awaiting decision | approvers | availability check |

### 11.6 Acceptance criteria for the mobile product
- Installs to the home screen on Android and iOS; launches full-screen; passes automated PWA audits.
- A complete **receive → HU → label → put-away** run succeeds with the device in airplane mode and synchronises correctly when reconnected, with no duplicate records.
- Scan-to-feedback < 300 ms on a mid-range handset; a hardware (keyboard-wedge) scanner works on every scan screen.
- 200 photos captured offline upload without loss; failed uploads retry automatically.
- Conflicting actions produce a readable message and never corrupt location or status.
- Operators cannot reach approval, billing or settings screens even by URL.

## 12. Notifications

### 12.1 Mechanism and channels
| Channel | Purpose | Status |
|---|---|---|
| **Email** | Customer-facing and internal messages; the fallback for every other channel | Built (3 of 14 events) |
| **In-app notification centre** (bell with unread count, §10.22) | Internal events for the signed-in user; deep link to the record | Planned |
| **Web push** (§11.5) | Time-critical floor events on mobile | Planned |
| **SMS / chat webhook** | Optional extra channels (driver gate alerts, supervisors) | Future |

**Sending** is performed by a server-side *Send notification* operation (§16.4): inputs *event type, recipient (email or user), record id, message, module, channel*. **Sender** = a configured address on a verified domain. **Subject and body** come from a template per event, with placeholders (customer, reference, dates, counts, link). Each send is audited (`NOTIFY_EVENT`). Notifications are **best-effort**: a failure is reported to the user but never rolls back the business action, except the inbound completion email, which offers *Send again* and *Continue without email*.

**Recipients are resolved from roles and records**, not typed: customer contacts (primary contact by default, optional per-event distribution list on the customer), the assigned user, all approvers of the record's warehouse, all billing officers. Each user can switch internal events on or off per channel in their profile; mandatory events (assignments, approvals waiting) cannot be switched off.

### 12.2 Event catalogue
"Built" means the reference application sends it today. Everything else is specified here and should be built.

#### Inbound
| Event code | Trigger | Recipients | Channels | Content | Status |
|---|---|---|---|---|---|
| `INBOUND_REQUESTED` | Request submitted | approvers of the destination warehouse | in-app, push | "New inbound request IB-… from <customer>, ETA <date>" with link to the availability check | Planned |
| `INBOUND_ACCEPTED` / `INBOUND_REJECTED` | Accept/reject | customer contact; the requester | email | Confirmation with dates and warehouse, or the rejection reason | Planned |
| `INBOUND_ARRIVAL` | Day of expected arrival (scheduled) | operators of the warehouse | in-app, push | Today's expected inbounds, count, ETA | Planned |
| `GOODS_RECEIVED_CONFIRMATION` | Marked as received | customer contact | email | Quantities received, differences, photos link | Planned |
| `OPERATIONAL_EXCEPTION` / `EXCEPTION_NOTIFICATION` | Damage, shortage or other exception reported (§11.4 M-9) | supervisors; optionally customer | in-app, push, email | Type, HU/line, photos, note | Planned |
| `PENDING_VERIFICATION` | GRN or other item awaiting verification | approvers | in-app, push | What is waiting, with link | Planned |
| `GRN_ISSUED` | GRN generated or verified | customer contact | email (PDF attached) | The Goods Receipt Note | Planned |
| `INBOUND_COMPLETED` | Finish inbound | the email entered (default customer) | email | "Inbound <reference> has been received and is now in stock" (target: summary, labels overview, photos, signed CMR attached; proper subject) | **Built** (text only, no subject) |

#### Storage and outbound
| Event code | Trigger | Recipients | Channels | Content | Status |
|---|---|---|---|---|---|
| `CARGO_READY_FOR_DISPATCH` | All lines picked | supervisors | in-app, push | Pickup reference, carrier, time | Planned |
| `DISPATCH_READY` | Request ready for pickup / driver checked in | supervisors; customer (optional) | in-app, push, email | Request ready, driver arrived | Planned |
| `DISPATCH_CONFIRMATION` | Confirm dispatch | customer contact | email | Target: pickup reference, driver, vehicle, time, HU list, Dispatch Note attached | **Built** (one line, internal id) |
| `DELIVERY_CONFIRMATION` | Marked delivered | customer contact | email | Delivered date | Planned |

#### Tasks and value-added logistics
| Event code | Trigger | Recipients | Channels | Content | Status |
|---|---|---|---|---|---|
| `TASK_ASSIGNMENT` | Task created with assignee | assignee | email, in-app, push | "New task assigned: <type>", due date, link | **Built** (email, only for tasks attached to an inbound/outbound) |
| `TASK_REMINDER` | Due date approaching / overdue (scheduled) | assignee, supervisor if overdue | in-app, push | Task list | Planned |
| `TASK_COMPLETION` | Task completed | creator | in-app | Result | Planned |
| `VAL_ASSIGNMENT` / `VAL_COMPLETION` | VAL assigned / completed | assignee / requester, customer optional | in-app, push, email | Service type, HU, report | Planned |

#### Billing and integration *(new)*
| Event code | Trigger | Recipients | Channels | Content |
|---|---|---|---|---|
| `BILLING_RUN_READY` | Invoice run generated | billing officers | in-app, email | Period, customers, total, variances |
| `BILLING_APPROVAL_NEEDED` | Proposal above the approval threshold | approvers | in-app, email | Customer, amount, link |
| `INVOICE_PUSHED` | Invoice created in Zoho Books | billing officer | in-app | Customer, number, link to Zoho |
| `INTEGRATION_ERROR` | Push/sync failed after retries; token expired | billing officers, administrators | in-app, email | Error code, record, how to fix |
| `INVOICE_OVERDUE` | Zoho status becomes overdue | billing officer; account manager | in-app | Customer, amount, days overdue |
| `UNBILLED_USAGE_WARNING` | Occupancy exists with no applicable rate card line | billing officer | in-app | Customer, zone, days affected |
| `USAGE_STATEMENT` | Invoice sent | customer billing contact | email (PDF/CSV) | Period usage statement |

#### Access and system
| Event code | Trigger | Recipients | Channel |
|---|---|---|---|
| `USER_INVITED`, `PASSWORD_RESET` | Invite / reset | the user | email (identity service) |
| `ACCESS_CHANGED` | Warehouse or role added/removed | the user, administrators | in-app, email |
| `SESSION_REVOKED` | Admin revokes a device | the user | push/email |

### 12.3 Templates and customer-facing texts
Templates are maintained in **Settings → Notifications** (§13.1): per event, per language, with subject, body, placeholders, attachments and an enable switch. The customer-facing sender name and reply-to address are configurable per organisation. Previews use sample data; a test-send goes to the administrator's own address.

### 12.4 Rules
- **R-N1** Notifications never roll back the action that caused them.
- **R-N2** The completion email recipient defaults to the customer's primary contact email and must be non-empty to finish an inbound.
- **R-N3** Scheduled notifications (arrival today, task reminders, overdue invoices) run in the warehouse's local time zone and fire once per record per day.
- **R-N4** Customer emails never contain internal ids or other customers' data; documents are attached or linked with expiring links.
- **R-N5** Every notification is logged (event, recipient, channel, result) and visible to administrators.

## 13. Settings, billing and invoicing (Zoho Books)

**Status: planned.** The reference build has a static Settings page and no billing. This section specifies the Settings module and the complete path from floor events to an invoice in Zoho Books. Entity fields are in §9.7; business rules BB-1…BB-13 are in §1.7; screens are in §10.18 and §10.20.

> **Verification note.** Zoho Books API details (endpoints, scopes, limits, field names) are stated as understood for API v3 and must be re-checked against the current Zoho Books API documentation before implementation. The design isolates them in one integration layer so a change affects one place.

### 13.1 Settings module (administrators)
| Section | Contents |
|---|---|
| **Organisation** | Legal name, logo, address, tax/registration numbers, default time zone, default language, date and number formats |
| **Numbering** | Prefix, per-year sequence and padding for inbound, outbound, GRN, HU labels, invoice proposals |
| **Labels and documents** | HU label size/template (for example 100×150 mm with QR, label text, customer, date), location label template, header/footer of printed documents |
| **Notifications** | Event switches, channel defaults, templates, sender address and reply-to (§12.3) |
| **Warehouses** | Link to Warehouse Management; per-warehouse time zone, working days, cut-off time |
| **Verification** | Verification policies per activity (§3.5) |
| **Security** | Session timeout (desktop, mobile), password rules, two-step verification, allowed devices, session revocation |
| **Billing & Invoicing** | Billing settings (§13.2), tax/currency defaults, approval thresholds |
| **Integrations → Zoho Books** | Connection, mappings, sync options, logs (§13.6) |

Access: System Administrator for all sections; Billing Officer for *Billing & Invoicing* and *Integrations → Zoho Books* (without the ability to view secrets). Every change is audited with before/after values.

### 13.2 Billing configuration
#### Billing settings (one set, overridable per warehouse)
- **Day rule** (BB-2): *end-of-day snapshot* (default), *any presence*, *24-hour blocks*; **cut-off time** in warehouse local time (default 23:59).
- **Dock rate**: free hours on the dock (default 24), then the floor rate (BB-1).
- **Billing period**: monthly (default), weekly, per inbound; **invoice day** (for example the 2nd working day).
- **Invoice grouping**: one invoice per customer per period (default); optionally one per warehouse or per inbound.
- **Payment terms** default (days), **rounding** (per line / per invoice; 2 decimals), **minimum monthly charge** default.
- **Approval**: required yes/no; amount threshold above which a Manager must approve; separation of duties (the person who created the run cannot approve it).
- **Default invoice mode**: *create as draft* (default) or *create and send*.

#### Rate cards (§9.7)
A rate card is a dated price list for a customer (or the default card), optionally restricted to a warehouse. **Resolution order** for any usage item: customer + warehouse card → customer card → warehouse default card → global default card; within a card the most specific line wins (zone > zone type > capacity unit > charge type), then the lowest `priority`. Cards cannot overlap in time for the same scope; a new card **never changes past usage** (usage is priced with the card effective on the usage date).

| Charge type | Typical basis | Example |
|---|---|---|
| `STORAGE` | per capacity unit per day (or per HU, m³, m², kg per day) | 0.85 per pallet position per day, zone Ambient |
| `STORAGE` (cold) | per pallet position per day, zone type Cold | 1.90 |
| `DOCK_STORAGE` | per HU per day after free hours | 0.50 |
| `RECEIVING` | per HU or per hour | 4.00 per pallet |
| `HU_LABEL` | per HU | 0.30 |
| `PUTAWAY`, `PICK`, `DISPATCH`, `RELOCATION` | per HU / per event | 2.50 per pallet |
| `VAL_<service>` | per unit, per hour or fixed | Relabelling 0.15 per carton |
| `SURCHARGE_ADR`, `SURCHARGE_COLD`, `SURCHARGE_OVERSIZE` | per HU, per day or percentage | 15% on storage |
| `FIXED_FEE`, `MINIMUM_CHARGE` | per period | Minimum 250 per month |

**Features of a line:** `free_days`, `min_days`, tiered pricing (optional: price bands by quantity), `condition` expressions on HU data (ADR flag, weight, size), effective dates, and an optional Zoho Books item override.

#### Customer billing profile (on the customer record)
Billing entity name and address, **billing contacts** (invoice recipients), currency, payment terms, tax treatment (taxable / exempt / reverse-charge, tax registration id), rate card, **purchase-order requirement** (PO number required on invoices), invoice language, grouping preference, **Zoho Books contact link** (§13.6), credit hold flag, notes for finance. *Credit hold* is informational by default and can optionally block accepting new inbounds (business decision).

### 13.3 Usage capture
**Storage (Time × Space).** A **scheduled snapshot job** runs after each warehouse's cut-off. For every HU that is in the building (statuses Stored, Retrieved, Picked and, under the dock rule, Received), it writes one `OccupancyDay` row: date, customer, warehouse, location and zone at the snapshot, capacity unit and units (from the HU's package type and quantity, the same maths as the capacity engine), weight, volume, day number since put-away, and the billable flag (false during free days). The job is **idempotent** (unique per HU + date), can be re-run for a date range after a correction, and refuses to change rows that are already locked by an invoice.

**Events (handling, VAL, fees).** Business operations create `ChargeEvent` rows at the moment they happen, in the same transaction: *receiving* (HUs received), *HU creation/label*, *put-away*, *relocation*, *pick*, *dispatch*, *VAL task completed*, *document fee*, *manual charge* (entered by a Billing Officer with a reason). The event stores the source record, quantity and charge type; **the price is resolved at invoicing** from the rate card effective on the event date (or snapshotted if the contract requires).

**Corrections.** A wrong scan is corrected by a cycle-count/adjustment (audited) that regenerates affected unlocked `OccupancyDay` rows. Locked (invoiced) usage is never changed; the difference goes to an adjustment line on the next run or a credit note in Zoho Books (BB-11).

### 13.4 Invoice run workflow
1. **Create run** (Billing Officer): period, scope (all customers or a selection, warehouses), default invoice mode. The system checks: snapshot job complete for every day of the period (otherwise blocks), open exceptions, rates missing, customers without a Zoho link.
2. **Price** — usage is grouped per customer, priced from rate cards: storage lines grouped by zone/rate (quantity = unit-days), event lines grouped by charge type. Free days, minimums, minimum monthly charge, surcharges and discounts applied. Result: an **InvoiceProposal** per customer with **InvoiceLines**; every line links to its detail rows (HU, days, events).
3. **Review** — the Billing Officer sees per customer: lines, subtotal, **variance vs the previous period**, *unbilled occupancy* warnings (usage with no applicable rate), disputed items, and can drill down to HU-days. Actions: add an **adjustment line** (with reason), mark a charge **disputed** (excluded until resolved), **waive** an event, change the invoice date/notes, regenerate after fixes.
4. **Approve** — proposals above the threshold need a second approver; approval **locks** the underlying `OccupancyDay` and `ChargeEvent` rows (set `invoice_line`). Unapproved proposals can be discarded and re-run with no side effects.
5. **Push to Zoho Books** — per proposal or as a batch (§13.6.5). Status becomes *Pushed* (or *Failed* with the error).
6. **Track** — Zoho invoice number, link and status (draft → sent → viewed → unpaid/overdue → partially paid → paid / void) are read back and shown in WOMS (§13.6.7).
7. **Statement** — a **usage statement** (PDF/CSV) per proposal explains every line (per inbound/HU: start, end, days, units, rate, amount) and can be attached to the Zoho invoice and emailed to the customer.

**Run states:** Draft → In review → Approved → Pushed (or Partially failed). Proposals: Draft, Approved, Pushed, Failed, Void.

### 13.5 Worked example
Customer ACME has an inbound of 20 pallets put away on 1 March and dispatched together on 18 March, card: storage 0.85 per pallet position per day, 3 free days per HU, receiving 4.00 per pallet, dispatch 2.50 per pallet, minimum monthly charge 250.

- Storage: each HU billable on 4–17 March (put-away day 1 … dispatch day not counted, 3 free days) = 14 days × 20 × 0.85 = **238.00**.
- Receiving: 20 × 4.00 = **80.00**; dispatch: 20 × 2.50 = **50.00**.
- Subtotal 368.00 ≥ minimum 250, so no top-up. The invoice has three lines (Storage, Receiving, Dispatch) with tax mapped in Zoho Books and a usage statement showing each HU's interval.

### 13.6 Zoho Books integration

#### 13.6.1 Scope and principles
- **Direction:** WOMS → Zoho Books for **customers, invoices and attachments**; Zoho Books → WOMS for **invoice status, payments and credit notes**. Items and taxes are **read** from Zoho Books for mapping.
- **Source of truth:** WOMS for usage and pricing; **Zoho Books for invoice numbers, tax, legal documents and payments**. WOMS never edits an invoice after it has been created in Zoho Books beyond sending/voiding through the API; corrections are credit notes or next-period adjustments.
- **One integration layer** (server side) holds credentials, calls the API, retries and logs; the browser never sees tokens.
- **Idempotent and recoverable:** the same proposal can be pushed again without creating a duplicate.

#### 13.6.2 Connection (Settings → Integrations → Zoho Books)
| Field | Notes |
|---|---|
| **Data center / domain** | Zoho accounts are region-specific (for example .com, .eu, .in, .com.au, .jp, .ca, .sa); API and accounts URLs derive from it |
| **Organization** | `organization_id` (chosen from the organisations returned after connecting; one WOMS tenant ↔ one Zoho Books organisation, or one per billing entity) |
| **Authorisation** | **OAuth 2.0.** Either *Self Client* (client id/secret + generated refresh token, simplest for a single organisation) or the *authorization-code flow* (administrator clicks *Connect to Zoho Books*, signs in at Zoho, grants access, and WOMS receives a code and exchanges it for tokens). The client secret and **refresh token are stored encrypted server-side**; short-lived **access tokens** (about one hour) are refreshed automatically and cached. |
| **Scopes (minimum)** | Contacts (create/read/update), Invoices (create/read/update, status changes), Settings read (items, taxes, currencies, payment terms), Customer payments read, Credit notes read; optional documents/attachments. Grant only what is used. |
| **Test connection** | Calls the organisation endpoint, shows organisation name, currency and plan; shows granted scopes and token health |
| **Status** | Connected / Needs re-authorisation / Error; connected by/at; last successful call; **Disconnect** (revokes the token, keeps mappings and history) |
| **Sync options** | Auto-create missing Zoho contacts (yes/no); invoice mode (draft / create and send); attach usage statement (yes/no); status poll interval; webhook secret |

#### 13.6.3 Mappings
- **Customers ↔ Zoho contacts** (`ZohoCustomerMap`): *Match by* tax id, email, or name → the screen lists WOMS customers with suggested Zoho matches and status (*Linked*, *Not linked*, *Conflict*). Actions: **link existing**, **create in Zoho** (contact_name, company, billing address, currency, payment terms, tax treatment, billing contacts as contact persons), **unlink**, **refresh from Zoho**. A customer without a link cannot be pushed.
- **Charge types ↔ Zoho items** (`ZohoItemMap`): each charge type (optionally by zone or VAL service) maps to a Zoho **item** (service type) with its sales account and default tax; unmapped charge types block the push with a clear message. Items can be read from Zoho and chosen from a list.
- **Taxes:** each billing profile's tax treatment maps to a Zoho **tax** (or exemption) selected from the list read from Zoho; the line's `tax_id` comes from the item map unless the customer profile overrides it.
- **Currency and terms:** the customer's currency must exist in Zoho Books; payment terms map to Zoho payment terms.
- **Custom fields (optional):** Zoho custom fields *WOMS Proposal ID* and *WOMS Period* on the invoice for traceability.

#### 13.6.4 Data sent (invoice payload)
| Zoho invoice field | WOMS source |
|---|---|
| `customer_id` | `ZohoCustomerMap` |
| `date` | invoice date from the run (default: last day of the period or run date) |
| `payment_terms` / `due_date` | customer profile |
| `reference_number` | **`WOMS-<run number>-<customer code>`**, the **idempotency key** |
| `currency_id`, `exchange_rate` | customer currency |
| `line_items[]` | per `InvoiceLine`: `item_id` (map), `name`, `description` (period, zone, basis), `quantity`, `unit`, `rate`, `tax_id`, optional `project`/`account` |
| `notes` | period and warehouse text, PO number |
| `custom_fields` | proposal id, period |
| Attachment | usage statement PDF (added to the created invoice) |
| Mode | created as **draft**; if configured, then marked sent / emailed through the API |

#### 13.6.5 Push procedure and idempotency
1. Validate the proposal (approved, all mappings present, currency and tax valid, amounts equal the sum of lines).
2. **Search first:** look up an invoice with the same `reference_number` for that customer; if it exists, **adopt** it (store its id and status) instead of creating another.
3. **Create** the invoice (draft). On success store `zoho_invoice_id`, `zoho_invoice_number`, `zoho_url`, `pushed_at`; set the proposal *Pushed*.
4. **Attach** the usage statement; if the mode requires, **send** (email) or **mark as sent**.
5. On a transient failure (timeout, rate limit, 5xx) retry with exponential backoff; if the outcome is unknown, repeat the *search first* step before any new create.
6. On a validation failure (for example an inactive item, a closed period or a missing tax) set the proposal *Failed* with Zoho's error code and message and notify the billing officer; fixing the cause and pressing **Retry** is safe.
7. Every call writes an `IntegrationLog` row (direction, entity, id, idempotency key, HTTP status, Zoho code, message, duration, retry count).

#### 13.6.6 Void, credit and corrections
- **Void/delete a draft:** allowed from WOMS before it is sent; the proposal returns to *Approved* and its usage stays locked until the proposal is voided.
- **Sent invoice errors:** create a **credit note** (or a corrected invoice) in Zoho Books; in WOMS record an **adjustment** that links to it, and release usage only if the business decides to rebill. WOMS never silently unlocks billed usage.

#### 13.6.7 Reading back status and payments
- **Polling (default):** a scheduled job (for example every 30 minutes, and on demand with *Refresh*) fetches invoices modified since the last sync and updates `zoho_status`, balance, due date, payment status and the invoice PDF link.
- **Webhooks (optional):** Zoho Books workflow rules can call a WOMS endpoint on invoice and payment events; requests are authenticated with the shared secret, processed idempotently and verified by re-reading the invoice from the API.
- **Shown in WOMS:** Invoices list and customer page (outstanding balance, overdue amount), dashboard KPIs, notifications `INVOICE_OVERDUE`. Payments are **read-only** in WOMS (recording payments stays in Zoho Books).

#### 13.6.8 Limits, errors, security
- **Rate limits:** Zoho Books applies per-minute and per-day API limits depending on the plan; the integration layer queues calls, honours *429*/limit responses, batches reads and spreads a large run (for example 60 calls per minute default, configurable).
- **Token handling:** refresh before expiry; on *invalid token* mark the connection *Needs re-authorisation* and notify administrators; never log tokens.
- **Error taxonomy:** *Configuration* (missing mapping, no connection) → fix and retry; *Validation* (Zoho rejected the data) → fix data; *Transient* (network, rate limit) → automatic retry; *Conflict* (duplicate reference, contact exists) → adopt/link.
- **Security:** secrets encrypted at rest and never returned by the API; only administrators can connect/disconnect; Billing Officers can map and push; all actions audited; webhook endpoint validates the secret and source.
- **Multi-currency and tax:** WOMS sends net amounts in the customer currency; Zoho computes tax, rounding differences and exchange differences; WOMS shows the totals returned by Zoho as the authority.

#### 13.6.9 Reconciliation
A **reconciliation report** compares, per period and customer: WOMS approved total vs Zoho invoice total (differences flagged), invoices created in Zoho with a WOMS reference but unknown to WOMS, WOMS proposals pushed but missing in Zoho, and unbilled usage. Differences are listed for manual resolution.

### 13.7 Billing rules
- **R-B1** Usage is priced only from a rate card effective on the usage date; usage without an applicable rate line is reported as *unbilled* and blocks approval until resolved or waived with a reason.
- **R-B2** A snapshot day exists once per HU; the job is idempotent and never alters locked rows.
- **R-B3** Approval locks usage; locked usage can be changed only through adjustment lines or credit notes.
- **R-B4** A proposal can be pushed only when approved, mapped and currency/tax valid; the push is idempotent by `reference_number`.
- **R-B5** The run creator cannot approve their own run when separation of duties is on.
- **R-B6** Customers with a *credit hold* are flagged on new requests (and optionally blocked).
- **R-B7** All amounts are stored as decimals with at least 4 decimals for rates and 2 for amounts; rounding follows the billing settings.
- **R-B8** Every billing and integration action is audited, including failed attempts.

## 14. Printed documents, dashboards and reports

### 14.1 Printed and generated documents
| Document | Content | Status |
|---|---|---|
| **Inbound Receiving Advice / Goods Receipt Note (GRN)** | GRN number (or "not generated yet"), inbound reference, advice number, customer, customer reference, destination, transporter, expected date, status, **Handling Units table** (HU, contents, type, weight, QR); target: receipts table, differences, photos index, signature, verifier | Built (browser print); **PDF generation and storage planned** |
| **Handling Unit Labels** | A cuttable label per HU: QR (`WOMS-CARGO-<id>`), HU label text (`IB-…-001`), description, customer, date; warns when some HUs lack a QR; template size from Settings | Built |
| **Location labels** | QR (`WOMS-LOC-<id>`), location code, path (zone/aisle/rack/bay/level), large human-readable code | Planned |
| **Outbound Dispatch Note** | Reference, request #, customer, transporter, requested date, status, **pick list** (description, qty, pick status, QR), signature lines (warehouse hand-over, driver receipt); target: driver, vehicle, time, seals | Built |
| **Pickup Pass** | Big pickup reference, **QR `WOMS-OB-<id>`**, "Show this pass and photo ID at the gate", customer, customer reference, collect-from warehouse and address, pickup date, carrier, number of HUs, "Goods to collect" table, release statement | Built |
| **VAL report** | Service, HU, before/after photos, materials, time, performer, verifier | Planned |
| **Movement report (HU)** | Chronological scans and moves of an HU or an inbound | Planned |
| **Usage statement** | Per customer and period: storage by inbound/HU with start, end, days, units, rate, amount; events; services; adjustments; totals | Planned (§13) |
| **Invoice** | Issued and stored in Zoho Books; PDF link kept in WOMS | Planned (§13.6) |

All documents: A4 or label format, company header/footer from Settings, "Print" and "Download PDF", language per customer where supported.

### 14.2 Dashboards
**Home dashboard (every signed-in user).** Greeting and role summary; KPI cards that appear only if the user can open the module and link to a pre-filtered list:
| Card | Definition | Scope |
|---|---|---|
| Warehouse occupancy | % of locations in use, "x of y locations" (target: per capacity unit) | warehouse(s) |
| Today's inbound | Inbounds arriving today (target; reference: created today) | warehouse(s) |
| Today's outbound | Pickups due today (target; reference: created today) | warehouse(s) |
| Cargo in warehouse | HUs not Dispatched/Delivered | warehouse(s) |
| Pending tasks | Tasks not Completed (operators: own) | warehouse(s) |
| Pending VAL | VAL not Completed | all |
| Customers | Total customers | global |

**Stage dashboards *(planned)*.** Counts per workflow stage for inbound (Requested, Confirmed, Received, HU Created, Put Away, Ready, Completed) and outbound (Submitted, Picking, Ready, Dispatched), **action-required** lists (waiting for my approval, exceptions, overdue tasks), **employee workload** (open tasks per person), arrivals/pickups today and tomorrow, and the **notification bell**.

**Management dashboard *(planned)*.** Utilisation by day and by capacity unit with forecast (committed + scheduled releases), inbound/outbound volumes, dwell time distribution, exception rate, revenue run-rate and unbilled usage, invoice pipeline (draft/sent/overdue), top customers by space-days.

### 14.3 Reports catalogue
Every report supports filters (period, warehouse, customer), sorting, grouping where meaningful, and export to CSV/Excel/PDF (§10.1). Scoping follows §3.4.

| # | Report | Content | Status |
|---|---|---|---|
| 1 | **Cargo Register** | Every HU: customer, description, quantity, status, location, QR; opens the HU timeline | Built |
| 2 | **Dispatch Report** | Outbound request, customer, vehicle, dispatched by, date, status | Built |
| 3 | Goods Receipt | Inbounds and GRNs in a period: expected vs received, differences, verifier | Planned |
| 4 | Cargo Location | Where every HU is, by zone/aisle/rack; empty locations | Planned |
| 5 | Occupancy and Availability | Capacity, occupied, committed, available by day and unit; history | Planned |
| 6 | Movement History | Scans and moves by HU, user, period, type | Planned |
| 7 | VAL Summary | Requests by type, status, time, materials | Planned |
| 8 | Task Report | Tasks by assignee/status/overdue | Planned |
| 9 | Customer Activity | Receipts, dispatches, stock and storage days per customer | Planned |
| 10 | **Storage utilisation** | Space-days sold vs available per warehouse/zone | Planned (billing) |
| 11 | **Unbilled usage** | Occupancy/events not yet on an invoice, by customer and age | Planned (billing) |
| 12 | **Revenue by customer / charge type / period** | From approved proposals | Planned (billing) |
| 13 | **Invoice pipeline and ageing** | Drafts, sent, overdue, paid, from Zoho Books status | Planned (billing) |
| 14 | **Integration reconciliation** | WOMS vs Zoho differences (§13.6.9) | Planned (billing) |
| 15 | **Dwell time / stock ageing** | HUs by days in warehouse | Planned |
| 16 | **Audit report** | Who did what, by user, module, record | Planned |

**HU lifecycle timeline** (`/cargo/:id`): merged, time-ordered list of every scan and movement of the HU with user, location, context and photos; the same data drives the usage statement.

## 15. Business rules catalogue
Numbered so tests and tickets can reference them. **All rules must be enforced on the server**; the reference build enforced most of them only in the browser.

### Access
- **R-A1** A user without an active application profile (or with status Inactive, or a staff user with no warehouse assignment) has no access.
- **R-A2** Module access is the union of the modules granted to the user's roles (§3.2). Anything outside it is refused.
- **R-A3** Non-administrators see only records of their assigned warehouses; records without a warehouse are administrator-only; opening another warehouse's record is refused.
- **R-A4** Approvers (administrator, manager, supervisor of the record's warehouse) may create/edit/accept/reject inbound requests, mark received and verify GRNs.
- **R-A5** Only a System Administrator may edit a Completed inbound, reopen a Rejected one, configure warehouses, invite users or change access.
- **R-A6** Operators see only tasks assigned to their email.
- **R-A7** The working-warehouse selection decides where new inbounds/outbounds are created and narrows lists; "All" disables creation.

### Inbound
- **R-I1** Expected arrival cannot be in the past while the inbound is Requested (historical dates are preserved afterwards).
- **R-I2** Storage start cannot be before the expected arrival (or before today when no arrival is set); storage end cannot be before storage start.
- **R-I3** Expected Colli must equal the sum of line quantities; a mismatch blocks the Availability Check until corrected (a one-click fix is offered).
- **R-I4** A request is complete only with expected colli, destination, customer, ETA, ≥ 1 line, and every line having unit, description, qty > 0, weight, length, width, height.
- **R-I5** A customer must be selected before lines can be added.
- **R-I6** Accept or Reject needs an approver; Reject needs a non-empty reason; an availability shortage never blocks accepting.
- **R-I7** Editing a Confirmed inbound returns it to Requested (after confirmation); editing Requested/Confirmed is allowed only for approvers.
- **R-I8** Mark as Received requires unloading date, time, piece count, plate, driver and a driver signature. A piece count different from Σ received quantities warns but does not block.
- **R-I9** Handling Units: cannot pack more than "left to pack" per line; HU type must be a Package Type; each HU gets a unique QR at creation; if its contents cannot be saved the HU is removed; deletable only while it has no location.
- **R-I10** Moving to Put-away needs ≥ 1 HU and no packages left to pack.
- **R-I11** The inbound moves to Put Away only when every HU has a location.
- **R-I12** One GRN per inbound (creation is idempotent); the inbound cannot be Completed until the GRN is Verified by an approver and a recipient email is entered.
- **R-I13** The Completed status is saved before the email is sent; a failed email is recoverable (send again / continue).

### Capacity and storage
- **R-C1** Available = Total − Occupied − Committed (§7.2); occupancy is derived from HU locations, never stored.
- **R-C2** A location is dedicated to one customer at a time: once it holds (or is reserved for) one customer's HUs, other customers' HUs are not allocated to it until it is empty.
- **R-C3** An item fits a location only if its capacity unit matches, its dimensions fit (any orientation), and free units, weight and volume suffice (where those figures are recorded). Blocked locations are skipped.
- **R-C4** A put-away or relocation scan requires a destination location; retrieval requires the HU to be in a location.
- **R-C5** The specific location is chosen at put-away, not at acceptance.
- **R-C6** HUs with status Dispatched or Delivered no longer occupy anything or appear as stock.

### Outbound
- **R-O1** Only a customer's own HUs that are not Dispatched, Delivered or already Picked can be added to a request.
- **R-O2** Dispatch requires every line Picked **and** the driver checked in (name and vehicle plate mandatory).
- **R-O3** Confirming dispatch sets every HU Dispatched, creates the dispatch record, sets the request Dispatched and notifies the customer if an email exists; a notification failure never blocks dispatch.
- **R-O4** Delivery can only be confirmed after dispatch and sets the HUs Delivered.
- **R-O5** A picked line cannot be removed from a request; check-in cannot be edited after dispatch.
- **R-O6** Outbound requests are looked up by pickup reference, customer reference, customer name, id, or by scanning the Pickup Pass QR (the date filter is ignored while searching).

### Data
- **R-D1** References (`IB-`, `OB-`) and GRN numbers follow the formats in Appendix A.2; HU numbers are sequential per inbound.
- **R-D2** Optional numeric/date fields are null when empty; timestamps are UTC.
- **R-D3** Every status transition that matters writes an audit row; an audit failure never blocks the business action.

### Notifications
- Rules **R-N1…R-N5** are in §12.4.

### Billing and invoicing
- Rules **R-B1…R-B8** are in §13.7; the commercial rules **BB-1…BB-13** are in §1.7.

### Mobile and offline
- **R-M1** Every queued mobile action carries a client-generated idempotency key, the device id and the device timestamp; the server never applies the same key twice.
- **R-M2** Queued actions for one record are applied in the order they were made; a failure blocks the dependent actions and is shown in *Sync issues*.
- **R-M3** For location conflicts the latest **confirmed physical scan** wins; impossible transitions (for example put-away of a dispatched HU) are rejected with a readable reason.
- **R-M4** Dispatch confirmation, delivery confirmation, acceptance, GRN verification, invoice approval, user administration and settings are **online only**.
- **R-M5** A scan always records the device time and the server receipt time; billing uses the device time of the event.
- **R-M6** Photos, scans and signatures are never lost: they stay in the device outbox until the server acknowledges them.

### Verification and segregation of duties
- **R-V1** When a verification policy requires it, the activity is not complete until a user with the verifier role has verified it; when *verifier must differ from performer* is on, the same user cannot do both.
- **R-V2** Verification, rejection and override are audited with reason.


## 16. Platform, server operations and non-functional requirements

This section states what any implementation must provide. It deliberately says nothing about a specific vendor.

### 16.1 Shape of the application
- A **web application** with a responsive layout: persistent left navigation on desktop; a top bar and bottom tab bar on phones/tablets (Dashboard, Inbounds, Storage, Outbounds, More).
- A **PWA** delivery of the floor workflows (§11) from the same codebase and the same server API.
- **Camera access** in the browser for scanning QR/barcodes and capturing photos; **printing** of documents and labels from the browser or a label printer.
- QR codes are generated and rendered on the client (any QR library); scanning uses the device camera or a keyboard-wedge scanner.
- Printed documents are ordinary pages printed or saved as PDF (§14.1); server-side PDF generation is required for GRN, statements and invoices attachments.
- **Scheduled jobs** run on the server (snapshot, reminders, integration sync).

### 16.2 Architecture principle
The reference application enforced its rules mostly **in the browser**, with the browser reading and writing data directly. That was a prototype shortcut and **must not be copied**: a rebuild exposes a **server API** that enforces every rule in §15, checks the caller's role and warehouse on every request, and returns only the data the caller may see. The client only renders. Computed data (capacity and availability, allocation suggestions, derived fulfillment statuses, dashboard counts, occupancy snapshots, invoice pricing) is computed on the server.

### 16.3 Capabilities the platform must provide
| Capability | Requirement |
|---|---|
| **Identity** | Email-based sign-in (password and/or one-time code), **invitation-only** accounts (no public sign-up), password reset, sessions, optional two-step verification; token-based sessions suitable for mobile; remote session revocation. Invitation email: "You have been invited to join WOMS… link… you are assigned the role …". |
| **Data storage** | Relational data with **referential integrity**: required fields, unique constraints, foreign keys with *cascade delete* or *set null* (§9), indexed lookups, and queries that join up to five levels (location → rack → aisle → zone → warehouse). If the platform is document-oriented, compute joins and aggregates (capacity, derived statuses, lists with names) on the server. Transactions for multi-record operations (receive, HU creation, dispatch, invoice approval). |
| **File storage** | Private storage with logical areas: **documents** (versioned, encrypted), **photos** (encrypted), **generated PDFs and labels**. Files are never publicly addressable; they are shown through short-lived signed links or streamed through the API; malware scanning on upload is recommended. |
| **Server-side API** | All business rules, authorization and warehouse scoping enforced on the server (§15). Pagination, filtering and sorting on every list endpoint (§10.1). |
| **Scheduler** | Cron-like jobs: occupancy snapshot, notification schedules, integration sync, retention cleanup. |
| **Queue / retry** | Reliable background execution with retries and dead-letter handling for integration calls and emails. |
| **Email** | Transactional email from a verified sender address (configurable), with attachments. |
| **Push** | Web Push service for the PWA (§11.2). |
| **Auditing** | Append-only audit log (§7.10). |
| **Secrets** | Encrypted secret storage for integration credentials (§13.6). |
| **Observability** | Structured logs, metrics, alerts; correlation id per request; health endpoint. |

### 16.4 Server operations required
Every operation requires an **authenticated user** and checks that user's role and warehouse. Entity operations (create/read/update/delete of the entities in §9, scans, GRN creation and verification, accept/reject, dispatch, delivery) are ordinary API endpoints whose behaviour is described by the workflows in §7 and the rules in §15. The following operations need specific behaviour:

| Operation | Inputs | Behaviour | Result |
|---|---|---|---|
| **Upload file** | file content, file name, storage area (*documents* or *photos*), doc type, linked module, linked record id | Reject files over the size limit (reference: 15 MB). Store under a unique name (`<module>-<record id>-<timestamp>-<file name>`) in private storage, create a `Documents` record (linked module, linked record id as text, doc type, storage key, uploader, upload time) and write an audit entry. For mobile: resumable/chunked upload with idempotency key. | storage key, document id |
| **Get file for display** | storage key (and storage area) | Return the file inline when small (reference: ≤ 4 MB) otherwise a **signed link** valid for a short time (reference: 1 hour). Check the caller's warehouse. 404 if not found. | content type + data, or link |
| **Send notification** | event type, recipient(s), optional record id, message, module, channel | Render template, send via channel, write audit and notification log (§12). | event, recipient, result |
| **Invite user** | first name, last name (optional), email, access level (*System Administrator* or *Warehouse Staff*), assignments `[ {warehouse, role} ]` | Caller must be an **active System Administrator**. Staff need at least one assignment, one per warehouse. Create the account and send the invitation, create the application profile (status Active) and one per-warehouse role row per assignment; audit. | email, access level, account id |
| **Write audit entry** | action type, module, record id, details | Append to the audit log; the user comes from the session, never from the request body. | – |
| **Generate GRN / statement document** | record id | Produce and store a PDF; link to the record and Documents. | file reference |
| **Reserve HU ids** | count | Reserve a block of HU numbers/QR payloads for offline label printing (§11.3). | list of ids |
| **Apply scan batch** | list of scans with idempotency keys and device timestamps | Apply in order, validate each, return per-item result (§11.3). | results |
| **Snapshot occupancy** | date, warehouse | Scheduled; idempotent (§13.3). | rows written |
| **Run invoice pricing** | run id | Price usage with rate cards; produce proposals (§13.4). | proposals |
| **Push invoice to Zoho Books** | proposal id | §13.6.5 | invoice id, status |
| **Sync Zoho status** | since time or invoice id | §13.6.7 | updated invoices |
| **Compute availability / suggestions / statuses** | warehouse, dates, record | §7.2, §7.3, §8 | results |

**Configuration values:** sender email address; upload size limit; inline-file size limit; signed-link lifetime; session timeouts; snapshot cut-off; sync intervals; integration rate limits.

### 16.5 Non-functional requirements (proposals to validate)
| Area | Requirement |
|---|---|
| **Scale** | Up to 20 warehouses, 500 customers, 50 concurrent users, 10,000 HUs in stock, 500 inbound and 500 outbound requests per month per warehouse; occupancy table growth per §17.4 |
| **Response time** | List screens < 1 s (p95) for the first page; record page < 1.5 s; availability check < 3 s; scan-to-confirm on mobile < 300 ms perceived |
| **Availability** | 99.5% during warehouse hours; planned maintenance outside shifts; offline tolerance on mobile (§11) |
| **Data integrity** | No orphan records; all multi-record operations transactional; idempotent integrations and scans |
| **Security** | TLS everywhere; encryption at rest for files and secrets; least-privilege roles (§3); input validation; protection against injection, XSS and CSRF; rate limiting; secure headers; dependency scanning; audit of administrative actions |
| **Privacy and compliance** | Personal data limited to staff, customer contacts and drivers (name, ID number, phone); retention policy and deletion/anonymisation on request; data residency configurable; access to driver ID images restricted |
| **Auditability** | Who/what/when for every status change and configuration change; billing and integration actions fully logged; audit log immutable |
| **Backup and recovery** | Daily backups, point-in-time recovery, restore test each quarter; RPO ≤ 1 h, RTO ≤ 4 h |
| **Accessibility and usability** | WCAG 2.1 AA for desktop screens; touch targets ≥ 44 px on mobile; keyboard operability; readable status colours with text labels |
| **Internationalisation** | UTF-8; ISO dates in storage; locale-aware display; time zone per warehouse; multi-currency amounts via ISO codes; translatable strings |
| **Browser support** | Current and previous major versions of Chrome, Edge, Safari, Firefox; mobile per §11.2 |
| **Maintainability** | Automated tests for rules (acceptance scenarios, Appendix C), CI/CD, environment separation (development, staging, production), database migrations, API documentation |
| **Deployment** | Containerised or managed hosting; static client hosting with short-lived HTML cache and hashed assets (§17.4) |

### 16.6 Data-handling conventions
- Record ids are **opaque strings** (never assume numeric ordering or size).
- Optional numeric and date fields are stored as *null* when empty (never as empty text).
- Timestamps are stored in UTC and displayed in the viewer's (or warehouse's) time zone. ETA, requested/pickup date and storage period are **calendar dates** (no time zone).
- Money is a decimal with currency code; never a floating-point number.
- All lists are scoped to the viewer's warehouses by the server (§3.4).
- Page loads should not depend on chains of sequential requests; prefer one request per screen (§17.4).

## 17. Known limitations

This section lists what the **reference build** (the working application this specification was derived from) does not do, does wrongly, or does only partially, so a rebuild can decide what to fix. Features that were never built are listed with their target section; the work to close them is planned in §18.

### 17.1 Functional limitations (scope gaps)
| # | Limitation | Effect | Target |
|---|---|---|---|
| L-1 | **One receipt per inbound.** One inbound = one receipt = one GRN; no *Partially Received* state, no close-short | Multi-truck or split deliveries cannot be recorded faithfully | F-I9 (§18.1) |
| L-2 | **No location QR labels.** Only HU QR codes exist | Put-away cannot be confirmed by scanning the rack | F-W6, F-S5 |
| L-3 | **No handheld/PWA experience.** Pages are responsive but there is no install, offline mode, push, hardware-scanner mode or label printing | Floor use depends on stable connectivity and typing | §11 |
| L-4 | **No billing or invoicing.** No rate cards, no daily occupancy records, no charge events, no accounting integration | Space-time-cost cannot be turned into revenue by the system | §13 |
| L-5 | **Reports:** 2 of 16 reports exist; no exports from any list | Management and finance rely on screens | §14.3, F-R5 |
| L-6 | **Notifications:** 3 of 14 events are sent; no in-app centre, push or customer-facing templates with attachments | Customers and staff are not informed of most events | §12 |
| L-7 | No receiving **exceptions** (damage/shortage), **customs** status/MRN, per-line hazardous class and UN number, or **Excel import** of lines | Manual workarounds | F-I10…F-I13 |
| L-8 | **Partial dispatch inside one outbound request** is not possible (a request dispatches all lines at once; HUs of one inbound can leave over several requests) | Extra requests needed | F-O9 |
| L-9 | An HU occupies **one** location only | Oversized or multi-position units are approximated | §18.1 |
| L-10 | **Role gating** is limited: only inbound request/accept/receive, GRN verification and administration are role-checked; Outbound, Storage, VAL and Tasks are open to any user with the module. Users cannot be deactivated from the UI | Weaker separation of duties | §3.3, F-A4, F-A7 |
| L-11 | **No customer portal**, no SKU/batch/serial inventory, no transport planning, no multi-tenancy (excluded or future) | By design | §1.3 |
| L-12 | **VAL** does not change the HU status, is not warehouse-scoped, raises no notification and is not billable | Weak traceability of services | F-T1, F-T2 |
| L-13 | **Tasks** created in the app carry no warehouse, so warehouse-scoped users never see them (only administrators) | Task assignment is unreliable | F-T3 |
| L-14 | **Settings** is a static information card; numbering, templates and thresholds cannot be configured | Hard-coded behaviour | §13.1 |

### 17.2 Security and integrity risks (do not copy)
1. **Rules enforced in the browser.** A direct API caller could bypass role checks, status transitions and warehouse scoping. A rebuild must enforce every rule on the server (§16.2).
2. **Server operations that accepted anonymous callers** (file upload/retrieval, email sending, audit writing). Every operation must require a signed-in user and check ownership and warehouse.
3. **Permissions not matched to the workflow.** Ordinary staff roles lacked write access to records that the inbound workflow must write (line items, Handling Unit contents, GRN, audit entries), so the flow worked only for administrators. Grant each role exactly the writes its workflow steps need and **test every workflow as a non-administrator** (Appendix C, scenario H).
4. **Cascading deletes.** Deleting a customer or warehouse deletes all dependent history after a generic confirmation. Prefer soft delete or block deletion of records with history.
5. **Duplicate outbound membership.** A single HU can be added to more than one outbound request, so the capacity "expected release" can over-count.
6. **Visibility is a query filter**, not a data-layer guarantee, so a skilled signed-in user could request other warehouses' rows (see §3.4, §16.2).

### 17.3 Functional defects found while documenting
1. Dashboard totals add different capacity units together (the per-unit table is reliable); the "Other" capacity unit has no locations.
2. Accepted-but-not-arrived inbounds reduce availability on **every** day of the projection, not from their arrival date.
3. The Finish screen claims the confirmation email carries *Signed CMR, Photos, Inbound Summary and Label Overview*; **the email is one line of text with no attachments**, and has no subject (the raw event code is shown). The dispatch email quotes an internal id instead of the pickup reference and omits driver, vehicle, time and goods.
4. The GRN is a record plus a printable page; no PDF is stored, and the same page serves as inbound summary and GRN.
5. Reference numbers were derived from the record id rather than a true per-year sequence.
6. Package types are global (not per customer) and their standard dimensions are unused.
7. Unused or legacy fields: `Cargo.reserved_location_id` (only partly used), `GRN.document_id`, `RolePermissions.function_name` and `warehouse_id`, the legacy `AppUsers.warehouse_id`, `InboundAdvice.transport_details`.
8. Completing VAL never sets the *In VAL* scan context or the HU status.

### 17.4 Performance, hosting and operational limitations
- **Latency compounds.** Screens that issue many sequential round trips feel slow, especially across distant regions (about 0.8 s per round trip was measured). Design for one request per screen, short caches for reference lists (customers, warehouses, locations, package types, permissions), lazy loading of below-the-fold sections (documents, tasks, audit) and optimistic updates.
- **Stale front-end builds.** If a host serves the application's HTML with a long cache lifetime, users keep running old code after a release. Use short/no-cache HTML with hashed assets, or let the app detect a newer build and reload at most once every several minutes.
- **Sign-in redirects.** Make the post-sign-in destination explicit and path-based, never load the app inside another page's frame, and detect repeated login-page loads, stopping with an on-screen explanation instead of looping.
- **Query limits.** Platforms with a small limit on joins per query force several queries per screen; compute joins and aggregates on the server.
- **No offline tolerance** in the reference build; any network interruption loses unsaved work (partly mitigated by *Save as draft* in the wizard).
- **Data growth.** Daily occupancy records (one per HU per day) grow quickly (for example 5,000 HUs ≈ 1.8 million rows per year); plan indexing, partitioning/archiving and aggregate tables from the start.

### 17.5 Limitations of this specification
- Billing rules (§1.7, §13) are **proposed** and must be validated against the operator's customer contracts.
- Zoho Books details reflect API v3 as understood at the time of writing and must be verified before implementation (§13).
- Screens in §10 are specified from the working application and the design package; pixel-level visual design is not part of this document.
- Volumes, response-time targets and retention periods (§16.5) are proposals for validation.

## 18. Features for development and roadmap

This section turns the gaps in §17 and the planned features of §5 into a **development backlog**. Priority: **M** must, **S** should, **C** could. Effort (relative): **S** ≤ 1 week, **M** 1–3 weeks, **L** 3–6 weeks, **XL** > 6 weeks, for one small team and an existing foundation.

### 18.1 Development backlog
#### Foundation and corrections
| ID | Feature / work item | Description | Pri | Effort | Depends on |
|---|---|---|:-:|:-:|---|
| D-01 | **Server-side API with authorization** | All rules (§15) and warehouse scoping enforced on the server; client only renders (§16.2) | M | XL | – |
| D-02 | **Workflow-complete permissions** | Each role has exactly the writes its workflow needs; test every scenario as non-admin | M | M | D-01 |
| D-03 | Per-year sequences for references | `IB-`, `OB-`, GRN, proposal numbers; configurable prefixes | M | S | D-01 |
| D-04 | Soft delete / protect history | Block or archive customers, warehouses with history | M | S | D-01 |
| D-05 | Defect fixes (§17.3) | Task warehouse, VAL scoping and HU status, email content, projection-by-arrival-date, per-unit dashboard totals | M | M | D-01 |
| D-06 | One open outbound per HU | Uniqueness rule and release maths fix | M | S | D-01 |
| D-07 | Deactivate/reactivate users, revoke sessions | UI + enforcement; last-login display | S | S | D-01 |
| D-08 | Action-level permissions and role gating | Outbound, Storage, VAL, Tasks, delete actions (§3.3) | S | M | D-01 |
| D-09 | Verification policies | Configurable verification per activity (GRN, VAL, dispatch, task, incident) | S | M | D-08 |

#### Inbound and outbound completion
| ID | Feature | Description | Pri | Effort | Depends on |
|---|---|---|:-:|:-:|---|
| D-10 | **Multiple receipts per inbound** | `Receipt` entity, GRN per receipt, running received/remaining, *Partially Received*, close short | M | L | D-01 |
| D-11 | **GRN PDF generation and storage** | Generated PDF linked to GRN and Documents; emailed | M | M | D-10 |
| D-12 | Receiving exceptions | Damage/shortage/condition capture with photos; exception tasks and notices | S | M | D-10 |
| D-13 | Partial dispatch inside an outbound request | Dispatch selected lines now, rest later; request states | S | M | D-01 |
| D-14 | Customs status and MRN; per-line hazardous data (IMO class, UN number) | Fields, validation, documents | C | M | – |
| D-15 | Excel import of inbound lines | Template, validation report, partial acceptance | S | M | – |
| D-16 | Customer operating instructions | Shown on inbound/outbound/mobile | C | S | – |
| D-17 | HU occupying several locations | Footprint split across locations | C | M | D-01 |
| D-18 | Cycle count / stock check | `CountSession`/`CountLine`, discrepancy workflow, adjustments (audited) | S | L | D-01 |

#### Storage and location
| ID | Feature | Description | Pri | Effort | Depends on |
|---|---|---|:-:|:-:|---|
| D-20 | **Location QR labels** | Permanent label per location, print, scan | M | S | – |
| D-21 | **Scan-the-location put-away** | HU scan → location scan → confirm; mismatch handling | M | M | D-20 |
| D-22 | Customer-specific package types | Per-customer overrides; use standard dimensions in allocation | C | M | – |

#### Mobile (PWA)
| ID | Feature | Description | Pri | Effort | Depends on |
|---|---|---|:-:|:-:|---|
| D-30 | **PWA shell** | Manifest, service worker, install prompt, mobile dashboard, bottom tabs, universal scan button | M | M | – |
| D-31 | **Mobile receive wizard** (M-2) | 5-step flow with photos, document scan, signature | M | L | D-30, D-10 |
| D-32 | **HU creation and label printing on mobile** (M-3) | Custom HU, reserved ids, printer integration | M | L | D-30 |
| D-33 | **Mobile put-away, relocate, retrieve, find** (M-4, M-5) | Scan-confirmed, offline queue | M | L | D-30, D-21 |
| D-34 | **Mobile pick, gate check-in, dispatch** (M-6, M-7) | Walking order, Pickup Pass scan, verify load | M | L | D-30 |
| D-35 | **Offline outbox and sync** (§11.3) | IndexedDB queue, idempotency keys, conflict handling, sync status | M | XL | D-01, D-30 |
| D-36 | Hardware scanner support | Keyboard-wedge handhelds, scan routing | S | S | D-30 |
| D-37 | Mobile tasks, VAL work, exceptions (M-8, M-9) | Task queue, completion with photos | S | M | D-30 |
| D-38 | **Web push** | Subscriptions, per-event opt-in, deep links | S | M | D-30, D-40 |

#### Notifications, tasks, VAL
| ID | Feature | Description | Pri | Effort | Depends on |
|---|---|---|:-:|:-:|---|
| D-40 | **Notification service and centre** | Templates, recipients by role/record, in-app bell, preferences, log | M | L | D-01 |
| D-41 | Complete the 14 + billing events (§12.2) | Triggers, attachments, customer templates | M | M | D-40 |
| D-42 | VAL ↔ HU linkage and billing event | Status change, photos, materials, verification, charge event | S | M | D-01, D-09 |
| D-43 | Task reminders and overdue escalation | Scheduler | S | S | D-40 |

#### Billing and Zoho Books
| ID | Feature | Description | Pri | Effort | Depends on |
|---|---|---|:-:|:-:|---|
| D-50 | **Settings module** (§13.1) | Organisation, numbering, labels, notifications, security, billing | M | M | D-01 |
| D-51 | **Rate cards** | Entities, UI, resolution rules, effective dating | M | L | D-50 |
| D-52 | **Customer billing profile** | Contacts, terms, tax, currency, PO, credit hold | M | S | D-50 |
| D-53 | **Daily occupancy snapshot job** | `OccupancyDay`, cut-off, idempotent re-run | M | L | D-01 |
| D-54 | **Charge events** | Emit from receiving, HU, put-away, pick, dispatch, VAL, manual | M | M | D-01 |
| D-55 | **Invoice runs and proposals** | Pricing engine, review, adjustments, disputes, approval and locking | M | XL | D-51, D-53, D-54 |
| D-56 | **Usage statement** | PDF/CSV per proposal | S | M | D-55 |
| D-57 | **Zoho Books connection** | OAuth, token handling, organisation, test, status | M | M | D-50 |
| D-58 | **Zoho mappings** | Customers, items, taxes, currency; link/create/refresh | M | M | D-57 |
| D-59 | **Push invoices (idempotent)** | Create, attach, send, retry, log | M | L | D-55, D-58 |
| D-60 | **Status/payment sync** | Polling, optional webhook, overdue alerts | S | M | D-59 |
| D-61 | Credit notes and adjustments | Linking WOMS adjustments to Zoho credit notes | S | M | D-59 |
| D-62 | Reconciliation report | WOMS vs Zoho totals and orphans | S | S | D-60 |
| D-63 | Take-or-pay commitments, tiered rates | Contract features (BB-5) | C | M | D-51 |

#### Reporting, UX, integrations
| ID | Feature | Description | Pri | Effort | Depends on |
|---|---|---|:-:|:-:|---|
| D-70 | Export (CSV/Excel/PDF) on every list | Shared component | M | M | – |
| D-71 | Reports 3–9 and 15–16 (§14.3) | Operational reports | S | L | D-01 |
| D-72 | Stage and management dashboards | §14.2 | S | L | D-71 |
| D-73 | Billing reports 10–14 | Utilisation, unbilled, revenue, ageing | S | M | D-55 |
| D-74 | Saved filters and views | Per user | C | S | – |
| D-75 | Customer portal (read-only) | Status, documents, invoices, requests | C | XL | D-01 |
| D-76 | Integration API and webhooks | Inbound advice import, status callbacks, ERP/TMS hooks | C | L | D-01 |
| D-77 | Multi-language UI and documents | i18n of screens, labels, emails | C | M | – |
| D-78 | Multi-organisation (tenant) support | Isolation per operator | C | XL | D-01 |

### 18.2 Suggested phases
| Phase | Theme | Items | Outcome |
|---|---|---|---|
| **0 – Foundation** | Safe base | D-01…D-06 | A server-enforced API, non-admin workflow works, no data-loss risks |
| **1 – Core completion** | Finish the workflows | D-10, D-11, D-12, D-13, D-20, D-21, D-18, D-07…D-09, D-40, D-41, D-70 | Multi-receipt GRN, location QR, notifications, exports |
| **2 – Mobile** | Floor in the pocket | D-30…D-38 | Installable PWA with scan, offline, labels |
| **3 – Revenue** | Space-time-cost to cash | D-50…D-62 | Rate cards, usage, invoice runs, Zoho Books invoices and status |
| **4 – Insight and experience** | Management value | D-42, D-43, D-71…D-74 | Reports, dashboards, VAL billing |
| **5 – Extend** | Beyond the core | D-14, D-15, D-17, D-22, D-63, D-75…D-78 | Portal, integrations, multi-language, tenancy |

Phases 2 and 3 can run in parallel once Phase 0 is complete, because they depend on the same API but not on each other, except that mobile receiving should follow multi-receipt (D-10).

### 18.3 Open business decisions
| # | Decision | Options | Needed by |
|---|---|---|---|
| OD-1 | Who may receive goods (mark received): operators or approvers only? | Operators with supervisor verification (recommended) / approvers only | Phase 1 |
| OD-2 | Billing day rule and dock billing | End-of-day snapshot (default) / any presence / 24-hour blocks; dock free hours | Phase 3 |
| OD-3 | Rate structure in contracts | Per pallet position per day / per m³ / per HU; tiers; take-or-pay | Phase 3 |
| OD-4 | Invoice mode | Draft for review (recommended) / create and send | Phase 3 |
| OD-5 | Billing entity | One organisation or one per warehouse/legal entity (several Zoho organisations) | Phase 3 |
| OD-6 | Credit hold | Informational / block new inbounds | Phase 3 |
| OD-7 | Customer deletion | Block / archive (recommended) | Phase 0 |
| OD-8 | Dispatch confirmation by operators | Supervisor only (recommended) / operators | Phase 1 |
| OD-9 | Retention of photos, scans and logs | For example 7 years for documents, 13 months for logs | Phase 0 |
| OD-10 | Labels and printers | Label size, supported printer models, Bluetooth vs network | Phase 2 |
| OD-11 | Offline scope | Which operations must work offline (§11.3) | Phase 2 |
| OD-12 | Languages | Interface and document languages | Phase 5 |

### 18.4 Guidance for building WOMS on another platform


#### 18.4.1 What to keep
- The **plan/physical split** (`InboundLine` ↔ `HuLine` ↔ HU) and HU-level tracking of everything.
- The **status vocabularies** (§9.4) and the derived fulfillment statuses (§8), including the record-page pattern "one contextual action opens one stage popup" for both inbound and outbound.
- The **capacity maths** (§7.2), the **allocation rules** (§7.3) including customer-dedicated locations, and the **scan model** (§7.4) with `ScanHistory` + `CargoMovementLog`.
- The **role model**: global System Administrator, per-warehouse Manager/Supervisor/Operator, module-level permission matrix, the "approver" concept.

#### 18.4.2 What to improve
1. Put all business rules (§15) in a **server API**; add authorization to every endpoint.
2. Use a **per-year sequence** for references, and enforce that an HU can be on at most one open outbound.
3. Implement **multiple receipts per inbound**, a **GRN per receipt** (with generated PDF), a *Partially Received* state, receiving exceptions (damage/condition/photos), and **location QR** put-away.
4. Complete the **notification set** (14 events) with proper templates, attachments and recipients (customer contacts), and an in-app notification centre.
5. Add the missing **reports** and exports, role-gating for outbound/storage/VAL, task warehouse assignment, VAL ↔ HU status linkage, user deactivation.
6. Soft-delete (or block deletion of) customers and warehouses that have history.

#### 18.4.3 Platform checklist
| Need | Requirement | Examples of how it can be met |
|---|---|---|
| Accounts, invitations, password reset, sessions | §16.3 Identity | Any identity service (OIDC provider, or the platform's built-in users) |
| Relational data with cascade/set-null, unique constraints | §16.3, §9 | PostgreSQL/MySQL, or a platform database with relationships |
| Private files with signed access | §16.3 | S3-compatible bucket, or the platform's storage with file permissions |
| Server endpoints / functions | §16.2, §16.4 | REST/GraphQL service, or serverless functions |
| Transactional email | §12 | SMTP/SES/SendGrid or the platform's messaging |
| QR create/scan, print | §16.1 | Browser libraries (no server needed) |
| Hosting of the web app | §16.1 | Any static or server host |

#### 18.4.4 Notes if the target is Appwrite (verify against its current documentation)
- **Users and roles:** Auth users with *labels* for the global level (System Administrator vs Warehouse Staff) and one **Team per warehouse** with team roles (Manager/Supervisor/Operator) – this maps the per-warehouse role model directly and lets document permissions use team roles.
- **Data:** one **collection per entity** in §9 with the listed attributes, *relationship* attributes for the references (choose cascade for "on delete cascade" and set-null for "on delete set-null"), unique indexes for the unique fields, and a `warehouse` attribute on every operational record so permissions/queries can scope by warehouse.
- **Permissions:** set document-level permissions from the warehouse team (read for the team; write per role) *and* enforce the rules in functions; do not rely on client-side checks.
- **Computed data:** document databases offer limited joins/aggregation, so compute **capacity/availability, allocation suggestions, derived fulfillment statuses and dashboard counts in Functions** (or maintain counters), and return ready-to-display results.
- **Files:** two Storage buckets (documents, photos) with encryption, private by default; serve through short-lived URLs from a function that checks the caller's warehouse.
- **Email:** Messaging with an email provider; invitation via Teams membership invitations or the *Invite user* function (§16.4).
- **Order of work:** identity and teams → masters and warehouse structure → inbound request and availability check → receiving, HU creation, labels, put-away → GRN, completion, notifications → storage operations → outbound → VAL and tasks → reports/dashboard → items in §17.1.

#### 18.4.5 Suggested build order (any platform)
1. Auth, users, roles, warehouses, masters. 2. Warehouse structure and package types. 3. Inbound request + availability check (capacity engine). 4. Receiving, HU creation, labels, put-away (scan model). 5. GRN, completion, notifications. 6. Storage operations. 7. Outbound with pickup pass, pick, check-in, dispatch, delivery. 8. VAL and tasks. 9. Reports, dashboard, audit views. 10. The "not built" items in §17.1.

- **Scheduled work:** use scheduled Functions for the occupancy snapshot, reminders and Zoho Books status sync; keep integration secrets in function variables or an encrypted collection, never in client code.
- **PWA hosting:** serve the client from Appwrite Sites or any static host over HTTPS; use a service worker with a hashed-asset precache; Appwrite Realtime can drive live lists, but the offline outbox must still be implemented in the client (§11.3).
- **Zoho Books:** implement the integration (§13.6) inside one Function that owns the OAuth tokens; call it from other Functions through a queue so retries and rate limits are controlled.


## Appendix A: Glossary, identifiers and value lists

### A.1 Glossary
| Term | Meaning |
|---|---|
| **Inbound** (`InboundAdvice`) | A customer's announcement/receipt of goods into one warehouse. |
| **Line item** (`InboundLine`) | "N packages of one type with a per-package weight and size". The plan. `qty` = number of packages. |
| **Handling Unit / HU** (`Cargo`) | One physical unit (pallet, carton, crate…) with a QR. Created at receiving. |
| **HuLine** | Which line(s), and how many packages of each, sit in which HU. |
| **Package type** | Master list (Pallet, Crate, Carton, Box, Bag, Drum, Roll, Other) with the capacity unit it consumes and units per item. |
| **Capacity unit** | What a location can hold: Pallet Positions, Cartons, Crates, m², m³, Other. |
| **GRN** | Goods Receipt Note: record that an inbound was received, verified by a manager. |
| **Pickup Pass** | Printed sheet with a QR that the customer gives its driver; scanned at the gate. |
| **Dispatch Note** | Printed handover sheet with pick list and signature lines. |
| **VAL** | Value-added logistics (inspection, repacking, relabelling, kitting, quality check). |
| **Gone** HU | Status Dispatched or Delivered; no longer physically in the warehouse. |

### A.2 Reference formats
| Item | Format | Example |
|---|---|---|
| Inbound reference | `IB-<year>-<6-digit sequence>` | `IB-2026-215006` |
| Outbound (pickup) reference | `OB-<year>-<6-digit sequence>` | `OB-2026-207030` |
| HU number | sequential per inbound (1, 2, 3…) stored in `outer_package_no` | `3` |
| HU label text | `<inbound reference>-<HU no. zero-padded to 3>` | `IB-2026-215006-003` |
| HU QR payload | `WOMS-CARGO-<HU id>` | `WOMS-CARGO-<id>` |
| Pickup Pass QR payload | `WOMS-OB-<outbound request id>` | `WOMS-OB-<id>` |
| GRN number | `GRN-<inbound reference>` (fallback: advice id) | `GRN-IB-2026-215006` |
| Line number | `1…n` per inbound (`InboundLine.line_no`) | |

References should come from a **per-year sequence** for each type (inbound, outbound), assigned when the record is created. (The reference build derived them from the record id.)

### A.3 Standard value lists
- **Transport type:** Sea/Ocean Freight, Air Freight, Road Freight, Rail Freight, Courier, Other.
- **Destination:** a country picklist (196 standard country names) plus "Other" with free text.
- **Salutation (contacts):** Mr., Mrs., Ms., Dr., Other.
- **VAL service types:** Inspection, Repacking, Relabelling, Kitting, Quality Check.
- **Task priority:** Low, Medium, High. **Task status:** Assigned → In Progress → Completed.
- **Customer / supplier / transporter status:** Active, Inactive.
- **Location occupancy override:** Available, Reserved, Blocked.
- **Document types in use:** CMR, Photo, Driver Signature (Receiving), Driver Signature (Handover), Goods Receipt Note, Packing List, Delivery Note, Bill of Lading, Commercial Invoice, Operational Attachment, Other.

---

@@GLOSSARY_EXTRA
### A.4 Additional terms (space-time-cost, billing, mobile)
| Term | Meaning |
|---|---|
| **Space-time-cost** | The commercial model: the operator sells space (capacity units) for a period of time at a price, plus handling and services (§1.2) |
| **Capacity unit** | The unit in which a location's space is measured (Pallet Positions, Crates, …); each package type consumes *units per item* |
| **Occupancy day** | One record per HU per day, the basis of storage billing |
| **Charge event** | A billable occurrence (receiving, put-away, pick, dispatch, VAL task, fee) |
| **Rate card** | A dated price list for a customer/warehouse |
| **Free days / minimum period** | Days not charged per HU; the least number of days charged |
| **Invoice run / proposal** | A period's pricing job and its per-customer result awaiting review and approval |
| **Usage statement** | The customer-readable explanation of an invoice |
| **Billing Officer** | Finance role responsible for rates, runs and invoices |
| **Zoho Books** | The accounting system that issues invoices, applies tax and records payments |
| **PWA** | Progressive Web App: the installable mobile version of the web application |
| **Outbox** | The device-side queue of actions waiting to synchronise |
| **Idempotency key** | A unique key that makes repeating an action harmless |
| **Cut-off** | The time of day at which the daily occupancy snapshot is taken |
| **Dock rate** | The charge for goods that are received but not yet stored |

## Appendix B: Seed data

### B.1 Package types (`PackageTypes`)
| Name | Capacity unit | Units per item | Std weight (kg) | Std L×W×H (cm) | Compatible location type |
|---|---|---:|---:|---|---|
| Pallet | Pallet Positions | 1.0 | 600 | 120×100×180 | Pallet Rack |
| Crate | Crates | 1.0 | 50 | 80×60×60 | Cold Storage Bin |
| Carton | Pallet Positions | 0.1 | 20 | 60×40×40 | Pallet Rack |
| Box | Pallet Positions | 0.2 | 15 | 50×40×30 | Pallet Rack |
| Bag | Pallet Positions | 0.1 | 25 | 50×30×20 | Pallet Rack |
| Drum | Pallet Positions | 1.0 | 250 | 60×60×90 | Pallet Rack |
| Roll | Pallet Positions | 1.0 | 300 | 100×100×150 | Pallet Rack |
| Other | Other | 1.0 | | | |

### B.2 Role permissions
The 34-row matrix is in §3.2 (role × module; the `function_name` and `warehouse_id` columns of the permissions table are unused).

## Appendix C: Acceptance scenarios
Use these as the acceptance suite for a rebuild. Sample data: warehouse "Rotterdam DC2"; any customer, supplier and carrier; three line items – (1) 40 Cartons "Cotton T-shirts", 12 kg, 60×40×40 cm; (2) 20 Cartons "Denim jeans", 15 kg, 60×40×40; (3) 10 Boxes "Spare parts", 8 kg, 40×30×30.

**A. Request.** (1) "+ New Inbound" opens the Request form by itself. (2) Fill customer, supplier, carrier, destination, transport type Road Freight, CMR number. (3) ETA = yesterday → error and not saved; ETA = tomorrow → accepted; storage-from earlier than ETA → error; storage-to before storage-from → error; then set a valid period (tomorrow → about a month later). (4) Add the 3 lines; Expected Colli 60 → message "line items add up to 70", fix with "Set to 70". (5) After Done: record shows 3 lines, status Requested, buttons *Availability Check* and *Edit Request*. (6) Edit a line quantity and back; the page reflects it.

**B. Availability check.** (1) One row per day, dates increasing, a "Required" row on top, no red cells. (2) Changing the warehouse updates the table; the comparison lists other warehouses. (3) Accept → status Confirmed, button *Mark as Received*. (4) Edit Request on a Confirmed inbound prompts that it returns to Requested; confirm; accept again.

**C. Receive.** (1) *Mark as Received* disabled until unloading date/time, piece count, plate, driver and signature are done. (2) Upload a CMR photo, an extra photo and draw a signature; each appears as a thumbnail. (3) Receive 38 of line 1; piece count 70 shows a warning vs 68; set 68. (4) Mark as Received → status Received; lines show received 38/20/10. (5) Documents card shows previews.

**D. Handling Units.** (1) Lines show *Received* and *Left to pack*. (2) Split line 1 (19 on 2 identical Pallets). (3) Combine lines 2 and 3 on one Pallet. "Left to pack" is 0 everywhere. (4) Over-packing is blocked with a message; deleting and recreating an HU works. (5) Continue → status HU Created; the record shows 3 HUs with contents; Print Labels shows QR labels.

**E. Put-away.** (1) Each HU gets a suggested location in the right zone. (2) Store 3 of 3 → status Put Away; locations shown on the record. (3) Availability shows occupied pallet positions up by 3.

**F. Complete.** (1) Complete Inbound → GRN generated, status Ready. (2) Finish: verify GRN, enter an email, complete (or continue without email) → status Completed. (3) A Completed inbound can be edited by an administrator only.

**G. Outbound.** (1) New request: same customer and warehouse, requested date tomorrow, a PO reference. (2) Add two stored HUs. (3) Dispatch is disabled until every line is picked and the driver is checked in; pick each line by scan. (4) Enter vehicle details, confirm dispatch → request Dispatched, HUs leave their locations. (5) Availability shows occupied down by 2. (6) Mark Delivered; Deliveries lists them under Delivered.

**H. Access (needs a second account).** (1) Invite a staff user: Manager in warehouse A, Operator in warehouse B. (2) Signed in as that user, only those two warehouses appear; approve actions show for A's inbounds, not B's. (3) Opening a third warehouse's record is refused. (4) **Repeat scenarios A–G as this non-administrator user** wherever the role allows (manager in A: all inbound steps incl. GRN verify; operator in B: receive-side steps from HU creation onward) and confirm no step fails for lack of write permission. (5) As administrator, change and remove that user's warehouses.

**I. Regression.** (1) An inbound created under older status names (Pending/Submitted) appears as Requested and offers its actions. (2) Reloading mid-flow keeps status, lines, HUs and documents.

@@SCENARIOS_EXTRA
**J. Billing (Phase 3).** Sample: customer ACME with a rate card effective 1 March: storage 0.85 per pallet position per day, 3 free days per HU, receiving 4.00 per pallet, dispatch 2.50 per pallet, minimum monthly charge 250. (1) Put away 20 pallets on 1 March, dispatch all on 18 March. (2) After the run of 1–31 March: 17 occupancy days per HU exist (1–17 March); 14 are billable; none for 18 March onward. (3) Proposal: Storage 238.00, Receiving 80.00, Dispatch 50.00, subtotal 368.00; variance vs previous period shown. (4) Re-running the snapshot for 5 March creates no duplicates. (5) A pallet put away in a zone with no rate line is flagged *unbilled* and blocks approval until a rate is added or the charge is waived with a reason. (6) Mark one event *disputed*: it disappears from the proposal; resolve it: it returns. (7) Approve: occupancy rows and events become locked; editing a locked row is refused. (8) A correction after approval appears as an adjustment line in the next run. (9) Two-person approval: the run's creator cannot approve it when separation of duties is on.

**K. Zoho Books integration (Phase 3).** (1) Connect with a test organisation; *Test connection* shows organisation name and currency; the secret is never visible after saving. (2) Customer mapping: a customer with a matching tax id is suggested; *Create in Zoho* creates a contact with the billing profile; an unlinked customer blocks the push with a clear message. (3) Item mapping: an unmapped charge type blocks the push. (4) Push the approved proposal: a **draft** invoice appears in Zoho Books with the three lines, reference `WOMS-<run>-<customer>`, tax from the mapping, usage statement attached; the proposal shows invoice number, status and link. (5) Press *Push* again: no second invoice is created (adopted by reference). (6) Simulate a timeout after creation: retry adopts the existing invoice. (7) Send the invoice in Zoho Books; after the next sync WOMS shows *sent*, then (after a payment is recorded) *paid* with the balance 0. (8) Let an invoice pass its due date: status *overdue*, notification `INVOICE_OVERDUE`. (9) Revoke the token: connection shows *Needs re-authorisation*, administrators are notified, no data is lost, and pushes resume after reconnecting. (10) Reconciliation report lists a manually created Zoho invoice with a WOMS reference as unknown to WOMS.

**L. Mobile (Phase 2).** Device: mid-range phone with the app installed. (1) Install to the home screen; launch full-screen; the sync indicator shows *online*. (2) Put the device in airplane mode. (3) Receive an inbound (M-2): enter plate, driver, counts, take 3 photos and a document scan, sign; status shows *Received (pending sync)*. (4) Create 5 HUs (M-3) and print labels (or produce a PDF). (5) Put away 5 HUs by scanning HU then location (M-4); a wrong location prompts and a customer-dedicated location is refused with a reason. (6) Restore connectivity: the outbox synchronises in order; no duplicate records; photos upload; the inbound moves to *Put Away* and appears the same on desktop. (7) Pick an outbound in walking order (M-6): a wrong HU is rejected; scan the Pickup Pass at the gate, check in the driver, take the driver's signature, supervisor confirms dispatch online (M-7). (8) Offline attempt to confirm dispatch is refused with the message "needs a connection". (9) A hardware keyboard-wedge scanner works on all scan screens. (10) An operator cannot reach billing, settings or approval screens by URL. (11) Two devices relocate the same HU while offline: the later *confirmed scan* wins, the other user sees a readable message in *Sync issues*.

## Appendix D: Requirement traceability
Each business requirement of §1.6 and the features and sections that satisfy it.

| Req | Description (short) | Features | Specified in |
|---|---|---|---|
| BR-01 | HU identity and QR | F-I5, F-S4 | §7.1.5, §9 |
| BR-02 | Location and time-stamped history | F-S2, F-S4 | §7.4 |
| BR-03 | Space description | F-W1, F-M6 | §6.4, §6.5 |
| BR-04 | Availability check by day | F-W3, F-I3 | §7.1.3, §7.2 |
| BR-05 | Customer-dedicated storage | F-W4 | §7.3 |
| BR-06 | Accept/reject with reason | F-I3 | §7.1.3 |
| BR-07 | Rate cards | F-B1 | §13.2 |
| BR-08 | Daily occupancy record | F-B2 | §13.3 |
| BR-09 | Storage charges | F-B2, F-B4 | §13.3, §13.4 |
| BR-10 | Handling charges | F-B3 | §13.3 |
| BR-11 | VAL charges | F-B3, F-T2 | §7.7, §13.3 |
| BR-12 | Surcharges and fees | F-B1 | §13.2 |
| BR-13 | Invoice proposals and approval | F-B4 | §13.4 |
| BR-14 | Push to Zoho Books | F-B6 | §13.6 |
| BR-15 | Usage statement | F-B5 | §13.4, §14.1 |
| BR-16 | Billing reports | F-B7 | §14.3 |
| BR-17 | Multi-warehouse, roles, visibility | F-A2, F-A5 | §3 |
| BR-18 | Mobile-first PWA | F-P1…F-P5 | §11 |
| BR-19 | Evidence and audit | F-E1, F-E2, F-A9 | §7.9, §7.10 |
| BR-20 | Notifications | F-N1…F-N3 | §12 |
| BR-21 | Currency and tax via accounting | F-B6 | §13.6.8 |
| BR-22 | Verification workflows | F-A8 | §3.5 |
| BR-23 | Multiple receipts, partial dispatch | F-I9, F-O9 | §18.1 (D-10, D-13) |
| BR-24 | Customer portal | – | §18.1 (D-75) |
