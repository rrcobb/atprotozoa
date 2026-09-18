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
#   - No repo checkout. It runs in an empty scratch dir, so there is no source
#     tree to edit even by accident. (box-build.sh runs in /opt/atprotozoa and
#     needs Edit/Write; this deliberately does not.)
#   - No Edit, no Write. Read-only tools only.
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
      --allowedTools Read,Grep,Glob,WebFetch \
    2>&1
) | tee "$CLAUDE_LOG"
AGENT_RC=${PIPESTATUS[0]}
set -e

# The agent writes its answer to INTENT.json in its scratch dir. Reading a file
# rather than parsing stdout: the CLI's output carries reasoning prose around the
# answer, and grepping JSON out of prose is exactly the brittleness that makes a
# bot feel broken at 2am.
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
  [ "$AGENT_RC" -eq 124 ] || [ "$AGENT_RC" -eq 137 ] && REASON="timed out"
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
