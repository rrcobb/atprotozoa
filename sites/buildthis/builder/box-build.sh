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
# Secrets come from the environment (source /etc/buildthis/env first):
#   ANTHROPIC_API_KEY, ANTHROPIC_MODEL, [ANTHROPIC_BASE_URL],
#   BUILDER_PAT, BOT_IDENTIFIER, BOT_APP_PASSWORD, OUTCOME_SECRET
set -euo pipefail

CHECKOUT="${CHECKOUT:-/opt/atprotozoa}"
BUILD_DIR="$CHECKOUT"
cd "$BUILD_DIR"

: "${BRIEF:?BRIEF is required (the build request text)}"
: "${ANTHROPIC_API_KEY:?source /etc/buildthis/env first}"
: "${BUILDER_PAT:?source /etc/buildthis/env first}"

echo "=== sync to origin/main (discard any local build leftovers) ==="
git fetch origin main
git reset --hard origin/main
git clean -fd -e BUILD_RESULT

echo "=== build (claude -p, same invocation as the Action) ==="
# BUILD_RESULT is how the agent reports what it built; make sure a stale one from
# a prior build can't be mistaken for this build's result.
rm -f BUILD_RESULT
# --max-turns bounds a runaway; bypassPermissions makes it unattended; the
# allowedTools + the FIRST-read INSTRUCTIONS.md keep edits in the sandbox.
# Model/endpoint come from the env — swapping providers is those vars, nothing here.
set +e
AUTHOR="${AUTHOR:-someone}" BRIEF="$BRIEF" \
  claude -p "$(cat sites/buildthis/builder/BUILD_PROMPT.md)" \
    --max-turns 30 \
    --permission-mode bypassPermissions \
    --allowedTools Edit,Read,Write,Bash,Glob,Grep
BUILD_RC=$?
set -e

# Read what the agent built. Absent/empty BUILD_RESULT => nothing built.
BUILD_RESULT=""
if [ -f BUILD_RESULT ]; then
  BUILD_RESULT="$(head -n1 BUILD_RESULT | tr -d '[:space:]')"
fi
if [ "$BUILD_RC" -eq 0 ] && [ -n "$BUILD_RESULT" ]; then
  BUILD_OK="true"
else
  BUILD_OK="false"
fi
echo "=== build rc=$BUILD_RC result='${BUILD_RESULT}' ok=$BUILD_OK ==="

echo "=== push to main (PAT, so deploy.yml fires) ==="
# Only push if the build actually changed tracked files. A no-op build (or a
# failed one) shouldn't push an empty commit.
if [ "$BUILD_OK" = "true" ] && ! git diff --quiet; then
  git add -A
  git commit -m "buildthis: ${BUILD_RESULT} (@${AUTHOR:-someone})"
  git push "https://x-access-token:${BUILDER_PAT}@github.com/rrcobb/atprotozoa.git" HEAD:main
else
  echo "  nothing to push (build not ok or no changes)"
fi

echo "=== reply in-thread (same reply.mjs the Action uses) ==="
BUILD_OK="$BUILD_OK" BUILD_RESULT="$BUILD_RESULT" \
  BOT_IDENTIFIER="${BOT_IDENTIFIER}" BOT_APP_PASSWORD="${BOT_APP_PASSWORD}" \
  REPLY_ROOT_URI="${REPLY_ROOT_URI}" REPLY_ROOT_CID="${REPLY_ROOT_CID}" \
  REPLY_PARENT_URI="${REPLY_PARENT_URI}" REPLY_PARENT_CID="${REPLY_PARENT_CID}" \
  node sites/buildthis/builder/reply.mjs

echo "=== report outcome to the event log (POST /outcome) ==="
# Best-effort: a failed outcome POST must not fail the build. Mirrors the record
# the logs site renders. Keyed by MENTION_URI so it merges onto the watcher's event.
if [ -n "${MENTION_URI:-}" ] && [ -n "${OUTCOME_SECRET:-}" ]; then
  STATUS="failure"; [ "$BUILD_OK" = "true" ] && STATUS="success"
  URL=""
  if [ "$BUILD_OK" = "true" ]; then
    case "$BUILD_RESULT" in
      */*) URL="https://${BUILD_RESULT%%/*}.bisks.net/${BUILD_RESULT#*/}" ;;
      *)   URL="https://${BUILD_RESULT}.bisks.net" ;;
    esac
  fi
  # Build the JSON body with node's JSON.stringify (correct escaping), passing the
  # values through the environment so they're read as env vars, not argv.
  BODY="$(MENTION_URI="$MENTION_URI" STATUS="$STATUS" BUILD_RESULT="$BUILD_RESULT" URL="$URL" \
    node -e 'const e=process.env; const o={mentionUri:e.MENTION_URI, status:e.STATUS, builtName:e.BUILD_RESULT||undefined, url:e.URL||undefined}; process.stdout.write(JSON.stringify(o))')"
  curl -fsS -X POST "https://buildthis.bisks.net/outcome" \
    -H "authorization: Bearer ${OUTCOME_SECRET}" \
    -H "content-type: application/json" \
    -d "$BODY" \
    >/dev/null || echo "  outcome POST failed (non-fatal)"
else
  echo "  skipped outcome POST (no MENTION_URI/OUTCOME_SECRET)"
fi

echo "=== done ==="
