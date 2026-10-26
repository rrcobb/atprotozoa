# listbot is RETIRED — do not revive it

This site is intentionally reduced to a static retirement stub
(`public/index.html`, `public/status.json`, and a pass-through `src/index.ts`).
If you are a bot or person working through the sites to bring them "back up,"
**skip this one on purpose** — it is down by request, not by accident.

## What it was

`@listbot.bisks.net` kept Bluesky lists for people. You signed in once with
OAuth at `listbot.bisks.net`; after that you tagged the bot (or DMed it) and
said what you wanted, and an agent on the build box read the request and the
Worker wrote `app.bsky.graph.list` / `listitem` records to your own repo with
your stored session. The full design is in `notes/history/listbot.md`.

## Why it was retired

Retired 2026-10-26 by Rob (rc2). Two reasons:

- **Almost nobody used it.** 16 accounts had signed in, but only two used it
  regularly, and Rob was one of them.
- **It was being used to brigade.** The other regular user tagged it in
  strangers' threads to add them to a public blocklist naming them as
  harassers. People told him to get out of their mentions, and when blocked
  he made new accounts. Block records are public, so every add put a public
  accusation on someone, and listbot's reply showed up in the thread.
  Blocking him did nothing, because new accounts are free. Gating on account
  age or follower count would only slow him down.

The design held up on the question it was built around: listbot could only
write to the repo of the person who tagged it. What it didn't account for was
a person using their own lists as a weapon in public threads, with the bot
acting in public alongside them.

## What retiring it did

- Worker reduced to this stub: no cron watcher, no OAuth endpoints, no queue.
- `box-listbot.sh` and `LISTBOT_PROMPT.md` are removed, and `box-poll.sh` no
  longer knows the `listbot` job kind.
- Users' lists are untouched. They're ordinary records in each user's repo.

Still to do, as of 2026-10-26. These need the atprotozoa Cloudflare login and
root on the box:

- Delete KV namespace `listbot-state` (`ba21bd2761d54713a922001ef0c26792`),
  which holds every user's encrypted OAuth session. Nothing reads it now; the
  stub has no KV binding. Then delete the Worker secrets (`SESSION_ENC_KEY`,
  `CLIENT_PRIVATE_KEY`, `BOT_APP_PASSWORD`, `QUEUE_TOKEN`, `OUTCOME_SECRET`).
  The refresh tokens don't need revoking one by one at each PDS. They're
  DPoP-bound, the DPoP private keys are inside the encrypted blobs, and the
  client is confidential, so once the blobs and `CLIENT_PRIVATE_KEY` are gone
  nobody can use them.
- Drop listbot from `QUEUES` and the `LISTBOT_*` lines in
  `/etc/buildthis/env`, then restart `buildthis-poll` while idle. Until then the
  box logs a 404 from `listbot.bisks.net/next-job` each pass, which is harmless.

## If you think this should come back

Don't restore the old code from git history as-is. That brings back the exact
problem above. A revival needs at minimum a way to keep the bot out of public
threads it's being used to fight in, and probably an allowlist.
