# AGENTS.md: how to build WOMS from this specification

Read this first. It tells an AI coding agent (or a new developer) what to read, in what order, and which rules never to break.

## What is here
| File | Purpose |
|---|---|
| `WOMS-functional-spec.md` | The specification (v2.0, ~35,000 words). Source of truth for behaviour. |
| `WOMS-functional-spec.docx` | The same content for human readers. Do not use it as input. |
| `schema/woms-schema.yaml` | All 47 entities, fields, types, references and delete behaviour. Source of truth for the data model. |
| `schema/woms-schema.sql` | The same schema as PostgreSQL DDL, a starting point (add indexes, review types). |
| `schema/generate.py` | Regenerates both schema files from spec §9.6 and §9.7. Run it after changing those sections. |
| `acceptance/*.feature` | Gherkin acceptance tests (spec Appendix C). Bind the steps to your stack; they define "done". |

## Ground rules (do not break)
1. **Status matters.** Anything marked **Planned** or **proposed** (billing, Zoho Books, mobile PWA, multi-receipt, location QR…) is design, not proven behaviour. Build it only when asked, and never treat it as settled until the open decisions in §18.3 are answered by the owner.
2. **WOMS is not a SKU system.** The unit of tracking is the Handling Unit (HU). Do not add product masters, batches or serial numbers (§1.1, §1.3).
3. **Plan versus physical split.** `InboundLine` (plan) ↔ `HuLine` ↔ `Cargo` (the HU, physical). Occupancy is derived from HU locations and never stored as a counter (§9, R-C1).
4. **Enforce rules on the server.** Every rule in §15 must be checked by the server API with the caller's role and warehouse. Never rely on client checks (§16.2, §17.2).
5. **Grant roles exactly the writes their workflow needs**, then run every scenario as a non-administrator (`acceptance/access.feature`).
6. **Do not copy the known defects** in §17.3.
7. **Zoho Books details must be verified** against current Zoho documentation before use (§13).
8. Money is a decimal with a currency code. Timestamps are UTC. Optional fields are null, never empty strings (§16.6).
9. Ask the owner when the spec has an open decision (§18.3) or two sections disagree. Do not guess.

## Build order and what to read
| Step | Build | Read |
|---|---|---|
| 0 | Identity, server API skeleton, audit log, permissions, warehouses, zones/aisles/racks/locations, master data | §2, §3, §6, §16, §9.2, `schema/` |
| 1 | Capacity and availability engine, allocation suggestions | §7.2, §7.3, §8 |
| 2 | Inbound: request → availability check → receive → HUs → put-away → GRN → complete | §7.1, §10.7–10.12, §15 (Access, Inbound, Capacity), `acceptance/inbound.feature` |
| 3 | Storage operations and the scan model | §7.4, R-C4 |
| 4 | Outbound: request, pick, pickup pass, check-in, dispatch, delivery | §7.5, §7.6, `acceptance/outbound.feature` |
| 5 | Notifications (email first), documents and printed output | §12, §14.1, §7.9 |
| 6 | VAL, tasks, reports and dashboards | §7.7, §7.8, §14 |
| 7 | **Mobile PWA** (needs the owner's confirmation of §18.3 OD-10, OD-11) | §11, `acceptance/mobile.feature` |
| 8 | **Billing and Zoho Books** (needs OD-2 to OD-6) | §1.7, §13, §10.18, `acceptance/billing.feature` |

Steps 7 and 8 may run in parallel after step 4. Mobile receiving should follow the multi-receipt work (D-10 in §18.1).

## Working method
- Read the section for the step, the matching entities in `schema/woms-schema.yaml`, and the matching `.feature` file, then implement and make the scenarios pass before moving on.
- Use IDs for traceability: reference rule IDs (R-…, BB-…), feature IDs (F-…), journey IDs (J…), mobile workflows (M-…) and backlog IDs (D-…) in commits and tests.
- Keep the spec current: if you change behaviour, update the Markdown first, then regenerate the schema (`python3 schema/generate.py`).
- Keep the product generic: no customer branding in code, data or text.

## Where things are in the spec
Business requirements §1 · Users §2 · Roles and permissions §3 · Journeys §4 · Features §5 · Master data §6 · Workflows §7 · Derived statuses §8 · Data model §9 · User interfaces §10 · Mobile §11 · Notifications §12 · Settings, billing, Zoho Books §13 · Documents, dashboards, reports §14 · Business rules §15 · Platform and NFRs §16 · Known limitations §17 · Backlog and roadmap §18 · Appendices A (glossary) B (seed data) C (acceptance scenarios) D (traceability).
