@story:STORY-104 @platform:android
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
