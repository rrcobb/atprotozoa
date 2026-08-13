// Worker entry — likescore.bisks.net. Routes /api/* to the LikeScoreEngine
// Durable Object (the whole scan + persistence + scoring layer, see
// engine.ts); everything else is static ASSETS. The DO class must be
// exported from the module wrangler.toml points `main` at, so it's
// re-exported here.
import { LikeScoreEngine, type Env } from "./engine.ts";

export { LikeScoreEngine };
export type { Env };

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      const id = env.ENGINE.idFromName("global");
      const stub = env.ENGINE.get(id);
      return stub.fetch(request);
    }
    return env.ASSETS.fetch(request);
  },
};
