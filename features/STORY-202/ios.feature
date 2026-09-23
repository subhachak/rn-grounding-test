@story:STORY-202 @platform:ios
Feature: Plans by membership
  As a plan member
  I want to see each plan's status and details
  So that I know where I can contribute

  @persona:entitled
  Scenario: A Premier member reviews a plan they can contribute to
    Given the login screen is displayed
    When I enter username "member.entitled"
    And I enter password "Harbor123!"
    And I tap Log In
    Then the home screen is displayed
    When I tap manage plans
    Then the plans screen is displayed
    And plan "p1" shows the active badge
    And plan "p2" shows the restricted badge
    When I open plan "p1"
    Then the plan details screen is displayed
    And the contribution amount is displayed
    And the upgrade prompt is not displayed

  @persona:restricted
  Scenario: A Basic member is invited to upgrade from a plan
    Given the login screen is displayed
    When I enter username "member.restricted"
    And I enter password "Harbor123!"
    And I tap Log In
    Then the home screen is displayed
    When I tap manage plans
    Then the plans screen is displayed
    When I open plan "p2"
    Then the upgrade prompt is displayed
    And the contribution amount is not displayed
