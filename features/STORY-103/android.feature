@story:STORY-103 @platform:android
Feature: Plan entitlements differ by member type
  As a plan member
  I want to see which of my plans I can contribute to
  So that I know where to put my money

  Background:
    Given the login screen is displayed

  @persona:entitled
  Scenario Outline: Entitled member sees plan <plan> as <badge>
    When I enter username "member.entitled"
    And I enter password "Passw0rd!"
    And I tap Log In
    And I tap View Plans
    Then plan "<plan>" shows the <badge> badge

    Examples:
      | plan | badge      |
      | p1   | Active     |
      | p2   | Restricted |

  @persona:entitled
  Scenario: Entitled member sees the contribution amount on a plan
    When I enter username "member.entitled"
    And I enter password "Passw0rd!"
    And I tap Log In
    And I tap View Plans
    And I open plan "p1"
    Then the plan contribution amount is displayed
    And the upgrade prompt is not displayed

  @persona:restricted
  Scenario: Restricted member is asked to upgrade instead
    When I enter username "member.restricted"
    And I enter password "Passw0rd!"
    And I tap Log In
    And I tap View Plans
    And I open plan "p2"
    Then the upgrade prompt is displayed

  # Deliberate spec error for the demo: the app shows the contribution amount
  # only to entitled members, so the grounding gate rejects this scenario (G5).
  @persona:restricted
  Scenario: Restricted member sees the contribution amount
    When I enter username "member.restricted"
    And I enter password "Passw0rd!"
    And I tap Log In
    And I tap View Plans
    And I open plan "p2"
    Then the plan contribution amount is displayed
