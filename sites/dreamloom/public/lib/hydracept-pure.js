// Pure Hydracept helpers — safe to import from the Worker and from node --test.

export const ALLOWED_CAPABILITIES = new Set([
  "image.generate.v1",
  "audio.voice.generate.v1",
]);

const IMAGE_PROMPT_MAX = 32_000;
const VOICE_TEXT_MAX = 10_000;
const IMAGE_EDGE_MIN = 256;
const IMAGE_EDGE_MAX = 3840;
const IMAGE_EDGE_MULTIPLE = 16;

function imageEdge(value) {
  const n = Math.max(IMAGE_EDGE_MIN, Math.min(IMAGE_EDGE_MAX, Math.round(value)));
  return Math.ceil(n / IMAGE_EDGE_MULTIPLE) * IMAGE_EDGE_MULTIPLE;
}

export function parseImageSize(size) {
  const m = String(size || "1024x1024").match(/^(\d+)x(\d+)$/);
  if (!m) return { width: 1024, height: 1024 };
  return { width: imageEdge(parseInt(m[1], 10)), height: imageEdge(parseInt(m[2], 10)) };
}

export function crossOriginRequest(origin, requestUrl) {
  if (!origin) return false;
  try {
    return new URL(origin).origin !== new URL(requestUrl).origin;
  } catch {
    return true;
  }
}

export function quoteDisplay(body) {
  if (body?.expectedCharge?.display) return body.expectedCharge.display;
  if (body?.pricing?.quote?.customerTotal?.display) return body.pricing.quote.customerTotal.display;
  if (body?.pricing?.price?.display) return body.pricing.price.display;
  return String(body?.quoteId || "quoted");
}

export function validateCapabilityInput(capability, input) {
  if (!ALLOWED_CAPABILITIES.has(capability)) {
    return { ok: false, error: "capability not allowed" };
  }
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, error: "input must be an object" };
  }
  if (capability === "image.generate.v1") {
    const prompt = String(input.prompt || "");
    if (!prompt.trim()) return { ok: false, error: "prompt required" };
    if (prompt.length > IMAGE_PROMPT_MAX) return { ok: false, error: "prompt too long" };
  }
  if (capability === "audio.voice.generate.v1") {
    const text = String(input.text || "");
    if (!text.trim()) return { ok: false, error: "text required" };
    if (text.length > VOICE_TEXT_MAX) return { ok: false, error: "text too long" };
    if (!String(input.voiceId || "").trim()) return { ok: false, error: "voiceId required" };
  }
  return { ok: true, input };
}

export function bytesToBase64(bytes) {
  const bin = new Uint8Array(bytes);
  let s = "";
  for (let i = 0; i < bin.length; i += 0x8000) {
    s += String.fromCharCode(...bin.subarray(i, i + 0x8000));
  }
  return btoa(s);
}
