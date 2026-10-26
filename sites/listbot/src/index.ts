// listbot Worker — RETIRED
//
// This bot made and edited Bluesky lists in signed-in users' own repos when
// they tagged it. It was retired on 2026-10-26 (see RETIRED.md). Reduced to a
// static retirement stub: no watcher, no OAuth, no stored sessions, no queue.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
