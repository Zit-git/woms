# Source: Appendix C scenarios H and I.
Feature: Access control and regression
  @H @R-A1 @R-A2 @R-A3 @R-A4
  Scenario: Per-warehouse roles
    Given an administrator invites a staff user as Manager in warehouse A and Operator in warehouse B
    When that user signs in
    Then only warehouses A and B appear in lists and pickers
    And approve actions show on A's inbounds and not on B's
    And opening a record of a third warehouse is refused
    When administrator changes and then removes that user's warehouses
    Then the user's access changes accordingly

  @H @non-admin
  Scenario Outline: Every workflow works for non-administrators
    Given I am signed in as the non-administrator from the previous scenario
    When I run scenario "<scenario>" where my role allows it
    Then no step fails for lack of write permission
    Examples:
      | scenario                          |
      | A request                         |
      | B availability check              |
      | C receive                         |
      | D handling units                  |
      | E put-away                        |
      | F complete                        |
      | G outbound                        |

  @R-A1
  Scenario: Inactive or unassigned users have no access
    Given a user whose status is Inactive, or a staff user with no warehouse assignment
    Then every request from that user is refused

  @I
  Scenario: Legacy statuses
    Given an inbound stored with status "Pending" or "Submitted"
    Then it appears as "Requested" and offers its actions

  @I
  Scenario: Reload keeps state
    Given an inbound in the middle of a flow
    When the page is reloaded
    Then status, lines, HUs and documents are unchanged
