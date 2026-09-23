---
name: clean-story
description: Reset everything generated for a story (output/<story>/), after you confirm
argument-hint: story id, e.g. STORY-1, or "all"
agent: Story Cleaner
# Without this, the prompt runs on whatever model the chat picker has selected.
model: GPT-5.6 Luna
---

Clean the story given after the command, or everything if it says "all".
