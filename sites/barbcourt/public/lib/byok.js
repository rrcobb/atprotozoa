// byok.js — bring-your-own-key. The visitor pastes their own provider API key,
// it lives in this browser's localStorage and nowhere else, and the page calls
// the provider directly with it. No Worker, no proxy, no server-side key, so
// the site owner pays nothing for what the visitor generates.
//
// Copy this file into a site's public/lib/ and call mountKeyPanel() plus one of
// the capability functions. Copy, don't import across sites.
//
//   chat(prompt, {provider})        text in, text out
//   image(prompt, {provider})       returns a URL (or data: URL) for an <img>
//   speak(text, {provider})         returns an object URL for an <audio>
//   transcribe(blob, {provider})    audio in, text out
//   embed(text, {provider})         returns a vector
//
// Most providers here speak the OpenAI /chat/completions dialect, so they're one
// registry entry each rather than one function each. Adding another OpenAI-shaped
// provider means adding a base URL and a model — no new code.
//
// WHICH PROVIDERS WORK FROM A BROWSER (probed 2026-09-17 from a real page; see
// notes/40-new-site-playbook.md). Everything in PROVIDERS below was verified
// reachable; the blocked ones are listed in NEEDS_PROXY with what happened.
//
// Test this with a browser, not curl. curl sending an Origin header gets a
// different answer than a real page does — OpenAI omits allow-origin for curl
// and sends it for a browser, so a curl probe says "blocked" for a provider
// that actually works fine. A blocked call throws "Failed to fetch" with no
// status; an allowed one gives you a status and a readable body even on a 401.

const STORE_PREFIX = "byok:";

// `dialect` picks the request/response adapter. Everything else is data.
export const PROVIDERS = {
  // --- OpenAI dialect: POST {base}/chat/completions, Authorization: Bearer ---
  openai: {
    label: "OpenAI",
    keyHint: "sk-…",
    consoleUrl: "https://platform.openai.com/api-keys",
    dialect: "openai",
    base: "https://api.openai.com/v1",
    chatModel: "gpt-4o-mini",
    imageModel: "gpt-image-1",
    speechModel: "tts-1",
    transcribeModel: "whisper-1",
    embedModel: "text-embedding-3-small",
    can: ["chat", "image", "speak", "transcribe", "embed"],
  },
  openrouter: {
    label: "OpenRouter",
    keyHint: "sk-or-…",
    consoleUrl: "https://openrouter.ai/keys",
    dialect: "openai",
    base: "https://openrouter.ai/api/v1",
    chatModel: "openai/gpt-4o-mini",
    can: ["chat"],
  },
  groq: {
    label: "Groq",
    keyHint: "gsk_…",
    consoleUrl: "https://console.groq.com/keys",
    dialect: "openai",
    base: "https://api.groq.com/openai/v1",
    chatModel: "llama-3.3-70b-versatile",
    can: ["chat"],
  },
  mistral: {
    label: "Mistral",
    keyHint: "a 32-char key",
    consoleUrl: "https://console.mistral.ai/api-keys",
    dialect: "openai",
    base: "https://api.mistral.ai/v1",
    chatModel: "mistral-small-latest",
    can: ["chat"],
  },
  deepseek: {
    label: "DeepSeek",
    keyHint: "sk-…",
    consoleUrl: "https://platform.deepseek.com/api_keys",
    dialect: "openai",
    base: "https://api.deepseek.com",
    chatModel: "deepseek-chat",
    can: ["chat"],
  },
  together: {
    label: "Together",
    keyHint: "a 64-char hex key",
    consoleUrl: "https://api.together.xyz/settings/api-keys",
    dialect: "openai",
    base: "https://api.together.xyz/v1",
    chatModel: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
    can: ["chat"],
  },
  xai: {
    label: "xAI (Grok)",
    keyHint: "xai-…",
    consoleUrl: "https://console.x.ai",
    dialect: "openai",
    base: "https://api.x.ai/v1",
    chatModel: "grok-4",
    can: ["chat"],
  },
  perplexity: {
    label: "Perplexity",
    keyHint: "pplx-…",
    consoleUrl: "https://www.perplexity.ai/settings/api",
    dialect: "openai",
    base: "https://api.perplexity.ai",
    chatModel: "sonar",
    can: ["chat"],
  },
  fireworks: {
    label: "Fireworks",
    keyHint: "fw_…",
    consoleUrl: "https://fireworks.ai/account/api-keys",
    dialect: "openai",
    base: "https://api.fireworks.ai/inference/v1",
    chatModel: "accounts/fireworks/models/llama-v3p3-70b-instruct",
    can: ["chat"],
  },
  nebius: {
    label: "Nebius",
    keyHint: "a JWT-looking key",
    consoleUrl: "https://studio.nebius.com",
    dialect: "openai",
    base: "https://api.studio.nebius.com/v1",
    chatModel: "meta-llama/Llama-3.3-70B-Instruct",
    can: ["chat"],
  },
  huggingface: {
    label: "Hugging Face",
    keyHint: "hf_…",
    consoleUrl: "https://huggingface.co/settings/tokens",
    dialect: "openai",
    base: "https://router.huggingface.co/v1",
    chatModel: "meta-llama/Llama-3.1-8B-Instruct",
    can: ["chat"],
  },
  // Gemini ships an OpenAI-compatible endpoint; use it rather than the native
  // one so it shares the adapter. The native shape is still there if needed.
  gemini: {
    label: "Google Gemini",
    keyHint: "AIza…",
    consoleUrl: "https://aistudio.google.com/apikey",
    dialect: "openai",
    base: "https://generativelanguage.googleapis.com/v1beta/openai",
    chatModel: "gemini-2.0-flash",
    embedModel: "text-embedding-004",
    can: ["chat", "embed"],
  },

  // --- other dialects ---
  anthropic: {
    label: "Anthropic",
    keyHint: "sk-ant-…",
    consoleUrl: "https://console.anthropic.com/settings/keys",
    dialect: "anthropic",
    base: "https://api.anthropic.com/v1",
    chatModel: "claude-opus-5",
    can: ["chat"],
  },
  elevenlabs: {
    label: "ElevenLabs",
    keyHint: "sk_…",
    consoleUrl: "https://elevenlabs.io/app/settings/api-keys",
    dialect: "elevenlabs",
    base: "https://api.elevenlabs.io/v1",
    // Rachel — a stock voice on every account, so a copied site works untouched.
    voiceId: "21m00Tcm4TlvDq8ikWAM",
    speechModel: "eleven_multilingual_v2",
    can: ["speak", "sfx", "music"],
  },
  deepgram: {
    label: "Deepgram",
    keyHint: "a 40-char hex key",
    consoleUrl: "https://console.deepgram.com",
    dialect: "deepgram",
    base: "https://api.deepgram.com/v1",
    can: ["speak", "transcribe"],
  },
  fal: {
    label: "fal",
    keyHint: "a UUID:hex key",
    consoleUrl: "https://fal.ai/dashboard/keys",
    dialect: "fal",
    base: "https://fal.run",
    imageModel: "fal-ai/flux/schnell",
    can: ["image"],
  },
  voyage: {
    label: "Voyage",
    keyHint: "pa-…",
    consoleUrl: "https://dash.voyageai.com",
    dialect: "openai",
    base: "https://api.voyageai.com/v1",
    embedModel: "voyage-3",
    can: ["embed"],
  },
  exa: {
    label: "Exa (search)",
    keyHint: "a UUID key",
    consoleUrl: "https://dashboard.exa.ai/api-keys",
    dialect: "exa",
    base: "https://api.exa.ai",
    can: ["search"],
  },
};

// Blocked by the browser when probed — they send no usable CORS headers, so a
// page cannot call them however the request is written. Using one means running
// a proxy, which puts the key and the bill back on the site owner.
export const NEEDS_PROXY = {
  replicate: "Replicate — browser blocks it.",
  bfl: "Black Forest Labs (flux) — browser blocks it.",
  cerebras: "Cerebras — answers curl but blocks the browser.",
  tavily: "Tavily (search) — browser blocks it.",
  brave: "Brave Search — browser blocks it.",
  ideogram: "Ideogram (images) — browser blocks it.",
  luma: "Luma (video) — browser blocks it.",
  runway: "Runway (video) — browser blocks it.",
  jev: "Jev / TypeSafe System One — browser blocks it (api.typesafe.ai).",
};

export function providersFor(capability) {
  return Object.entries(PROVIDERS)
    .filter(([, p]) => p.can.includes(capability))
    .map(([id]) => id);
}

// --- storage ---------------------------------------------------------------
// localStorage, so the key survives a reload but never leaves this browser.
// Deliberately not a cookie — a cookie gets attached to requests to our own
// Worker, which is exactly the thing we promise never happens.

export function getKey(provider) {
  try {
    return localStorage.getItem(STORE_PREFIX + provider) || "";
  } catch {
    return ""; // private mode / storage disabled
  }
}

export function setKey(provider, key) {
  try {
    localStorage.setItem(STORE_PREFIX + provider, key.trim());
    return true;
  } catch {
    return false;
  }
}

export function forgetKey(provider) {
  try {
    localStorage.removeItem(STORE_PREFIX + provider);
  } catch {
    /* nothing to forget */
  }
}

export function hasKey(provider) {
  return getKey(provider).length > 0;
}

// Clear every key this library stored, whichever provider.
export function forgetAllKeys() {
  for (const id of Object.keys(PROVIDERS)) forgetKey(id);
}

// --- plumbing --------------------------------------------------------------

function need(provider, capability) {
  const meta = PROVIDERS[provider];
  if (!meta) throw new Error(`Unknown provider "${provider}".`);
  if (capability && !meta.can.includes(capability)) {
    throw new Error(`${meta.label} can't do ${capability}.`);
  }
  const key = getKey(provider);
  if (!key) throw new Error(`No ${meta.label} key set.`);
  return { meta, key };
}

// Providers disagree about where the error message lives; try the known shapes
// so the UI can show the real reason rather than a status code.
async function readError(res, fallback) {
  let detail = "";
  try {
    let b = await res.json();
    // Gemini's OpenAI-compatible endpoint wraps the error in an array.
    if (Array.isArray(b)) b = b[0];
    detail =
      b?.error?.message ||        // OpenAI dialect, most aggregators
      b?.error ||                 // some return a bare string
      b?.detail?.message ||       // ElevenLabs
      b?.detail ||                // fal, Mistral, Voyage
      b?.message ||               // Cohere
      b?.err_msg ||               // Deepgram
      "";
  } catch {
    detail = await res.text().catch(() => "");
  }
  if (typeof detail !== "string") detail = JSON.stringify(detail);
  return new Error(detail || fallback || `HTTP ${res.status}`);
}

function authHeaders(meta, key) {
  switch (meta.dialect) {
    case "anthropic":
      return {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        // Required: without it the browser blocks the response outright. The
        // "dangerous" is about exposing a key to page JS, which is the whole
        // arrangement here — it's the visitor's own key, on their machine.
        "anthropic-dangerous-direct-browser-access": "true",
      };
    case "elevenlabs":
      return { "xi-api-key": key };
    case "deepgram":
      return { authorization: `Token ${key}` };
    case "fal":
      return { authorization: `Key ${key}` };
    case "exa":
      return { "x-api-key": key };
    default:
      return { authorization: `Bearer ${key}` };
  }
}

// --- chat ------------------------------------------------------------------

export async function chat(prompt, { provider = "openai", system, model, maxTokens = 1024, signal } = {}) {
  const { meta, key } = need(provider, "chat");
  const useModel = model || meta.chatModel;
  const headers = { "content-type": "application/json", ...authHeaders(meta, key) };

  if (meta.dialect === "anthropic") {
    const body = { model: useModel, max_tokens: maxTokens, messages: [{ role: "user", content: prompt }] };
    if (system) body.system = system;

    const res = await fetch(`${meta.base}/messages`, {
      method: "POST", headers, body: JSON.stringify(body), signal,
    });
    if (!res.ok) throw await readError(res, "Chat failed.");
    const data = await res.json();
    return data.content.filter((b) => b.type === "text").map((b) => b.text).join("").trim();
  }

  // OpenAI dialect — every aggregator above.
  const messages = [];
  if (system) messages.push({ role: "system", content: system });
  messages.push({ role: "user", content: prompt });

  const res = await fetch(`${meta.base}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({ model: useModel, messages, max_tokens: maxTokens }),
    signal,
  });
  if (!res.ok) throw await readError(res, "Chat failed.");
  const data = await res.json();
  return (data?.choices?.[0]?.message?.content || "").trim();
}

// --- images ----------------------------------------------------------------
// Returns something you can put straight in an <img src>: a hosted URL from
// fal, a data: URL from OpenAI (which returns base64, not a link).

export async function image(prompt, { provider = "fal", model, size = "1024x1024", signal, ...rest } = {}) {
  const { meta, key } = need(provider, "image");
  const useModel = model || meta.imageModel;
  const headers = { "content-type": "application/json", ...authHeaders(meta, key) };

  if (meta.dialect === "fal") {
    const res = await fetch(`${meta.base}/${useModel}`, {
      method: "POST", headers, body: JSON.stringify({ prompt, ...rest }), signal,
    });
    if (!res.ok) throw await readError(res, "Image generation failed.");
    const data = await res.json();
    const url = data?.images?.[0]?.url;
    if (!url) throw new Error("No image came back.");
    return url;
  }

  // OpenAI. gpt-image-1 needs a verified org on the key's account; an
  // unverified key fails here with OpenAI's own message, which readError shows.
  const res = await fetch(`${meta.base}/images/generations`, {
    method: "POST",
    headers,
    body: JSON.stringify({ model: useModel, prompt, size, n: 1, ...rest }),
    signal,
  });
  if (!res.ok) throw await readError(res, "Image generation failed.");
  const data = await res.json();
  const first = data?.data?.[0];
  if (first?.b64_json) return `data:image/png;base64,${first.b64_json}`;
  if (first?.url) return first.url;
  throw new Error("No image came back.");
}

// --- speech out ------------------------------------------------------------
// Returns a blob: URL for an <audio src>. Revoke it with URL.revokeObjectURL
// when you're done if the page makes many.

export async function speak(text, { provider = "elevenlabs", voice, model, signal } = {}) {
  const { meta, key } = need(provider, "speak");
  const headers = { "content-type": "application/json", ...authHeaders(meta, key) };

  let url;
  let body;
  if (meta.dialect === "elevenlabs") {
    url = `${meta.base}/text-to-speech/${voice || meta.voiceId}`;
    body = { text, model_id: model || meta.speechModel };
  } else if (meta.dialect === "deepgram") {
    url = `${meta.base}/speak`;
    body = { text };
  } else {
    // OpenAI
    url = `${meta.base}/audio/speech`;
    body = { model: model || meta.speechModel, input: text, voice: voice || "alloy" };
  }

  const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body), signal });
  if (!res.ok) throw await readError(res, "Speech generation failed.");
  return URL.createObjectURL(await res.blob());
}

// ElevenLabs extras — a sound effect or a music clip from a text prompt.
export async function sfx(prompt, { provider = "elevenlabs", signal } = {}) {
  const { meta, key } = need(provider, "sfx");
  const res = await fetch(`${meta.base}/sound-generation`, {
    method: "POST",
    headers: { "content-type": "application/json", ...authHeaders(meta, key) },
    body: JSON.stringify({ text: prompt }),
    signal,
  });
  if (!res.ok) throw await readError(res, "Sound generation failed.");
  return URL.createObjectURL(await res.blob());
}

export async function music(prompt, { provider = "elevenlabs", lengthMs, signal } = {}) {
  const { meta, key } = need(provider, "music");
  const body = { prompt };
  if (lengthMs) body.music_length_ms = lengthMs;
  const res = await fetch(`${meta.base}/music`, {
    method: "POST",
    headers: { "content-type": "application/json", ...authHeaders(meta, key) },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) throw await readError(res, "Music generation failed.");
  return URL.createObjectURL(await res.blob());
}

// --- speech in -------------------------------------------------------------
// Takes a Blob (e.g. from MediaRecorder) and returns text.

export async function transcribe(blob, { provider = "openai", model, signal } = {}) {
  const { meta, key } = need(provider, "transcribe");

  if (meta.dialect === "deepgram") {
    const res = await fetch(`${meta.base}/listen`, {
      method: "POST",
      headers: { "content-type": blob.type || "audio/webm", ...authHeaders(meta, key) },
      body: blob,
      signal,
    });
    if (!res.ok) throw await readError(res, "Transcription failed.");
    const data = await res.json();
    return (data?.results?.channels?.[0]?.alternatives?.[0]?.transcript || "").trim();
  }

  // OpenAI — multipart. Don't set content-type; the browser adds the boundary.
  const form = new FormData();
  form.append("file", blob, "audio.webm");
  form.append("model", model || meta.transcribeModel);

  const res = await fetch(`${meta.base}/audio/transcriptions`, {
    method: "POST", headers: authHeaders(meta, key), body: form, signal,
  });
  if (!res.ok) throw await readError(res, "Transcription failed.");
  const data = await res.json();
  return (data?.text || "").trim();
}

// --- embeddings ------------------------------------------------------------

export async function embed(input, { provider = "openai", model, signal } = {}) {
  const { meta, key } = need(provider, "embed");
  const res = await fetch(`${meta.base}/embeddings`, {
    method: "POST",
    headers: { "content-type": "application/json", ...authHeaders(meta, key) },
    body: JSON.stringify({ model: model || meta.embedModel, input }),
    signal,
  });
  if (!res.ok) throw await readError(res, "Embedding failed.");
  const data = await res.json();
  const vectors = (data?.data || []).map((d) => d.embedding);
  return Array.isArray(input) ? vectors : vectors[0];
}

// --- search ----------------------------------------------------------------

export async function search(query, { provider = "exa", numResults = 5, signal } = {}) {
  const { meta, key } = need(provider, "search");
  const res = await fetch(`${meta.base}/search`, {
    method: "POST",
    headers: { "content-type": "application/json", ...authHeaders(meta, key) },
    body: JSON.stringify({ query, numResults }),
    signal,
  });
  if (!res.ok) throw await readError(res, "Search failed.");
  const data = await res.json();
  return (data?.results || []).map((r) => ({ title: r.title, url: r.url, text: r.text }));
}

// --- UI --------------------------------------------------------------------

const PANEL_CSS = `
.byok { border: 1px solid var(--byok-line, #d4cfc4); border-radius: 10px;
  padding: 14px 16px; background: var(--byok-bg, #faf8f4); font-size: 14px; }
.byok h3 { margin: 0 0 6px; font-size: 15px; font-weight: 600; }
.byok .byok-why { margin: 0 0 10px; line-height: 1.45; opacity: .8; }
.byok .byok-row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.byok select, .byok input { padding: 7px 9px; font: inherit; border-radius: 6px;
  border: 1px solid var(--byok-line, #d4cfc4); background: #fff; }
.byok input { flex: 1 1 240px; min-width: 0; font-family: ui-monospace, Menlo, monospace; }
.byok button { padding: 7px 12px; font: inherit; border-radius: 6px; cursor: pointer;
  border: 1px solid var(--byok-line, #d4cfc4); background: #fff; }
.byok button.byok-primary { background: #1f1c18; color: #fff; border-color: #1f1c18; }
.byok .byok-state { margin-top: 9px; line-height: 1.45; }
.byok .byok-ok { color: #2f6b3a; }
.byok a { color: inherit; }
`;

function injectCss() {
  if (document.getElementById("byok-css")) return;
  const el = document.createElement("style");
  el.id = "byok-css";
  el.textContent = PANEL_CSS;
  document.head.appendChild(el);
}

// Render the key panel into `target`.
//
//   provider    pin the panel to one provider, or
//   capability  let the visitor pick any provider that can do the job
//
// onChange(hasKey, providerId) fires whenever that flips, so the page can
// enable its own controls and remember which provider is selected.
export function mountKeyPanel(target, { provider, capability, onChange, blurb, title, prefer } = {}) {
  const el = typeof target === "string" ? document.querySelector(target) : target;
  if (!el) throw new Error("byok: no mount target");

  const choices = provider ? [provider] : providersFor(capability || "chat");
  if (!choices.length) throw new Error(`byok: nothing can do ${capability}`);

  let current = choices.includes(prefer) ? prefer : choices[0];
  // Prefer a provider the visitor already has a key for.
  const known = choices.find((id) => hasKey(id));
  if (known) current = known;

  injectCss();
  el.classList.add("byok");

  function render() {
    const meta = PROVIDERS[current];
    const stored = hasKey(current);

    const picker =
      choices.length > 1
        ? `<select data-byok="pick">${choices
            .map(
              (id) =>
                `<option value="${id}"${id === current ? " selected" : ""}>${PROVIDERS[id].label}</option>`,
            )
            .join("")}</select>`
        : "";

    if (stored) {
      el.innerHTML = `
        <h3>${title ? `${title} — ${meta.label}` : `${meta.label} key`}</h3>
        <p class="byok-state byok-ok">Your key is set, and stored only in this browser.</p>
        <div class="byok-row">${picker}
          <button type="button" data-byok="forget">Forget my key</button></div>`;
    } else {
      el.innerHTML = `
        <h3>${title || "Use your own API key"}</h3>
        <p class="byok-why">${blurb || "This page calls the provider straight from your browser."}
        Your key is stored in this browser and sent only to ${meta.label} — it never
        reaches this site's server, because this site doesn't have one that sees it.
        <a href="${meta.consoleUrl}" target="_blank" rel="noopener">Get a key</a>.</p>
        <div class="byok-row">${picker}
          <input type="password" data-byok="input" placeholder="${meta.keyHint}"
            autocomplete="off" spellcheck="false" />
          <button type="button" class="byok-primary" data-byok="save">Save</button>
        </div>`;
    }
    onChange?.(stored, current);
  }

  el.addEventListener("click", (ev) => {
    const what = ev.target?.dataset?.byok;
    if (what === "save") {
      const input = el.querySelector('[data-byok="input"]');
      const value = input.value.trim();
      if (!value) return input.focus();
      setKey(current, value);
      render();
    } else if (what === "forget") {
      forgetKey(current);
      render();
    }
  });

  el.addEventListener("change", (ev) => {
    if (ev.target?.dataset?.byok === "pick") {
      current = ev.target.value;
      render();
    }
  });

  el.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter" && ev.target?.dataset?.byok === "input") {
      el.querySelector('[data-byok="save"]').click();
    }
  });

  render();
  return { refresh: render, provider: () => current };
}
