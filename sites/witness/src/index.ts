// witness Worker — served at the root of witness.bisks.net.
// Every entry is a plain net.bisks.witness.entry record the browser writes to
// the *poster's own* PDS; the feed, category filters, and duplicate-report
// tally are all computed client-side by replaying every repo's entries
// network-wide (public/lib/global-index.js). No KV, no Durable Object, no
// server-side state at all — this Worker is a pure static-asset passthrough.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
