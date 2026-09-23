---
name: ground
description: Scan the app source and write registry.json to the output folder, or ask about RN locators (gaps, persona variants, weak IDs)
argument-hint: blank = scan the app source and save registry.json, or ask e.g. "which elements are missing testIDs?"
agent: Selector Grounding
# Without this, /ground runs on whatever model the chat picker has selected.
model: GPT-5.6 Luna
---

Answer the question that follows using the `ground_selectors` tool. If no question is given, call it once with `scope: src` and `save: true` (writes `registry.json` in the output folder), then report the path and summary counts.
