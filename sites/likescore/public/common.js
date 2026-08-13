// Shared helpers for likescore's pages — plain vanilla JS, no bundler, no
// framework (house style: a site is self-contained, no build step needed
// beyond what wrangler already does for src/*.ts).
export function escapeHtml(s) {
  return String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]
  );
}

export async function fetchJSON(url, opts) {
  const resp = await fetch(url, opts);
  const data = await resp.json().catch(() => null);
  if (!resp.ok) {
    throw new Error(data?.error || `request failed (${resp.status})`);
  }
  return data;
}

export function fmtTimeAgo(ms) {
  if (!ms) return "never";
  const diff = Date.now() - ms;
  if (diff < 0) return "just now";
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export function statusStamp(status) {
  if (status === "scanned") return `<span class="stamp live">scanned</span>`;
  if (status === "provisional")
    return `<span class="stamp provisional">provisional</span>`;
  if (status === "deactivated")
    return `<span class="stamp deactivated">deactivated</span>`;
  return "";
}

export function avatarOrInitial(handle, avatar) {
  const initial = (handle || "?").replace(/^@/, "")[0]?.toUpperCase() || "?";
  if (avatar) {
    return `<img src="${escapeHtml(avatar)}" alt="" width="20" height="20" style="border-radius:50%;vertical-align:middle;margin-right:6px" loading="lazy">`;
  }
  return `<span style="display:inline-block;width:20px;height:20px;border-radius:50%;background:var(--panel-2);border:1px solid var(--border);text-align:center;line-height:18px;font-size:10px;vertical-align:middle;margin-right:6px">${escapeHtml(initial)}</span>`;
}

// Consumes a fetch Response's SSE body and calls onEvent(eventName, data)
// per message. likescore's /api/scan endpoint streams exactly this shape.
export async function readSSE(response, onEvent) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf("\n\n")) !== -1) {
      const chunk = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      let event = "message";
      let data = "";
      for (const line of chunk.split("\n")) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) data += line.slice(5).trim();
      }
      if (data) {
        try {
          onEvent(event, JSON.parse(data));
        } catch {
          // malformed chunk — ignore, keep streaming
        }
      }
    }
  }
}

export const SHARE_BASE = "https://likescore.bisks.net";

export function shareIntentUrl(text) {
  return "https://bsky.app/intent/compose?text=" + encodeURIComponent(text);
}
