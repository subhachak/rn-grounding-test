@story:STORY-201 @platform:android
Feature: Signing in and out
  As a plan member
  I want to sign in with my username and sign out when I am done
  So that my retirement account stays private

  @persona:entitled
  Scenario: A Premier member signs in and sees their balance
    Given the login screen is displayed
    When I enter username "member.entitled"
    And I enter password "Harbor123!"
    And I tap Log In
    Then the home screen is displayed
    And the greeting is displayed
    And the balance amount is displayed

  @persona:entitled
  Scenario: An unknown username is refused
    Given the login screen is displayed
    When I enter username "nobody"
    And I tap Log In
    Then the login error is displayed
    And the login screen is displayed

  @persona:restricted
  Scenario: A Basic member checks their membership and signs out
    Given the login screen is displayed
    When I enter username "member.restricted"
    And I enter password "Harbor123!"
    And I tap Log In
    Then the home screen is displayed
    When I tap my avatar
    Then the profile screen is displayed
    And the basic badge is displayed
    And the premier badge is not displayed
    When I tap Sign out
    Then the login screen is displayed
