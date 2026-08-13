# bigwalk architecture

bigwalk is a static client-side async race. The browser resolves the entered
handle and its moot pool through the public Bluesky AppView, then runs the
countdown, movement, elimination, and ghost replay locally. It makes no
requests to a bigwalk backend and has no Durable Object, WebSocket, presence,
or shared start coordination.

Runs and history are stored in `localStorage`, under keys scoped to the
normalized handle. A finished run stores a compact step trace and becomes a
ghost for later local races. Different browsers therefore converge only when
their users share a handle or link; the model is intentionally eventual and
local rather than authoritative multiplayer.

Publishing ghosts or results to a PDS could be added later as an optional
extension, but would require authentication and explicit user consent.
