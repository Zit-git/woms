# Source: Appendix C scenario G.
Feature: Outbound, from pickup request to delivery
  @G @R-O1 @R-O2 @R-O3 @R-O4 @R-C6
  Scenario: Pick, check in, dispatch, deliver
    Given I am signed in as a Warehouse Manager of "Rotterdam DC2"
    And two stored HUs of customer X
    When I create an outbound request for customer X, requested date tomorrow, with a PO reference
    And I add the two HUs
    Then "Dispatch" is disabled
    When I pick each line by scanning its HU
    And I check in the driver with name and vehicle plate
    And I enter vehicle details and confirm dispatch
    Then the request is "Dispatched", both HUs are "Dispatched" and have left their locations
    And occupied positions in availability decrease by 2
    And the customer is emailed if an address exists
    When I mark the request delivered
    Then the HUs are "Delivered" and appear under Delivered in Deliveries

  @R-O1
  Scenario: Only a customer's own free HUs can be added
    Given HUs of customer X that are Picked, Dispatched or on another open request
    Then they are not offered when creating a request for customer X
    And HUs of customer Y are never offered

  @R-O5
  Scenario: A picked line cannot be removed
    Given an outbound request with a picked line
    When I try to remove that line
    Then it is refused
