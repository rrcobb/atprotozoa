# guestbet architecture

The Worker stores the anonymous play-money round, bets, and history in one KV
snapshot. It has no Durable Object or alarm; round resolution is reconciled on
API requests against the public guest board. KV is eventually consistent and
does not provide atomic settlement, so balances and odds are explicitly
non-authoritative game state, not real money or a financial ledger.
