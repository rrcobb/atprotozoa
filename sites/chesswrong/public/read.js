import { chessify, chessifyText, asideFor } from "./lib/chess.js";

const $ = (id) => document.getElementById(id);
const id = new URLSearchParams(location.search).get("id") || "";

// Tags we keep when rebuilding the body; everything else is unwrapped to its
// children (script/style/iframe/img etc. are dropped outright).
const KEEP = new Set(["P", "H1", "H2", "H3", "H4", "H5", "H6", "UL", "OL", "LI", "BLOCKQUOTE", "PRE", "CODE",
  "EM", "I", "STRONG", "B", "A", "BR", "HR", "SUP", "SUB", "TABLE", "THEAD", "TBODY", "TR", "TD", "TH", "DEL", "U"]);
const DROP = new Set(["SCRIPT", "STYLE", "IFRAME", "IMG", "FIGURE", "OBJECT", "EMBED", "SVG", "FORM", "INPUT", "BUTTON", "VIDEO", "AUDIO"]);

function rebuild(node, out) {
  for (const n of node.childNodes) {
    if (n.nodeType === 3) {
      out.append(document.createTextNode(n.parentNode.closest("pre,code") ? n.textContent : chessifyText(n.textContent)));
    } else if (n.nodeType === 1) {
      if (DROP.has(n.tagName.toUpperCase())) continue;
      if (!KEEP.has(n.tagName)) { rebuild(n, out); continue; }
      const el = document.createElement(n.tagName.toLowerCase());
      if (n.tagName === "A") {
        const href = n.getAttribute("href") || "";
        if (/^https?:\/\//i.test(href)) { el.href = href; el.target = "_blank"; el.rel = "noopener"; }
      }
      rebuild(n, el);
      out.append(el);
    }
  }
}

async function main() {
  if (!/^[A-Za-z0-9]{10,24}$/.test(id)) throw new Error("no post id in the link");
  const r = await fetch(`/api/post?id=${id}`);
  if (!r.ok) throw new Error("HTTP " + r.status);
  const p = await r.json();
  const c = chessify(p.title);
  document.title = `${c.title} — ChessWrong`;
  $("title").textContent = c.title;
  $("orig").textContent = p.title;
  $("meta").textContent = `${(p.postedAt || "").slice(0, 10)} · ${p.user ? p.user.displayName : ""} · ${p.baseScore || 0} pts · ${p.commentCount || 0} comments`;
  $("real").href = `https://www.lesswrong.com/posts/${p._id}/${p.slug}`;
  $("share").href = `https://bsky.app/intent/compose?text=${encodeURIComponent(`"${c.title}" — on ChessWrong https://chesswrong.bisks.net/read?id=${p._id}`)}`;
  const doc = new DOMParser().parseFromString(p.htmlBody || "", "text/html");
  const body = $("body");
  rebuild(doc.body, body);
  let i = 0;
  for (const para of [...body.querySelectorAll(":scope > p")]) {
    const a = asideFor(p._id, i++);
    if (!a) continue;
    const s = document.createElement("span");
    s.className = "aside"; s.textContent = a;
    para.after(s);
  }
  if (!body.textContent.trim()) $("status").textContent = "this post has no text body — use the link below.";
}
main().catch((e) => { $("title").textContent = "couldn't load that post"; $("status").classList.add("err"); $("status").textContent = e.message; });
