# Grounding report: STORY-101

## android

Feature: Member reviews plans and starts a contribution (`features/STORY-101/android.feature`).

24 unique steps: 22 accepted (21 by rules, 0 by the Copilot agent, 1 by QA), 0 rejected, 2 ungrounded (0 awaiting the agent; 2 run on a device-validated fallback, 0 fallbacks awaiting validation), 1 warnings. 0 scenario-level (G5) errors.

| Step | Verdict | Source | Action | Locator | Evidence / reason |
|---|---|---|---|---|---|
| the login screen is displayed | accepted | rules | assertVisible | `login-screen` | src/screens/LoginScreen.tsx:10 |
| I enter username "member.entitled" | accepted | rules | type | `login-username-input` | src/screens/LoginScreen.tsx:12 |
| I enter password "Passw0rd!" | accepted | rules | type | `login-password-input` | src/screens/LoginScreen.tsx:21 |
| I tap Log In | accepted | rules | tap | `login-submit-button` | src/screens/LoginScreen.tsx:26 |
| the dashboard is displayed | accepted | rules | assertVisible | `dashboard-screen` | src/screens/DashboardScreen.tsx:9 |
| I tap View Plans | accepted | rules | tap | `dashboard-view-plans-button` | src/screens/DashboardScreen.tsx:12 |
| plan "p1" shows the Active badge | accepted | rules | assertVisible | `plan-item-entitled-badge-p1` | src/screens/PlanListScreen.tsx:27 |
| I open plan "p1" | accepted | rules | tap | `plan-item-p1` | src/screens/PlanListScreen.tsx:22 |
| the plan contribution amount is displayed | accepted | rules | assertVisible | `plan-details-contribution-amount` | src/screens/PlanDetailsScreen.tsx:18 |
| the upgrade prompt is not displayed | accepted | rules | assertNotVisible | `plan-details-upgrade-prompt` | src/screens/PlanDetailsScreen.tsx:22 |
| I enter username "member.restricted" | accepted | rules | type | `login-username-input` | src/screens/LoginScreen.tsx:12 |
| plan "p2" shows the Restricted badge | accepted | rules | assertVisible | `plan-item-restricted-badge-p2` | src/screens/PlanListScreen.tsx:29 |
| I open plan "p2" | accepted | rules | tap | `plan-item-p2` | src/screens/PlanListScreen.tsx:22 |
| the upgrade prompt is displayed | accepted | rules | assertVisible | `plan-details-upgrade-prompt` | src/screens/PlanDetailsScreen.tsx:22 |
| the plan contribution amount is not displayed | accepted | rules | assertNotVisible | `plan-details-contribution-amount` | src/screens/PlanDetailsScreen.tsx:18 |
| I open the contribution form | accepted | human | tap | `dashboard-contribute-button` | src/screens/DashboardScreen.tsx:24 |
| the contribution form is displayed | accepted | rules | assertVisible | `contribution-form-screen` | src/screens/ContributionFormScreen.tsx:9 |
| I enter contribution amount "500" | accepted | rules | type | `contribution-amount-input` | src/screens/ContributionFormScreen.tsx:10 |
| I enter contribution frequency "monthly" | ungrounded | human | unmapped | - | gap at src/screens/ContributionFormScreen.tsx:12 (proposed testID contribution-frequency-input); fallback validated on emulator-5554 16 2026-09-22 |
| I tap Submit | accepted | rules | tap | `contribution-submit-button` | src/screens/ContributionFormScreen.tsx:13 |
| I tap Cancel | ungrounded | rules | unmapped | - | gap at src/screens/ContributionFormScreen.tsx:17 (proposed testID contribution-cancel-button); fallback validated on emulator-5554 16 2026-09-22 |
| I tap Account Summary | accepted | rules | tap | `dashboard-view-account-button` | src/screens/DashboardScreen.tsx:18 |
| the account balance is displayed | accepted | rules | assertVisible | `account-balance-text` | src/screens/AccountSummaryScreen.tsx:10; G6 accessibilityLabel only; ask for a testID |
| I press the device back button | accepted | rules | back | - | no locator needed |

## ios

Feature: Member reviews plans and starts a contribution (`features/STORY-101/ios.feature`).

26 unique steps: 24 accepted (23 by rules, 0 by the Copilot agent, 1 by QA), 0 rejected, 2 ungrounded (0 awaiting the agent; 1 run on a device-validated fallback, 0 fallbacks awaiting validation), 1 warnings. 0 scenario-level (G5) errors.

| Step | Verdict | Source | Action | Locator | Evidence / reason |
|---|---|---|---|---|---|
| the login screen is displayed | accepted | rules | assertVisible | `login-screen` | src/screens/LoginScreen.tsx:10 |
| I enter username "member.entitled" | accepted | rules | type | `login-username-input` | src/screens/LoginScreen.tsx:12 |
| I enter password "Passw0rd!" | accepted | rules | type | `login-password-input` | src/screens/LoginScreen.tsx:21 |
| I tap Log In | accepted | rules | tap | `login-submit-button` | src/screens/LoginScreen.tsx:26 |
| the dashboard is displayed | accepted | rules | assertVisible | `dashboard-screen` | src/screens/DashboardScreen.tsx:9 |
| I tap View Plans | accepted | rules | tap | `dashboard-view-plans-button` | src/screens/DashboardScreen.tsx:12 |
| plan "p1" shows the Active badge | accepted | rules | assertVisible | `plan-item-entitled-badge-p1` | src/screens/PlanListScreen.tsx:27 |
| I open plan "p1" | accepted | rules | tap | `plan-item-p1` | src/screens/PlanListScreen.tsx:22 |
| the plan contribution amount is displayed | accepted | rules | assertVisible | `plan-details-contribution-amount` | src/screens/PlanDetailsScreen.tsx:18 |
| the upgrade prompt is not displayed | accepted | rules | assertNotVisible | `plan-details-upgrade-prompt` | src/screens/PlanDetailsScreen.tsx:22 |
| I enter username "member.restricted" | accepted | rules | type | `login-username-input` | src/screens/LoginScreen.tsx:12 |
| plan "p2" shows the Restricted badge | accepted | rules | assertVisible | `plan-item-restricted-badge-p2` | src/screens/PlanListScreen.tsx:29 |
| I open plan "p2" | accepted | rules | tap | `plan-item-p2` | src/screens/PlanListScreen.tsx:22 |
| the upgrade prompt is displayed | accepted | rules | assertVisible | `plan-details-upgrade-prompt` | src/screens/PlanDetailsScreen.tsx:22 |
| the plan contribution amount is not displayed | accepted | rules | assertNotVisible | `plan-details-contribution-amount` | src/screens/PlanDetailsScreen.tsx:18 |
| I open the contribution form | accepted | human | tap | `dashboard-contribute-button` | src/screens/DashboardScreen.tsx:24 |
| the contribution form is displayed | accepted | rules | assertVisible | `contribution-form-screen` | src/screens/ContributionFormScreen.tsx:9 |
| I enter contribution amount "500" | accepted | rules | type | `contribution-amount-input` | src/screens/ContributionFormScreen.tsx:10 |
| I enter contribution frequency "monthly" | ungrounded | human | unmapped | - | gap at src/screens/ContributionFormScreen.tsx:12 (proposed testID contribution-frequency-input); fallback validated on iPhone 17 27.0 2026-09-22 |
| I tap Submit | accepted | rules | tap | `contribution-submit-button` | src/screens/ContributionFormScreen.tsx:13 |
| I open the contribution schedule | accepted | rules | tap | `dashboard-schedule-button` | src/screens/DashboardScreen.tsx:30 |
| the contribution date picker is displayed | accepted | rules | assertVisible | `contribution-date-picker-screen` | src/screens/ThirdPartyWidgetScreen.tsx:10 |
| I choose "2026-10-01" in the date picker | ungrounded | human | unmapped | - | no source evidence: QA mapping: the vendor date picker exposes nothing in app source; needs a vendor-supported locator |
| I tap Account Summary | accepted | rules | tap | `dashboard-view-account-button` | src/screens/DashboardScreen.tsx:18 |
| the account balance is displayed | accepted | rules | assertVisible | `account-balance-text` | src/screens/AccountSummaryScreen.tsx:10; G6 accessibilityLabel only; ask for a testID |
| I tap the back button in the navigation bar | accepted | rules | back | - | no locator needed |
