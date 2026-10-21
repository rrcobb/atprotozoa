// Same-origin Hydracept proxy client (hosted or visitor Bearer token).

import { parseImageSize } from "./hydracept-pure.js";

export async function fetchHostedStatus() {
  try {
    const r = await fetch("/api/hydracept/status");
    if (!r.ok) return { hosted: false };
    return r.json();
  } catch {
    return { hosted: false };
  }
}

function authHeaders(token) {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function hydraceptQuote({ capability, input, token }) {
  const r = await fetch("/api/hydracept/quote", {
    method: "POST",
    headers: { "content-type": "application/json", ...authHeaders(token) },
    body: JSON.stringify({ capability, input }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `quote failed (${r.status})`);
  return data;
}

export async function hydraceptRun({ capability, input, quoteId, token }) {
  const r = await fetch("/api/hydracept/run", {
    method: "POST",
    headers: { "content-type": "application/json", ...authHeaders(token) },
    body: JSON.stringify({ capability, input, quoteId }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `run failed (${r.status})`);
  return data;
}

export async function generateHydraceptImage(prompt, { token, size = "1024x1024", confirmQuote } = {}) {
  const { width, height } = parseImageSize(size);
  const input = { prompt: prompt.slice(0, 32000), width, height };
  const q = await hydraceptQuote({ capability: "image.generate.v1", input, token });
  const ok = confirmQuote ? await confirmQuote(q.display, q) : window.confirm(`Hydracept quote: ${q.display}. Run this image job?`);
  if (!ok) throw new Error("cancelled");
  const ran = await hydraceptRun({
    capability: "image.generate.v1",
    input,
    quoteId: q.quoteId,
    token,
  });
  const mime = ran.mediaType || "image/png";
  return `data:${mime};base64,${ran.dataBase64}`;
}
