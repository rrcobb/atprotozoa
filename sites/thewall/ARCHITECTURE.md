# The Wall Architecture

The Wall is a static client-side board. There is no Worker application,
Durable Object, or board API. The deployed assets are served directly and the
browser owns the board state.

Each `/b/<id>` board uses a board-specific `localStorage` key containing an
append-only-ish JSON event log. Card additions, edits, removals, and edge
changes are events. On startup (and when another tab changes the key), the
client replays the log from the beginning into fresh maps and sets. This makes
local reconstruction deterministic while retaining the simple, inspectable
history of mutations. A browser `storage` event provides best-effort updates
between tabs; the board is intentionally local to one browser profile and is
not shared by sending its URL alone.

Skeet imports still use the public AppView from the browser, then store the
returned card data in the local event log. Optional PDS synchronization can be
added in the future if authentication is introduced; it is not part of the
current local model.
