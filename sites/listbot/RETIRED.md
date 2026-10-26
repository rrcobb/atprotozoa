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
- KV namespace `listbot-state` deleted, which removed every user's encrypted
  OAuth session. The Worker secrets (`SESSION_ENC_KEY`, `CLIENT_PRIVATE_KEY`,
  `BOT_APP_PASSWORD`, `QUEUE_TOKEN`, `OUTCOME_SECRET`) are deleted too. The
  refresh tokens weren't revoked one by one at each PDS. They're DPoP-bound,
  and the DPoP private keys were inside the deleted blobs. The client is
  confidential, and its assertion key is gone. So nobody can use those tokens,
  and they expire on their own.
- The build box no longer polls listbot (`QUEUES` in `/etc/buildthis/env`),
  and `box-listbot.sh` / `LISTBOT_PROMPT.md` are removed.
- Users' lists are untouched. They're ordinary records in each user's repo.

## If you think this should come back

Don't restore the old code from git history as-is. That brings back the exact
problem above. A revival needs at minimum a way to keep the bot out of public
threads it's being used to fight in, and probably an allowlist.
