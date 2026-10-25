// llm-vision.js — bring-your-own-key vision model for the photo pass.
//
// The visitor pastes their own provider key; it lives in this browser's
// localStorage and is sent only to that provider (copied from the pattern in
// sites/byok/public/lib/byok.js). CLIP gates which photos look like hot dogs;
// only those are sent here, so a key pays for the likely-hotdog photos and
// not for every attachment in the cluster.
//
// Jev (TypeSafe's System One) is not offered: api.typesafe.ai sends no CORS
// headers, so no browser page can call it (notes/40-new-site-playbook.md).
import { TOPPINGS } from "./toppings.js";

const STORE = "hotdog:vision-key:";
const PROVIDER_STORE = "hotdog:vision-provider";

export const PROVIDERS = {
  openai: { label: "OpenAI", hint: "sk-…", url: "https://platform.openai.com/api-keys", dialect: "openai", base: "https://api.openai.com/v1", model: "gpt-4o-mini" },
  anthropic: { label: "Anthropic", hint: "sk-ant-…", url: "https://console.anthropic.com/settings/keys", dialect: "anthropic", base: "https://api.anthropic.com/v1", model: "claude-haiku-4-5-20251001" },
  gemini: { label: "Google Gemini", hint: "AIza…", url: "https://aistudio.google.com/apikey", dialect: "openai", base: "https://generativelanguage.googleapis.com/v1beta/openai", model: "gemini-2.0-flash" },
};

export function getProvider() {
  try {
    const p = localStorage.getItem(PROVIDER_STORE);
    return PROVIDERS[p] ? p : "openai";
  } catch {
    return "openai";
  }
}

export function getKey(provider) {
  try {
    return localStorage.getItem(STORE + provider) || "";
  } catch {
    return "";
  }
}

export function saveKey(provider, key) {
  try {
    localStorage.setItem(PROVIDER_STORE, provider);
    localStorage.setItem(STORE + provider, key.trim());
    return true;
  } catch {
    return false;
  }
}

export function forgetKeys() {
  try {
    for (const id of Object.keys(PROVIDERS)) localStorage.removeItem(STORE + id);
  } catch {
    /* nothing to forget */
  }
}

const NAMES = TOPPINGS.map((t) => t[0]);

export const PROMPT =
  "This image may be a hot dog. If it is not a photo of a hot dog (or a chili dog / corn dog), reply with exactly: NONE. " +
  "Otherwise list the toppings visibly on it, chosen only from this list: " +
  NAMES.join(", ") +
  ". Reply with just the matching names, comma-separated, nothing else. If it is a hot dog with no toppings, reply: PLAIN.";

// Model reply -> topping names from our list (unknown words and NONE/PLAIN dropped).
export function parseToppings(reply) {
  const text = String(reply || "").toLowerCase();
  if (/^\s*(none|plain)\b/.test(text)) return [];
  // Longest names first so "crispy onions" claims its words before "onions".
  const found = [];
  let rest = text;
  for (const n of NAMES.slice().sort((a, b) => b.length - a.length)) {
    if (rest.includes(n)) {
      found.push(n);
      rest = rest.split(n).join(" ");
    }
  }
  return found;
}

async function toDataUrl(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`photo fetch ${res.status}`);
  const blob = await res.blob();
  return await new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(blob);
  });
}

async function errorOf(res) {
  try {
    let b = await res.json();
    if (Array.isArray(b)) b = b[0];
    const m = b?.error?.message || b?.error || b?.message;
    if (m) return new Error(typeof m === "string" ? m : JSON.stringify(m));
  } catch {
    /* fall through */
  }
  return new Error(`HTTP ${res.status}`);
}

// -> topping names the model sees on the photo at `imageUrl`. Throws on a bad
// key / provider error so the UI can say so.
export async function askToppings(imageUrl, provider = getProvider()) {
  const meta = PROVIDERS[provider];
  const key = getKey(provider);
  if (!meta || !key) throw new Error("no vision key set");
  const dataUrl = await toDataUrl(imageUrl);

  if (meta.dialect === "anthropic") {
    const m = dataUrl.match(/^data:([^;]+);base64,(.*)$/);
    const res = await fetch(`${meta.base}/messages`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: meta.model,
        max_tokens: 60,
        messages: [{ role: "user", content: [
          { type: "image", source: { type: "base64", media_type: m[1], data: m[2] } },
          { type: "text", text: PROMPT },
        ] }],
      }),
    });
    if (!res.ok) throw await errorOf(res);
    const d = await res.json();
    return parseToppings(d.content.filter((b) => b.type === "text").map((b) => b.text).join(" "));
  }

  const res = await fetch(`${meta.base}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: meta.model,
      max_tokens: 60,
      messages: [{ role: "user", content: [
        { type: "text", text: PROMPT },
        { type: "image_url", image_url: { url: dataUrl } },
      ] }],
    }),
  });
  if (!res.ok) throw await errorOf(res);
  const d = await res.json();
  return parseToppings(d?.choices?.[0]?.message?.content);
}
