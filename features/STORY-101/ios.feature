@story:STORY-101 @platform:ios
Feature: Member reviews plans and starts a contribution
  As a plan member
  I want to see which of my plans are active and contribute to them
  So that I can manage my retirement savings from my phone

  Background:
    Given the login screen is displayed

  @persona:entitled
  Scenario: Entitled member sees an active plan and its contribution amount
    When I enter username "member.entitled"
    And I enter password "Passw0rd!"
    And I tap Log In
    Then the dashboard is displayed
    When I tap View Plans
    Then plan "p1" shows the Active badge
    When I open plan "p1"
    Then the plan contribution amount is displayed
    And the upgrade prompt is not displayed

  @persona:restricted
  Scenario: Restricted member is prompted to upgrade
    When I enter username "member.restricted"
    And I enter password "Passw0rd!"
    And I tap Log In
    Then the dashboard is displayed
    When I tap View Plans
    Then plan "p2" shows the Restricted badge
    When I open plan "p2"
    Then the upgrade prompt is displayed
    And the plan contribution amount is not displayed

  @persona:entitled
  Scenario: Member fills in a contribution
    When I enter username "member.entitled"
    And I enter password "Passw0rd!"
    And I tap Log In
    Then the dashboard is displayed
    When I open the contribution form
    Then the contribution form is displayed
    When I enter contribution amount "500"
    And I enter contribution frequency "monthly"
    And I tap Submit
    Then the dashboard is displayed

  @persona:entitled
  Scenario: Member schedules a contribution date
    When I enter username "member.entitled"
    And I enter password "Passw0rd!"
    And I tap Log In
    Then the dashboard is displayed
    When I open the contribution schedule
    Then the contribution date picker is displayed
    When I choose "2026-10-01" in the date picker
    Then the contribution date picker is displayed

  @persona:entitled
  Scenario: Member checks the account balance
    When I enter username "member.entitled"
    And I enter password "Passw0rd!"
    And I tap Log In
    Then the dashboard is displayed
    When I tap Account Summary
    Then the account balance is displayed
    When I tap the back button in the navigation bar
    Then the dashboard is displayed
