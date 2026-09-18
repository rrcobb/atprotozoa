#!/usr/bin/env bash
# box-listbot.sh — resolve ONE listbot tag into an intent.
#
# listbot's Worker sees a tag like "@listbot.bisks.net cool posters" — or just
# "@listbot do it" — and needs to know what the person meant. That's this job.
# The agent reads the thread, looks at who the subject is, looks at the lists the
# user already has, and returns a structured answer. The WORKER then does the
# write, because the worker is what holds the OAuth tokens.
#
# THE SPLIT THAT MATTERS: this agent reads, it does not write.
#
#   - No repo checkout. It runs in a FRESH TEMP DIR created per job and deleted
#     after, so there is no source tree to edit even by accident. (box-build.sh
#     runs in /opt/atprotozoa and needs to edit it; this deliberately does not.)
#   - It can write, but only into that temp dir, and the directory is the
#     boundary — not a permission rule. Tried `--allowedTools 'Edit(INTENT.json)'`
#     first, on the assumption it confines writes to one path. Measured: it does
#     NOT. In a directory the CLI already trusts it writes anything; outside one,
#     it wrote a file the rule didn't name and declined the file it did. So the
#     scoping is not a boundary and isn't treated as one here.
#   - No credentials in its environment. No BUILDER_PAT (can't push), no
#     BOT_APP_PASSWORD (can't post as the bot), and nothing that could decrypt a
#     user's OAuth session — those never leave Cloudflare.
#   - Its output is a JSON intent, not an action. The worker validates it against
#     the user's actual lists before touching anything.
#
# So the worst a confused or prompt-injected agent can do is return a wrong
# intent about ONE tag, on ONE list, for the person who tagged it — which they
# can undo with one tap at listbot.bisks.net/lists. It cannot write to the repo,
# cannot act on anyone else's account, and cannot reach a token.
#
# Prompt injection is a live concern here in a way it isn't for buildthis: the
# input is a stranger's post text, and the agent reads a whole thread of more
# strangers' text. The mitigation is the above — capability, not instruction.
# Do not add write tools to this script.
#
# Input:  JOB_JSON     — the whole job (tag text, thread, subject, user's lists)
#         MENTION_URI  — keys the outcome
#         OUTCOME_URL  — where to report back
# Output: POST to OUTCOME_URL, {mentionUri, intent|error}
set -uo pipefail

: "${JOB_JSON:?JOB_JSON is required}"
: "${MENTION_URI:?MENTION_URI is required}"
: "${CLAUDE_CODE_OAUTH_TOKEN:?source /etc/buildthis/env first}"

# Same billing guard as box-build.sh: an API key anywhere in the environment
# silently outranks the subscription token and switches to per-token billing.
unset ANTHROPIC_API_KEY ANTHROPIC_BASE_URL

BUILDER_DIR="${BUILDER_DIR:-/opt/atprotozoa/sites/buildthis/builder}"
LISTBOT_MODEL="${LISTBOT_MODEL:-claude-sonnet-5}"
# Generous: the point is that it looks around properly. This is a liveness
# guard, not a budget — an agent still going after 30 turns is stuck.
LISTBOT_MAX_TURNS="${LISTBOT_MAX_TURNS:-30}"
LISTBOT_TIMEOUT="${LISTBOT_TIMEOUT:-4m}"

# An empty scratch dir, NOT the repo checkout. See the header.
WORK_DIR="$(mktemp -d /tmp/listbot-job.XXXXXX)"
cleanup() { rm -rf "$WORK_DIR"; }
trap cleanup EXIT

printf '%s' "$JOB_JSON" > "$WORK_DIR/job.json"

echo "=== listbot: resolving $MENTION_URI ==="

CLAUDE_LOG="$(mktemp /tmp/listbot-claude.XXXXXX.log)"
set +e
(
  cd "$WORK_DIR" || exit 1
  CLAUDE_CODE_OAUTH_TOKEN="$CLAUDE_CODE_OAUTH_TOKEN" \
    timeout --signal=TERM --kill-after=30s "$LISTBOT_TIMEOUT" \
    claude -p "$(cat "$BUILDER_DIR/LISTBOT_PROMPT.md")" \
      --model "$LISTBOT_MODEL" \
      --max-turns "$LISTBOT_MAX_TURNS" \
      --allowedTools Read,Grep,Glob,WebFetch,Write \
      --permission-mode bypassPermissions \
    2>&1
) | tee "$CLAUDE_LOG"
AGENT_RC=${PIPESTATUS[0]}
set -e

# The agent writes its answer to INTENT.json in its scratch dir. Reading a file
# rather than parsing stdout: the CLI's output carries reasoning prose around the
# answer, and grepping JSON out of prose is exactly the brittleness that makes a
# bot feel broken at 2am.
#
# It needs Write and bypassPermissions to do that. Without them the run ends with
# the agent ASKING for permission to write its own output — which is exactly what
# happened to the first tag that reached it: it reasoned correctly, then said
# "I need permission to write the output file", nobody was there to answer, and
# the user got "something went wrong working that out".
#
# bypassPermissions is safe here for the reason box-build.sh relies on and then
# some: unprivileged user, no repo checkout, no credentials in the environment,
# and a working directory that is a fresh temp dir holding one file.
INTENT=""
if [ -f "$WORK_DIR/INTENT.json" ]; then
  if jq -e . >/dev/null 2>&1 < "$WORK_DIR/INTENT.json"; then
    INTENT="$(cat "$WORK_DIR/INTENT.json")"
  else
    echo "listbot: INTENT.json is not valid JSON"
  fi
fi

if [ -z "$INTENT" ]; then
  # No usable answer. Report the failure rather than staying silent — the worker
  # replies to the user, and silence is the worst outcome for someone who tagged.
  REASON="the agent didn't produce an answer"
  # 124 from timeout, 137 if it needed the KILL. Written as an if rather than
  # `[ a ] || [ b ] && x`, which bash groups as `([ a ] || [ b ]) && x` — right
  # by luck here, and wrong the moment someone adds set -e.
  if [ "$AGENT_RC" -eq 124 ] || [ "$AGENT_RC" -eq 137 ]; then
    REASON="timed out"
  fi
  INTENT="$(jq -n --arg r "$REASON" '{action:"failed", reason:$r}')"
fi

echo "=== listbot: intent ==="
printf '%s\n' "$INTENT"

if [ -n "${OUTCOME_URL:-}" ] && [ -n "${LISTBOT_OUTCOME_SECRET:-}" ]; then
  BODY="$(jq -n --arg uri "$MENTION_URI" --argjson intent "$INTENT" \
    '{mentionUri:$uri, intent:$intent}')"
  CODE="$(curl -sS -o /dev/null -w '%{http_code}' -X POST "$OUTCOME_URL" \
    -H "authorization: Bearer $LISTBOT_OUTCOME_SECRET" \
    -H "content-type: application/json" \
    -d "$BODY" 2>/dev/null)"
  echo "listbot: reported outcome -> $CODE"
else
  echo "listbot: no OUTCOME_URL/LISTBOT_OUTCOME_SECRET — not reporting"
fi

rm -f "$CLAUDE_LOG"
