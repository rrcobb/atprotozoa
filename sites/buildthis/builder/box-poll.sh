#!/usr/bin/env bash
# box-poll.sh — the box's work loop. Every few seconds it claims the next queued
# job from each bot that has one (POST /next-job, QUEUE_TOKEN-authed) and runs
# the script for that job's kind. One box, one loop, one job at a time — that IS
# the serialization (two agents never push to main at once), for free.
#
# The box only ever makes OUTBOUND calls (poll, push, reply) — nothing listens on
# the box. Runs as the unprivileged `builder` user under systemd (see the unit
# installed by box-setup.sh), which restarts it on crash/reboot.
#
# MULTI-BOT. The box started as buildthis's alone and is now a general runner:
# each bot's Worker serves its own /next-job with its own token, and the box
# polls them in turn. Each bot keeps its own queue in its own KV namespace —
# nothing is shared, which is the point. listbot's queue holds tag text; its
# Worker holds OAuth tokens that must never come near here.
#
# A job's `kind` picks the script. An unknown kind is logged and skipped rather
# than guessed at — a job the box doesn't understand is a deploy-order problem
# (worker updated before the box), and skipping lets it age out harmlessly.
#
# Configure the endpoints in /etc/buildthis/env as QUEUES: a space-separated list
# of name|url|token-var-name. Unset, it falls back to buildthis alone, so an
# un-updated env file keeps working exactly as before.
#
# Reads /etc/buildthis/env for the queue tokens + the job secrets.
set -uo pipefail  # NOT -e: a single failed job must never kill the loop.

ENV_FILE="${ENV_FILE:-/etc/buildthis/env}"
POLL_INTERVAL="${POLL_INTERVAL:-15}"
BUILDER_DIR="${BUILDER_DIR:-/opt/atprotozoa/sites/buildthis/builder}"

set -a; . "$ENV_FILE"; set +a

# name|url|token-var. Defaulting to buildthis alone keeps a box whose env file
# predates multi-bot working unchanged.
QUEUES="${QUEUES:-buildthis|https://buildthis.bisks.net/next-job|QUEUE_TOKEN}"

: "${QUEUE_TOKEN:?QUEUE_TOKEN missing from $ENV_FILE}"

# kind -> script. `build` is buildthis's and stays the default for jobs with no
# kind field, so jobs queued by an older worker still run.
script_for_kind() {
  case "$1" in
    build)   echo "$BUILDER_DIR/box-build.sh" ;;
    listbot) echo "$BUILDER_DIR/box-listbot.sh" ;;
    *)       echo "" ;;
  esac
}

echo "box-poll: starting; polling every ${POLL_INTERVAL}s"
for q in $QUEUES; do
  echo "box-poll:   queue ${q%%|*} -> $(echo "$q" | cut -d'|' -f2)"
done

while true; do
  WORKED=0

  for QUEUE in $QUEUES; do
    QNAME="$(echo "$QUEUE" | cut -d'|' -f1)"
    QURL="$(echo "$QUEUE" | cut -d'|' -f2)"
    QTOKEN_VAR="$(echo "$QUEUE" | cut -d'|' -f3)"
    QTOKEN="${!QTOKEN_VAR:-}"

    if [ -z "$QTOKEN" ]; then
      echo "box-poll: $QNAME has no token in \$$QTOKEN_VAR — skipping"
      continue
    fi

    # Claim the next job. 200 + body = a job; 204 = empty; anything else =
    # transient error (log, move on, retry next pass).
    RESP="$(curl -sS -w $'\n%{http_code}' -X POST "$QURL" \
      -H "authorization: Bearer $QTOKEN" 2>/dev/null)"
    CODE="$(printf '%s' "$RESP" | tail -n1)"
    BODY="$(printf '%s' "$RESP" | sed '$d')"

    [ "$CODE" = "204" ] && continue
    if [ "$CODE" != "200" ] || [ -z "$BODY" ]; then
      echo "box-poll: $QNAME /next-job returned '$CODE' (transient?)"
      continue
    fi

    # Jobs with no kind are buildthis builds from before the field existed.
    KIND="$(printf '%s' "$BODY" | jq -r '.kind // "build"')"
    SCRIPT="$(script_for_kind "$KIND")"
    if [ -z "$SCRIPT" ] || [ ! -f "$SCRIPT" ]; then
      echo "box-poll: $QNAME job has unknown kind '$KIND' — skipping (it'll age out)"
      continue
    fi

    if ! MENTION_URI="$(printf '%s' "$BODY" | jq -re .mentionUri)"; then
      echo "box-poll: $QNAME unparseable job, skipping: $BODY"
      continue
    fi

    echo "box-poll: claimed $KIND job for $MENTION_URI"
    WORKED=1

    case "$KIND" in
      build)
        # ATTEMPT is which try this is (1-based); the worker bumps it on each
        # requeue so box-build.sh can cap retries. Older jobs have no attempts
        # field — jq's // 1 defaults them to attempt 1.
        BRIEF="$(printf '%s' "$BODY" | jq -r .brief)" \
        AUTHOR="$(printf '%s' "$BODY" | jq -r .authorHandle)" \
        BRIEF_IMAGES="$(printf '%s' "$BODY" | jq -c '.images // []')" \
        MENTION_URI="$MENTION_URI" \
        ATTEMPT="$(printf '%s' "$BODY" | jq -r '.attempts // 1')" \
        REPLY_ROOT_URI="$(printf '%s' "$BODY" | jq -r .replyRootUri)" \
        REPLY_ROOT_CID="$(printf '%s' "$BODY" | jq -r .replyRootCid)" \
        REPLY_PARENT_URI="$(printf '%s' "$BODY" | jq -r .replyParentUri)" \
        REPLY_PARENT_CID="$(printf '%s' "$BODY" | jq -r .replyParentCid)" \
          bash "$SCRIPT"
        ;;
      listbot)
        # The whole job rides in as JSON — it's one structured blob (tag text,
        # the thread, the user's existing lists) rather than a handful of
        # scalars, and the script hands it straight to the agent.
        JOB_JSON="$BODY" \
        MENTION_URI="$MENTION_URI" \
        OUTCOME_URL="$(printf '%s' "$BODY" | jq -r '.outcomeUrl // empty')" \
          bash "$SCRIPT"
        ;;
    esac

    RC=$?
    echo "box-poll: $KIND job for $MENTION_URI finished rc=$RC"
    # The job scripts POST /outcome, which retires the job from its queue. If one
    # died before reporting, the job stays 'claimed' and ages out on its TTL — it
    # won't be re-served, so a wedged job fails safe rather than looping.
  done

  # Only sleep when every queue was empty. A backlog drains at full speed;
  # an idle box polls gently.
  [ "$WORKED" = "0" ] && sleep "$POLL_INTERVAL"
done
