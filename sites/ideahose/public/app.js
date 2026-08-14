/* ideahose: deliberately browser-local. Nothing is retained when this tab closes. */
const JETSTREAM = "wss://jetstream2.us-east.bsky.network/subscribe?wantedCollections=app.bsky.feed.post";
const APPVIEW = "https://public.api.bsky.app/xrpc/app.bsky.feed.getPosts";
const MAX_CLUSTERS = 250, MAX_QUEUE = 300, MAX_DEDUPE = 5000, MAX_INSTANCES = 4;
const CHECK_AFTER = 6 * 60 * 1000, CHECK_BATCH = 25, LEADERBOARD_SIZE = 40;
const MENTION_WEIGHT = 30, ENGAGEMENT_WEIGHT = 8, UPVOTE_WEIGHT = 12, TAGGED_BONUS = 15;
const EXPLICIT = [
  /\bidea for an? (website|site|web ?app|app|bot|tool|extension|plugin)\b/i,
  /\b(website|site|web ?app|app) idea\b/i,
  /\bthere (should|ought to) be an? (website|site|web ?app|app|bot|tool|extension)\b/i,
  /\bimagine an? (website|site|web ?app|app|bot|tool) that\b/i,
  /\bwhat if there (was|were) an? (website|site|web ?app|app|bot|tool)\b/i,
  /\bbuild me an? (website|site|web ?app|app|bot|tool)\b/i,
  /\bwe need an? (website|site|web ?app|app|bot|tool) (that|for|to)\b/i,
];
const VERBS = [
  /\b(someone|somebody)\s+(should|needs? to|ought to|really should|could)\s+(build|make|create|code up|develop|design)\b/i,
  /\bi wish (there was|there were|someone (would|had) (made|built)|there existed)\b/i,
  /\b(can|could|would)\s+(someone|somebody|anyone)\s+(please\s+)?(build|make|create)\b/i,
];
const NOUN = /\b(website|web ?site|site|web ?app|app|bot|tool|extension|plugin|dashboard|tracker|generator|game)\b/i;
const STOP = new Set(("the a an and or but if then else for nor so yet of to in on at by with from into onto over under about above below between out up down off again further once here there when where why how all any both each few more most other some such no not only own same than too very s t can will just don should now this that these those i you he she it we they them his her its our your my me him is are was were be been being have has had do does did would could should might must shall someone somebody anyone everybody people who what which really please make build created create creating website site web app apps bot tool tools extension plugin idea ideas imagine needs need wish wishing existed exist actually kind sort thing things like something anything").split(/\s+/));
function spam(s) { return /#nowplaying|listen live|onelink\.to|shop now|buy now|amzn\.to|prime members|\$\d+\.\d{2}\b/i.test(s) || (s.match(/#/g) || []).length >= 4; }
function idea(s) { if (s.length < 15 || s.length > 500 || spam(s)) return false; if (/@buildthis\.bisks\.net|@buildthis\b/i.test(s)) return true; return EXPLICIT.some((r) => r.test(s)) || (VERBS.some((r) => r.test(s)) && NOUN.test(s)); }
function stem(w) { if (w.length > 5 && w.endsWith("ing")) return w.slice(0, -3); if (w.length > 4 && w.endsWith("ed")) return w.slice(0, -2); if (w.length > 4 && w.endsWith("es")) return w.slice(0, -2); return w.length > 3 && w.endsWith("s") ? w.slice(0, -1) : w; }
function signature(text) { const out = new Set(); for (const w of text.toLowerCase().replace(/https?:\/\/\S+/g, " ").replace(/[^a-z0-9\s']/g, " ").split(/\s+/)) { if (w.length >= 4 && !STOP.has(w)) { const s = stem(w); if (s.length >= 3) out.add(s); } if (out.size >= 10) break; } return [...out]; }
function overlap(a, b) { const set = new Set(a); let n = 0; for (const w of b) if (set.has(w)) n++; return { n, score: (a.length + b.length - n) ? n / (a.length + b.length - n) : 0 }; }
function score(c) { return c.mentions * MENTION_WEIGHT + Math.log2(1 + c.likes + c.reposts * 2 + c.replies * 1.5) * ENGAGEMENT_WEIGHT + c.upvotes * UPVOTE_WEIGHT + (c.tagged ? TAGGED_BONUS : 0); }

const dot = document.getElementById("dot"), statusText = document.getElementById("statusText"), trackingText = document.getElementById("trackingText"), empty = document.getElementById("empty"), board = document.getElementById("board"), shareLink = document.getElementById("shareLink");
const clusters = new Map(), seen = new Set(), queue = [], votes = new Set();
let postsScanned = 0, ideasSeen = 0, socket, reconnect = 1000, lastRender = 0;
try { JSON.parse(localStorage.getItem("ideahose-voted") || "[]").forEach((k) => votes.add(k)); } catch {}
function esc(s) { return (s || "").replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c])); }
function ago(ms) { if (!ms) return ""; const seconds = Math.max(1, (Date.now() - ms) / 1000); for (const [u, n] of [["d",86400],["h",3600],["m",60],["s",1]]) if (seconds >= n) return `${Math.floor(seconds / n)}${u} ago`; return "just now"; }
function entry(c) { if (!c.rep) return null; return {...c, key:c.key, text:c.rep.text, handle:c.rep.handle, rkey:c.rep.rkey, avatar:c.rep.avatar, mentionCount:c.mentions, likeSum:c.likes, repostSum:c.reposts, replySum:c.replies, firstSeen:c.firstSeen, lastSeen:c.lastSeen, score:score(c)}; }
function render() {
  const ideas = [...clusters.values()].map(entry).filter(Boolean).sort((a,b) => b.score-a.score || b.mentionCount-a.mentionCount || b.lastSeen-a.lastSeen).slice(0, LEADERBOARD_SIZE);
  trackingText.textContent = `this tab: ${clusters.size} clusters · ${ideasSeen} idea-shaped posts · ${postsScanned.toLocaleString()} posts sampled`;
  empty.style.display = ideas.length ? "none" : "";
  board.innerHTML = ideas.map((e,i) => { const voted = votes.has(e.key), reactions = e.likeSum + e.repostSum + e.replySum; return `<li class="row"><div class="rank">${i+1}</div><div class="body"><div class="badges"><span class="badge mentions">mentioned ${e.mentionCount}×</span>${e.tagged ? '<span class="badge tagged">already tagged @buildthis</span>' : ""}</div><p class="text">${esc(e.text)}</p><div class="meta"><span>${e.likeSum.toLocaleString()} likes</span><span>${e.repostSum.toLocaleString()} reposts</span><span>${e.replySum.toLocaleString()} replies</span><span>${ago(e.lastSeen)}</span><a href="https://bsky.app/profile/${esc(e.handle)}/post/${esc(e.rkey)}" target="_blank" rel="noopener">source ↗</a></div><div class="actions"><a class="btn build" href="https://bsky.app/intent/compose?text=${encodeURIComponent("@buildthis.bisks.net build: " + e.text)}" target="_blank" rel="noopener">tag @buildthis ↗</a><button type="button" class="upvote${voted ? " voted" : ""}" data-key="${esc(e.key)}" ${voted ? "disabled" : ""}>▲ ${e.upvotes || 0}</button></div></div></li>`; }).join("");
  board.querySelectorAll(".upvote").forEach((button) => button.addEventListener("click", () => { const c = clusters.get(button.dataset.key); if (!c || votes.has(c.key)) return; c.upvotes++; votes.add(c.key); try { localStorage.setItem("ideahose-voted", JSON.stringify([...votes])); } catch {} render(); }));
  if (ideas[0]) shareLink.href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(`top idea in the ideahose backlog in my live tab: "${ideas[0].text.slice(0, 140)}" — mentioned ${ideas[0].mentionCount}×. ideahose.bisks.net`);
}
function add(evt) {
  const commit = evt.commit, rec = commit && commit.record, text = rec && typeof rec.text === "string" ? rec.text.trim() : "";
  if (!evt.did || !commit || commit.operation !== "create" || commit.collection !== "app.bsky.feed.post" || !text || rec.reply || seen.has(`${evt.did}/${commit.rkey}`)) return;
  postsScanned++; if (!idea(text) || queue.length >= MAX_QUEUE) return; ideasSeen++; const uri = `at://${evt.did}/app.bsky.feed.post/${commit.rkey}`; seen.add(`${evt.did}/${commit.rkey}`); if (seen.size > MAX_DEDUPE) seen.delete(seen.values().next().value);
  const now = Date.now(), sig = signature(text), tagged = /@buildthis\.bisks\.net|@buildthis\b/i.test(text); let match, best = 0;
  for (const c of clusters.values()) { const o = overlap(sig, c.sig); if (o.n >= 2 && o.score >= .34 && o.score > best) { best = o.score; match = c; } }
  const instance = { uri, did:evt.did, rkey:commit.rkey, text:text.length > 280 ? text.slice(0,280) + "…" : text, createdAt:now };
  if (match) { match.mentions++; match.lastSeen = now; match.tagged ||= tagged; match.instances.unshift(instance); match.instances.length = Math.min(match.instances.length, MAX_INSTANCES); queue.push(instance); return; }
  if (clusters.size >= MAX_CLUSTERS) { const worst = [...clusters.values()].sort((a,b) => score(a)-score(b))[0]; if (worst) clusters.delete(worst.key); }
  const c = {key:`${evt.did.slice(-12)}-${commit.rkey}`, sig, mentions:1, instances:[instance], rep:null, likes:0, reposts:0, replies:0, upvotes:0, tagged, firstSeen:now, lastSeen:now}; clusters.set(c.key, c); queue.push(instance);
}
async function checkDue() { const now = Date.now(), due = []; while (queue.length && queue[0].createdAt + CHECK_AFTER <= now && due.length < CHECK_BATCH) due.push(queue.shift()); if (!due.length) return; try { const u = new URL(APPVIEW); due.forEach((x) => u.searchParams.append("uris", x.uri)); const response = await fetch(u); if (!response.ok) return; const data = await response.json(); const posts = new Map((data.posts || []).map((p) => [p.uri, p])); for (const x of due) { const p = posts.get(x.uri), c = [...clusters.values()].find((candidate) => candidate.instances.some((i) => i.uri === x.uri)); if (!p || !c) continue; c.likes += p.likeCount || 0; c.reposts += p.repostCount || 0; c.replies += p.replyCount || 0; if (!c.rep) c.rep = {text:p.record?.text || x.text, handle:p.author?.handle || "", rkey:x.rkey, avatar:p.author?.avatar || ""}; } } catch {} render(); }
function connect() { statusText.textContent = "connecting to Jetstream…"; socket = new WebSocket(JETSTREAM); socket.onopen = () => { reconnect = 1000; dot.classList.add("live"); statusText.textContent = "live in this tab · processing a bounded sample"; }; socket.onmessage = (event) => { try { add(JSON.parse(event.data)); } catch {} if (Date.now() - lastRender > 1000) { lastRender = Date.now(); render(); } }; socket.onclose = () => { dot.classList.remove("live"); statusText.textContent = "Jetstream disconnected · retrying…"; setTimeout(connect, reconnect); reconnect = Math.min(reconnect * 2, 30000); }; socket.onerror = () => socket.close(); }
render(); connect(); setInterval(checkDue, 15000); setInterval(render, 30000);
