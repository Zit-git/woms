# WOMS test journey (inbound -> storage -> outbound)

Site: the legacy `/app/` link (or Slate once the latest commits are pushed). Sign in as the System Administrator.
For anything that fails, send: the step ID, a screenshot, and the exact message shown.

Sample data used below: warehouse Rotterdam DC2; any customer; any supplier and carrier.

| Line | Unit | Description | Qty | Weight/pkg | L x W x H (cm) |
|---|---|---|---|---|---|
| 1 | Carton | Cotton T-shirts | 40 | 12 | 60 x 40 x 40 |
| 2 | Carton | Denim jeans | 20 | 15 | 60 x 40 x 40 |
| 3 | Box | Spare parts | 10 | 8 | 40 x 30 x 30 |

## A. Request

- [ ] A1 Inbound Operations -> **+ New Inbound**: the Request popup opens by itself.
- [ ] A2 Fill customer, supplier, carrier, destination, Transport Type = Road Freight, CMR = CMR-1001.
- [ ] A3 Date rules: ETA = yesterday -> red error and not saved. ETA = tomorrow -> accepted. Storage From earlier than ETA -> error. Storage To before From -> error. Then set From = tomorrow, To = about a month later.
- [ ] A4 Add the 3 lines. Expected Colli = 60 -> red message "line items add up to 70"; click **Set to 70**.
- [ ] A5 **Done**: the page lists the 3 lines, status Requested, buttons **Availability Check** and **Edit Request**.
- [ ] A6 **Edit Request**: change line 2 quantity to 22 and back to 20 (Expected Colli stays 70). Page shows the change after Done.

## B. Availability check and accept

- [ ] B1 **Availability Check**: one row per day, dates increase day by day, a "Required" row on top, no red cells.
- [ ] B2 Change the warehouse in the selector: the table updates and the comparison table below lists the other warehouses.
- [ ] B3 **Accept**: status Confirmed, button "Mark as Received", plus Edit Request.
- [ ] B4 Edit Request on the Confirmed inbound: a prompt says it returns to Requested; confirm, then Done. Status is Requested; accept again.

## C. Receive

- [ ] C1 **Mark as Received** is disabled until the unloading date/time, piece count, plate, driver and signature are done.
- [ ] C2 Upload a CMR photo, upload an extra photo, draw and save the signature: each appears on screen as a thumbnail right after saving.
- [ ] C3 Set line 1 received quantity to 38. Piece count 70 -> small warning that it differs from the received quantities (68). Set piece count 68.
- [ ] C4 **Mark as Received** finishes within a few seconds. Status Received; Line Items show received 38 / 20 / 10.
- [ ] C5 The Documents card on the inbound page shows previews of the signature, CMR and photo.

## D. Handling Units

- [ ] D1 **Create Handling Units**: lines show Received and "Left to pack".
- [ ] D2 Split a line: type Pallet, line 1 = 19, identical HUs = 2, **Add Handling Unit** (weight and size prefill). 2 HUs created.
- [ ] D3 Combine lines: Pallet, line 2 = 20 and line 3 = 10, add. 1 HU created. "Left to pack" is 0 everywhere.
- [ ] D4 Over-pack check (before D2): try line 1 = 30 with 2 identical HUs -> blocked with a message. Delete a HU and recreate it.
- [ ] D5 **Continue to Put-away**: status HU Created. The detail view shows 3 HUs with their contents; **Print Labels** opens QR labels.

## E. Put away

- [ ] E1 **Put Away**: each HU gets a suggested location in Zone A (codes like RT2-A1-R01-B1-L2).
- [ ] E2 **Store 3 of 3**: status Put Away; the detail view shows the locations.
- [ ] E3 Warehouse Management -> Availability: occupied pallet positions went up by 3.

## F. Complete

- [ ] F1 **Complete Inbound**: GRN generated; status Ready.
- [ ] F2 **Finish**: verify the GRN, enter an email, complete (or continue without email). Status Completed.
- [ ] F3 Completed inbound: an **Edit** button is available to the administrator.

## G. Outbound

- [ ] G1 Outbound Operations -> **+ New Outbound Request**: same customer and warehouse, requested date tomorrow, reference PO-1001.
- [ ] G2 Open it, **+ Add Pick Line**: the list shows the stored HUs with contents and locations. Add two.
- [ ] G3 **Confirm Dispatch** is disabled until every line is picked. **Scan & Pick** each line.
- [ ] G4 Enter vehicle details, **Confirm Dispatch**: request Dispatched, the HUs leave their locations.
- [ ] G5 Availability tab: occupied went down by 2.
- [ ] G6 **Mark Delivered**; Delivery page, Delivered tab lists them.

## H. Access (needs a second email address)

- [ ] H1 Administration -> **Invite User**: Warehouse staff, Manager in Rotterdam DC2 and Operator in Hamburg DC.
- [ ] H2 Sign in as that user: only those two warehouses appear. Approve buttons show for DC2 inbounds, not Hamburg's.
- [ ] H3 Open an Antwerp inbound link: "You don't have access to this warehouse's records."
- [ ] H4 Back as administrator: **Manage access** can add, change and remove that user's warehouses.

## I. Regression

- [ ] I1 An older inbound with status Pending shows an action button and Edit Request.
- [ ] I2 Reload the page mid-flow: status, lines, HUs and documents are all still there.
