# docmoot architecture

`docmoot` is intentionally an assets-only Worker. The browser owns the current
draft in `localStorage`; there is no shared relay, Durable Object, WebSocket,
presence service, or server-side document state.

Signed-in users can publish a durable `net.bisks.docmoot.snapshot` record to
their own PDS. That is the sharing boundary: a revision can be exported,
restored into a local draft, or shared as an atproto record. This is not
keystroke-level multi-writer editing, and a browser that has never seen a
draft cannot reconstruct it from the short document URL alone.

The deliberate tradeoff is a simple static deployment over a live coordinator.
If collaborative records are added later, they should remain user-owned,
append-only revisions with client-side conflict handling rather than restoring
a central authoritative document.

## Network revision list

Opening a doc (`/d/<id>`) also shows every `net.bisks.docmoot.snapshot` record
on the network whose `docId` matches — `public/lib/global-index.js`'s
`SnapshotIndex`, following the `listReposByCollection` backfill + Jetstream
live-tail recipe used by steamtags/catspace/quadrants (see
`notes/ideas/pds-and-lexicons.md` item 3). This is still read-only discovery,
not a relay: a snapshot's rkey is a PDS-assigned TID rather than the docId, so
unlike those sites' single-record-per-did index, `backfillDid` pages through a
candidate's *whole* snapshot collection via `listRecords` and filters locally.
Opening someone else's revision creates a new local draft; it never overwrites
the draft currently open.
