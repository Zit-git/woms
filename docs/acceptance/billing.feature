# Source: Appendix C scenarios J and K. Status: PLANNED features; implement after Phase 0 (spec section 18.2).
# Sample: customer ACME, rate card effective 1 March: storage 0.85 per pallet position per day, 3 free days per HU,
# receiving 4.00 per pallet, dispatch 2.50 per pallet, minimum monthly charge 250.
Feature: Billing, from occupancy to approved invoice
  @J @R-B1 @R-B2 @R-B3 @R-B5 @BB-2 @BB-4
  Scenario: Month of storage
    Given 20 pallets of ACME put away on 1 March and dispatched together on 18 March
    When the occupancy snapshot has run for every day of March
    Then each pallet has 17 occupancy days (1-17 March), of which 14 are billable
    And no occupancy exists from 18 March
    When I create an invoice run for March
    Then the proposal for ACME has Storage 238.00, Receiving 80.00, Dispatch 50.00 and subtotal 368.00
    And the variance against the previous period is shown

  @J @R-B2
  Scenario: Snapshot re-run is idempotent
    When I re-run the snapshot for 5 March
    Then no duplicate occupancy rows exist

  @J @R-B1
  Scenario: Missing rate blocks approval
    Given a pallet stored in a zone with no applicable rate line
    Then the run flags it as unbilled
    And approval is blocked until a rate is added or the charge is waived with a reason

  @J @BB-13
  Scenario: Disputed charge
    When I mark one charge event as disputed
    Then it is excluded from the proposal
    When the dispute is resolved
    Then it is included again

  @J @R-B3 @R-B5
  Scenario: Approval locks usage and enforces separation of duties
    Given separation of duties is on
    Then the creator of the run cannot approve it
    When another officer approves
    Then occupancy rows and events become locked and editing them is refused
    And a later correction appears as an adjustment line in the next run

  @K @R-B4 @BB-12
  Scenario: Push to Zoho Books is idempotent
    Given a connected Zoho Books organisation and mapped customer, items and taxes
    When I push the approved proposal
    Then a draft invoice exists in Zoho Books with reference "WOMS-<run>-<customer>", three lines and the usage statement attached
    And the proposal shows invoice number, status and link
    When I push again
    Then no second invoice is created
    When the first push timed out after the invoice was created and I retry
    Then the existing invoice is adopted

  @K
  Scenario Outline: Blocking conditions
    Given <condition>
    When I push the proposal
    Then the push is blocked with the message "<message>"
    Examples:
      | condition                   | message                         |
      | the customer is not linked  | customer has no Zoho Books link |
      | a charge type is unmapped   | charge type has no Zoho item    |

  @K
  Scenario: Status and payments are read back
    When the invoice is sent and paid in Zoho Books and the sync runs
    Then WOMS shows "sent" and later "paid" with balance 0
    When an invoice passes its due date
    Then WOMS shows "overdue" and raises INVOICE_OVERDUE

  @K
  Scenario: Token revoked
    When the Zoho Books token is revoked
    Then the connection shows "Needs re-authorisation" and administrators are notified
    And no data is lost and pushes resume after reconnecting
