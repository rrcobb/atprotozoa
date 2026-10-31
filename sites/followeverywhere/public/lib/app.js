// followeverywhere — scan an account's repo for appview profile records and
// create a follow record for each appview whose follow collection we know.
//
// Each entry: profile collection -> { follow collection, label, profile URL }.
// The follow collections here must match the `repo:` grants in oauth.js's SCOPE
// and client-metadata.json — OAuth scope is declared up front, so a follow
// collection can't be added without adding its grant in both places.
import {
  getSession, clearSession, login, completeLoginIfCallback, dpopFetch,
  resolveHandle, resolvePds,
} from "./oauth.js";

export const APPVIEWS = {
  "app.bsky.actor.profile": {
    label: "Bluesky", follow: "app.bsky.graph.follow",
    url: (p) => `https://bsky.app/profile/${p.handle}`,
  },
  "sh.tangled.actor.profile": {
    label: "Tangled", follow: "sh.tangled.graph.follow",
    url: (p) => `https://tangled.org/@${p.handle}`,
  },
  "social.grain.actor.profile": {
    label: "Grain", follow: "social.grain.graph.follow",
    url: (p) => `https://grain.social/profile/${p.handle}`,
  },
  "so.sprk.actor.profile": {
    label: "Spark", follow: "so.sprk.graph.follow",
    url: (p) => `https://sprk.so/profile/${p.handle}`,
  },
};

const PUBLIC_API = "https://public.api.bsky.app";
const PLC_DIR = "https://plc.directory";
const $ = (id) => document.getElementById(id);
const cleanHandle = (s) => s.trim().replace(/^@+/, "").toLowerCase();
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

let session = null;
let target = null; // { did, handle, rows: [{ profileColl, app, existing }] }

function setMsg(id, text, err) {
  const el = $(id);
  el.textContent = text || "";
  el.className = "msg" + (err ? " err" : "");
}

async function handleForDid(did) {
  try {
    const r = await fetch(did.startsWith("did:plc:") ? `${PLC_DIR}/${did}` : `https://${did.slice(8)}/.well-known/did.json`);
    const doc = await r.json();
    const aka = (doc.alsoKnownAs || []).find((a) => a.startsWith("at://"));
    if (aka) return aka.slice(5);
  } catch {}
  return did;
}

// Has `did` already got a follow of `subject` in `coll`? Reads the follower's
// own repo, paging listRecords until the cursor comes back empty. Bluesky uses
// getRelationships instead, which answers for one pair without walking the list.
async function alreadyFollowing(coll, myDid, myPds, subject) {
  if (coll === "app.bsky.graph.follow") {
    const r = await fetch(`${PUBLIC_API}/xrpc/app.bsky.graph.getRelationships?actor=${myDid}&others=${subject}`);
    if (r.ok) {
      const rel = ((await r.json()).relationships || [])[0];
      return !!(rel && rel.following);
    }
  }
  let cursor = "";
  for (;;) {
    const u = `${myPds}/xrpc/com.atproto.repo.listRecords?repo=${myDid}&collection=${coll}&limit=100` + (cursor ? `&cursor=${encodeURIComponent(cursor)}` : "");
    const r = await fetch(u);
    if (!r.ok) return false; // collection absent on this PDS = no follows yet
    const j = await r.json();
    if ((j.records || []).some((x) => x.value && x.value.subject === subject)) return true;
    if (!j.cursor) return false;
    cursor = j.cursor;
  }
}

async function scan() {
  const raw = cleanHandle($("targetHandle").value);
  if (!raw) return setMsg("scanMsg", "Enter an account to scan.", true);
  $("scanBtn").disabled = true;
  $("results").innerHTML = "";
  $("followRow").hidden = true;
  setMsg("followMsg", "");
  target = null;
  try {
    setMsg("scanMsg", "Resolving…");
    const did = raw.startsWith("did:") ? raw : await resolveHandle(raw);
    if (!did) throw new Error(`couldn't resolve ${raw}`);
    const pds = await resolvePds(did);
    if (!pds) throw new Error("couldn't find that account's PDS");
    const handle = raw.startsWith("did:") ? await handleForDid(did) : raw;
    setMsg("scanMsg", "Scanning repo…");
    const r = await fetch(`${pds}/xrpc/com.atproto.repo.describeRepo?repo=${did}`);
    if (!r.ok) throw new Error(`describeRepo failed (${r.status})`);
    const colls = ((await r.json()).collections || []).filter((c) => /\.profile$/.test(c)).sort();
    if (!colls.length) {
      setMsg("scanMsg", `${handle} has no profile records in their repo.`, true);
      return;
    }
    const rows = colls.map((c) => ({ profileColl: c, app: APPVIEWS[c] || null, existing: false, done: false }));
    target = { did, handle, rows };
    if (session) {
      setMsg("scanMsg", "Checking your existing follows…");
      await Promise.all(rows.filter((x) => x.app).map(async (x) => {
        try { x.existing = await alreadyFollowing(x.app.follow, session.did, session.pdsUrl, did); } catch {}
      }));
    }
    renderRows();
    const n = rows.filter((x) => x.app).length;
    setMsg("scanMsg", `${handle} has ${colls.length} profile record${colls.length === 1 ? "" : "s"}; ${n} on appviews we can follow on.`);
  } catch (e) {
    setMsg("scanMsg", e.message || String(e), true);
  } finally {
    $("scanBtn").disabled = false;
  }
}

function rowStatus(x) {
  if (!x.app) return `<span class="dim">no known follow lexicon</span>`;
  if (x.error) return `<span class="bad">${esc(x.error)}</span>`;
  if (x.done) return `<span class="ok">followed ✓</span>`;
  if (x.existing) return `<span class="ok">already following ✓</span>`;
  return `<span class="dim">not followed yet</span>`;
}

function renderRows() {
  $("results").innerHTML = target.rows.map((x) => `
    <li>
      <span class="name">${esc(x.app ? x.app.label : x.profileColl.replace(/\.[^.]+\.profile$|\.profile$/, ""))}</span>
      <span class="coll">${esc(x.profileColl)}</span>
      ${x.app && (x.done || x.existing) ? `<a href="${esc(x.app.url(target))}" target="_blank" rel="noopener">check on ${esc(x.app.label)} →</a>` : ""}
      <span class="status">${rowStatus(x)}</span>
    </li>`).join("");
  const todo = target.rows.some((x) => x.app && !x.existing && !x.done);
  $("followRow").hidden = !todo;
  $("followBtn").disabled = !session;
  if (todo && !session) setMsg("followMsg", "Sign in (step 1) to create the follow records.");
}

async function followAll() {
  if (!session || !target) return;
  $("followBtn").disabled = true;
  setMsg("followMsg", "Creating follow records…");
  let ok = 0, fail = 0;
  for (const x of target.rows) {
    if (!x.app || x.existing || x.done) continue;
    x.error = "";
    try {
      const res = await dpopFetch(session, `${session.pdsUrl}/xrpc/com.atproto.repo.createRecord`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repo: session.did,
          collection: x.app.follow,
          record: { $type: x.app.follow, subject: target.did, createdAt: new Date().toISOString() },
        }),
      });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(`${res.status} ${t.slice(0, 120)}`);
      }
      x.done = true; ok++;
    } catch (e) {
      x.error = e.message || String(e); fail++;
    }
  }
  renderRows();
  setMsg("followMsg", `${ok} follow${ok === 1 ? "" : "s"} created${fail ? `, ${fail} failed` : ""}. Use the links to log in on each appview and check.`, fail > 0);
  $("followBtn").disabled = false;
}

function showSession() {
  $("signedOut").hidden = !!session;
  $("signedIn").hidden = !session;
  if (session) $("meName").textContent = "@" + session.handle;
}

async function init() {
  $("signinBtn").addEventListener("click", async () => {
    const h = cleanHandle($("myHandle").value);
    if (!h) return setMsg("signinMsg", "Enter your handle.", true);
    $("signinBtn").disabled = true;
    setMsg("signinMsg", "Redirecting to your PDS…");
    try { await login(h); } catch (e) { setMsg("signinMsg", e.message || String(e), true); $("signinBtn").disabled = false; }
  });
  $("myHandle").addEventListener("keydown", (e) => { if (e.key === "Enter") $("signinBtn").click(); });
  $("signoutBtn").addEventListener("click", async () => { await clearSession(); session = null; showSession(); if (target) renderRows(); });
  $("scanBtn").addEventListener("click", scan);
  $("targetHandle").addEventListener("keydown", (e) => { if (e.key === "Enter") scan(); });
  $("followBtn").addEventListener("click", followAll);
  try {
    session = (await completeLoginIfCallback()) || (await getSession());
  } catch (e) {
    setMsg("signinMsg", e.message || String(e), true);
  }
  showSession();
}
init();
