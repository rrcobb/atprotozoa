# Identity & DID — using bisks.net as a Bluesky handle

## What we're doing

Make **bisks.net** usable as Rob's Bluesky handle via the HTTP verification
method. This does **not** create a new identity or change the DID — the account
stays the same `did:plc:...`. We're just proving control of the domain so Bluesky
will let the domain (or a subdomain) *be* the handle.

Two verification methods exist in atproto; we use the HTTP one because we already
control the Worker:

- **HTTP (what we use):** serve `GET /.well-known/atproto-did` returning the DID
  as plain text. Simple, no DNS record needed.
- **DNS TXT (alternative):** a `_atproto.bisks.net` TXT record `did=<did>`. Works
  too, but we'd rather serve it from the apex Worker.

## The value to serve

`/.well-known/atproto-did` must return, as `text/plain`, exactly Rob's DID:

```
did:plc:f6n22z62adionrvb5s6n6vfk     # robcobbable.bsky.social
```

To find the current DID from the current handle:

```
curl "https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle=<current-handle>"
# -> {"did":"did:plc:..."}
```

Once the apex serves that DID at the well-known path, set the handle in the
Bluesky app: Settings → Account → Handle → "I have my own domain" → enter
`bisks.net` → verify. Bluesky fetches the well-known path, sees its own DID, and
switches the handle.

## Apex = handle (decision)

The handle is the **apex**: `bisks.net`. So the apex Worker owns both the landing
page and the well-known endpoint. Chosen over a subdomain handle (`rob.bisks.net`)
because the apex is the nicer handle and it's already the front door.

Concretely, the apex Worker's fetch handler routes:

- `GET /.well-known/atproto-did` → `text/plain` body = the DID.
- everything else → the static landing/gallery page (`public/`).

## did:web (NOT what we're doing, noted for later)

A different, more ambitious move is making the domain itself an *identity* via
`did:web:bisks.net` — serving `/.well-known/did.json` with a full DID document
(signing keys, PDS endpoint, etc.). That's a separate project (running or
delegating a PDS) and is out of scope for handle verification. Filed here so we
don't confuse the two: **handle verification reuses the existing did:plc; did:web
would be a brand-new identity.**

## Gotchas

- The well-known response must be **plain text**, just the DID, no JSON, no
  trailing junk. A stray newline is fine; HTML is not.
- If the apex is behind Cloudflare's default caching, make sure the well-known
  path isn't cached as HTML from an earlier deploy — bust cache or set explicit
  `content-type`.
- Changing your handle rotates what other people see; your old
  `<name>.bsky.social` handle is freed and your posts now attribute to
  `bisks.net`. The DID (permanent id) is unchanged, so nothing breaks.
