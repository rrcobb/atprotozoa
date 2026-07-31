// verbs Worker — served at verbs.bisks.net and, for older shared links, at
// the bisks.net/verbs path route (see notes/20-deploy.md).
//
// The site's assets live at the root of ./public and have no idea which of
// those two hostnames they're being served under, so the only server job is to
// strip the "/verbs" mount prefix when — and only when — it's actually there.
// Stripping unconditionally is a real bug: on the subdomain the prefix is
// absent, so slicing chops the front off short paths instead ("/app.js" ->
// "") and every asset silently serves index.html.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

const PREFIX = "/verbs";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const mounted =
      url.pathname === PREFIX || url.pathname.startsWith(PREFIX + "/");

    // Bare mount path with no trailing slash: relative asset URLs in the HTML
    // would resolve against "/verbs" as a filename rather than a directory and
    // drop the prefix. Redirect so the browser's URL carries the slash.
    if (url.pathname === PREFIX) {
      url.pathname = PREFIX + "/";
      return Response.redirect(url.toString(), 308);
    }

    if (mounted) {
      url.pathname = url.pathname.slice(PREFIX.length) || "/";
    }
    return env.ASSETS.fetch(new Request(url, request));
  },
};
