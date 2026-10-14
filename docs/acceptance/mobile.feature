# Source: Appendix C scenario L. Status: PLANNED (spec section 11). Run on a real mid-range phone with the PWA installed.
Feature: Mobile floor workflows with offline tolerance
  @L @R-M1 @R-M2
  Scenario: Receive, label and put away offline, then sync
    Given the app is installed to the home screen and the sync indicator shows online
    When I put the device in airplane mode
    And I receive an inbound (plate, driver, counts, 3 photos, a document scan, signature)
    Then the status shows "Received (pending sync)"
    When I create 5 HUs and print or produce label PDFs
    And I put away the 5 HUs by scanning each HU then its location
    Then a wrong location prompts and a location dedicated to another customer is refused with a reason
    When connectivity returns
    Then the outbox synchronises in order, with no duplicate records, and photos upload
    And the inbound is "Put Away" and looks the same on desktop

  @L @R-M4
  Scenario: Online-only operations
    Given the device is offline
    When I try to confirm dispatch
    Then it is refused with a message that a connection is needed

  @L
  Scenario: Pick and dispatch on mobile
    Given an outbound request
    Then the pick list is in walking order
    When I scan a wrong HU
    Then it is rejected
    When I scan the Pickup Pass at the gate, check in the driver and capture the signature
    And a supervisor confirms dispatch online
    Then the request is "Dispatched"

  @L
  Scenario: Hardware scanner
    Given a keyboard-wedge scanner
    Then it works on every scan screen

  @L @R-A2
  Scenario: Operators cannot reach restricted screens
    Given I am signed in as an Operator
    Then billing, settings and approval screens are refused even by URL

  @L @R-M3
  Scenario: Conflicting offline relocations
    Given two devices relocate the same HU while offline
    When both synchronise
    Then the later confirmed scan wins
    And the other user sees a readable message in "Sync issues"

  @L @R-M6
  Scenario: Photos are never lost
    Given 200 photos captured offline
    When connectivity returns
    Then all upload, with automatic retry of failures
