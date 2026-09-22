# Testability gaps: proposed testIDs

Interactive elements with no locator, and the testID proposed for each in
the screen's existing naming convention. Apply with
`git apply generated/remediation/testids.patch`, then regenerate: steps that
used a fallback locator switch to the testID with no change to the step
definitions, because page objects keep the same member name.

| Element | Visible text | Location | Proposed testID |
|---|---|---|---|
| TextInput | Frequency (monthly/annual) | `src/screens/ContributionFormScreen.tsx:12` | `contribution-frequency-input` |
| TouchableOpacity | Cancel | `src/screens/ContributionFormScreen.tsx:17` | `contribution-cancel-button` |
