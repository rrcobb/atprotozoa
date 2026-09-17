// byok.js — bring-your-own-key. The visitor pastes their own provider API key,
// it lives in this browser's localStorage and nowhere else, and the page calls
// the provider directly with it. No Worker, no proxy, no server-side key, so
// the site owner pays nothing for what the visitor generates.
//
// Copy this file into a site's public/lib/ and call mountKeyPanel() plus one of
// the call helpers. Copy, don't import across sites.
//
// WHICH PROVIDERS WORK FROM A BROWSER (probed 2026-09-17 from a real page, see
// notes/40-new-site-playbook.md):
//
//   Anthropic   works, and needs anthropic-dangerous-direct-browser-access: true
//   OpenAI      works, chat and images both
//   fal         works, images
//   Gemini      works
//   Replicate   NO — the browser blocks it outright (Failed to fetch)
//   Black Forest Labs (flux)  NO — same
//
// The blocked two need a server-side proxy, which means the site owner holds a
// key and pays for every visitor. That defeats the purpose of this file, so
// prefer one of the working providers.
//
// Test this with a browser, not curl. curl sending an Origin header gets a
// different answer than a real page does — OpenAI omits allow-origin for curl
// and sends it for a browser, so a curl probe says "blocked" for a provider
// that actually works fine.

const STORE_PREFIX = "byok:";

// Everything a provider needs to be called and described in the UI. `probe`
// documents what the CORS test found so the next person doesn't have to re-run
// it to know why OpenAI isn't here as a callable option.
export const PROVIDERS = {
  anthropic: {
    label: "Anthropic",
    keyHint: "sk-ant-…",
    consoleUrl: "https://console.anthropic.com/settings/keys",
    browserCallable: true,
  },
  openai: {
    label: "OpenAI",
    keyHint: "sk-…",
    consoleUrl: "https://platform.openai.com/api-keys",
    browserCallable: true,
  },
  fal: {
    label: "fal (images)",
    keyHint: "a UUID:hex key",
    consoleUrl: "https://fal.ai/dashboard/keys",
    browserCallable: true,
  },
  gemini: {
    label: "Google Gemini",
    keyHint: "AIza…",
    consoleUrl: "https://aistudio.google.com/apikey",
    browserCallable: true,
  },
};

// Providers a page can't reach, kept here so a site can explain the gap rather
// than silently omitting them and looking broken to someone holding that key.
export const NEEDS_PROXY = {
  replicate: "Replicate doesn't allow browser calls.",
  bfl: "Black Forest Labs doesn't allow browser calls.",
};

// --- storage ---------------------------------------------------------------
// localStorage, so the key survives a reload but never leaves this browser.
// Deliberately not sessionStorage (a reload would lose it) and deliberately not
// a cookie — a cookie gets attached to requests to our own Worker, which is
// exactly the thing we promise never happens.

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

// --- calls -----------------------------------------------------------------
// One function per provider. Each throws an Error with the provider's own
// message when the call fails, so a site can show the real reason ("credit
// balance too low", "invalid key") instead of a generic failure.

async function readError(res, fallback) {
  let detail = "";
  try {
    const body = await res.json();
    detail = body?.error?.message || body?.detail || body?.error?.type || "";
  } catch {
    detail = await res.text().catch(() => "");
  }
  return new Error(detail || fallback || `HTTP ${res.status}`);
}

// Anthropic. The dangerous-direct-browser-access header is required: without it
// the response comes back with no allow-origin and the browser blocks it, even
// though the request itself succeeded. The name is a warning that the key is
// exposed to the page — which is fine here, because it's the visitor's own key
// that they pasted in themselves.
export async function askClaude(prompt, { system, maxTokens = 1024, model = "claude-opus-5", signal } = {}) {
  const key = getKey("anthropic");
  if (!key) throw new Error("No Anthropic key set.");

  const body = {
    model,
    max_tokens: maxTokens,
    messages: [{ role: "user", content: prompt }],
  };
  if (system) body.system = system;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) throw await readError(res, "Claude call failed.");

  const data = await res.json();
  // content is a list of blocks; concatenate the text ones.
  return data.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}

// OpenAI chat.
export async function askGpt(prompt, { system, model = "gpt-4o-mini", maxTokens = 1024, signal } = {}) {
  const key = getKey("openai");
  if (!key) throw new Error("No OpenAI key set.");

  const messages = [];
  if (system) messages.push({ role: "system", content: system });
  messages.push({ role: "user", content: prompt });

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, messages, max_completion_tokens: maxTokens }),
    signal,
  });
  if (!res.ok) throw await readError(res, "OpenAI call failed.");

  const data = await res.json();
  return (data?.choices?.[0]?.message?.content || "").trim();
}

// OpenAI images. gpt-image-1 returns base64 rather than a URL, so hand back a
// data: URL that drops straight into an <img>. Note this model needs a verified
// org on the key's account; an unverified key fails here with OpenAI's own
// message, which readError surfaces.
export async function makeImageOpenAI(prompt, { model = "gpt-image-1", size = "1024x1024", signal } = {}) {
  const key = getKey("openai");
  if (!key) throw new Error("No OpenAI key set.");

  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, prompt, size, n: 1 }),
    signal,
  });
  if (!res.ok) throw await readError(res, "Image generation failed.");

  const data = await res.json();
  const first = data?.data?.[0];
  if (first?.b64_json) return `data:image/png;base64,${first.b64_json}`;
  if (first?.url) return first.url;
  throw new Error("No image came back.");
}

// fal — image generation. Returns a URL on fal's CDN, which serves images with
// permissive CORS, so it can go straight into an <img> or be re-fetched.
export async function makeImage(prompt, { model = "fal-ai/flux/schnell", signal, ...rest } = {}) {
  const key = getKey("fal");
  if (!key) throw new Error("No fal key set.");

  const res = await fetch(`https://fal.run/${model}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Key ${key}`,
    },
    body: JSON.stringify({ prompt, ...rest }),
    signal,
  });
  if (!res.ok) throw await readError(res, "Image generation failed.");

  const data = await res.json();
  const url = data?.images?.[0]?.url;
  if (!url) throw new Error("No image came back.");
  return url;
}

// Gemini. Key goes in a header, not the query string — a key in a URL ends up in
// referrer headers and any logging in between.
export async function askGemini(prompt, { model = "gemini-2.0-flash", signal } = {}) {
  const key = getKey("gemini");
  if (!key) throw new Error("No Gemini key set.");

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      signal,
    },
  );
  if (!res.ok) throw await readError(res, "Gemini call failed.");

  const data = await res.json();
  return (data?.candidates?.[0]?.content?.parts || [])
    .map((p) => p.text || "")
    .join("")
    .trim();
}

// --- UI --------------------------------------------------------------------

const PANEL_CSS = `
.byok { border: 1px solid var(--byok-line, #d4cfc4); border-radius: 10px;
  padding: 14px 16px; background: var(--byok-bg, #faf8f4); font-size: 14px; }
.byok h3 { margin: 0 0 6px; font-size: 15px; font-weight: 600; }
.byok .byok-why { margin: 0 0 10px; line-height: 1.45; opacity: .8; }
.byok .byok-row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.byok input { flex: 1 1 240px; min-width: 0; padding: 7px 9px; font: inherit;
  font-family: ui-monospace, Menlo, monospace; border: 1px solid var(--byok-line, #d4cfc4);
  border-radius: 6px; background: #fff; }
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

// Render the key panel into `target`. Shows the entry field when no key is
// stored and a "key is set / forget it" state when one is, and calls
// onChange(hasKey) whenever that flips so the page can enable its own controls.
export function mountKeyPanel(target, { provider = "anthropic", onChange, blurb } = {}) {
  const el = typeof target === "string" ? document.querySelector(target) : target;
  if (!el) throw new Error("byok: no mount target");

  const meta = PROVIDERS[provider];
  if (!meta) throw new Error(`byok: ${provider} can't be called from a browser`);

  injectCss();
  el.classList.add("byok");

  function render() {
    const stored = hasKey(provider);
    if (stored) {
      el.innerHTML = `
        <h3>${meta.label} key</h3>
        <p class="byok-state byok-ok">Your key is set, and stored only in this browser.</p>
        <div class="byok-row"><button type="button" data-byok="forget">Forget my key</button></div>`;
    } else {
      el.innerHTML = `
        <h3>Use your own ${meta.label} key</h3>
        <p class="byok-why">${
          blurb || `This page calls ${meta.label} straight from your browser.`
        } Your key is stored in this browser and sent only to ${meta.label} —
        it never reaches this site's server, because this site doesn't have one
        that sees it. <a href="${meta.consoleUrl}" target="_blank" rel="noopener">Get a key</a>.</p>
        <div class="byok-row">
          <input type="password" data-byok="input" placeholder="${meta.keyHint}"
            autocomplete="off" spellcheck="false" />
          <button type="button" class="byok-primary" data-byok="save">Save</button>
        </div>`;
    }
    onChange?.(stored);
  }

  el.addEventListener("click", (ev) => {
    const what = ev.target?.dataset?.byok;
    if (what === "save") {
      const input = el.querySelector('[data-byok="input"]');
      const value = input.value.trim();
      if (!value) return input.focus();
      setKey(provider, value);
      render();
    } else if (what === "forget") {
      forgetKey(provider);
      render();
    }
  });

  el.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter" && ev.target?.dataset?.byok === "input") {
      el.querySelector('[data-byok="save"]').click();
    }
  });

  render();
  return { refresh: render };
}
