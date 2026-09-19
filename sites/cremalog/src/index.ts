// cremalog Worker — purely static. Every review is a net.bisks.cremalog.review
// record the browser signs and writes to the *writer's own* PDS (public/lib/records.js);
// the log itself is read straight back off that PDS (public/lib/log.js), so
// there is nothing dynamic for this Worker to render — just forward to the
// ASSETS binding.

export interface Env {
  ASSETS: { fetch: (request: Request) => Promise<Response> };
}

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
