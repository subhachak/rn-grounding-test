---
name: generate-appium
description: Generate grounded Appium (WebdriverIO + Cucumber, Sauce Labs) tests for a story's android and iOS feature files
argument-hint: story id, e.g. STORY-1
agent: Appium Test Generator
# Without this, the prompt runs on whatever model the chat picker has selected.
model: GPT-5.6 Luna
---

Generate the Appium tests for the story id given after the command (a folder under `features/` holding `android.feature` and `ios.feature`). If none is given, ask for it.
