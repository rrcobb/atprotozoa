// brennanswedding is a static page; the guestbook is real Bluesky posts read
// back client-side (see public/index.html), so the Worker just serves assets.
export interface Env {
  ASSETS: { fetch: (request: Request) => Promise<Response> };
}

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
