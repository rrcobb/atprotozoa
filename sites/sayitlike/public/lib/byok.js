// byok.js — bring-your-own-key. The visitor pastes their own provider API key,
// it lives in this browser's localStorage and nowhere else, and the page calls
// the provider directly with it. No Worker, no proxy, no server-side key, so
// the site owner pays nothing for what the visitor generates.
//
// Trimmed from sites/byok/public/lib/byok.js: this site only offers OpenAI and
// OpenRouter (the ask was explicit about the two), so the other dialects,
// providers, and capabilities (image/speak/transcribe/embed/search) are cut.
// Both remaining providers speak the same OpenAI /chat/completions dialect.
//
//   chat(prompt, {provider, system, model, temperature, maxTokens})

const STORE_PREFIX = "byok:";

export const PROVIDERS = {
  openai: {
    label: "OpenAI",
    keyHint: "sk-…",
    consoleUrl: "https://platform.openai.com/api-keys",
    base: "https://api.openai.com/v1",
    chatModel: "gpt-4o-mini",
  },
  openrouter: {
    label: "OpenRouter",
    keyHint: "sk-or-…",
    consoleUrl: "https://openrouter.ai/keys",
    base: "https://openrouter.ai/api/v1",
    chatModel: "openai/gpt-4o-mini",
  },
};

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

// --- plumbing --------------------------------------------------------------

function need(provider) {
  const meta = PROVIDERS[provider];
  if (!meta) throw new Error(`Unknown provider "${provider}".`);
  const key = getKey(provider);
  if (!key) throw new Error(`No ${meta.label} key set.`);
  return { meta, key };
}

// Providers disagree about where the error message lives; try the known shapes
// so the UI can show the real reason rather than a status code.
async function readError(res, fallback) {
  let detail = "";
  try {
    const b = await res.json();
    detail = b?.error?.message || b?.error || b?.message || "";
  } catch {
    detail = await res.text().catch(() => "");
  }
  if (typeof detail !== "string") detail = JSON.stringify(detail);
  return new Error(detail || fallback || `HTTP ${res.status}`);
}

// --- chat --------------------------------------------------------------

export async function chat(
  prompt,
  { provider = "openai", system, model, temperature, maxTokens = 1024, signal } = {},
) {
  const { meta, key } = need(provider);
  const useModel = model || meta.chatModel;

  const messages = [];
  if (system) messages.push({ role: "system", content: system });
  messages.push({ role: "user", content: prompt });

  const body = { model: useModel, messages, max_tokens: maxTokens };
  if (temperature !== undefined && temperature !== null && temperature !== "") {
    body.temperature = Number(temperature);
  }

  const res = await fetch(`${meta.base}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) throw await readError(res, "Translation failed.");
  const data = await res.json();
  return (data?.choices?.[0]?.message?.content || "").trim();
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

// Render the key panel into `target`. Both providers here do chat, so the
// panel always offers a picker rather than pinning to one.
//
// onChange(hasKey, providerId) fires whenever that flips, so the page can
// enable its own controls and remember which provider is selected.
export function mountKeyPanel(target, { onChange, blurb, title, prefer } = {}) {
  const el = typeof target === "string" ? document.querySelector(target) : target;
  if (!el) throw new Error("byok: no mount target");

  const choices = Object.keys(PROVIDERS);
  let current = choices.includes(prefer) ? prefer : choices[0];
  // Prefer a provider the visitor already has a key for.
  const known = choices.find((id) => hasKey(id));
  if (known) current = known;

  injectCss();
  el.classList.add("byok");

  function render() {
    const meta = PROVIDERS[current];
    const stored = hasKey(current);

    const picker = `<select data-byok="pick">${choices
      .map((id) => `<option value="${id}"${id === current ? " selected" : ""}>${PROVIDERS[id].label}</option>`)
      .join("")}</select>`;

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
