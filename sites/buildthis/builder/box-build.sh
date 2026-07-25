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

echo "=== sync to origin/main ==="
git fetch origin main
# Fast-forward to main, preserving anything already committed locally. Every build
# now commits + pushes its work before finishing (see the preserve/push block), so
# at the top of a normal build the tree is clean and a ff pull just advances it —
# no --hard reset that would throw away committed work. The fallback: if the tree is
# dirty (a build was SIGKILLed mid-edit and left uncommitted junk) or the pull can't
# fast-forward, reset --hard to origin/main to guarantee a clean, current start.
# Committed work is safe either way (it's on origin); only uncommitted leftovers,
# which are by definition junk from an interrupted run, get discarded.
if git pull --ff-only origin main; then
  echo "  fast-forwarded to origin/main"
else
  echo "  ff pull failed (dirty tree or diverged) — hard-resetting to origin/main"
  git reset --hard origin/main
fi
# `git clean -fd` removes untracked leftovers but SKIPS gitignored files, so
# BUILD_RESULT / BUILD_NOTE (both gitignored) survive a clean and would leak into the
# next build — a stale note once posted under a later, unrelated request. Clear the
# scratch files explicitly, every build, before anything runs.
git clean -fd
rm -f BUILD_RESULT BUILD_NOTE

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

# Read the agent's per-build scratch files. Both are gitignored, cleared before the
# build above, and now ADVISORY — the harness preserves and reports work on its own
# (see the derive + always-push blocks below), so a build whose agent forgot to write
# these still ships correctly. BUILD_RESULT: the agent's name for what it built
# (nicer than the derived name, and the only way to say "<site>/<path>"). BUILD_NOTE:
# a line in the agent's voice for the reply.
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

# Distinguish "ran out of turns on a too-big ask" from a transient failure. Hitting
# Detect a --max-turns overrun. It's DETERMINISTIC (an identical rerun overruns
# identically), so it's never worth a blind retry. What happens next depends on
# whether real work got onto disk first (see the classify block): if it did, this is
# a PARTIAL — a live first pass, continuable by re-tag; if nothing landed, it's a
# terminal too_big. Either way, not a requeue. The CLI prints "Reached max turns"
# when it caps out. (cee.wtf's 10-min-EP ask is the motivating case: it overran
# three times, ~50 min of silence, and threw away real work each time.)
MAX_TURNS_HIT=""
if grep -qiE "reached max turns|max.?turns" "$CLAUDE_LOG" 2>/dev/null; then
  MAX_TURNS_HIT="1"
fi

# Did the build change anything on disk? This — not "did the agent write
# BUILD_RESULT" — is the ground truth for "is there work to preserve". A max-turns
# kill lands before the agent's final report, so work-happened and result-file-exists
# diverge exactly when it matters most.
CHANGED=""
[ -n "$(git status --porcelain)" ] && CHANGED="1"

# Derive the built site's name deterministically from the changed files, so the
# harness can preserve + report a build the agent didn't get to name (e.g. killed
# before writing BUILD_RESULT). A build touches sites/<name>/... (and often apex/ for
# the gallery card); the site is the first changed sites/<name> dir. BUILD_RESULT
# wins when the agent DID set it — it's nicer, and the only way to express
# "<site>/<path>". DERIVED_NAME is empty if only apex/notes/root changed (no site
# dir), in which case we fall back to BUILD_RESULT if present.
DERIVED_NAME="$(git status --porcelain | sed -E 's/^...//; s/^"//' \
  | grep -oE '^sites/[^/]+' | head -n1 | cut -d/ -f2 || true)"
BUILT_NAME="${BUILD_RESULT:-$DERIVED_NAME}"

# Provenance: stamp who-asked-what into the built site so it permanently carries its
# origin (the KV log has a 30-day TTL; git history doesn't). Written before the push
# so it rides the same commit. Uses BUILT_NAME (agent's or derived), for a real site
# dir only. Skipped when nothing changed or no site dir is identifiable.
if [ -n "$CHANGED" ] && [ -n "$BUILT_NAME" ]; then
  SITE_DIR="sites/${BUILT_NAME%%/*}"
  [ -d "$SITE_DIR" ] && write_provenance "$SITE_DIR/.buildthis.json"
fi

echo "=== push to main (PAT, so deploy.yml fires) ==="
# PRESERVE, don't discard. If the build changed ANYTHING, commit + push it —
# regardless of how the build ended. A max-turns overrun that got a real first pass
# onto disk should land on main (live, and continuable by re-tagging), not be reset
# away. There's no BUILD_RESULT gate: work is preserved on the fact that it exists,
# not on the agent remembering to name it. `git status --porcelain` (via CHANGED)
# catches staged, unstaged, and brand-new-untracked alike. PUSHED is set true only
# on the push's own success — the unambiguous "it's on main now" signal.
PUSHED="false"
if [ -n "$CHANGED" ]; then
  git add -A
  git commit -q -m "buildthis: ${BUILT_NAME:-build} (@${AUTHOR:-someone})"
  if git push -q "https://x-access-token:${BUILDER_PAT}@github.com/rrcobb/atprotozoa.git" HEAD:main; then
    PUSHED="true"
  else
    echo "  push FAILED — work is committed locally; will retry sync next build"
  fi
else
  echo "  nothing changed — no commit (a note-only reaction or a build that made nothing)"
fi

# Classify the outcome into a DISPOSITION the reply + queue act on. The key axis is
# PUSHED (did real work land on main), because work is now always preserved:
#   success    -> work landed AND the build finished cleanly. "built it 🎉".
#   partial    -> work landed BUT the build ran out of turns mid-way. A real first
#                 pass is live; it's just not done. Reply "first pass is up — tag me
#                 to keep going", and retire (continuation is a fresh re-tag, not a
#                 retry of this job). This is the preserve-WIP path — a big ask like
#                 cee.wtf's EP lands a partial you can grow, instead of vanishing.
#   usage_limit-> out of budget, nothing landed. Honest reply, REQUEUE (budget resets).
#   too_big    -> ran out of turns AND got nothing coherent onto disk. Terminal, no
#                 retry (an identical run overruns identically); honest "too big" reply.
#   no_build   -> clean exit, nothing changed (a note-only reaction). Reply the note.
#   incomplete -> nothing landed for a TRANSIENT reason (crash/blip — not max-turns,
#                 not usage-limit). REQUEUE up to MAX_ATTEMPTS; a retry might get through.
ATTEMPT="${ATTEMPT:-1}"
MAX_ATTEMPTS="${MAX_ATTEMPTS:-3}"
if [ "$PUSHED" = "true" ] && [ -n "$MAX_TURNS_HIT" ]; then
  DISPOSITION="partial"
elif [ "$PUSHED" = "true" ]; then
  DISPOSITION="success"
elif [ -n "$USAGE_LIMIT" ]; then
  DISPOSITION="usage_limit"
elif [ -n "$MAX_TURNS_HIT" ]; then
  DISPOSITION="too_big"
elif [ "$BUILD_RC" -eq 0 ] && [ -z "$CHANGED" ]; then
  # Clean exit, nothing changed: the agent looked and chose not to build. If it left
  # a note that's the deliberate reaction; either way it's done, not retryable.
  DISPOSITION="no_build"
else
  DISPOSITION="incomplete"
fi

# Requeue decision. usage_limit always retries (budget will reset); a TRANSIENT
# incomplete retries until attempts run out. partial / too_big / success / no_build
# are all terminal for THIS job — a partial is continued by a NEW re-tag, not by
# requeuing this one (that would just re-run and overrun again).
REQUEUE="false"
if [ "$DISPOSITION" = "usage_limit" ]; then
  REQUEUE="true"
elif [ "$DISPOSITION" = "incomplete" ] && [ "$ATTEMPT" -lt "$MAX_ATTEMPTS" ]; then
  REQUEUE="true"
fi

# Post-deploy liveness check: the bot's whole promise is "it's live at <url>", so
# verify that's TRUE before saying it. On a success, poll the target URL until it
# serves (deploy.yml + Cloudflare take ~40s), bounded. This is the belt-and-braces
# for favstar-class misses: even if some future bug lets an unshipped build read as
# pushed, a dead URL is caught here and recorded, instead of the bot cheerfully
# linking a 404. LIVE_VERIFIED is passed to reply.mjs → logged on the outcome, so
# /health and the timeline can flag a build that pushed but never came up.
LIVE_VERIFIED=""
if { [ "$DISPOSITION" = "success" ] || [ "$DISPOSITION" = "partial" ]; } && [ -n "$BUILT_NAME" ]; then
  # <site> -> https://<site>.bisks.net ; <site>/<path> -> .../<path>
  SITE_HOST="${BUILT_NAME%%/*}"
  SITE_PATH=""
  [ "$BUILT_NAME" != "$SITE_HOST" ] && SITE_PATH="/${BUILT_NAME#*/}"
  LIVE_URL="https://${SITE_HOST}.bisks.net${SITE_PATH}"
  echo "=== verify live: $LIVE_URL ==="
  # ~90s budget (deploy is usually <60s). 2xx/3xx = live. New custom domains can
  # take longer to provision a cert; a miss here isn't fatal — it's recorded, and
  # the reply still goes out (the deploy may simply be a touch behind).
  for i in $(seq 1 9); do
    CODE="$(curl -s -o /dev/null -w '%{http_code}' --max-time 8 "$LIVE_URL" 2>/dev/null || echo 000)"
    if [ "$CODE" -ge 200 ] 2>/dev/null && [ "$CODE" -lt 400 ] 2>/dev/null; then
      LIVE_VERIFIED="true"
      echo "  live ($CODE) after ~$((i*10))s"
      break
    fi
    sleep 10
  done
  [ "$LIVE_VERIFIED" = "true" ] || echo "  NOT verified live within ~90s (last=$CODE) — recorded, reply still sent"
fi

echo "=== build rc=$BUILD_RC name='${BUILT_NAME}' (result='${BUILD_RESULT}' derived='${DERIVED_NAME}') note?=$([ -n "$BUILD_NOTE" ] && echo y || echo n) pushed=$PUSHED live=$([ "$LIVE_VERIFIED" = "true" ] && echo y || echo n) disp=$DISPOSITION attempt=$ATTEMPT/$MAX_ATTEMPTS requeue=$REQUEUE ==="

# When we're going to retry silently, don't post to the thread — a requeue isn't a
# user-facing event, and "trying again" spam under every slow build would be noise.
# We DO still report the outcome so the queue can requeue and the timeline reflects
# the attempt. reply.mjs treats REPLY_SKIP=1 as "report, don't post".
REPLY_SKIP=""
[ "$REQUEUE" = "true" ] && REPLY_SKIP="1"

# BUILD_OK gates the reply's celebratory vs. failure copy. Both success AND partial
# shipped real, live work, so both are "ok" (partial gets its own "not finished, tag
# to continue" wording via BUILD_ERROR below). BUILD_ERROR carries the sub-kind so
# reply.mjs picks the right honest line. We pass BUILT_NAME as BUILD_RESULT so
# reply.mjs's existing URL logic works whether the name was the agent's or derived.
BUILD_OK="false"
{ [ "$DISPOSITION" = "success" ] || [ "$DISPOSITION" = "partial" ]; } && BUILD_OK="true"
BUILD_ERROR=""
[ "$DISPOSITION" = "usage_limit" ] && BUILD_ERROR="usage_limit"
[ "$DISPOSITION" = "too_big" ] && BUILD_ERROR="too_big"
[ "$DISPOSITION" = "partial" ] && BUILD_ERROR="partial"

# Reply in-thread AND report the outcome to the event log — reply.mjs does both
# (it owns the /outcome POST, keyed by MENTION_URI, with the reply text as the
# logged replyText). DISPOSITION/REQUEUE tell the worker whether to retire or
# requeue the job. Same script the Action's reply step runs, same env contract.
echo "=== reply + report outcome (reply.mjs) ==="
BUILD_OK="$BUILD_OK" BUILD_RESULT="$BUILT_NAME" BUILD_NOTE="$BUILD_NOTE" BUILD_ERROR="$BUILD_ERROR" \
  DISPOSITION="$DISPOSITION" REQUEUE="$REQUEUE" REPLY_SKIP="$REPLY_SKIP" \
  ATTEMPT="$ATTEMPT" MAX_ATTEMPTS="$MAX_ATTEMPTS" LIVE_VERIFIED="$LIVE_VERIFIED" \
  BOT_IDENTIFIER="${BOT_IDENTIFIER}" BOT_APP_PASSWORD="${BOT_APP_PASSWORD}" \
  REPLY_ROOT_URI="${REPLY_ROOT_URI}" REPLY_ROOT_CID="${REPLY_ROOT_CID}" \
  REPLY_PARENT_URI="${REPLY_PARENT_URI}" REPLY_PARENT_CID="${REPLY_PARENT_CID}" \
  MENTION_URI="${MENTION_URI:-}" \
  OUTCOME_URL="${OUTCOME_URL:-https://buildthis.bisks.net/outcome}" \
  OUTCOME_SECRET="${OUTCOME_SECRET:-}" \
  node sites/buildthis/builder/reply.mjs

echo "=== done ==="
