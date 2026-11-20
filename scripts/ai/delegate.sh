#!/usr/bin/env bash
# Hand one coding task to another AI in its own copy of the repo; Claude then reviews as the lead.
#   scripts/ai/delegate.sh [--with <worker>] <short-name> "<task>"
# Workers (default: opencode/deepseek-v4.1-flash-free):
#   opencode/<model>   free OpenCode models, e.g. opencode/deepseek-v4.1-flash-free, opencode/longcat-2.5-free,
#                      opencode/mimo-v2.6-flash-free (list: opencode-cli models | grep free)
#   ollama/<model>     local models on this PC, e.g. ollama/gemma3:4b, ollama/phi4-mini:latest (free, offline, weakest)
#   codex              Codex on the ChatGPT plan (stronger; OS sandbox limits it to its folder)
# - New git worktree ../InsideOut-ai/<short-name> on branch ai/<short-name>, cut from main.
# - The worker follows AGENTS.md, works only there, commits on its branch, never pushes.
# - OpenCode has no OS sandbox, so it gets a strict allow-list: edit files in its folder, run tests,
#   type check and git add/commit/status/diff/log. Everything else (other commands, web, other
#   folders, .env files) is denied.
# - Afterwards: prints the summary, what changed and the test result. Nothing is merged.
set -euo pipefail
worker="opencode/deepseek-v4.1-flash-free"
if [ "${1:-}" = "--with" ]; then worker="${2:?--with needs a worker}"; shift 2; fi
name="${1:?usage: delegate.sh [--with <worker>] <short-name> \"<task>\"}"; task="${2:?missing task}"
[[ "$name" =~ ^[a-z0-9][a-z0-9-]{0,40}$ ]] || { echo "short-name: lowercase letters, digits, dashes" >&2; exit 2; }
repo="$(git rev-parse --show-toplevel)"; dir="$(dirname "$repo")/InsideOut-ai/$name"; branch="ai/$name"
[ -e "$dir" ] && { echo "$dir already exists; pick another name or remove it with: git worktree remove \"$dir\"" >&2; exit 2; }

git -C "$repo" worktree add -q -b "$branch" "$dir" main
# Share installed packages instead of reinstalling (Windows junction; plain symlink elsewhere).
if command -v cygpath >/dev/null 2>&1; then
  powershell.exe -NoProfile -Command "New-Item -ItemType Junction -Path '$(cygpath -w "$dir/node_modules")' -Target '$(cygpath -w "$repo/node_modules")' | Out-Null"
else ln -s "$repo/node_modules" "$dir/node_modules"; fi

prompt="$task

Rules: follow AGENTS.md in this folder. Work only in this folder. Keep the change small and focused.
Run 'npm test' and 'npm run lint'. Commit your work on the current branch ($branch) with a clear message.
Do not push, do not merge, do not touch .env files or data/ unless the task says so.
End with a short summary: what you changed, what you tested, what is not done."

echo ">> $worker is working on '$name' in $dir ..."
if [ "$worker" = "codex" ]; then
  codex_cmd=codex; command -v codex.cmd >/dev/null 2>&1 && codex_cmd=codex.cmd
  "$codex_cmd" exec -C "$dir" -s workspace-write --approve-for-me -o "$dir/.ai-summary.md" "$prompt" > "$dir/.ai-log.txt" 2>&1 || echo ">> Codex exited with an error (see $dir/.ai-log.txt)"
else
  oc="${OPENCODE_CLI:-$LOCALAPPDATA/Programs/ai.opencode.desktop/resources/opencode-cli.exe}"
  command -v opencode >/dev/null 2>&1 && oc=opencode
  # This OpenCode version ignores config passed in environment variables; it reads .opencode/opencode.json in
  # the project folder, which overrides the repo's opencode.json. Deny by default, allow just what the task needs.
  # (Checked: a blocked command is refused even with --auto.) .opencode/ is git-excluded so it is never committed.
  mkdir -p "$dir/.opencode"
  grep -qx '.opencode/' "$(git -C "$repo" rev-parse --git-common-dir)/info/exclude" 2>/dev/null || echo '.opencode/' >> "$(git -C "$repo" rev-parse --git-common-dir)/info/exclude"
  cat > "$dir/.opencode/opencode.json" <<'JSON'
{"permission":{"edit":"allow","webfetch":"deny","external_directory":"deny",
 "read":{"*":"allow","*.env":"deny","*.env.*":"deny",".env*":"deny"},
 "bash":{"*":"deny","npm test*":"allow","npm.cmd test*":"allow","npm run lint*":"allow","npm.cmd run lint*":"allow",
  "npx vitest*":"allow","npx tsc*":"allow","git status*":"allow","git diff*":"allow","git log*":"allow","git add*":"allow","git commit*":"allow"}}}
JSON
  (cd "$dir" && "$oc" run --auto -m "$worker" --title "delegate: $name" "$prompt") > "$dir/.ai-log.txt" 2>&1 || echo ">> OpenCode exited with an error (see $dir/.ai-log.txt)"
  tail -n 40 "$dir/.ai-log.txt" > "$dir/.ai-summary.md"
fi

echo ">> Summary:"; cat "$dir/.ai-summary.md" 2>/dev/null || echo "(none)"
echo ">> Commits on $branch:"; git -C "$dir" log --oneline main..HEAD
git -C "$dir" diff --name-only main...HEAD | grep -E '^.opencode/|.env' && echo ">> WARNING: the worker committed settings or secret files; do not accept this branch" || true
echo ">> Uncommitted:"; git -C "$dir" status -s | grep -v '^?? .ai-' || true
echo ">> Files changed vs main:"; git -C "$dir" diff --stat main...HEAD
echo ">> Tests:"; (cd "$dir" && npx vitest run 2>&1 | grep -E "Tests |FAIL" ) || true
echo ">> Review with: git diff main...$branch"
