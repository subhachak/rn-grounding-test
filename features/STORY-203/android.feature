@story:STORY-203 @platform:android
Feature: Making a contribution
  As a Premier member
  I want to contribute to a plan from the app
  So that I can grow my retirement savings between paychecks

  @persona:entitled
  Scenario: A Premier member contributes a quick amount
    Given the login screen is displayed
    When I enter username "member.entitled"
    And I enter password "Harbor123!"
    And I tap Log In
    Then the home screen is displayed
    When I tap Contribute
    Then the contribute form is displayed
    When I select amount "250"
    Then the contribute summary is displayed
    When I tap Submit contribution
    Then the confirmation title is displayed
    And the confirmation reference is displayed
    When I tap the confirmation done button
    Then the home screen is displayed

  @persona:entitled
  Scenario Outline: Each quick amount fills in the summary
    Given the login screen is displayed
    When I enter username "member.entitled"
    And I enter password "Harbor123!"
    And I tap Log In
    Then the home screen is displayed
    When I tap Contribute
    And I select amount "<amount>"
    Then the contribute summary is displayed

    Examples:
      | amount |
      | 100    |
      | 500    |

  @persona:entitled
  Scenario: Submitting without an amount shows an error
    Given the login screen is displayed
    When I enter username "member.entitled"
    And I enter password "Harbor123!"
    And I tap Log In
    Then the home screen is displayed
    When I tap Contribute
    And I tap Submit contribution
    Then the contribute error is displayed

  @persona:entitled
  Scenario: A member cancels a contribution
    Given the login screen is displayed
    When I enter username "member.entitled"
    And I enter password "Harbor123!"
    And I tap Log In
    Then the home screen is displayed
    When I tap Contribute
    And I tap Cancel
    Then the home screen is displayed

  @persona:entitled
  Scenario: A member makes the contribution quarterly
    Given the login screen is displayed
    When I enter username "member.entitled"
    And I enter password "Harbor123!"
    And I tap Log In
    Then the home screen is displayed
    When I tap Contribute
    And I select amount "250"
    And I tap Quarterly
    Then the contribute summary is displayed
