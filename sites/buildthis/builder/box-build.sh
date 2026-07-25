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
# Inference auth is Rob's Claude Code SUBSCRIPTION, via a headless OAuth token
# (CLAUDE_CODE_OAUTH_TOKEN, minted once by `claude setup-token`, stored in
# /etc/buildthis/env). This is the whole reason builds moved off the ephemeral
# GitHub Action onto a persistent box: subscription billing, not per-token API.
#
# Claude Code's auth precedence (higher wins): ANTHROPIC_API_KEY > OAuth token >
# interactive ~/.claude.json login. So an API key in the environment would
# SILENTLY override the subscription token and switch to API billing — this
# script unsets it defensively. (Note: `claude auth status` only reports the
# interactive-login mode, so it says loggedIn:false even though the OAuth token
# authenticates fine — don't guard on it.)
#
# Non-inference secrets come from the environment (source /etc/buildthis/env):
#   CLAUDE_CODE_OAUTH_TOKEN, BUILDER_PAT, BOT_IDENTIFIER, BOT_APP_PASSWORD, OUTCOME_SECRET
set -euo pipefail

CHECKOUT="${CHECKOUT:-/opt/atprotozoa}"
BUILD_DIR="$CHECKOUT"
cd "$BUILD_DIR"

: "${BRIEF:?BRIEF is required (the build request text)}"
: "${BUILDER_PAT:?source /etc/buildthis/env first}"
: "${CLAUDE_CODE_OAUTH_TOKEN:?source /etc/buildthis/env first — run 'claude setup-token' to mint it}"

# Never let an API key silently outrank the subscription token and switch billing
# to per-token API. Keep CLAUDE_CODE_OAUTH_TOKEN — that IS the auth.
unset ANTHROPIC_API_KEY ANTHROPIC_BASE_URL

# Stamp a committed provenance manifest into a built site: who asked, the brief,
# the agent's note, the mention it came from, and when. This is the DURABLE record
# of a site's origin — the KV event log has a 30-day TTL, git history doesn't. Uses
# jq (installed by box-setup.sh) so the arbitrary third-party BRIEF/NOTE text is
# JSON-escaped, never string-concatenated into the file. Written before the push so
# it rides the same commit as the site.
write_provenance() {
  local out="$1"
  jq -n \
    --arg name "$BUILD_RESULT" \
    --arg handle "${AUTHOR:-someone}" \
    --arg brief "$BRIEF" \
    --arg note "$BUILD_NOTE" \
    --arg mention "${MENTION_URI:-}" \
    --arg builtAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    '{
      builtName: $name,
      requestedBy: $handle,
      brief: $brief,
      note: (if $note == "" then null else $note end),
      mentionUri: (if $mention == "" then null else $mention end),
      builtAt: $builtAt,
      builtBy: "@buildthis.bisks.net"
    }' > "$out"
  echo "  wrote provenance $out"
}

echo "=== sync to origin/main (discard any local build leftovers) ==="
git fetch origin main
git reset --hard origin/main
# `git clean -fd` skips gitignored files, so BUILD_RESULT / BUILD_NOTE (both
# gitignored) survive a clean and would leak into the next build. That leak posted
# a prior build's note under a LATER, unrelated request (a failed build inherited
# the previous build's BUILD_NOTE and replied it to the wrong thread). Clear the
# scratch files explicitly, every build, before anything runs — never trust a
# leftover from the last one.
git clean -fd
rm -f BUILD_RESULT BUILD_NOTE

# The SHA before the build. "did anything actually land on main?" is answered by
# comparing this to origin/main AFTER the push — the real success signal, not just
# "BUILD_RESULT exists". A build that writes files but never commits them (the
# agent staged-and-left-it, or hit max-turns mid-commit) leaves main unchanged, and
# that must NOT read as success. See the push + classify blocks below.
BASE_SHA="$(git rev-parse HEAD)"

echo "=== build (claude -p, same invocation as the Action) ==="
# Sonnet for the builder (cheaper than Opus, near-Opus on this copy-a-site-and-edit
# workload). Overridable via BUILDER_MODEL if we ever want to bump a build to Opus.
# --max-turns bounds a runaway; bypassPermissions makes it unattended (fine on this
# isolated non-root box); allowedTools + the FIRST-read INSTRUCTIONS.md keep edits
# in the sandbox. Tee the CLI's output to a log so we can tell "out of budget"
# (usage-limit) from "build flopped" afterwards, and stream it to the box journal.
BUILDER_MODEL="${BUILDER_MODEL:-claude-sonnet-5}"
# Turn ceiling: a runaway stop, not a build budget. The Action used 30 (tuned for
# Opus, which is more turn-efficient). Sonnet takes more, smaller steps, and a real
# build — a whole game with animations, not a one-file edit — blew past 30 and got
# cut off mid-build. 60 gives room; the systemd TimeoutStopSec + wall-clock are the
# real runaway guards. Overridable via BUILDER_MAX_TURNS.
BUILDER_MAX_TURNS="${BUILDER_MAX_TURNS:-60}"
CLAUDE_LOG="$(mktemp /tmp/buildthis-claude.XXXXXX.log)"
set +e
CLAUDE_CODE_OAUTH_TOKEN="$CLAUDE_CODE_OAUTH_TOKEN" \
AUTHOR="${AUTHOR:-someone}" BRIEF="$BRIEF" \
  claude -p "$(cat sites/buildthis/builder/BUILD_PROMPT.md)" \
    --model "$BUILDER_MODEL" \
    --max-turns "$BUILDER_MAX_TURNS" \
    --permission-mode bypassPermissions \
    --allowedTools Edit,Read,Write,Bash,Glob,Grep \
  2>&1 | tee "$CLAUDE_LOG"
BUILD_RC=${PIPESTATUS[0]}
set -e

# Read what the agent built. Absent/empty BUILD_RESULT => nothing the agent chose
# to claim as a build. The agent may instead leave a BUILD_NOTE (a friendly line
# for a tag with nothing to build from) — reply.mjs posts that as the reply. Both
# are gitignored, repo-root scratch files, cleared before the build above.
BUILD_RESULT=""
[ -f BUILD_RESULT ] && BUILD_RESULT="$(head -n1 BUILD_RESULT | tr -d '[:space:]')"
BUILD_NOTE=""
[ -f BUILD_NOTE ] && BUILD_NOTE="$(cat BUILD_NOTE)"

# Distinguish "out of budget" from "build flopped". The box hits the subscription's
# usage ceiling; the CLI prints a usage/rate-limit message ("usage limit reached",
# "rate limit", "resets at ...") rather than a clean exit. Matched here so the reply
# is the honest "out of budget, back soon" and the job is requeued (not the build's
# fault — it should retry once budget resets), not thrown away as a flop.
USAGE_LIMIT=""
if grep -qiE "usage limit|rate limit|resets? at|reached your (usage|limit)" "$CLAUDE_LOG" 2>/dev/null; then
  USAGE_LIMIT="1"
fi

# Provenance: on a claimed build, stamp a committed manifest INTO the built site so
# each site permanently carries who asked for it and why — the durable record the
# KV event log (30-day TTL) isn't. Written before the push so it's part of the same
# commit. Only for a real site build (BUILD_RESULT names a site dir); a note-only
# reaction or an explain-only reply has no site to stamp. `<site>/<path>` and a
# plain `<site>` both stamp sites/<site>/.buildthis.json.
if [ -n "$BUILD_RESULT" ]; then
  SITE_DIR="sites/${BUILD_RESULT%%/*}"
  if [ -d "$SITE_DIR" ]; then
    write_provenance "$SITE_DIR/.buildthis.json"
  fi
fi

echo "=== push to main (PAT, so deploy.yml fires) ==="
# Push if the build produced ANY change — staged, unstaged, OR untracked (a brand
# new site directory is entirely untracked). The old guard used `git diff --quiet`,
# which sees only unstaged tracked changes, so a new site the agent staged-but-
# -didn't-commit read as "nothing to push" and was silently dropped (then wiped by
# the next build's reset) while the reply still promised it was live. `git status
# --porcelain` catches all three states. We still gate on BUILD_RESULT so a genuine
# no-build (note-only reaction) doesn't push an empty commit.
if [ -n "$BUILD_RESULT" ] && [ -n "$(git status --porcelain)" ]; then
  git add -A
  git commit -q -m "buildthis: ${BUILD_RESULT} (@${AUTHOR:-someone})"
  git push -q "https://x-access-token:${BUILDER_PAT}@github.com/rrcobb/atprotozoa.git" HEAD:main
else
  echo "  nothing to push (no BUILD_RESULT or no changes)"
fi

# The real success signal: did main actually move? A build "succeeds" only if its
# work is now on origin/main (so deploy.yml will ship it). Comparing HEAD to
# BASE_SHA — not "does BUILD_RESULT exist" — is what stops a staged-but-uncommitted
# build from being reported live when it never shipped.
HEAD_SHA="$(git rev-parse HEAD)"
PUSHED="false"
[ "$HEAD_SHA" != "$BASE_SHA" ] && PUSHED="true"

# Classify the outcome into a DISPOSITION the reply + queue act on:
#   success    -> work landed on main. Reply "built it", retire the job.
#   usage_limit-> out of budget. Reply honestly, REQUEUE (retry when budget resets).
#   no_build   -> agent deliberately built nothing (note-only reaction). Reply the
#                 note, retire — retrying would just re-react.
#   incomplete -> agent worked but nothing landed (rc!=0, or claimed a result that
#                 never got to main). REQUEUE up to MAX_ATTEMPTS, then give up with
#                 an honest failure. This is the case favstar hit.
ATTEMPT="${ATTEMPT:-1}"
MAX_ATTEMPTS="${MAX_ATTEMPTS:-3}"
if [ "$PUSHED" = "true" ]; then
  DISPOSITION="success"
elif [ -n "$USAGE_LIMIT" ]; then
  DISPOSITION="usage_limit"
elif [ "$BUILD_RC" -eq 0 ] && [ -z "$BUILD_RESULT" ]; then
  # Clean exit, no result claimed: the agent looked and chose not to build. If it
  # left a note that's the deliberate reaction; either way it's done, not retryable.
  DISPOSITION="no_build"
else
  DISPOSITION="incomplete"
fi

# Requeue decision. usage_limit always retries (budget will reset); incomplete
# retries until attempts run out. On the final attempt an incomplete becomes a
# terminal honest-failure reply so the requester isn't left hanging forever.
REQUEUE="false"
if [ "$DISPOSITION" = "usage_limit" ]; then
  REQUEUE="true"
elif [ "$DISPOSITION" = "incomplete" ] && [ "$ATTEMPT" -lt "$MAX_ATTEMPTS" ]; then
  REQUEUE="true"
fi

echo "=== build rc=$BUILD_RC result='${BUILD_RESULT}' note?=$([ -n "$BUILD_NOTE" ] && echo y || echo n) pushed=$PUSHED disp=$DISPOSITION attempt=$ATTEMPT/$MAX_ATTEMPTS requeue=$REQUEUE ==="

# When we're going to retry silently, don't post to the thread — a requeue isn't a
# user-facing event, and "trying again" spam under every slow build would be noise.
# We DO still report the outcome so the queue can requeue and the timeline reflects
# the attempt. reply.mjs treats REPLY_SKIP=1 as "report, don't post".
REPLY_SKIP=""
[ "$REQUEUE" = "true" ] && REPLY_SKIP="1"

# BUILD_OK is the reply's success/failure switch; it must track PUSHED (did it
# really ship), not merely "a result file exists" — otherwise a dropped build still
# gets the celebratory copy. BUILD_ERROR carries usage_limit so reply.mjs picks the
# honest out-of-budget line.
BUILD_OK="$PUSHED"
BUILD_ERROR=""
[ "$DISPOSITION" = "usage_limit" ] && BUILD_ERROR="usage_limit"

# Reply in-thread AND report the outcome to the event log — reply.mjs does both
# (it owns the /outcome POST, keyed by MENTION_URI, with the reply text as the
# logged replyText). DISPOSITION/REQUEUE tell the worker whether to retire or
# requeue the job. Same script the Action's reply step runs, same env contract.
echo "=== reply + report outcome (reply.mjs) ==="
BUILD_OK="$BUILD_OK" BUILD_RESULT="$BUILD_RESULT" BUILD_NOTE="$BUILD_NOTE" BUILD_ERROR="$BUILD_ERROR" \
  DISPOSITION="$DISPOSITION" REQUEUE="$REQUEUE" REPLY_SKIP="$REPLY_SKIP" \
  ATTEMPT="$ATTEMPT" MAX_ATTEMPTS="$MAX_ATTEMPTS" \
  BOT_IDENTIFIER="${BOT_IDENTIFIER}" BOT_APP_PASSWORD="${BOT_APP_PASSWORD}" \
  REPLY_ROOT_URI="${REPLY_ROOT_URI}" REPLY_ROOT_CID="${REPLY_ROOT_CID}" \
  REPLY_PARENT_URI="${REPLY_PARENT_URI}" REPLY_PARENT_CID="${REPLY_PARENT_CID}" \
  MENTION_URI="${MENTION_URI:-}" \
  OUTCOME_URL="${OUTCOME_URL:-https://buildthis.bisks.net/outcome}" \
  OUTCOME_SECRET="${OUTCOME_SECRET:-}" \
  node sites/buildthis/builder/reply.mjs

echo "=== done ==="
