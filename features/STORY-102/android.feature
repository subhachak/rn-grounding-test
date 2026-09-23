@story:STORY-102 @platform:android
Feature: Member checks their account balance
  As a plan member
  I want to see my current balance from the dashboard
  So that I know how much I have saved

  Background:
    Given the login screen is displayed

  @persona:entitled
  Scenario: Entitled member checks their balance and returns to the dashboard
    When I enter username "member.entitled"
    And I enter password "Passw0rd!"
    And I tap Log In
    Then the dashboard is displayed
    And the dashboard welcome text is displayed
    When I tap Account Summary
    Then the account balance is displayed
    When I press the device back button
    Then the dashboard is displayed

  @persona:restricted
  Scenario: Restricted member can also see their balance
    When I enter username "member.restricted"
    And I enter password "Passw0rd!"
    And I tap Log In
    Then the dashboard is displayed
    When I tap Account Summary
    Then the account balance is displayed
