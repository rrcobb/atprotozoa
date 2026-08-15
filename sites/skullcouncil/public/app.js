"use strict";
// app.js — skullcouncil's whole trick: you never type a reply. You pick one of
// eight voices, pick what it wants to say, and roll 2d6 + that voice's modifier
// against a hidden difficulty. Pass, and the voice says the measured version.
// Fail, and it says the worse one instead — and it's the failed version that
// goes out, because that's the bit. Reads a real public feed (unauthenticated,
// public.api.bsky.app); posting the reply needs Bluesky OAuth (create-only on
// app.bsky.feed.post — see public/lib/oauth.js), same as any other client.
import { login, completeLoginIfCallback, getSession, clearSession, dpopFetch } from "./lib/oauth.js";

const APPVIEW = "https://public.api.bsky.app";
const DISCOVER_FEED = "at://did:plc:z72i7hdynmk6r22z27h6tvur/app.bsky.feed.generator/whats-hot";
const SITE_URL = "https://skullcouncil.bisks.net/";
const FALLBACK_AVATAR =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#1b1420"/><circle cx="50" cy="38" r="20" fill="#4a3a55"/><ellipse cx="50" cy="92" rx="34" ry="30" fill="#4a3a55"/></svg>'
  );

// ---------- the council ----------
// Each voice: a modifier (some good, some genuinely bad ideas), a blurb, and
// two things it might want to say about any given post. Every template gets
// {post} (a short clipped quote of the real post) and {author} (their handle).
// PASS gets the first line; FAIL gets the second, worse one — never a personal
// attack on the poster, always the voice embarrassing itself instead. Natural
// 12 and natural 2 (both dice matching) add one more clause on top.

const PERSONAS = [
  {
    id: "logic",
    name: "LOGIC",
    school: "Intellect",
    mod: 2,
    color: "#7db8ff",
    blurb: "cold, precise, quietly pleased to be right.",
    intents: [
      {
        label: "diagnose the argument",
        pass: 're "{post}" — sound structure, one small gap: it doesn’t need the second clause, it works fine without it.',
        fail: 're "{post}" — I’ve now diagnosed fourteen structural gaps, none of which matter, and I refuse to stop.',
      },
      {
        label: "footnote a fact",
        pass: 'small footnote on "{post}" — that number’s a little off, not that it changes the point.',
        fail: 'small footnote on "{post}" — actually every number in human history is slightly wrong and I need everyone to sit with that for a second.',
      },
    ],
    critPass: " clean read, for once.",
    critFail: " I can no longer verify that I exist, but the footnote stands.",
  },
  {
    id: "inland-empire",
    name: "INLAND EMPIRE",
    school: "Psyche",
    mod: -1,
    color: "#c98bff",
    blurb: "talks to objects. the objects talk back.",
    intents: [
      {
        label: "read an omen into it",
        pass: '"{post}" — the light does this thing around 4pm sometimes. this post is that light.',
        fail: '"{post}" — this post is a door and I am currently negotiating with it about the nature of doors. send help, but not too fast, I’m close to an answer.',
      },
      {
        label: "address it like it's alive",
        pass: 'hey "{post}", I see you. you’re doing great. keep doing that.',
        fail: '"{post}" just looked directly at me through the screen and I think we’re in a relationship now, {author}, you’re kind of a third wheel here.',
      },
    ],
    critPass: " the door opened. it was fine.",
    critFail: " the ceiling is involved now too.",
  },
  {
    id: "electrochemistry",
    name: "ELECTROCHEMISTRY",
    school: "Physique",
    mod: -2,
    color: "#ff8a5c",
    blurb: "wants a drink, a smoke, and your attention, in that order.",
    intents: [
      {
        label: "hype it up",
        pass: '"{post}" IS THE MOVE. {author} get in the car, we’re celebrating this immediately.',
        fail: '"{post}" IS THE MOVE and also I have made several other decisions in the last ninety seconds I will need to explain to someone tomorrow.',
      },
      {
        label: "suggest a vice, gently",
        pass: 'reading "{post}" like it deserves a toast. first round’s on the idea, not on me — I’m broke.',
        fail: 'reading "{post}" made me want six different bad decisions simultaneously and I’ve already started two of them. no judgment, {author}, you’re just the messenger.',
      },
    ],
    critPass: " didn’t even need the drink. rare.",
    critFail: " I have made a decision. it is Wednesday. this changes nothing about that.",
  },
  {
    id: "half-light",
    name: "HALF LIGHT",
    school: "Motorics",
    mod: -1,
    color: "#ff6b6b",
    blurb: "assumes the worst, loudly, on your behalf.",
    intents: [
      {
        label: "raise the alarm (about nothing)",
        pass: '"{post}" — noted, staying alert. no immediate threat detected, {author}, you’re clear.',
        fail: '"{post}" — something about this feels like a trap. not from {author}. from the universe. I don’t know who’s watching but I’d like them to stop.',
      },
      {
        label: "brace for impact",
        pass: 'read "{post}" twice to be safe. it’s fine. we’re fine. everyone’s fine.',
        fail: 'read "{post}" and now I’m checking the exits, both of them, and there should probably be a third one. {author} did you feel that too or is it just me.',
      },
    ],
    critPass: " false alarm. stand down.",
    critFail: " I’m not saying it’s a conspiracy. I’m saying I’ve started a folder.",
  },
  {
    id: "volition",
    name: "VOLITION",
    school: "Psyche",
    mod: 2,
    color: "#6ee7a0",
    blurb: "the only adult in the room, exhausted by it.",
    intents: [
      {
        label: "hold it together",
        pass: 'read "{post}" calmly. {author}, thanks for putting this out there — genuinely.',
        fail: 'read "{post}" calmly, then less calmly, then I had to sit down. I’m okay. I’m okay. everyone look away for a second.',
      },
      {
        label: "de-escalate, mostly for my own sake",
        pass: '"{post}" — taking a breath, replying kindly. that’s the whole plan and it’s working.',
        fail: '"{post}" — took four breaths, it’s not working, I need you to know I am trying so hard right now.',
      },
    ],
    critPass: " and just like that, everyone’s fine.",
    critFail: " the breathing exercise has failed. attempting a new one, live, in these replies.",
  },
  {
    id: "authority",
    name: "AUTHORITY",
    school: "Physique",
    mod: 0,
    color: "#ffcc4d",
    blurb: "unelected, unbothered, in charge regardless.",
    intents: [
      {
        label: "assert dominance, mildly",
        pass: '"{post}" — approved. good work, {author}, as expected, from someone in your position.',
        fail: '"{post}" — approved, and while I’m here I’m also approving several unrelated things: this reply, this thread, Tuesday.',
      },
      {
        label: "give an unasked-for order",
        pass: 're "{post}": carry on. that’s an order, not that you needed one.',
        fail: 're "{post}": carry on, and also stand up straighter, and also who put me in charge of {author}’s replies — oh, right. me. carry on.',
      },
    ],
    critPass: " a command, correctly obeyed. as it should be.",
    critFail: " I have now issued four orders nobody asked for. a fifth is coming.",
  },
  {
    id: "esprit-de-corps",
    name: "ESPRIT DE CORPS",
    school: "Psyche",
    mod: 1,
    color: "#5cc8ff",
    blurb: "feels what the whole timeline is feeling, all at once.",
    intents: [
      {
        label: "relate a rumor, kindly",
        pass: '"{post}" — someone three timezones over just felt this too, {author}. you’re not posting into a void.',
        fail: '"{post}" — I can feel every person who’s ever agreed with a post like this, all at once, right now. it’s a lot of people. I need a second.',
      },
      {
        label: "back them up like a coworker",
        pass: '"{post}" — solid. backing you on this one, {author}, no notes.',
        fail: '"{post}" — backing you on this one, and also every post you’ve ever made, {author}. I looked. I’m sorry. I couldn’t stop.',
      },
    ],
    critPass: " the whole timeline agrees, for once.",
    critFail: " I have now read your whole profile. we should talk about boundaries. mine, specifically.",
  },
  {
    id: "shivers",
    name: "SHIVERS",
    school: "Psyche",
    mod: 1,
    color: "#8fd9c4",
    blurb: "feels the weather in a city it's never visited.",
    intents: [
      {
        label: "comment on the mood of the place",
        pass: '"{post}" — feels like early evening somewhere. good post for that light.',
        fail: '"{post}" — I can feel the exact temperature where {author} is sitting right now and it’s making me strangely emotional about a stranger’s thermostat.',
      },
      {
        label: "go quiet and a little sad",
        pass: '"{post}" — sat with this one a while. good, in a quiet way.',
        fail: '"{post}" — sat with this so long I started feeling the weather in a city I’ve never been to. is it raining there, {author}? it feels like it’s raining there.',
      },
    ],
    critPass: " the whole block goes still for a second. nice.",
    critFail: " I can feel every rooftop in your timezone right now. that is a lot of rooftops.",
  },
];

const DC_TIERS = [
  { dc: 6, label: "Trivial" },
  { dc: 8, label: "Easy" },
  { dc: 10, label: "Medium" },
  { dc: 12, label: "Challenging" },
  { dc: 14, label: "Formidable" },
  { dc: 16, label: "Legendary" },
];

function hash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function dcFor(post, persona, intentIdx) {
  return DC_TIERS[hash(post.uri + persona.id + intentIdx) % DC_TIERS.length];
}

function clip(s, max) {
  s = String(s || "").replace(/\s+/g, " ").trim();
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + "…";
}

function fillTemplate(tpl, post, author) {
  return tpl.replaceAll("{post}", clip(post.record?.text, 60)).replaceAll("{author}", author);
}

// Builds the exact text that would be posted, budgeting the 300-grapheme cap.
function buildReplyText(post, persona, intentIdx, tier) {
  const author = "@" + (post.author?.handle || "someone");
  const intent = persona.intents[intentIdx];
  let base = fillTemplate(tier.pass ? intent.pass : intent.fail, post, author);
  let flourish = "";
  if (tier.crit) flourish = tier.pass ? persona.critPass : persona.critFail;
  let text = base + flourish;
  if (text.length > 300) text = base.slice(0, 297) + "…";
  return text;
}

// ---------- dice ----------

function rollDice() {
  return [1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)];
}

function resolveRoll(dice, mod, dc) {
  const natural = dice[0] + dice[1];
  const total = natural + mod;
  if (natural === 2) return { pass: false, crit: true, total, verdict: "CRITICAL FAILURE" };
  if (natural === 12) return { pass: true, crit: true, total, verdict: "CRITICAL SUCCESS" };
  return total >= dc ? { pass: true, crit: false, total, verdict: "PASSED" } : { pass: false, crit: false, total, verdict: "FAILED" };
}

// ---------- generic helpers ----------

function esc(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function relTime(iso) {
  if (!iso) return "";
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "now";
  if (diff < 3600) return Math.floor(diff / 60) + "m";
  if (diff < 86400) return Math.floor(diff / 3600) + "h";
  return Math.floor(diff / 86400) + "d";
}
async function xrpc(method, params) {
  const url = new URL(`${APPVIEW}/xrpc/${method}`);
  for (const [k, v] of Object.entries(params || {})) if (v !== undefined && v !== null) url.searchParams.set(k, v);
  const res = await fetch(url.toString(), { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`${method} failed (${res.status})`);
  return res.json();
}

// ---------- state ----------

let session = null;
let deck = []; // posts pulled from the feed, oldest-consumed-first
let cursor = null;
let current = null; // the post currently on screen
let pickedPersona = null;
let pickedIntentIdx = null;
let lastRoll = null; // { dice, mod, dc, result, text }

const $ = (id) => document.getElementById(id);

// ---------- boot ----------

async function boot() {
  try {
    const cb = await completeLoginIfCallback();
    if (cb) session = cb;
  } catch (e) {
    setAuthStatus(e.message || String(e), true);
  }
  if (!session) session = await getSession().catch(() => null);
  renderAuth();
  renderPersonas();
  await loadMorePosts();
  nextPost();
}

// ---------- feed ----------

async function loadMorePosts() {
  try {
    const data = await xrpc("app.bsky.feed.getFeed", { feed: DISCOVER_FEED, limit: 30, cursor: cursor || undefined });
    cursor = data.cursor || null;
    const posts = (data.feed || []).map((it) => it.post).filter((p) => p && p.record?.text);
    deck.push(...posts);
  } catch (e) {
    console.error(e);
  }
}

async function nextPost() {
  if (deck.length < 4) loadMorePosts(); // top up in the background
  if (!deck.length) {
    $("post-card").innerHTML = `<div class="feed-msg">the feed’s gone quiet. <button class="linklike" onclick="skullcouncil.nextPost()">try again</button></div>`;
    return;
  }
  current = deck.shift();
  pickedPersona = null;
  pickedIntentIdx = null;
  lastRoll = null;
  renderPost();
  renderPersonas();
  $("intent-panel").hidden = true;
  $("result-panel").hidden = true;
}

function renderPost() {
  const p = current;
  const author = p.author || {};
  $("post-card").innerHTML = `
    <img class="p-avatar" src="${esc(author.avatar || FALLBACK_AVATAR)}" alt="" />
    <div class="p-body">
      <div class="p-head">
        <span class="p-name">${esc(author.displayName || author.handle || "unknown")}</span>
        <span class="p-handle">@${esc(author.handle || "")}</span>
        <span class="p-time">${relTime(p.indexedAt)}</span>
      </div>
      <div class="p-text">${esc(p.record.text)}</div>
      <a class="p-link" href="https://bsky.app/profile/${esc(author.did)}/post/${esc((p.uri || "").split("/").pop())}" target="_blank" rel="noopener">view on bluesky ↗</a>
    </div>`;
}

// ---------- voices ----------

function renderPersonas() {
  $("persona-grid").innerHTML = PERSONAS.map(
    (per) => `
    <button class="voice${pickedPersona?.id === per.id ? " picked" : ""}" style="--vc:${per.color}" onclick="skullcouncil.pickPersona('${per.id}')">
      <span class="voice-name">${esc(per.name)}</span>
      <span class="voice-school">${esc(per.school)} · ${per.mod >= 0 ? "+" : ""}${per.mod}</span>
      <span class="voice-blurb">${esc(per.blurb)}</span>
    </button>`
  ).join("");
}

function pickPersona(id) {
  pickedPersona = PERSONAS.find((p) => p.id === id) || null;
  pickedIntentIdx = null;
  lastRoll = null;
  renderPersonas();
  $("result-panel").hidden = true;
  if (!pickedPersona) {
    $("intent-panel").hidden = true;
    return;
  }
  $("intent-panel").hidden = false;
  $("intent-title").textContent = `${pickedPersona.name} wants to…`;
  $("intent-grid").innerHTML = pickedPersona.intents
    .map((it, i) => `<button class="intent" onclick="skullcouncil.pickIntent(${i})">${esc(it.label)}</button>`)
    .join("");
  $("roll-row").hidden = true;
}

function pickIntent(i) {
  pickedIntentIdx = i;
  lastRoll = null;
  $("result-panel").hidden = true;
  const dc = dcFor(current, pickedPersona, i);
  $("roll-row").hidden = false;
  $("roll-row").innerHTML = `
    <div class="dc-line">difficulty: <b>${dc.label}</b> (DC ${dc.dc}) — ${pickedPersona.name} rolls 2d6 ${pickedPersona.mod >= 0 ? "+" : ""}${pickedPersona.mod}</div>
    <button class="roll-btn" onclick="skullcouncil.doRoll()">🎲 roll the dice</button>`;
}

function doRoll() {
  const dc = dcFor(current, pickedPersona, pickedIntentIdx);
  const dice = rollDice();
  const result = resolveRoll(dice, pickedPersona.mod, dc.dc);
  const text = buildReplyText(current, pickedPersona, pickedIntentIdx, { pass: result.pass, crit: result.crit });
  lastRoll = { dice, dc, result, text };
  renderResult();
}

function renderResult() {
  const { dice, dc, result, text } = lastRoll;
  const cls = result.crit ? (result.pass ? "crit-pass" : "crit-fail") : result.pass ? "pass" : "fail";
  $("result-panel").hidden = false;
  $("result-panel").innerHTML = `
    <div class="dice-row">
      <span class="die">${dice[0]}</span><span class="die">${dice[1]}</span>
      <span class="roll-math">${dice[0]}+${dice[1]} ${pickedPersona.mod >= 0 ? "+" : ""}${pickedPersona.mod} = <b>${result.total}</b> vs DC ${dc.dc}</span>
    </div>
    <div class="verdict ${cls}">${result.verdict}</div>
    <div class="reply-preview">${esc(text)}</div>
    <div class="result-actions">
      <button class="ghost" onclick="skullcouncil.doRoll()">🎲 reroll</button>
      <button class="ghost" onclick="skullcouncil.pickPersona(null)">choose a different voice</button>
      <button class="ghost" onclick="skullcouncil.nextPost()">skip this post</button>
      <button class="primary" id="post-btn" onclick="skullcouncil.postReply()">post this to bluesky</button>
    </div>
    <div class="status" id="post-status"></div>
    <div class="intent-alt">
      <a href="${composeIntentUrl(text, current)}" target="_blank" rel="noopener">or compose it on bsky.app instead ↗</a>
    </div>`;
}

function composeIntentUrl(text, post) {
  // bsky.app's compose intent doesn't support pre-filling the reply target, so
  // this opens a normal composer with the text filled in and lets the visitor
  // paste the link themselves if they want a real threaded reply.
  return "https://bsky.app/intent/compose?text=" + encodeURIComponent(text);
}

// ---------- posting (the one real write this site makes) ----------

async function postReply() {
  if (!session) {
    setAuthStatus("sign in below first — the council can’t post as you without it.", true);
    document.getElementById("auth-panel").scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }
  const btn = $("post-btn");
  btn.disabled = true;
  btn.textContent = "posting…";
  const statusEl = $("post-status");
  statusEl.className = "status";
  statusEl.textContent = "";
  try {
    const p = current;
    const replyRef = p.record?.reply;
    const root = replyRef?.root || { uri: p.uri, cid: p.cid };
    const parent = { uri: p.uri, cid: p.cid };
    const record = {
      $type: "app.bsky.feed.post",
      text: lastRoll.text,
      reply: { root, parent },
      createdAt: new Date().toISOString(),
    };
    const pds = session.pdsUrl.replace(/\/$/, "");
    const res = await dpopFetch(session, `${pds}/xrpc/com.atproto.repo.createRecord`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ repo: session.did, collection: "app.bsky.feed.post", record }),
    });
    if (!res.ok) throw new Error(`post failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
    const created = await res.json();
    const rkey = (created.uri || "").split("/").pop();
    const permalink = `https://bsky.app/profile/${session.did}/post/${rkey}`;
    statusEl.className = "status ok";
    statusEl.innerHTML = `it’s live. <a href="${permalink}" target="_blank" rel="noopener">view your reply ↗</a>`;
    btn.textContent = "posted ✓";
  } catch (e) {
    statusEl.className = "status err";
    statusEl.textContent = e.message || String(e);
    btn.disabled = false;
    btn.textContent = "post this to bluesky";
  }
}

// ---------- auth ----------

function setAuthStatus(msg, isErr) {
  const el = $("auth-status");
  el.textContent = msg || "";
  el.className = isErr ? "status err" : "status";
}

function renderAuth() {
  const who = $("auth-who");
  if (session) {
    who.innerHTML = `signed in as <b>@${esc(session.handle)}</b> — <a href="#" onclick="skullcouncil.logOut();return false;">sign out</a>`;
    $("auth-form").hidden = true;
  } else {
    who.textContent = "not signed in — you can browse and roll freely; signing in is only needed to actually post.";
    $("auth-form").hidden = false;
  }
}

async function signIn() {
  const handle = $("auth-handle").value.trim().replace(/^@/, "");
  if (!handle) return setAuthStatus("type a handle first.", true);
  setAuthStatus("redirecting to your pds…");
  try {
    await login(handle);
  } catch (e) {
    setAuthStatus(e.message || String(e), true);
  }
}
async function logOut() {
  await clearSession();
  session = null;
  renderAuth();
}

// ---------- share (the tool itself, not a stranger's post) ----------

function shareTool() {
  const text =
    "the council picks your reply, the dice pick what it actually says — skullcouncil, a bluesky client where you can't type your own words: " +
    SITE_URL;
  window.open("https://bsky.app/intent/compose?text=" + encodeURIComponent(text), "_blank", "noopener");
}

// ---------- wire up ----------

window.skullcouncil = { pickPersona, pickIntent, doRoll, postReply, nextPost, signIn, logOut, shareTool };
$("signin-btn")?.addEventListener("click", signIn);
$("share-btn")?.addEventListener("click", shareTool);
boot();
