// Served at the root of tpk.bisks.net. Everything runs client-side (see
// public/index.html) — this Worker only exists to serve ASSETS and to render
// the per-party unfurl route /p/<seed> with a stamped OG description so a
// shared party actually shows a preview of what got rolled.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const m = url.pathname.match(/^\/p\/([A-Za-z0-9_-]+)$/);
    if (!m) return env.ASSETS.fetch(request);

    const seed = m[1];
    const res = await env.ASSETS.fetch(new Request(new URL("/", url), { method: "GET" }));
    const html = await res.text();

    const title = "TPK — a party got rolled";
    const desc = `Someone rolled a party of four and shared it. Odds are, they're not gonna make it. Open the link to see who (and how badly).`;
    const shareUrl = `https://tpk.bisks.net/p/${esc(seed)}`;

    const stamped = html
      .replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`)
      .replace(/property="og:title"\s+content="[^"]*"/, `property="og:title" content="${esc(title)}"`)
      .replace(/property="og:description"\s+content="[^"]*"/, `property="og:description" content="${esc(desc)}"`)
      .replace(/property="og:url"\s+content="[^"]*"/, `property="og:url" content="${esc(shareUrl)}"`)
      .replace(/name="twitter:title"\s+content="[^"]*"/, `name="twitter:title" content="${esc(title)}"`)
      .replace(/name="twitter:description"\s+content="[^"]*"/, `name="twitter:description" content="${esc(desc)}"`);

    return new Response(stamped, {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  },
};
