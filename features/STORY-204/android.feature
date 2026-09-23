@story:STORY-204 @platform:android
Feature: Scheduling the first contribution
  As a Premier member
  I want to choose when my contributions start
  So that they line up with my pay dates

  @persona:entitled
  Scenario: A Premier member picks the first contribution date
    Given the login screen is displayed
    When I enter username "member.entitled"
    And I enter password "Harbor123!"
    And I tap Log In
    Then the home screen is displayed
    When I tap Contribute
    And I tap First contribution
    Then the schedule screen is displayed
    And the choose a date button is displayed
    And the date wheels are not displayed
    When I tap the schedule done button
    Then the contribute form is displayed
