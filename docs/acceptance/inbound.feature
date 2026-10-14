# Source: WOMS-functional-spec.md Appendix C, scenarios A-F. Platform-neutral Gherkin; bind the steps to your stack.
# Sample data: warehouse "Rotterdam DC2"; lines (1) 40 Cartons "Cotton T-shirts" 12 kg 60x40x40,
# (2) 20 Cartons "Denim jeans" 15 kg 60x40x40, (3) 10 Boxes "Spare parts" 8 kg 40x30x30.
Feature: Inbound, from request to completion
  Background:
    Given I am signed in as a Warehouse Manager of "Rotterdam DC2"

  @A @R-I1 @R-I2 @R-I3 @R-I4
  Scenario: Request validation
    When I start a new inbound for a customer, a supplier, a carrier, destination "Rotterdam DC2", transport "Road Freight", CMR number
    And I set the ETA to yesterday
    Then saving fails with an error about the past date
    When I set the ETA to tomorrow
    Then it is accepted
    When I set storage-from earlier than the ETA
    Then I get an error
    When I set storage-to before storage-from
    Then I get an error
    When I set a valid period from tomorrow to about one month later
    And I add the 3 line items
    And I set Expected Colli to 60
    Then I see that the line items add up to 70 and am offered "Set to 70"
    When I accept the correction and finish the wizard
    Then the inbound has status "Requested", 3 lines, and the actions "Availability Check" and "Edit Request"

  @B @R-I6 @R-I7 @R-C1
  Scenario: Availability check and acceptance
    Given a "Requested" inbound
    When I open the availability check
    Then there is one row per day with increasing dates and a "Required" row
    When I change the warehouse
    Then the table updates and other warehouses are compared
    When I accept
    Then the status is "Confirmed" and the action "Mark as Received" is offered
    When I edit a Confirmed inbound and confirm the prompt
    Then it returns to "Requested"

  @B @R-I6
  Scenario: Rejection needs a reason
    Given a "Requested" inbound
    When I reject without a reason
    Then it is refused
    When I reject with a reason
    Then the status is "Rejected" and the reason is stored

  @C @R-I8
  Scenario: Receive
    Given a "Confirmed" inbound
    Then "Mark as Received" is disabled until unloading date, time, piece count, plate, driver and signature are provided
    When I upload a CMR photo, an extra photo and a drawn signature
    And I receive 38 of line 1, 20 of line 2, 10 of line 3
    And I enter piece count 70
    Then a warning compares it with 68 and does not block
    When I set 68 and mark as received
    Then the status is "Received" and the lines show received 38, 20, 10
    And the documents card shows previews

  @D @R-I9 @R-I10
  Scenario: Handling Units
    Given a "Received" inbound
    Then each line shows "Received" and "Left to pack"
    When I split line 1 into 19 on each of 2 identical Pallets
    And I combine lines 2 and 3 on one Pallet
    Then "Left to pack" is 0 everywhere
    When I try to pack more than left to pack
    Then it is blocked with a message
    When I continue
    Then the status is "HU Created", there are 3 HUs each with a unique QR, and labels can be printed

  @E @R-I11 @R-C2 @R-C3
  Scenario: Put-away
    Given an inbound in status "HU Created"
    Then each HU has a suggested location in a suitable zone
    When I store 3 of 3 HUs
    Then the status is "Put Away" and the record shows the locations
    And occupied pallet positions in availability increase by 3

  @F @R-I12 @R-I13 @R-A5
  Scenario: Complete the inbound
    Given an inbound in status "Put Away"
    When I complete the inbound
    Then a GRN is generated and the status is "Ready"
    When I verify the GRN, enter a recipient email, and finish
    Then the status is "Completed" and the completion email is sent
    And only a System Administrator can edit a Completed inbound
