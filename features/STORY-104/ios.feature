@story:STORY-104 @platform:ios
Feature: Member makes a monthly contribution
  As a plan member
  I want to set up a regular contribution from my phone
  So that I keep saving without thinking about it

  Background:
    Given the login screen is displayed

  @persona:entitled
  Scenario: Member contributes monthly
    When I enter username "member.entitled"
    And I enter password "Passw0rd!"
    And I tap Log In
    Then the dashboard is displayed
    When I go to the contribution form
    Then the contribution form is displayed
    When I enter contribution amount "250"
    And I set the frequency to "monthly"
    And I tap Submit
    Then the dashboard is displayed

  @persona:entitled
  Scenario: Member changes their mind
    When I enter username "member.entitled"
    And I enter password "Passw0rd!"
    And I tap Log In
    Then the dashboard is displayed
    When I tap Contribute
    Then the contribution form is displayed
    When I tap Cancel
    Then the dashboard is displayed

  @persona:entitled
  Scenario: Member schedules the first contribution date
    When I enter username "member.entitled"
    And I enter password "Passw0rd!"
    And I tap Log In
    Then the dashboard is displayed
    When I tap Schedule a contribution
    Then the contribution date picker is displayed
    When I choose "2026-11-15" in the date picker
    Then the contribution date picker value is displayed
