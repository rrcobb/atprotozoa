#!/usr/bin/env bash
# box-poll.sh — the builder box's work loop. Every few seconds it claims the next
# queued build from the watcher (POST /next-job, QUEUE_TOKEN-authed) and runs
# box-build.sh for it. One box, one loop, one build at a time — that IS the
# serialization (two agents never push to main at once), for free.
#
# The box only ever makes OUTBOUND calls (poll, push, reply) — nothing listens on
# the box. Runs as the unprivileged `builder` user under systemd (see the unit
# installed by box-setup.sh), which restarts it on crash/reboot.
#
# Reads /etc/buildthis/env for QUEUE_TOKEN + the build secrets.
set -uo pipefail  # NOT -e: a single failed build must never kill the loop.

ENV_FILE="${ENV_FILE:-/etc/buildthis/env}"
QUEUE_URL="${QUEUE_URL:-https://buildthis.bisks.net/next-job}"
POLL_INTERVAL="${POLL_INTERVAL:-15}"
BUILD_SCRIPT="${BUILD_SCRIPT:-/opt/atprotozoa/sites/buildthis/builder/box-build.sh}"

set -a; . "$ENV_FILE"; set +a
: "${QUEUE_TOKEN:?QUEUE_TOKEN missing from $ENV_FILE}"

echo "box-poll: starting; polling $QUEUE_URL every ${POLL_INTERVAL}s"

while true; do
  # Claim the next job. 200 + body = a job; 204 = empty; anything else = transient
  # error (log, back off, retry). Capture body + status in one call.
  RESP="$(curl -sS -w $'\n%{http_code}' -X POST "$QUEUE_URL" \
    -H "authorization: Bearer $QUEUE_TOKEN" 2>/dev/null)"
  CODE="$(printf '%s' "$RESP" | tail -n1)"
  BODY="$(printf '%s' "$RESP" | sed '$d')"

  if [ "$CODE" = "204" ]; then
    sleep "$POLL_INTERVAL"; continue
  fi
  if [ "$CODE" != "200" ] || [ -z "$BODY" ]; then
    echo "box-poll: /next-job returned '$CODE' (transient?) — backing off"
    sleep "$POLL_INTERVAL"; continue
  fi

  # Parse the job payload -> the env vars box-build.sh expects. jq is installed by
  # box-setup.sh. A malformed job is logged and skipped (it'll age out of the queue).
  if ! MENTION_URI="$(printf '%s' "$BODY" | jq -re .mentionUri)"; then
    echo "box-poll: unparseable job, skipping: $BODY"
    sleep "$POLL_INTERVAL"; continue
  fi
  echo "box-poll: claimed build for $MENTION_URI"

  # ATTEMPT is which try this is (1-based); the worker bumps it on each requeue so
  # box-build.sh can cap retries. Older jobs (pre-retry) have no attempts field —
  # jq's // 1 defaults them to attempt 1.
  BRIEF="$(printf '%s' "$BODY" | jq -r .brief)" \
  AUTHOR="$(printf '%s' "$BODY" | jq -r .authorHandle)" \
  BRIEF_IMAGES="$(printf '%s' "$BODY" | jq -c '.images // []')" \
  MENTION_URI="$MENTION_URI" \
  ATTEMPT="$(printf '%s' "$BODY" | jq -r '.attempts // 1')" \
  REPLY_ROOT_URI="$(printf '%s' "$BODY" | jq -r .replyRootUri)" \
  REPLY_ROOT_CID="$(printf '%s' "$BODY" | jq -r .replyRootCid)" \
  REPLY_PARENT_URI="$(printf '%s' "$BODY" | jq -r .replyParentUri)" \
  REPLY_PARENT_CID="$(printf '%s' "$BODY" | jq -r .replyParentCid)" \
    bash "$BUILD_SCRIPT"
  RC=$?
  echo "box-poll: build for $MENTION_URI finished rc=$RC"
  # box-build.sh's reply.mjs POSTs /outcome, which retires the job from the queue.
  # If the build died before reply.mjs ran (rc!=0 and no outcome), the job stays
  # 'claimed' and ages out on its TTL — it won't be re-served, so a wedged build
  # fails safe rather than looping. (Next tick just polls for the next job.)
done
