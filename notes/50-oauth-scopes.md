# OAuth scopes: minimal necessary, always

Every OAuth-using site requests exactly the atproto scope it needs — never a
blanket `atproto transition:generic` (the legacy "full account access, same
as an app password" scope) as a default or a shortcut. This was informally
true before; as of 2026-08-05 it's a hard rule, prompted by @isolyth.dev
asking the bot to scan the whole repo for over-broad scopes and narrow them
(see `sites/hyperobject`'s history for the request that started it).

## The rule

When a site's OAuth flow only ever does specific things — create a record in
one custom collection, post to `app.bsky.feed.post`, delete rows from a
collection it owns — its `client-metadata.json` `scope` field says exactly
that, using atproto's granular permission syntax, not the legacy transition
scope:

- **`repo:<nsid>?action=create`** — create-only on one collection. Chain
  `&action=update` / `&action=delete` for the actions actually used; omit
  `?action=...` entirely only if the site genuinely does all three (create +
  update + delete), since that's the default.
- **`blob:<mime-glob>`** — e.g. `blob:image/*` for image uploads. Narrower
  than the implicit "any blob" that comes bundled with `transition:generic`.
- **`rpc:<lxm>?aud=<aud>`** — permission to call one XRPC method proxied
  through the user's own PDS to another service. Two shapes show up here:
  - Reading Bluesky's AppView through the user's session (personal timeline,
    notifications) — `aud=did:web:api.bsky.app%23bsky_appview` (the `#` must
    be percent-encoded as `%23` inside the scope string). See
    `sites/skyclone/public/lib/oauth.js` (four rpc grants: getTimeline,
    listNotifications, updateSeen, getUnreadCount) and
    `sites/verdict/public/lib/oauth.js` (getTimeline only).
  - Minting a `com.atproto.server.getServiceAuth` token for a *third-party*
    service (e.g. video.bsky.app) — the audience is the user's own PDS DID,
    which varies per user, so the scope uses a wildcard aud:
    `rpc:app.bsky.video.uploadVideo?aud=*`. See
    `sites/mootdrone/public/lib/videopost.js` for the full three-hop flow
    this covers.
  - `rpc:*?aud=*` (wildcard both) is invalid — at most one side can be `*`.
- Space-separate multiple grants in one `scope` string, same as
  `sites/hyperobject/public/client-metadata.json`:
  `"atproto repo:net.bisks.x.a?action=create repo:net.bisks.x.b?action=create"`.

`atproto` alone (no `transition:*`, no `repo:`/`rpc:`/`blob:`) is correct
for a site that only needs to know who's signed in and never writes
anything — see `sites/nothingness`.

**Figure out the actual write/read surface before writing the scope.** Grep
the site for `createRecord` / `putRecord` / `deleteRecord` / `uploadBlob` /
calls proxied through `session.pdsUrl`, note the collection and the action
each call performs, and scope to exactly that set. Don't guess broad because
it's easier — the whole point is that it isn't the default anymore.

## The two places scope lives — keep them in lockstep

Every OAuth site declares scope **twice**: once in `public/client-metadata.json`
(what the PDS allows this client to ever ask for) and once as the `SCOPE`
constant in `public/lib/oauth.js` (what the `/authorize` request actually
asks for). **These two must be identical.** If `oauth.js` requests a wider
scope than `client-metadata.json` declares, the PDS rejects the authorize
request outright — narrowing one file without the other doesn't narrow
anything, it just breaks login. When you change one, change both, in the
same edit.

## Known risk, and the rollback if it bites

Granular scopes (`repo:`/`rpc:`/`blob:`) are a newer part of the atproto
OAuth spec than `transition:generic`, and `sites/skyclone` originally shipped
on the broad scope specifically because narrower scopes were untested
against this codebase's PDSes at the time (2026-07-27). `sites/hyperobject`
then proved the `repo:<collection>?action=create` pattern works end-to-end
(2026-08-05), and that pattern is now used across every site in this repo —
see the sites listed above.

If a user ever reports login failing with something like `invalid_scope` on
a specific site, the fast, safe fix is reverting *that one site's*
`client-metadata.json` and `oauth.js` `SCOPE` back to `"atproto
transition:generic"` (both files, together — see above) rather than trying
to debug the exact granular syntax their PDS rejected. That's a regression
for that site, not a repo-wide verdict — leave the other sites narrowed.

## For new sites

Don't copy `"atproto transition:generic"` from an older sibling site out of
habit. Copy the *pattern* — grep the sibling for its actual write calls, then
write a scope that matches only what the new site does. `sites/hyperobject`,
`sites/drivethru`, and `sites/mootdrone` are good references for, respectively:
several custom collections, a single `app.bsky.*` write, and a third-party
service-auth flow.
