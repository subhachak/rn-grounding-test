---
name: review-matches
description: Have the Match Critic review a story's rule matches for meaning and flag doubtful ones for human approval
argument-hint: story id, e.g. STORY-1
agent: Match Critic
# Without this, the prompt runs on whatever model the chat picker has selected.
model: GPT-5.6 Luna
---

Review the rule matches for the story id given after the command (a folder in the configured features folder, `features/` by default). If none is given, ask for it.
