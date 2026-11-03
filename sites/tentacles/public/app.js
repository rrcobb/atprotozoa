const $ = (id) => document.getElementById(id);
const NS = "http://www.w3.org/2000/svg";
const APPVIEW = "https://public.api.bsky.app";

async function getJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} from ${new URL(url).host}`);
  return r.json();
}

export function normalizeHandle(s) {
  return String(s || "").trim().replace(/^@+/, "").toLowerCase();
}

async function resolve(input) {
  if (input.startsWith("did:")) return input;
  const j = await getJson(`${APPVIEW}/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(input)}`);
  return j.did;
}

async function didDoc(did) {
  if (did.startsWith("did:plc:")) return getJson(`https://plc.directory/${did}`);
  if (did.startsWith("did:web:")) return getJson(`https://${did.slice(8)}/.well-known/did.json`);
  throw new Error("unsupported DID method");
}

// Each tentacle: label, a function returning {value, detail}.
async function gather(did) {
  const doc = await didDoc(did);
  const svc = (doc.service || []).find((s) => s.id === "#atproto_pds");
  const pds = svc ? svc.serviceEndpoint : null;
  const handle = ((doc.alsoKnownAs || []).find((a) => a.startsWith("at://")) || "").slice(5) || "(none)";
  const key = (doc.verificationMethod || []).find((v) => v.id.endsWith("#atproto"));
  const labeler = (doc.service || []).find((s) => s.id === "#atproto_labeler");
  const out = [];
  out.push({ k: "handle", v: handle, d: `alsoKnownAs: ${(doc.alsoKnownAs || []).join(", ")}` });
  out.push({ k: "did", v: did.length > 26 ? did.slice(0, 24) + "…" : did, d: did });
  out.push({ k: "pds", v: pds ? new URL(pds).host : "none", d: pds || "no #atproto_pds service in the DID document" });
  out.push({ k: "signing key", v: key ? key.publicKeyMultibase.slice(0, 12) + "…" : "none", d: key ? key.publicKeyMultibase : "no #atproto verification method" });
  out.push({ k: "labeler", v: labeler ? "yes" : "no", d: labeler ? labeler.serviceEndpoint : "no #atproto_labeler service: this account does not publish labels" });

  const jobs = [];
  if (did.startsWith("did:plc:")) {
    jobs.push(getJson(`https://plc.directory/${did}/log`).then((log) => {
      out.push({ k: "plc history", v: `${log.length} op${log.length === 1 ? "" : "s"}`, d: `created ${log[0].createdAt}; latest ${log[log.length - 1].createdAt}` });
    }).catch(() => {}));
  }
  if (pds) {
    jobs.push(getJson(`${pds}/xrpc/com.atproto.repo.describeRepo?repo=${encodeURIComponent(did)}`).then((r) => {
      const c = r.collections || [];
      out.push({ k: "collections", v: String(c.length), d: c.join("  ·  ") || "empty repo" });
    }).catch((e) => out.push({ k: "collections", v: "?", d: "describeRepo failed: " + e.message })));
  }
  jobs.push(getJson(`${APPVIEW}/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(did)}`).then((p) => {
    out.push({ k: "appview", v: `${p.postsCount} posts`, d: `${p.followersCount} followers · ${p.followsCount} follows · ${p.postsCount} posts${p.displayName ? " · " + p.displayName : ""}` });
  }).catch(() => {}));
  await Promise.all(jobs);
  return out;
}

const el = (n, a = {}, t) => {
  const e = document.createElementNS(NS, n);
  for (const k in a) e.setAttribute(k, a[k]);
  if (t != null) e.textContent = t;
  return e;
};

let raf = 0;
function draw(items, name) {
  cancelAnimationFrame(raf);
  const svg = $("svg");
  svg.replaceChildren();
  const cx = 450, cy = 320, n = items.length;
  const tentacles = items.map((it, i) => {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    const len = 190 + (i % 2) * 40;
    const tip = { x: cx + Math.cos(a) * len * 1.45, y: cy + Math.sin(a) * len * 0.95 };
    const path = el("path", { class: "tent" });
    svg.appendChild(path);
    return { a, tip, path, phase: i * 1.3 };
  });
  svg.appendChild(el("circle", { cx, cy, r: 46, fill: "#10141b", stroke: "#4fd1c5", "stroke-width": 3 }));
  svg.appendChild(el("text", { x: cx, y: cy + 5, "text-anchor": "middle", fill: "#e6eef2", "font-size": 13 }, name.length > 14 ? name.slice(0, 13) + "…" : name));
  tentacles.forEach((t, i) => {
    const g = el("g", { class: "node", tabindex: 0 });
    g.appendChild(el("circle", { cx: t.tip.x, cy: t.tip.y, r: 9 }));
    g.appendChild(el("text", { class: "k", x: t.tip.x, y: t.tip.y - 20 }, items[i].k));
    g.appendChild(el("text", { class: "v", x: t.tip.x, y: t.tip.y + 28 }, items[i].v));
    const show = () => { $("detail").innerHTML = ""; const b = document.createElement("b"); b.textContent = items[i].k + ": "; $("detail").append(b, items[i].d); };
    g.addEventListener("click", show);
    g.addEventListener("keydown", (e) => { if (e.key === "Enter") show(); });
    svg.appendChild(g);
    t.g = g;
  });
  const t0 = performance.now();
  const frame = (now) => {
    const s = (now - t0) / 1000;
    tentacles.forEach((t) => {
      const sway = Math.sin(s * 1.2 + t.phase) * 26, sway2 = Math.cos(s * 0.9 + t.phase) * 26;
      const px = -Math.sin(t.a), py = Math.cos(t.a);
      const c1 = { x: cx + (t.tip.x - cx) * 0.33 + px * sway, y: cy + (t.tip.y - cy) * 0.33 + py * sway };
      const c2 = { x: cx + (t.tip.x - cx) * 0.66 + px * sway2, y: cy + (t.tip.y - cy) * 0.66 + py * sway2 };
      const sx = cx + Math.cos(t.a) * 46, sy = cy + Math.sin(t.a) * 46;
      t.path.setAttribute("d", `M${sx},${sy} C${c1.x},${c1.y} ${c2.x},${c2.y} ${t.tip.x},${t.tip.y}`);
      t.path.setAttribute("stroke-width", 14);
    });
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
}

async function go(raw) {
  const input = normalizeHandle(raw);
  if (!input) return;
  const st = $("status");
  st.className = ""; st.textContent = "reaching…";
  try {
    const did = await resolve(input);
    const items = await gather(did);
    const h = items.find((i) => i.k === "handle");
    draw(items, h && h.v !== "(none)" ? h.v : did);
    st.textContent = `${items.length} tentacles`;
    $("detail").textContent = "tap a tentacle tip for details.";
  } catch (e) {
    st.className = "err";
    st.textContent = "couldn't reach: " + e.message;
  }
}

if (typeof document !== "undefined") {
  $("f").addEventListener("submit", (e) => { e.preventDefault(); go($("handle").value); });
  $("cee").addEventListener("click", () => {
    const i = $("handle");
    i.value = "@cee.wtf";
    i.dispatchEvent(new Event("input", { bubbles: true }));
    i.dispatchEvent(new Event("change", { bubbles: true }));
    i.focus();
  });
}
