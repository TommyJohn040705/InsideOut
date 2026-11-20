---
name: delegate
description: Hand a well-defined coding task to a worker AI (free OpenCode models like DeepSeek, or Codex on the ChatGPT plan) in its own branch and worktree, then review its work as the lead. Use for routine, self-contained implementation work (a fix, a small feature, tests, refactors) to save Claude usage; keep design decisions, reviews, data changes and merges for Claude.
---

# Delegate to a worker AI, review as the lead

Claude is the lead: it writes the task, the worker AI writes the code, and Claude reviews, tests and decides. Nothing is merged or pushed without Claude's review and the user's OK.

## 1. Write the task
One task per hand-off, self-contained. Name the files or area, what done looks like, and how to test it. Example:
"In src/campus/schedule.ts, also accept Quest rows that use 'TBA' as the room: skip them and keep the rest. Add a test in tests/schedule.test.ts."

Don't delegate: design choices, data/store.json or floor placements, secrets, anything touching GitHub settings, merges.

## 2. Hand it off
```bash
bash scripts/ai/delegate.sh <short-name> "<task>"                      # free: OpenCode DeepSeek V4.1 Flash
bash scripts/ai/delegate.sh --with opencode/longcat-2.5-free <name> "<task>"   # other free OpenCode models
bash scripts/ai/delegate.sh --with ollama/gemma3:4b <name> "<task>"       # local Ollama model: offline, free, weakest
bash scripts/ai/delegate.sh --with codex <name> "<task>"               # Codex on the ChatGPT plan, for harder tasks
```
Run it in the background for long tasks. The worker works in `../InsideOut-ai/<short-name>` on branch `ai/<short-name>` and commits there; it never pushes. Codex is OS-sandboxed to that folder; OpenCode gets a strict allow-list (edit there, tests, type check, git add/commit/status/diff/log; nothing else). Pick the worker by difficulty: local Ollama models only for tiny, very clear edits; free OpenCode models for small tasks; Codex for multi-file work. Expect more mistakes from smaller models: the review step is where Claude catches and fixes them.

## 3. Review like a lead (always)
- `git diff main...ai/<short-name>`: read every line. Check it does what was asked and nothing else, with no secrets, no data changes and no stray files.
- Run the tests yourself in that folder: `npm test` and `npm run lint`. Don't trust the summary alone.
- Not good enough: send a follow-up with `codex.cmd exec -C ../InsideOut-ai/<short-name> -s workspace-write --approve-for-me "<what to fix>"`, or fix it yourself.
- Good: tell the user what changed and ask before pushing the branch or opening a PR.

## 4. Clean up
`git worktree remove ../InsideOut-ai/<short-name>` once the branch is merged or dropped.
