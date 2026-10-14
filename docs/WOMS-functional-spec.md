# WOMS: Functional Specification

**Product:** Warehouse Operations Management System (WOMS), a multi-warehouse, multi-customer (3PL) warehouse management system.
**Document status:** platform-neutral functional specification, based on the behaviour of the working reference application as of 2026-10-14. Where something was specified but not built, or built but flawed, it is called out in §14.
**Purpose:** a complete description of features, workflows, users, roles, data model, business rules and notifications that a team can use to build WOMS on any platform (for example Appwrite, or a conventional web API with a SQL database).
**Sources:** the behaviour, data model and seed data of the working application, and the product-definition documents *WOMS Product Definition – Development Master v1.0* and *WOMS Product Master v1.2* (vision, market and pricing; not repeated here).

Legend used throughout: **BUILT** (works as described), **PARTIAL** (built with limits), **NOT BUILT** (specified in the product documents, absent from the reference application). Rule identifiers (R-xx, §13) can be used to trace requirements into tests.


## Contents

- [1. Product summary](#1-product-summary)
- [2. Platform and architecture requirements](#2-platform-and-architecture-requirements)
- [3. Users, roles and access](#3-users-roles-and-access)
- [4. Concepts, identifiers and formats](#4-concepts-identifiers-and-formats)
- [5. Master data](#5-master-data)
- [6. Workflows](#6-workflows)
- [7. Derived ("fulfillment") statuses](#7-derived-fulfillment-statuses)
- [8. Screens and navigation](#8-screens-and-navigation)
- [9. Notifications](#9-notifications)
- [10. Printed documents, reports and dashboard](#10-printed-documents-reports-and-dashboard)
- [11. Data model](#11-data-model)
- [12. Server operations required](#12-server-operations-required)
- [13. Business rules catalogue](#13-business-rules-catalogue)
- [14. Known gaps, defects and risks of the reference build](#14-known-gaps-defects-and-risks-of-the-reference-build)
- [15. Guidance for building WOMS on another platform](#15-guidance-for-building-woms-on-another-platform)
- [Appendix A: Seed data](#appendix-a-seed-data)
- [Appendix B: Acceptance scenarios](#appendix-b-acceptance-scenarios)

---

## 1. Product summary

### 1.1 What WOMS does
A 3PL warehouse operator receives goods on behalf of customers, stores them in racks, and releases them on pickup. WOMS tracks every physical package as a **Handling Unit (HU)** with its own QR code, from the moment it is announced (inbound request) to the moment it is delivered (outbound). It supports several warehouses and several customers, with per-warehouse staff roles.

### 1.2 Scope
| In scope (built) | Out of scope / not built |
|---|---|
| Customer, contact, supplier, transporter masters | Billing, invoicing, rate cards (explicitly excluded) |
| Warehouse → zone → aisle → rack → storage-location structure, package types | Customer self-service portal (later phase) |
| Inbound: request → availability check → accept/reject → receive → create HUs → put-away → GRN → finish | SKU / batch / serial inventory inside HUs |
| Capacity and availability engine with date-range projection; size/weight-aware location suggestion | Transport/route planning |
| Storage operations: put-away, relocate, retrieve, put back, scan | Dedicated PDA/handheld screens (the app is responsive only) |
| Outbound: request → select HUs → pick (scan) → driver check-in with Pickup Pass → dispatch → delivered | Multiple receipts (partial deliveries) per inbound with a GRN each |
| Deliveries tracking (in transit / delivered) | Permanent location QR labels ("scan HU, then scan location") |
| Value-added logistics (VAL) requests and tasks | Customs status / MRN, per-line hazardous-goods class, Excel import of lines |
| Operational tasks (standalone and attached to any record) | Most of the 9 planned reports, most notification types (see §9, §10) |
| Documents, photos, driver signatures, audit trail | Multi-tenant SaaS (tenant isolation) |
| Users, roles per warehouse, module permissions | |
| Dashboard KPIs, two reports, printable documents and QR labels | |

### 1.3 Design principles (these shaped the data model and should survive a port)
1. **Plan vs. physical.** An inbound's *line items* are the plan ("40 cartons of T-shirts"). *Handling Units* are what physically exists after receiving. One line can spread over many HUs; one HU can hold several lines. The link is `HuLine`.
2. **The HU is the unit of everything.** Storage, picking, dispatch, delivery, VAL, scans and reports all key off the HU (stored in the `Cargo` table). An HU record (entity `Cargo`) is an HU once its `qr_code` is set.
3. **HU QR says WHAT.** QR payload is `WOMS-CARGO-<HU id>`. (A matching "location QR" for WHERE is specified but not built.)
4. **Occupancy is derived, never stored.** A location is occupied if a non-gone HU has `current_location_id` pointing at it. Planned outbounds do not free space until dispatched.
5. **Warehouse scoping everywhere.** Every operational record carries a `warehouse_id`; users only see their warehouses.
6. **Everything auditable.** Status changes, scans and movements write history rows.

---

## 2. Platform and architecture requirements

This section states what any implementation must provide. It deliberately says nothing about a specific vendor.

### 2.1 Shape of the application
- A **web application** with a responsive layout: persistent left navigation on desktop; a top bar and a bottom tab bar on phones/tablets (Dashboard, Inbounds, Storage, Outbounds, More).
- **Camera access** in the browser for scanning QR codes and capturing photos; **printing** of documents and labels from the browser.
- QR codes are generated and rendered on the client (any QR library); scanning uses the device camera.
- Printed documents are ordinary pages printed or saved as PDF from the browser (§10.1).

### 2.2 Capabilities the platform must provide
| Capability | Requirement |
|---|---|
| **Identity** | Email-based sign-in (password and/or one-time code), **invitation-only** accounts (no public sign-up), password reset, sessions. Invitation email: "You have been invited to join WOMS… link… you are assigned the role …". |
| **Data storage** | Relational data with **referential integrity**: required fields, unique constraints, foreign keys with *cascade delete* or *set null* (§11), indexed lookups, and queries that join up to five levels (location → rack → aisle → zone → warehouse). If the platform is document-oriented, plan to compute joins and aggregates (capacity, derived statuses, lists with names) on the server. |
| **File storage** | Private storage with three logical areas: **documents** (versioned, encrypted), **photos** (encrypted), optional pre-rendered **labels**. Files must never be publicly addressable; they are shown through short-lived signed links or streamed through the API. |
| **Server-side API** | All business rules, authorization and warehouse scoping must be enforced on the server (§13, §15). |
| **Email** | Transactional email from a verified sender address (configurable). |
| **Auditing** | Append-only audit log (§6.10). |

### 2.3 Architecture principle
The reference application enforced its rules mostly **in the browser**, with the browser reading and writing data directly. That was a prototype shortcut and **must not be copied**: a rebuild should expose a server API that enforces every rule in §13, checks the caller's role and warehouse on every request, and returns only the data the caller may see. The client then only renders.

### 2.4 Data-handling conventions
- Record ids are **opaque strings** (never assume numeric ordering or size).
- Optional numeric and date fields are stored as *null* when empty (never as empty text).
- Timestamps are stored in UTC and displayed in the viewer's local time. ETA, requested/pickup date and storage period are **calendar dates** (no time zone).
- All lists are scoped to the viewer's warehouses by the server (§3.4).
- Page loads should not depend on chains of sequential requests; prefer one request per screen (see §14.4).

## 3. Users, roles and access

### 3.1 Identity and sign-in
- A user is an account (email + credentials) **plus** an application profile, `AppUsers` (`email`, `account_id`, `business_role`, `user_status`).
- Sign-in: email, then OTP/password, inside the WOMS login card. After login the user returns to the app root.
- The app resolves the signed-in user, loads their `AppUsers` row, their per-warehouse roles, and the `RolePermissions` table, then builds a *viewer* context. Without an active `AppUsers` row the user sees "Your account has no role yet". `user_status = Inactive` is treated as no role.
- Sign-out clears local storage/cookies and returns to the app.

### 3.2 Role model
Two levels:

| Level (`AppUsers.business_role`) | Meaning |
|---|---|
| **System Administrator** | Global. Sees every warehouse and every module. Can invite users, manage access, edit completed inbounds and reopen rejected ones, configure warehouses. |
| **Warehouse Staff** | Has no global rights. Gets **one role per warehouse** from `UserWarehouseRole`. |

Per-warehouse roles (`UserWarehouseRole.business_role`): **Warehouse Manager**, **Warehouse Supervisor**, **Warehouse Operator**. A user can be a Manager in one warehouse and an Operator in another. One role per warehouse per user.

"Approver" roles (may create/accept inbound requests, receive goods, verify a GRN): **System Administrator, Warehouse Manager, Warehouse Supervisor**, evaluated **per warehouse**. Operators are never approvers.

### 3.3 Module permissions (`RolePermissions`, as seeded)
A user may open a module if **any** role they hold grants it (System Administrator: all).

| Module | Sys. Admin | Manager | Supervisor | Operator |
|---|:-:|:-:|:-:|:-:|
| Customer Management | ✔ | ✔ | | |
| Warehouse Management | ✔ | ✔ | ✔ | |
| Inbound Operations | ✔ | ✔ | ✔ | ✔ |
| Cargo & Storage Management | ✔ | ✔ | ✔ | ✔ |
| QR Code & Label Management | ✔ | ✔ | ✔ | ✔ |
| Operational Task Management | ✔ | ✔ | ✔ | ✔ |
| Value Added Logistics | ✔ | ✔ | ✔ | ✔ |
| Outbound Operations | ✔ | ✔ | ✔ | ✔ |
| Reports & Dashboards | ✔ | ✔ | ✔ | |
| System Administration | ✔ | | | |

Route-to-module mapping (first matching prefix wins): `/customers`→Customer Management; `/warehouse`, `/transporters`→Warehouse Management; `/inbound`, `/print/inbound`, `/print/grn`, `/print/putaway`→Inbound Operations; `/storage`, `/cargo`→Cargo & Storage Management; `/outbound`, `/print/outbound`, `/print/pickup`, `/delivery`→Outbound Operations; `/tasks`→Operational Task Management; `/val`→Value Added Logistics; `/reports`→Reports & Dashboards; `/admin`, `/settings`→System Administration. The dashboard (`/`) is open to every user with an active role. Navigation hides entries a user cannot open, and a direct URL shows "No access". The module "QR Code & Label Management" is granted but has no screen of its own (labels are printed from Inbound).

### 3.4 Warehouse scoping and record visibility
- **System Administrator:** sees all warehouses.
- **Other users:** only warehouses in their assignments. A user with no assignments sees nothing.
- **Working warehouse selector** (sidebar, shown when the user has more than one warehouse): "All my warehouses (view only)" or one warehouse. Selecting one narrows every list to it and decides where new inbounds/outbounds are created. With "All" selected, creation is disabled ("Choose a warehouse at the bottom left first"). The choice is remembered in the browser and reloads the page.
- Every list query appends a warehouse filter. Opening a record from a warehouse the user lacks shows "You don't have access to this warehouse's records." Records with no warehouse are visible to administrators only.
- **Operators** additionally see only tasks **assigned to their email** (tasks are the only table with an assignee filter).
- Warehouse Management is split: administrators see all eight tabs; everyone else sees only the **Availability** tab.

### 3.5 Action gates (what each role can do in the UI)
| Action | Who |
|---|---|
| Create inbound request ("+ New Inbound"), edit request, run Availability Check, accept/reject, mark received | Approvers in that inbound's warehouse |
| Create Handling Units, put away, "Complete Inbound" (generate GRN), open Finish | Any user with Inbound access to that warehouse |
| **Verify GRN** | Approvers (the Finish step cannot complete until the GRN is *Verified*) |
| Edit a *Completed* inbound; reopen a *Rejected* inbound | System Administrator only |
| Any Outbound action, Storage action, VAL, Tasks | Any user with the module and warehouse access (**no further role gating**: a documented gap) |
| Warehouse / zone / aisle / rack / location / package-type setup | System Administrator |
| Invite users, manage a user's warehouse access | System Administrator (enforced by the *Invite user* operation, §12) |

### 3.6 User administration (System Administration → Users)
- **Invite User:** first name, last name (optional), email, access level (*Warehouse staff* or *System Administrator*). For staff: one or more rows of *warehouse + role* (at least one; each warehouse once). The *Invite user* operation (§12) creates the account and sends the invitation email, creates the profile (status Active) and one per-warehouse role row per assignment, and writes an audit entry.
- **Users table:** email, access summary, status, "Manage access".
- **Manage access** (per staff user): change role per warehouse, remove a warehouse, add another warehouse. No UI exists to deactivate a user or change the access level (data field `user_status` exists).
- The page also shows the role × module permission matrix (read from `RolePermissions`) and the audit trail for the module "System Administration".

---

## 4. Concepts, identifiers and formats

### 4.1 Glossary
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

### 4.2 Reference formats
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

### 4.3 Standard value lists
- **Transport type:** Sea/Ocean Freight, Air Freight, Road Freight, Rail Freight, Courier, Other.
- **Destination:** a country picklist (196 standard country names) plus "Other" with free text.
- **Salutation (contacts):** Mr., Mrs., Ms., Dr., Other.
- **VAL service types:** Inspection, Repacking, Relabelling, Kitting, Quality Check.
- **Task priority:** Low, Medium, High. **Task status:** Assigned → In Progress → Completed.
- **Customer / supplier / transporter status:** Active, Inactive.
- **Location occupancy override:** Available, Reserved, Blocked.
- **Document types in use:** CMR, Photo, Driver Signature (Receiving), Driver Signature (Handover), Goods Receipt Note, Packing List, Delivery Note, Bill of Lading, Commercial Invoice, Operational Attachment, Other.

---

## 5. Master data

### 5.1 Customers (`Customers`, `Contacts`)
- **Fields:** name* (unique), email, phone, address, status (Active/Inactive).
- **Screens:** list (sortable; add form; select several and bulk delete; row click opens detail); detail page (editable info card, **Contacts**, then three read-only activity tables: Inbound advices, Outbound requests, Cargo, each limited to the viewer's warehouses).
- **Contacts:** a customer can have several: salutation, first name, last name, email, phone, **primary** flag (only one primary: setting one clears the others). Added from the customer detail page; deleting a customer cascades to its contacts.
- **Use of data:** the customer's `email` is the default recipient for inbound-completion and dispatch emails. Contacts are not used for notifications.
- After creating a customer the app opens its detail page so contacts can be added.

### 5.2 Suppliers (`Suppliers`)
A directory separate from customers (who shipped the goods vs. whose goods they are). Fields: name* (unique), email, phone, address, status. There is **no standalone Suppliers screen**: suppliers are chosen, or created inline ("+ Add new supplier…"), from the inbound request form.

### 5.3 Transporters (`Transporters`)
Fields: name*, contact person, phone, vehicle registration, status. List with add/edit; sortable. Used as carrier on inbound and outbound requests.

### 5.4 Warehouses and storage structure (Warehouse Management, administrators)
Hierarchy: **Warehouse → Zone → Aisle → Rack → Storage Location**. Uniqueness: warehouse names, customer names, supplier names, transporter names and storage `location_code`s are each unique across the system (`location_code` globally, not per warehouse).
- **Warehouse:** name* (unique), address, status (Active/Inactive, default Active; no screen changes it). Create, edit, delete.
- **Zone:** name*, zone type (free text, e.g. Ambient/Cold), belongs to a warehouse.
- **Aisle:** name* within a zone.
- **Rack:** code* within an aisle.
- **Storage Location:** `location_code`* (convention `RT2-A1-R01-B1-L2` = warehouse-aisle-rack-bay-level), location type (free text, e.g. Pallet Rack), **capacity** (number) and **capacity unit**, optional **max weight (kg)**, optional **length/width/height (cm)**, **bay** (position along the rack), **rack level** (1 = floor), occupancy status override (Available/Reserved/Blocked). Bay/level are editable in place.
- Deleting a parent cascades down the hierarchy.
- **Map tab:** per warehouse, the full tree with each location shown occupied/empty.
- **Availability tab:** the capacity dashboard (§6.2); visible to every role with Warehouse Management access *and* to non-admin staff.

### 5.5 Package Types (`PackageTypes`)
Name*, **capacity unit consumed**, **units per item** (e.g. a Carton consumes 0.1 of a Pallet Position), optional standard weight/dimensions, compatible location types, status. Seeded values are in Appendix A. Matching is by name, case-insensitive; an unmatched unit counts as 1 unit of an "Ungrouped" capacity. Package types feed the unit drop-down of line items and Handling Units. Add and delete from the *Package Types* tab.


---

## 6. Workflows

### 6.1 Inbound (the core workflow)

#### 6.1.1 Status model (`InboundAdvice.status`)
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

#### 6.1.2 Stage 1: Request (status Requested)
"+ New Inbound" (inbound list; approvers only; needs a chosen working warehouse) creates an empty draft immediately (status Requested, reference assigned, warehouse = working warehouse) and opens the **Request popup**. All fields **autosave** on blur/selection; the popup's "Done" just closes it.

Fields:
- *Shipment details:* **Expected Colli*** (integer, total packages announced), **Destination (country)*** (picklist + Other), **Expected arrival (ETA)***.
- *Customer & reference:* **Customer***, customer reference / PO number, reference client.
- *Supplier & transport:* supplier (picklist + inline add), carrier/transporter, CMR (freight document) number, transport type, remarks.
- *Expected storage period:* from, to (optional; needed for a meaningful availability check; open-ended "to" is allowed).
- **Line items** (a customer must be chosen first): per line **unit type*** (from Package Types; default Box), **description***, **quantity (number of packages)*** (default 1), **weight per package (kg)***, **length/width/height (cm)***. Add/delete lines. Under the table: remarks and **ADR (dangerous goods)** Yes/No, plus a summary strip (expected colli, received pieces, total packages, total weight, total volume m³).

Validation (see §13): R-I1…R-I5. A request is "complete" (so the primary action advances to Availability Check) only when the four required general fields exist, there is at least one line, every line is fully filled with qty > 0, the date rules hold and Expected Colli equals the lines' package total. A one-click "Set to N" fixes a colli mismatch.

#### 6.1.3 Stage 2: Availability Check and acceptance (Requested → Confirmed | Rejected)
Shown to approvers. Purpose: decide whether the chosen warehouse can hold this request for its whole storage period, then accept or reject.
- Shows customer, destination/ETA, supplier/transporter, summary.
- **Warehouse selector** ("Store this request in"): the approver's own decision; changing it re-assigns all lines (and the advice) to that warehouse. Only warehouses the user can access are offered.
- **Availability table:** one row per day of the storage period (from the start date to the end date; an open-ended period is checked for 14 days; maximum 60 days; with no start date only "Today"). Columns: one per capacity unit the request needs, plus Weight (kg) and Space (m³). A top "Required" row shows what the request needs; each day row shows what is still free that day; cells where required > free are red. The *lowest* free figure over the whole period decides "fits".
- **Warehouse comparison:** for each accessible warehouse: does it fit the whole interval, how many packages physically fit (size/weight/dimension/customer-dedication allocation), with a "Use this warehouse" action.
- A shortage is **a warning, not a block** (the approver may still accept).
- **Accept** → status Confirmed; audit `INBOUND_CONFIRMED`. **Reject** (reason required) → status Rejected, `rejection_reason` stored; audit `INBOUND_REJECTED`. No email is sent on either.
- Accepting does **not** reserve a specific location; the location is chosen at put-away.

#### 6.1.4 Stage 3: Receive (Confirmed → Received)
Physical arrival. Fields: **warehouse unloading date***, **unloading time***, **received piece count***, **licence plate***, **driver name***, per-line **received quantity** (defaults to the requested qty), **driver signature*** (drawn on a canvas, stored as a document of type *Driver Signature (Receiving)*), **CMR photo** and optional **additional photos**.
- "Mark as Received" is enabled only when all starred items and the signature exist. A hint appears if the piece count differs from the sum of received quantities.
- Saves changed received quantities one by one, then sets status Received.

#### 6.1.5 Stage 4: Create Handling Units (Received → HU Created)
Turns received packages into physical HUs. Table of lines shows *Received*, *On HUs* and *Left to pack*. To build an HU: choose **HU type** (from Package Types), enter quantities for one or more lines in "Put on new HU" (combine lines on one HU, or split a line across several), weight (prefilled from line weight × qty), dimensions (prefilled from the first line), and **"create this many identical HUs"**. Shortcut **"One HU per package (all lines)"** creates one HU per remaining package with that line's own type, weight and size.
- Each HU gets the next HU number, the `Cargo` row (status Received, `received_qty` = packed qty, description = "<line description> ×qty, …"), its **QR stamped immediately** (`WOMS-CARGO-<id>`), and `HuLine` rows recording contents. If the contents fail to save, the half-built HU is deleted.
- Rule: you cannot pack more than "left to pack" for any line. An HU can be deleted while it has no location; deleting cascades its `HuLine` rows.
- **Print Labels** opens the QR label sheet. "Continue to Put-away" is enabled only when nothing is left to pack and at least one HU exists → status HU Created.

#### 6.1.6 Stage 5: Put-away (HU Created → Put Away)
Shows the warehouse's current availability (per capacity unit, plus weight and space) and a table of this inbound's HUs. Each unplaced HU gets a **suggested location** from the allocation algorithm (§6.3, "today" mode); the operator can override with any location of that warehouse; HUs with no suitable location are flagged and need a manual choice. "Store N of M" records a `storage` scan for each chosen HU (§6.4). It can be run in several sittings; when every HU is placed the status becomes Put Away.

#### 6.1.7 Stage 6: Complete Inbound (Put Away → Ready)
Final review (customer, supplier, destination, transport info, totals, line table with requested vs received, remarks/ADR, tasks, audit trail). "Complete Inbound" creates the **GRN** if none exists (idempotent, one per inbound; number `GRN-<reference>`, status *Generated*; audit `CREATE_GRN`) and sets status Ready.

#### 6.1.8 Stage 7: Finish (Ready → Completed)
- Shows the GRN with status. **Verify GRN** (approvers only) → GRN status *Verified*, `verified_by` stored (audit `VERIFY_GRN`). Non-approvers see "Waiting for a manager to verify."
- **Both completion buttons require: GRN verified and a recipient email** (prefilled from the customer's email). "Complete Inbound + New" or "Complete Inbound + Return to Dashboard": set status Completed, then send the customer confirmation email (§9). If sending fails the inbound stays Completed and the user may **Send again** or **Continue without email**. "+ New" starts a fresh inbound in the same warehouse.
- Links to the Inbound Summary and Label Overview prints. (The screen text lists "Signed CMR, Photos, Inbound Summary, Label Overview" as attachments, but **no attachments are actually sent**: see §14.)

#### 6.1.9 Inbound record page
Header: reference and, for editable states, the buttons above. Read-only blocks: Customer; Supplier; Destination; Transport information (type, carrier, CMR, ETA); Warehouse & Storage (warehouse, storage period, ADR); Receiving (unloading date/time, plate, driver, pieces counted); **GRN** (number, status, verified by, link to print); **Linked Outbounds** (each outbound this inbound's HUs left on, with "n of N HUs" and Open/Dispatched); summary strip; Line Items table (requested vs received); Handling Units table (HU label, type, contents, weight, size, QR thumbnail, location code/path, outbound link per HU); Documents (thumbnails, lazy-loaded); Tasks; Audit trail. Sidebar: Status card, Inbound Summary (expected colli, received pieces, total packages, total weight, total volume, HUs, pallets, items), Quick actions (Reprint Labels from HU Created onward, Save as Draft, Cancel; the latter two only navigate back, since everything autosaves).

### 6.2 Capacity and availability engine
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

### 6.3 Location allocation (suggestion algorithm)
Greedy, per item, in order, for one warehouse:
1. Start each location with free units = capacity, free weight = max weight (if set), free volume = L×W×H (if set); subtract everything already occupying it during the requested window (HUs in it unless their outbound leaves on/before the start date; reservations overlapping the window).
2. Record which customer each location is dedicated to.
3. For each item pick the **first** location that: is not Blocked; has the same capacity unit as the item's package type; fits the item's dimensions (item sorted dims ≤ location sorted dims, any orientation; missing dimensions don't block); is not dedicated to a *different* customer; has free units ≥ item units; has free weight ≥ item weight and free volume ≥ item volume where those are tracked.
4. Reduce that location's free figures and dedicate it to the customer.
It is not true 3-D bin packing. **Warehouse recommendation** runs the allocation per warehouse and ranks by how many items fit. Put-away reuses it for the real HUs with "today" as the window.

### 6.4 Storage operations and the scan model
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

### 6.5 Outbound
Mirror of Inbound: a read-only record page with one contextual action opening a stage popup.

#### 6.5.1 Request
"+ New Outbound Request" (outbound list; needs a working warehouse): **customer***, transporter (optional), customer reference/PO (optional), requested (pickup) date. Created with status **Submitted** and reference `OB-<year>-<n>` (the *pickup reference*).

#### 6.5.2 Stages (any order before dispatch, except dispatch itself)
| Stage / popup | What happens | Rule |
|---|---|---|
| **Select Goods** | Add/remove HUs of this customer (those not Dispatched/Delivered/Picked and not already on this request), each shown with description, HU no., type, qty, inbound reference and location (or status). Creates `PickTask` (status *Assigned*, assigned_to = current user). | Picked lines cannot be removed. |
| **Pick Goods** | Lines are listed **in walking order** (unpicked first, sorted by location code, "not in a rack: at the dock" last, picked last). **Scan & Pick** (button or camera scan matching the HU QR) performs a `pick` scan and sets the PickTask *Picked*. "n of N picked". | A scan that matches no pending line shows an error. |
| **Driver Check-in** | Records driver name*, driver ID number, phone, vehicle plate*, trailer plate, **arrival time**, and the staff member who checked them in; audit `PICKUP_CHECK_IN`. Editable until dispatch. | Check the driver's ID and Pickup Pass first (instruction on screen). |
| **Dispatch** | Documents and Dispatch Photos upload, driver handover signature (*Driver Signature (Handover)*), vehicle details (default: plate / trailer), **Confirm Dispatch**: a `dispatch` scan per HU (→ Dispatched), a `Dispatch` row (vehicle details, dispatched by, time, status Dispatched), request status → **Dispatched**, audit `DISPATCH_CONFIRMED`, customer email (§9). | **All lines must be picked and the driver checked in.** The email never blocks dispatch; a failure is shown as a warning. |
| **Mark Delivered** | A `delivery` scan for every HU (→ Delivered); audit `DELIVERY_CONFIRMED`. | Only after dispatch. |

The primary action is derived (no stored stage): no lines → *Select Goods*; unpicked lines → *Pick Goods*; all picked, not checked in → *Check Driver In*; checked in → *Dispatch*; dispatched and not all delivered → *Mark Delivered*; all delivered → none. Before dispatch the other stages remain available as secondary buttons (*Edit Goods*, *Pick Goods*, *Driver Check-in*).

#### 6.5.3 Outbound record page
Pickup reference, customer, pickup date/carrier/from-warehouse, driver check-in block, dispatch block, **Linked Inbounds** (inbounds the HUs came from, "n HUs", linked), Goods table (HU, cargo, from inbound (link), location, qty, QR, pick status, HU status), Documents, Tasks, Audit trail. Sidebar: fulfillment status, pickup number/date/created, summary (HUs, picked, sent, delivered x of N), Quick actions: **Print Pickup Pass**, **Print Dispatch Note**, Back to list.

#### 6.5.4 Outbound list
Columns: pickup ref, customer ref, customer, transporter, requested date, **fulfillment status**. Filters: **pickup date chips** (Today (default), Tomorrow, Next 7 days, All dates, Pick dates range), **search** (pickup ref, customer ref, customer, id; searching ignores the date filter so a driver arriving on the wrong day is still found), **Scan pass** (camera; reads `WOMS-OB-<id>` and opens the request; anything else: "is not a Pickup Pass code"), customer, status. Sortable columns.

### 6.6 Deliveries
HUs that have left (status Dispatched or Delivered) with their customer, outbound order, dispatch vehicle/date/by. Tabs **In Transit** / **Delivered**, search, customer filter, dispatched-from/to dates, group by none/customer/order, bulk select on In Transit and **Mark delivered** (delivery scan). The delivered date shown is the HU's last-modified date.

### 6.7 Value-added logistics (VAL)
- **New VAL request:** customer*, cargo* (the customer's HUs), service type* (Inspection, Repacking, Relabelling, Kitting, Quality Check), requested date. Status **Submitted**.
- **Advance button** per row: *Assign* (creates a `VALTask` assigned to the current user, status Assigned; request → Assigned) → *Start* (→ In Progress) → *Complete* (→ Completed).
- Dashboard "Pending VAL" counts requests not Completed. VAL requests are **not warehouse-scoped**. Completing VAL does not change the HU's status or send a notification (see §14). `VALTask.completion_notes` exists but the screen never edits it.

### 6.8 Operational tasks
- **Standalone** (Tasks page): task type/description*, assigned-to (free text, an email), priority (Low/Medium/High, default Medium), due date. Tabs Open / All. Advance: Assigned → *Start* → In Progress → *Complete* → Completed.
- **Attached to a record** (Inbound and Outbound pages): same form, stored with `module_ref` (e.g. "Inbound Operations") and `record_ref_id`. If *assigned-to* is filled, a **TASK_ASSIGNMENT** email is sent to that address (best-effort).
- Visibility: warehouse-scoped; operators see only tasks assigned to their email. Tasks created from the UI **do not set `warehouse_id`**, so non-administrators do not see them (§14).

### 6.9 Documents, photos and signatures
- **Upload:** the client sends the file (limit ≈ 15 MB) with storage area (documents or photos), file name, doc type, linked module, linked record id and uploader email (see *Upload file*, §12). The server stores it under a safe unique name, creates a `Documents` record (`linked_module`, `linked_record_id` as text, `doc_type`, `file_id` = storage key, `uploaded_by`, `uploaded_date`) and writes an audit entry.
- **Tiles:** *CMR upload* (camera photo or file/PDF), *Additional photos* (multiple; camera or file), generic uploader with doc-type drop-down (CMR, Packing List, Delivery Note, Bill of Lading, Commercial Invoice, Photo, Operational Attachment).
- **Signatures:** a 400×150 canvas (mouse or touch) saved as a PNG document of type *Driver Signature (Receiving)* or *(Handover)*; "Re-capture" replaces the view (older rows remain).
- **Display:** images appear inline as thumbnails via the *Get file for display* operation (§12); PDFs open in a viewer/link.
- `linked_module` values in use: `Inbound Operations`, `Inbound Operations Photos`, `Outbound Operations`, `Outbound Operations Photos`, `GRN`.

### 6.10 Audit trail
Rows in `AuditLog` (user, action type, module, record id, JSON details, timestamp) are written by the scan operation, GRN create/verify, accept/reject, pickup check-in, dispatch, delivery, user invitation, uploads and notifications. A reusable **Audit Trail** panel (last 50, newest first) is shown on inbound, outbound and administration pages. Writes are best-effort: an audit failure never blocks the business action. Action types: `RECORD_SCAN`, `CREATE_GRN`, `VERIFY_GRN`, `INBOUND_CONFIRMED`, `INBOUND_REJECTED`, `PICKUP_CHECK_IN`, `DISPATCH_CONFIRMED`, `DELIVERY_CONFIRMED`, `INVITE_USER`, `UPLOAD_DOCUMENT`, `NOTIFY_EVENT`, `GENERATE_QR_CODE`.

---

## 7. Derived ("fulfillment") statuses
Computed on the fly when lists load; never stored.

### 7.1 Inbound fulfillment status
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

### 7.2 Outbound fulfillment status
From the pick lines and their HUs: none → *Requested*; if any HU is Dispatched/Delivered: all Delivered → *Delivered*, all sent → *Sent*, else *Partially Sent*; else all lines Picked → *Picked*; some → *Partially Picked*; none → *Requested*.

### 7.3 Where each status shows
Inbound list: Stage (stored status) + Fulfillment; inbound sidebar: Stage; outbound list/sidebar: fulfillment; storage and delivery pages: HU status badges; customer detail: raw statuses.

---

## 8. Screens and navigation
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

---

## 9. Notifications

### 9.1 Mechanism
Notifications are sent by the *Send notification* operation (§12): one plain-text email per event, with inputs *event type, recipient email, record id, message, module*. **Sender** = a configured address on a verified sender domain. **Subject** = template text for the event type, or the raw event code if the type has no template. **Body** = the message supplied by the caller, else "<subject> (ref: <id>)". Each send is audited (action type `NOTIFY_EVENT`). Notifications are best-effort in the UI: a failure is reported but never blocks the workflow, except the inbound completion email, which offers *Send again* / *Continue without email*.

### 9.2 Event catalogue
Fourteen event templates are defined. **Only three are actually triggered by the application.**

| Event code | Subject | Triggered? | Recipient | Body |
|---|---|---|---|---|
| `TASK_ASSIGNMENT` | New task assigned | **Yes**, when a task attached to an inbound/outbound is created with an assignee | the assignee (email typed in "assigned to") | "New task assigned: <task type>" |
| `INBOUND_COMPLETED` | *(no template; subject shows the code)* | **Yes**, at Finish | the email entered (default: customer email) | "Inbound <reference> has been received and is now in stock." |
| `DISPATCH_CONFIRMATION` | Dispatch confirmation | **Yes**, at Confirm Dispatch, only if the customer has an email | customer email | "Your outbound request #<id> has been dispatched." |
| `TASK_REMINDER`, `TASK_COMPLETION`, `INBOUND_ARRIVAL`, `PENDING_VERIFICATION`, `VAL_ASSIGNMENT`, `DISPATCH_READY`, `OPERATIONAL_EXCEPTION`, `GOODS_RECEIVED_CONFIRMATION`, `GRN_ISSUED`, `VAL_COMPLETION`, `CARGO_READY_FOR_DISPATCH`, `EXCEPTION_NOTIFICATION` | (as named in the function) | **No** (defined, never sent) | | |

No in-app notifications, push, SMS or notification bell exist. Account invitation and password-reset emails are sent by the identity service (§2.2).

---

## 10. Printed documents, reports and dashboard

### 10.1 Printed documents (browser print / save as PDF; each is its own route)
- **Inbound Receiving Advice / Goods Receipt Note** (`/print/inbound/:id`, `/print/grn/:id`; same page, title changes): GRN number (or "not generated yet"), inbound reference, advice number, customer, customer reference, destination, transporter, expected date, status, **Handling Units table** (HU, contents, type, weight, QR).
- **Handling Unit Labels** (`/print/putaway/:id`): a cuttable label per HU: QR code, HU label text (`IB-…-001`) and description. Warns if some HUs lack a QR.
- **Outbound Dispatch Note** (`/print/outbound/:id`): reference, request #, customer, transporter, requested date, status, **pick list** (description, qty, pick status, QR), two signature lines ("Handed over by (warehouse)", "Received by (driver / transporter)").
- **Pickup Pass** (`/print/pickup/:id`): big pickup reference, **QR `WOMS-OB-<id>`**, instruction "Show this pass and photo ID at the gate", customer, customer reference, collect-from warehouse and address, pickup date, carrier, number of HUs, "Goods to collect" table (HU, description, type, from inbound), statement that the driver and vehicle are checked against the pass and goods are released only against the reference.
- In the reference build the GRN is a database record plus the printable page; no PDF is stored. A rebuild should generate and store a PDF per GRN (§12, §15).

### 10.2 Dashboard (every signed-in user)
Greeting and role line; KPI cards (each links to its module and appears only if the user can open it): **Warehouse occupancy** (% of locations in use, "x of y locations"), Today's Inbound (inbounds created today), Today's Outbound (outbound requests created today), Cargo in Warehouse (HUs not Dispatched/Delivered), Pending Tasks (not Completed), Pending VAL (not Completed), Customers (total). Counts are warehouse-scoped except Customers and VAL.

### 10.3 Reports (Reports & Dashboards)
Two tabs only: **Cargo Register** (customer, description, qty, status, location code, QR for every HU in the viewer's warehouses; each row opens the HU lifecycle timeline) and **Dispatch Report** (outbound request, customer, vehicle, dispatched by, dispatch date, status). The other planned reports are not built (§14).


---

## 11. Data model

The model has **28 entities** (tables or collections). Types are generic: `string(n)`, `text`, `integer`, `decimal`, `boolean`, `date`, `datetime`, and `reference → Entity` (a foreign key). Every entity also has an implicit primary key `id` plus `createdAt`, `updatedAt` and `createdBy`. "Cascade" means deleting the referenced record deletes this record too; "set null" means the reference is cleared. The definitions in §11.4 were generated from the working system, so they are exact.

### 11.1 Entity overview
```
Warehouses ─< Zones ─< Aisles ─< Racks ─< StorageLocations
     │
     ├─< InboundAdvice >─ Customers ─< Contacts
     │        │   └─ Suppliers, Transporters
     │        ├─< InboundLine (the plan) ─┐
     │        ├─< GRN                     │ HuLine (many-to-many: which line, how many, in which HU)
     │        └─< Cargo  (= Handling Unit, has qr_code) ─┘
     │                 │      ├─ current_location_id → StorageLocations
     │                 │      ├─< CargoMovementLog, ScanHistory
     │                 │      ├─< PickTask >─ OutboundRequest ─< Dispatch
     │                 │      └─< VALRequest ─< VALTask
     ├─< OutboundRequest >─ Customers, Transporters
     └─< Tasks (generic; link to any record via module_ref + record_ref_id)

Documents (linked_module + linked_record_id → any record)      AuditLog (module + record_id → any record)
AppUsers ─< UserWarehouseRole >─ Warehouses        RolePermissions (role × module)      PackageTypes (capacity master)
```
The entity `Cargo` is the **Handling Unit**; a rebuild may name it `HandlingUnit`.

### 11.2 Status vocabularies stored in the data
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

### 11.3 Notes on specific columns
- `InboundAdvice`: `reference_number` = the customer's PO/reference; `reference_client` = a second client-side reference; `inbound_reference` = WOMS reference (`IB-…`); `expected_colli` = total packages announced; `received_piece_count` = pieces counted at the dock (a manual figure checked against received quantities); `storage_start_date/storage_end_date` = expected storage period; `adr_status` = dangerous-goods flag (Yes/No); `rejection_reason` is set on reject. `transport_details` is a legacy free-text field.
- `InboundLine.qty` = number of **packages** (not inner pieces); `received_qty` = packages actually received.
- `Cargo` (HU): `outer_package_no` is the HU number within its inbound; `qty`/`received_qty` = packages packed in it; `unit` = HU type; `current_location_id` = where it is now (null when not in a rack); `reserved_location_id` exists but is **no longer written**; `dimensions` is a legacy display string; `description` is generated from contents.
- `Documents.file_id` holds the **storage key**; the reference build did not record which storage area (documents or photos) held the file, so retrieval tried both. A rebuild should record the area.
- `AuditLog.details` is a JSON string. `Tasks.assigned_to` is free text (an email by convention).
- Unused or legacy columns: `AppUsers.warehouse_id` (superseded by `UserWarehouseRole`), `RolePermissions.function_name` and `.warehouse_id` (the matrix is module-level only), `GRN.document_id`, `VALTask.completion_notes`.
- **Delete behaviour to preserve or reconsider:** deleting a **Customer** cascades to its contacts, inbounds, lines, HUs, outbounds, pick tasks and VAL requests. Deleting a **Warehouse** cascades to zones → aisles → racks → locations and to `UserWarehouseRole`, and sets `warehouse_id` to null on operational records. Deleting an HU cascades to its `HuLine` rows. Deleting a location nulls HU `current_location_id`.

### 11.4 Entity definitions (generated)

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


## 12. Server operations required

Every operation below must **require an authenticated user** and check that user's role and warehouse. Business operations not listed here (create/read/update/delete of the entities in §11, scans, GRN creation and verification, accept/reject, dispatch, delivery) are ordinary API endpoints whose behaviour is fully described by the workflows in §6 and the rules in §13; in the reference application they were performed directly from the browser, which a rebuild should replace with server endpoints.

| Operation | Inputs | Behaviour | Result |
|---|---|---|---|
| **Upload file** | file content, file name, storage area (*documents* or *photos*), doc type, linked module, linked record id | Reject files over the size limit (reference: 15 MB). Store the file under a unique name (`<module>-<record id>-<timestamp>-<file name>`) in private storage, create a `Documents` record (linked module, linked record id as text, doc type, storage key, uploader email, upload time) and write an audit entry. | storage key, document id |
| **Get file for display** | storage key (and, ideally, the storage area) | Return the file inline when small (reference: ≤ 4 MB) so it can be shown directly, otherwise a **signed link** valid for a short time (reference: 1 hour). 404 if not found. | content type + data, or link |
| **Send notification** | event type, recipient email, optional record id, message, module | Send one plain-text email from the configured sender using the event's subject (§9), then write an audit entry. | event, recipient, subject |
| **Invite user** | first name, last name (optional), email, access level (*System Administrator* or *Warehouse Staff*), assignments `[ {warehouse, role} ]` | Caller must be an **active System Administrator**. Staff need at least one assignment, one per warehouse. Create the account and send the invitation email; create the application profile (`AppUsers`, status Active) and one `UserWarehouseRole` per assignment; write an audit entry. | email, access level, account id |
| **Write audit entry** | action type, module, record id, details | Append to the audit log; the user comes from the session, never from the request body. | – |
| **Generate GRN document** *(recommended; not in the reference build)* | inbound id | Produce and store a PDF of the Goods Receipt Note, link it from the GRN and Documents records. | file reference |

**Configuration values:** sender email address for notifications; upload size limit; inline-file size limit; signed-link lifetime.

---

## 13. Business rules catalogue
Numbered so tests and tickets can reference them. **All rules must be enforced on the server**; the reference build enforced most of them only in the browser.

### Access
- **R-A1** A user without an active application profile (or with status Inactive, or a staff user with no warehouse assignment) has no access.
- **R-A2** Module access is the union of the modules granted to the user's roles (§3.3). Anything outside it is refused.
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
- **R-C1** Available = Total − Occupied − Committed (§6.2); occupancy is derived from HU locations, never stored.
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
- **R-D1** References (`IB-`, `OB-`) and GRN numbers follow the formats in §4.2; HU numbers are sequential per inbound.
- **R-D2** Optional numeric/date fields are null when empty; timestamps are UTC.
- **R-D3** Every status transition that matters writes an audit row; an audit failure never blocks the business action.

### Notifications
- **R-N1** Notifications are best-effort and never roll back the operation that caused them (§9).
- **R-N2** The completion email recipient defaults to the customer's email and must be non-empty to finish an inbound.

---

## 14. Known gaps, defects and risks of the reference build
Use this section to decide what to build better, not to copy.

### 14.1 Specified in the product documents but not built
1. **Multiple physical receipts per inbound**, each with its own GRN, driver, condition and photos; running received/remaining totals; a real *Partially Received* state; "close short". Today one inbound = one receipt = one GRN.
2. **Permanent location QR labels** and the "scan HU → scan location → confirm" put-away; only HU QR exists.
3. **Handheld (PDA) screens** (6-step inbound flow etc.); the app is merely responsive.
4. **Reports:** 2 of the 9 planned (inbound, occupancy, HUs, tasks, VAL are missing); no exports.
5. **Notifications:** 11 of the 14 defined events are never sent; no in-app notifications.
6. **Customs** status/MRN, per-line hazardous class and UN number, Excel import of lines, receipt condition/damage capture, exception handling.
7. **Dashboards** as in the design mockups (status tiles per stage, quick actions, notification bell).
8. **Customer portal**, SKU/batch/serial inventory, billing, transport planning, multi-tenancy (excluded or future).
9. An HU occupying **several locations**; **partial dispatch inside one outbound request** (an inbound's HUs *can* leave across several outbounds; a single request dispatches all its lines at once).
10. Role gating for **Outbound, Storage, VAL and Tasks** beyond module/warehouse access; deactivating users from the UI.

### 14.2 Security and integrity risks to avoid
1. **Rules enforced in the browser** (§2.3): a direct API caller could bypass role checks, status transitions and warehouse scoping.
2. **Server operations that accepted anonymous callers**: file upload/retrieval (with elevated storage rights), email sending and audit writing must all require a signed-in user and check ownership/warehouse.
3. **Permissions not matched to the workflow.** In the reference build, ordinary staff roles lacked write access to some records the workflow needs (line items, Handling Unit contents, GRN, audit entries), so the inbound flow only worked for administrators. In a rebuild, grant each role exactly the writes its workflow steps need and **test every workflow as a non-administrator** (acceptance scenario H, Appendix B).
4. **Deleting a customer or warehouse cascades** to all dependent history with only a generic confirmation; prefer soft delete or block deletion of records with history.
5. A single HU can be added to more than one outbound request (no uniqueness rule); the capacity "expected release" can then over-count.

### 14.3 Functional defects found while documenting
1. **Tasks created in the app have no warehouse**, so non-administrators (whose lists are warehouse-filtered) never see them; only administrators do.
2. **VAL** requests are not warehouse-scoped; completing VAL does not change the HU's status (the `In VAL` scan context is never used) and sends no notification.
3. The Finish screen says the confirmation email carries *Signed CMR, Photos, Inbound Summary and Label Overview*; **the email is a single line of text with no attachments**.
4. The inbound-completion email has no subject (its subject is the raw event code). The dispatch email quotes an internal id, not the pickup reference, and omits driver, vehicle, time and goods.
5. The GRN is only a record plus a printable page; no PDF is stored. The same page serves as both inbound summary and GRN.
6. Accepted-but-not-arrived inbounds reduce availability on **every** day of the projection, not from their arrival date; dashboard totals add different capacity units together (the per-unit table is reliable); the "Other" capacity unit has no locations; package types are global (not per customer) and their standard dimensions are unused.
7. Reference numbers were derived from the record id, not a true per-year sequence.
8. Unused or legacy fields: `Cargo.reserved_location_id`, `GRN.document_id`, `RolePermissions.function_name/warehouse_id`, the legacy `AppUsers.warehouse_id`, `InboundAdvice.transport_details`.

### 14.4 Design lessons from operating the reference build
- **Latency compounds.** Screens that issued many sequential or parallel round trips felt slow. Aim for one request per screen, cache reference lists (customers, warehouses, locations, package types, permissions) briefly, load below-the-fold sections (documents, tasks, audit) only when scrolled into view, and update the screen optimistically after a save.
- **Stale front-end builds.** If the host serves the app's HTML with a long cache lifetime, users keep running old code after a release. Use short/no-cache HTML with hashed assets, or have the app check for a newer build and reload at most once per several minutes.
- **Sign-in redirects.** Make the post-login destination explicit and absolute-path based; never let the app load inside another page's frame; detect repeated login-page loads and stop with an on-screen explanation instead of looping.

---

## 15. Guidance for building WOMS on another platform

### 15.1 What to keep
- The **plan/physical split** (`InboundLine` ↔ `HuLine` ↔ HU) and HU-level tracking of everything.
- The **status vocabularies** (§11.2) and the derived fulfillment statuses (§7), including the record-page pattern "one contextual action opens one stage popup" for both inbound and outbound.
- The **capacity maths** (§6.2), the **allocation rules** (§6.3) including customer-dedicated locations, and the **scan model** (§6.4) with `ScanHistory` + `CargoMovementLog`.
- The **role model**: global System Administrator, per-warehouse Manager/Supervisor/Operator, module-level permission matrix, the "approver" concept.

### 15.2 What to improve
1. Put all business rules (§13) in a **server API**; add authorization to every endpoint.
2. Use a **per-year sequence** for references, and enforce that an HU can be on at most one open outbound.
3. Implement **multiple receipts per inbound**, a **GRN per receipt** (with generated PDF), a *Partially Received* state, receiving exceptions (damage/condition/photos), and **location QR** put-away.
4. Complete the **notification set** (14 events) with proper templates, attachments and recipients (customer contacts), and an in-app notification centre.
5. Add the missing **reports** and exports, role-gating for outbound/storage/VAL, task warehouse assignment, VAL ↔ HU status linkage, user deactivation.
6. Soft-delete (or block deletion of) customers and warehouses that have history.

### 15.3 Platform checklist
| Need | Requirement | Examples of how it can be met |
|---|---|---|
| Accounts, invitations, password reset, sessions | §2.2 Identity | Any identity service (OIDC provider, or the platform's built-in users) |
| Relational data with cascade/set-null, unique constraints | §2.2, §11 | PostgreSQL/MySQL, or a platform database with relationships |
| Private files with signed access | §2.2 | S3-compatible bucket, or the platform's storage with file permissions |
| Server endpoints / functions | §2.3, §12 | REST/GraphQL service, or serverless functions |
| Transactional email | §9 | SMTP/SES/SendGrid or the platform's messaging |
| QR create/scan, print | §2.1 | Browser libraries (no server needed) |
| Hosting of the web app | §2.1 | Any static or server host |

### 15.4 Notes if the target is Appwrite (verify against its current documentation)
- **Users and roles:** Auth users with *labels* for the global level (System Administrator vs Warehouse Staff) and one **Team per warehouse** with team roles (Manager/Supervisor/Operator) – this maps the per-warehouse role model directly and lets document permissions use team roles.
- **Data:** one **collection per entity** in §11 with the listed attributes, *relationship* attributes for the references (choose cascade for "on delete cascade" and set-null for "on delete set-null"), unique indexes for the unique fields, and a `warehouse` attribute on every operational record so permissions/queries can scope by warehouse.
- **Permissions:** set document-level permissions from the warehouse team (read for the team; write per role) *and* enforce the rules in functions; do not rely on client-side checks.
- **Computed data:** document databases offer limited joins/aggregation, so compute **capacity/availability, allocation suggestions, derived fulfillment statuses and dashboard counts in Functions** (or maintain counters), and return ready-to-display results.
- **Files:** two Storage buckets (documents, photos) with encryption, private by default; serve through short-lived URLs from a function that checks the caller's warehouse.
- **Email:** Messaging with an email provider; invitation via Teams membership invitations or the *Invite user* function (§12).
- **Order of work:** identity and teams → masters and warehouse structure → inbound request and availability check → receiving, HU creation, labels, put-away → GRN, completion, notifications → storage operations → outbound → VAL and tasks → reports/dashboard → items in §14.1.

### 15.5 Suggested build order (any platform)
1. Auth, users, roles, warehouses, masters. 2. Warehouse structure and package types. 3. Inbound request + availability check (capacity engine). 4. Receiving, HU creation, labels, put-away (scan model). 5. GRN, completion, notifications. 6. Storage operations. 7. Outbound with pickup pass, pick, check-in, dispatch, delivery. 8. VAL and tasks. 9. Reports, dashboard, audit views. 10. The "not built" items in §14.1.

---

## Appendix A: Seed data

### A.1 Package types (`PackageTypes`)
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

### A.2 Role permissions
The 34-row matrix is in §3.3 (role × module; the `function_name` and `warehouse_id` columns of the permissions table are unused).

## Appendix B: Acceptance scenarios
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

