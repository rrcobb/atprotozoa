# presspool architecture

The Worker stores the anonymous play-money round and ledger in one KV
snapshot. It has no Durable Object or alarm; it reconciles against
`dontpressit` when visitors request the market. KV is eventually consistent and
does not provide atomic settlement, so displayed balances and payouts are
non-authoritative game state, not real money or a financial ledger.
