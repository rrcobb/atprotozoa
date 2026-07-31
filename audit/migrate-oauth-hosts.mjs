// Move OAuth sites' canonical host from bisks.net/<name> to <name>.bisks.net.
//
// An atproto OAuth client is identified BY ITS client_id URL, and that URL must
// be the document's own location — the PDS fetches client-metadata.json from
// client_id and checks the contents agree. So a client cannot be dual-homed:
// deriving MOUNT from location.pathname (correct for plain static assets) is
// WRONG here, because on the subdomain it would compute a client_id of
// https://<name>.bisks.net/client-metadata.json while the static file still
// declared the bisks.net/<name> identity, and the handshake would be rejected.
//
// So for these sites we pick ONE canonical host — the subdomain — and rewrite
// both the metadata and the MOUNT constant to match. The path route keeps
// serving the site, but login only works on the canonical host.
//
// Usage: node audit/migrate-oauth-hosts.mjs [--apply]
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";

const root = new URL("../", import.meta.url);
const sitesDir = new URL("./sites/", root);
const APPLY = process.argv.includes("--apply");

const done = [];
for (const name of readdirSync(sitesDir).sort()) {
  const dir = new URL(`./${name}/`, sitesDir);
  const metaUrl = new URL("./public/client-metadata.json", dir);
  if (!existsSync(metaUrl)) continue;

  const raw = readFileSync(metaUrl, "utf8");
  const meta = JSON.parse(raw);
  const pathBase = `https://bisks.net/${name}`;
  if (!meta.client_id.startsWith(pathBase)) continue; // already subdomain-canonical

  const host = `https://${name}.bisks.net`;
  meta.client_id = `${host}/client-metadata.json`;
  meta.client_uri = host;
  meta.redirect_uris = meta.redirect_uris.map((u) =>
    u.startsWith(pathBase) ? host + u.slice(pathBase.length) || host + "/" : u,
  );

  const edits = [[metaUrl, JSON.stringify(meta, null, 2) + "\n"]];

  // The companion MOUNT constant must become a constant "" — on the canonical
  // subdomain there is no path prefix, and a location-derived value would make
  // client_id vary by host, which is exactly what breaks the handshake.
  const walk = (d, rel = "") => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const child = new URL(`./${e.name}${e.isDirectory() ? "/" : ""}`, d);
      if (e.isDirectory()) { walk(child, rel + e.name + "/"); continue; }
      if (!/\.(js|html)$/.test(e.name)) continue;
      const txt = readFileSync(child, "utf8");
      const re = new RegExp(
        `((?:export\\s+)?(?:const|let|var)\\s+MOUNT\\s*=\\s*)location\\.pathname\\.startsWith\\("/${name}"\\) \\? "/${name}" : "";`,
      );
      if (!re.test(txt)) continue;
      edits.push([
        child,
        txt.replace(
          re,
          `$1""; // canonical host is ${name}.bisks.net — see audit/migrate-oauth-hosts.mjs`,
        ),
      ]);
    }
  };
  walk(new URL("./public/", dir));

  done.push(`${name} -> ${host}  (${edits.length} files)`);
  if (APPLY) for (const [u, c] of edits) writeFileSync(u, c);
}

for (const d of done) console.log(d);
console.log(`\n${done.length} OAuth sites ${APPLY ? "moved" : "would move"} to subdomain-canonical`);
if (!APPLY) console.log("DRY RUN — pass --apply to write.");
