---
name: run-story
description: Run a story end to end with live commentary, human approvals, device runs, and an HTML report
argument-hint: story id, e.g. STORY-1
agent: Story Runner
# Without this, the prompt runs on whatever model the chat picker has selected.
model: GPT-5.6 Luna
---

Run the story given after the command (a folder in the configured features folder, `features/` by default) end to end. If none is given, ask for it.
