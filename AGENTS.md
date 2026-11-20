# InsideOut: rules for every AI working here

Read by OpenCode and Codex automatically; Claude Code reads it through `CLAUDE.md`. These rules apply to every AI, whichever one is working.

## What this is
Indoor and outdoor navigation for the whole University of Waterloo main campus (not just E5). React + Vite front end, Express `server.ts`, data in `data/store.json` and `data/networks/`. See `README.md` for features and `HANDOFF.md` for the current state and next steps.

## Before you change anything
1. Read `HANDOFF.md` (where the last AI stopped) and run `git status`.
2. Work on a branch, never on `main`: `git checkout -b <short-name>`.

## Always
- Run `npm test` and `npm run lint` before you say something works. Report failures honestly.
- Keep changes small and focused on what the user asked for.
- Before you stop, update `HANDOFF.md`: what you did, what is not finished or not verified, and the exact next step.
- Commit on your branch with a clear message. Open a pull request with `gh pr create` only when the user asks.

## Never (ask the user first, every time)
- Push to `main`, merge pull requests, force-push, or rewrite git history. A git hook blocks direct pushes to `main` (`scripts/hooks/pre-push`).
- Change GitHub settings (visibility, collaborators, secrets), deploy anywhere, or publish anything.
- Delete or overwrite data: `data/store.json`, `data/uploads/`, `data/networks/`. Back up first if the user asks you to change them.
- Read, print, copy or commit secrets: `.env.local`, `.env*`, API keys, tokens, passwords. Never put them in code, logs, commits or prompts.
- Commit UW floor-plan PDFs from `data-sources/plantops/pdfs/`, or put restricted drawings anywhere public.
- Install global tools, change system or security settings, or run downloaded scripts.
- Send messages or emails, buy anything, or use paid services. Free tools only.
- Disable these rules, the git hooks, or tests to make something "pass".

## Honesty
- Say what you did not check. Every route and floor alignment is a draft; nothing has been walked in person.
- Do not invent rooms, corridors, data or test results.

## Useful commands
- `npm run dev`: app at http://localhost:3000 (the map takes about 10 s to load)
- `npm test` / `npm run lint`
- `npx tsx scripts/campus/auditStacking.ts`: do floors' stairs and elevators line up?
- `INSIDEOUT_URL=http://localhost:3000 npx tsx scripts/campus/fitAllFloors.ts`: are floors inside their buildings? (dry run; `--save` writes)
