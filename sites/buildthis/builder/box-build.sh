#!/usr/bin/env bash
# box-build.sh — run ONE build on the builder box. The box equivalent of the
# GitHub Action's build + read-result + reply steps (.github/workflows/buildthis.yml),
# so the box path is behavior-identical to the Action path and the cutover is safe.
#
# Reads the job from the environment (same shape the Action's dispatch payload
# carries), so the poll loop can just export these and call this script. To test
# a build BY HAND before the queue exists, set at least BRIEF + the reply target:
#
#   source /etc/buildthis/env
#   export BRIEF="add a dark mode toggle to trigrams"
#   export AUTHOR="rob.bisks.net"
#   export MENTION_URI="at://…"           # keys the event log / outcome POST
#   export REPLY_ROOT_URI="at://…"  REPLY_ROOT_CID="bafy…"
#   export REPLY_PARENT_URI="at://…" REPLY_PARENT_CID="bafy…"
#   bash box-build.sh
#
# Inference auth is Rob's Claude Code SUBSCRIPTION LOGIN, not an API key — the
# whole reason the builds moved off the ephemeral GitHub Action onto a persistent
# box (`claude setup-token` stores a long-lived credential in ~/.claude.json).
# Do NOT set ANTHROPIC_API_KEY: if it's present, `claude` uses API billing and
# IGNORES the login. So this script deliberately unsets it before the build.
#
# Non-inference secrets come from the environment (source /etc/buildthis/env):
#   BUILDER_PAT, BOT_IDENTIFIER, BOT_APP_PASSWORD, OUTCOME_SECRET
set -euo pipefail

CHECKOUT="${CHECKOUT:-/opt/atprotozoa}"
BUILD_DIR="$CHECKOUT"
cd "$BUILD_DIR"

: "${BRIEF:?BRIEF is required (the build request text)}"
: "${BUILDER_PAT:?source /etc/buildthis/env first}"

# Guard: the box must be logged in to Claude (subscription), or every build 400s.
# Fail loud here rather than discover it per-build. `claude setup-token` (run once
# by Rob) populates this.
if ! claude auth status 2>/dev/null | grep -q '"loggedIn": true'; then
  echo "ERROR: claude is not logged in on this box. Run: claude setup-token" >&2
  exit 1
fi
# Belt-and-suspenders: never let an API key leak in and silently switch billing
# from the subscription to per-token API. The login is the intended auth.
unset ANTHROPIC_API_KEY ANTHROPIC_BASE_URL

echo "=== sync to origin/main (discard any local build leftovers) ==="
git fetch origin main
git reset --hard origin/main
git clean -fd -e BUILD_RESULT

echo "=== build (claude -p, same invocation as the Action) ==="
# BUILD_RESULT is how the agent reports what it built; make sure a stale one from
# a prior build can't be mistaken for this build's result.
rm -f BUILD_RESULT
# --max-turns bounds a runaway; bypassPermissions makes it unattended; the
# allowedTools + the FIRST-read INSTRUCTIONS.md keep edits in the sandbox. The
# model is whatever the subscription login defaults to (no ANTHROPIC_MODEL set).
# Tee the CLI's output to a log so we can tell "out of budget" (usage-limit)
# from "build flopped" afterwards, and still stream it live to the box's journal.
CLAUDE_LOG="$(mktemp /tmp/buildthis-claude.XXXXXX.log)"
set +e
AUTHOR="${AUTHOR:-someone}" BRIEF="$BRIEF" \
  claude -p "$(cat sites/buildthis/builder/BUILD_PROMPT.md)" \
    --max-turns 30 \
    --permission-mode bypassPermissions \
    --allowedTools Edit,Read,Write,Bash,Glob,Grep \
  2>&1 | tee "$CLAUDE_LOG"
BUILD_RC=${PIPESTATUS[0]}
set -e

# Read what the agent built. Absent/empty BUILD_RESULT => nothing built. The agent
# may instead leave a BUILD_NOTE (a friendly line for a tag with nothing to build
# from) — reply.mjs posts that as the reply. Both are untracked, repo-root files.
BUILD_RESULT=""
[ -f BUILD_RESULT ] && BUILD_RESULT="$(head -n1 BUILD_RESULT | tr -d '[:space:]')"
BUILD_NOTE=""
[ -f BUILD_NOTE ] && BUILD_NOTE="$(cat BUILD_NOTE)"

if [ "$BUILD_RC" -eq 0 ] && [ -n "$BUILD_RESULT" ]; then
  BUILD_OK="true"
else
  BUILD_OK="false"
fi

# Distinguish "out of budget" from "build flopped" so reply.mjs sends the honest
# out-of-budget reply, not the generic failure. The box hits the same provider
# spend cap the Action does; the CLI prints the usage-limit 400 to the log.
# On the subscription, hitting the ceiling reads as a usage/rate-limit message
# ("usage limit reached", "rate limit", "resets at ...") rather than the API's
# 400. Match either so the honest "out of budget, back soon" reply still fires.
BUILD_ERROR=""
if [ "$BUILD_OK" != "true" ] && grep -qiE "usage limit|rate limit|resets? at|reached your (usage|limit)" "$CLAUDE_LOG" 2>/dev/null; then
  BUILD_ERROR="usage_limit"
fi
echo "=== build rc=$BUILD_RC result='${BUILD_RESULT}' note?=$([ -n "$BUILD_NOTE" ] && echo y || echo n) ok=$BUILD_OK err='${BUILD_ERROR}' ==="

echo "=== push to main (PAT, so deploy.yml fires) ==="
# Only push if the build actually changed tracked files. A no-op build, a failed
# one, or a note-only "nothing to build" reaction shouldn't push an empty commit.
if [ "$BUILD_OK" = "true" ] && ! git diff --quiet; then
  git add -A
  git commit -q -m "buildthis: ${BUILD_RESULT} (@${AUTHOR:-someone})"
  git push -q "https://x-access-token:${BUILDER_PAT}@github.com/rrcobb/atprotozoa.git" HEAD:main
else
  echo "  nothing to push (build not ok or no changes)"
fi

# Reply in-thread AND report the outcome to the event log — reply.mjs does both
# (it owns the /outcome POST now, keyed by MENTION_URI, with the reply text as the
# logged replyText). Same script the Action's reply step runs, same env contract.
echo "=== reply + report outcome (reply.mjs) ==="
BUILD_OK="$BUILD_OK" BUILD_RESULT="$BUILD_RESULT" BUILD_NOTE="$BUILD_NOTE" BUILD_ERROR="$BUILD_ERROR" \
  BOT_IDENTIFIER="${BOT_IDENTIFIER}" BOT_APP_PASSWORD="${BOT_APP_PASSWORD}" \
  REPLY_ROOT_URI="${REPLY_ROOT_URI}" REPLY_ROOT_CID="${REPLY_ROOT_CID}" \
  REPLY_PARENT_URI="${REPLY_PARENT_URI}" REPLY_PARENT_CID="${REPLY_PARENT_CID}" \
  MENTION_URI="${MENTION_URI:-}" \
  OUTCOME_URL="${OUTCOME_URL:-https://buildthis.bisks.net/outcome}" \
  OUTCOME_SECRET="${OUTCOME_SECRET:-}" \
  node sites/buildthis/builder/reply.mjs

echo "=== done ==="
