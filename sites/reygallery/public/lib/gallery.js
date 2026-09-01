// gallery.js — builds the exhibit from Rey's own repo, live, instead of
// hand-listing pieces that will drift the moment Rey posts again.
//
// Rey (@rey-notnecessarily.bsky.social) turns out to have posted almost
// nothing image-shaped: one images-embed post and one video, out of 1140
// records. So "gallery for rey's art" is read generously but honestly as two
// kinds of piece:
//
//  1. The current avatar — always "on view," paired with whatever Rey said
//     about it. Detected by scanning Rey's own post text for
//     announcement-shaped language ("new profile picture", "new avatar",
//     "new pfp", ...) rather than hardcoding today's specific post, so a
//     future avatar change picks up its own announcement automatically.
//  2. Any image/video Rey has actually posted, each becomes one piece.
//
// Both kinds reuse the same "statement" mechanism: an image/avatar
// announcement often kicks off a reply thread where Rey explains themself
// further (see the 2026-09-01 avatar posts, where Rey's own elaborations
// arrive as replies to *other people's* questions inside the thread, not as
// direct self-replies) — so a piece's statement is every one of Rey's own
// posts sharing that thread's root, concatenated in order, not just the one
// post's text.

import { fetchRepoRecordsWithKeys } from "./car.js";
import { resolvePds } from "./identity.js";

const PUB = "https://public.api.bsky.app/xrpc";
const HANDLE = "rey-notnecessarily.bsky.social";

// Alt text that signals "not actually art" — a debug/test upload, not a
// captioned piece. Anything else, however terse, is treated as real.
const TRIVIAL_ALT = new Set(["", "test", "testing", "test video", "test image", "test post"]);

const ANNOUNCE_RE = /\bnew\s+(profile\s*(pic(ture)?|photo)|avatar|pfp)\b/i;

async function jget(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status} on ${url}`);
  return r.json();
}

const B32_ALPHABET = "abcdefghijklmnopqrstuvwxyz234567";
function base32Encode(bytes) {
  let bits = 0, value = 0, out = "";
  for (let i = 0; i < bytes.length; i++) {
    value = (value << 8) | bytes[i];
    bits += 8;
    while (bits >= 5) {
      out += B32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}
function cidBytesToString(bytes) {
  const raw = bytes[0] === 0 ? bytes.subarray(1) : bytes;
  return "b" + base32Encode(raw);
}
function blobUrls(did, refBytes) {
  if (!(refBytes instanceof Uint8Array)) return null;
  const cid = cidBytesToString(refBytes);
  return {
    thumb: `https://cdn.bsky.app/img/feed_thumbnail/plain/${did}/${cid}@jpeg`,
    full: `https://cdn.bsky.app/img/feed_fullsize/plain/${did}/${cid}@jpeg`,
  };
}
function videoUrls(did, cidLink) {
  if (!cidLink) return null;
  const cid = cidLink;
  const enc = `${encodeURIComponent(did)}/${encodeURIComponent(cid)}`;
  return {
    poster: `https://video.bsky.app/watch/${enc}/thumbnail.jpg`,
    playlist: `https://video.bsky.app/watch/${enc}/playlist.m3u8`,
  };
}

export function postUrl(uri, handle) {
  const rkey = (uri || "").split("/").pop();
  return `https://bsky.app/profile/${handle}/post/${rkey}`;
}

// Every one of Rey's own posts that shares `rootUri` as their thread root
// (or *is* rootUri itself), oldest first — the raw material for a plaque.
function threadStatement(posts, rootUri, seedText, seedCreatedAt) {
  const inThread = posts.filter((p) => p.reply?.root?.uri === rootUri);
  const all = [{ text: seedText, createdAt: seedCreatedAt }, ...inThread.map((p) => ({ text: p.text || "", createdAt: p.createdAt || "" }))];
  all.sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));
  return all.map((p) => p.text.trim()).filter(Boolean).join("\n\n");
}

// A small pool of deterministic (hashed off the piece's own URI, not random)
// museum-filler lines for a piece that arrived with neither post text nor
// alt text — rare given what Rey actually posts, but a bare image is
// possible in principle and shouldn't crash the plaque.
const FALLBACK_DESCRIPTIONS = [
  "No statement accompanies this piece. It is presented as it was found, without further gloss.",
  "The artist offered no caption for this work; it is shown here on its own terms.",
  "This piece entered the collection without commentary. Any reading of it is the viewer's own.",
];
function hashString(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function deriveTitle(text, alt) {
  const quoted = (alt || "").match(/[“"]([^”"]{4,140})[”"]/);
  if (quoted) return quoted[1].trim();
  const t = (text || "").trim();
  if (t) {
    const firstLine = t.split("\n")[0];
    const firstClause = (firstLine.split(/(?<=[.!?])\s/)[0] || firstLine).replace(/\.$/, "");
    return firstClause.length > 70 ? firstClause.slice(0, 67).trim() + "…" : firstClause;
  }
  const a = (alt || "").trim();
  if (a) return a.length > 60 ? a.slice(0, 57).trim() + "…" : a;
  return "Untitled";
}

function imagesFromRawEmbed(embed) {
  if (!embed) return { images: [], video: null };
  if (embed.$type === "app.bsky.embed.images") return { images: embed.images || [], video: null };
  if (embed.$type === "app.bsky.embed.video") return { images: [], video: embed };
  if (embed.$type === "app.bsky.embed.recordWithMedia") {
    if (embed.media?.$type === "app.bsky.embed.images") return { images: embed.media.images || [], video: null };
    if (embed.media?.$type === "app.bsky.embed.video") return { images: [], video: embed.media };
  }
  return { images: [], video: null };
}

export async function buildExhibit(onStep) {
  const step = (s) => onStep && onStep(s);

  step("resolving @" + HANDLE + " …");
  const profile = await jget(`${PUB}/app.bsky.actor.getProfile?actor=${HANDLE}`);
  const did = profile.did;
  const handle = profile.handle;
  const displayName = profile.displayName || "Rey";

  step("finding the artist's PDS …");
  const pds = await resolvePds(did);
  if (!pds) throw new Error(`couldn't find a PDS for ${handle}`);

  step("downloading the whole repo (one request, no pagination) …");
  const { records } = await fetchRepoRecordsWithKeys(pds, did, "app.bsky.feed.post");

  step("assembling the exhibit …");
  const posts = records.map(({ uri, value }) => ({
    uri,
    text: value.text || "",
    createdAt: value.createdAt || "",
    reply: value.reply || null,
    embed: value.embed || null,
  }));
  posts.sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));

  // --- Piece 1: the current self-portrait -----------------------------
  let selfPortrait = null;
  const announcement = [...posts].reverse().find((p) => ANNOUNCE_RE.test(p.text));
  const statementText = announcement
    ? threadStatement(posts, announcement.uri, announcement.text, announcement.createdAt)
    : "";
  if (profile.avatar) {
    selfPortrait = {
      kind: "avatar",
      title: announcement ? deriveTitle(announcement.text, "") : "Self-Portrait (current)",
      artist: displayName,
      handle,
      year: announcement ? new Date(announcement.createdAt).getFullYear() : new Date().getFullYear(),
      image: profile.avatar,
      statement: statementText || "No accompanying statement was found for the current self-portrait; it is shown as displayed.",
      link: announcement ? postUrl(announcement.uri, handle) : `https://bsky.app/profile/${handle}`,
      linkLabel: announcement ? "read the thread on Bluesky ↗" : "view profile on Bluesky ↗",
      current: true,
    };
  }

  // --- Piece 2+: anything Rey has actually posted as an image/video ----
  const pieces = [];
  for (const p of posts) {
    const { images, video } = imagesFromRawEmbed(p.embed);
    if (images.length) {
      images.forEach((im, i) => {
        const alt = im.alt || "";
        if (TRIVIAL_ALT.has(alt.trim().toLowerCase())) return;
        const urls = blobUrls(did, im.image?.ref);
        if (!urls) return;
        const threaded = threadStatement(posts, p.uri, p.text, p.createdAt).trim();
        const statement =
          threaded ||
          (alt ? `The artist left no caption; the image's own description reads: "${alt}"` : FALLBACK_DESCRIPTIONS[hashString(p.uri + i) % FALLBACK_DESCRIPTIONS.length]);
        pieces.push({
          kind: "image",
          title: deriveTitle(p.text, alt) + (images.length > 1 ? ` (plate ${i + 1} of ${images.length})` : ""),
          artist: displayName,
          handle,
          year: new Date(p.createdAt).getFullYear(),
          image: urls.full,
          thumb: urls.thumb,
          alt,
          statement,
          link: postUrl(p.uri, handle),
          linkLabel: "view the original post on Bluesky ↗",
          createdAt: p.createdAt,
        });
      });
    } else if (video) {
      const alt = video.alt || "";
      if (TRIVIAL_ALT.has(alt.trim().toLowerCase())) continue;
      const cidLink = video.video?.ref?.$link || null;
      const urls = cidLink ? videoUrls(did, cidLink) : null;
      if (!urls) continue;
      const threaded = threadStatement(posts, p.uri, p.text, p.createdAt).trim();
      const statement =
        threaded ||
        (alt ? `The artist left no caption; the video's own description reads: "${alt}"` : FALLBACK_DESCRIPTIONS[hashString(p.uri) % FALLBACK_DESCRIPTIONS.length]);
      pieces.push({
        kind: "video",
        title: deriveTitle(p.text, alt),
        artist: displayName,
        handle,
        year: new Date(p.createdAt).getFullYear(),
        image: urls.poster,
        playlist: urls.playlist,
        alt,
        statement,
        link: postUrl(p.uri, handle),
        linkLabel: "watch it on Bluesky ↗",
        createdAt: p.createdAt,
      });
    }
  }
  pieces.sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));

  return { profile: { did, handle, displayName, avatar: profile.avatar }, selfPortrait, pieces };
}
