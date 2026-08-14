# derivatives architecture

The Worker stores one serialized anonymous play-money snapshot in KV. It has
no Durable Object, alarm, or authoritative settlement service. Repo discovery
and market resolution happen lazily when a visitor requests the API, so KV
replication and concurrent requests can make odds and balances temporarily
stale or non-atomic. This is a game display, not a financial ledger.
