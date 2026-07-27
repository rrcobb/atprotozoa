// alice-meets-bob Worker — mounted at bisks.net/alice-meets-bob/ (see
// notes/40-new-site-playbook.md). Pure static site; the only server job is
// stripping the "/alice-meets-bob" mount prefix before handing the request
// to the static-asset router, since the assets directory has no idea it
// isn't living at the domain root. All the OAuth + ECDH crush-matching logic
// runs client-side (see public/index.html + public/lib/) — there is nothing
// for a server to see even if there were one.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

const PREFIX = "/alice-meets-bob";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    url.pathname = url.pathname.slice(PREFIX.length) || "/";
    return env.ASSETS.fetch(new Request(url, request));
  },
};
