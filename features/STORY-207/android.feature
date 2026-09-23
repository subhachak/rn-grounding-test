@story:STORY-207 @platform:android
Feature: Enrolling
  As someone new to Harbor
  I want to start creating an account from the sign-in screen
  So that I can join my employer's plan

  Scenario: A new member fills in the enrollment form
    Given the login screen is displayed
    When I tap Enroll
    Then the enroll screen is displayed
    When I enter full name "Sam Rivera"
    And I enter email address "sam@example.com"
    And I enter date of birth "01/02/1990"
    And I enter the enroll password "Harbor123!"
    And I tap Back to sign in
    Then the login screen is displayed
