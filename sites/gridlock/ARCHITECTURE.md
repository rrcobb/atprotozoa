# gridlock architecture

gridlock is a static, single-tab browser toy. The browser resolves the entered
handle and its moot pool through the public Bluesky AppView, then keeps the jam
state locally. Notes, honks, mileage, checklist clears, and the creep timer use
`localStorage` and `setInterval`; there is no backend, Durable Object, WebSocket,
alarm, presence service, or shared room.

State is scoped to the normalized handle. A shared site link starts a separate
local jam in each browser, so counters and notes are intentionally not
authoritative or synchronized between people. The public roster is refreshed
when a jam is started.
