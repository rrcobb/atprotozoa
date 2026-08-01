// chrysalis.bisks.net — a countdown that reveals something on
// TARGET_ISO and not one second before.
//
// The trick: the reveal isn't a hidden div or a client-side flag you could
// flip in devtools. src/secret.ts only holds AES-256-GCM ciphertext. The
// decryption key is SHA-256(TARGET_ISO + PEPPER) — PEPPER lives only here,
// server-side, and is never sent to the client. /api/reveal refuses to even
// attempt the decrypt until this Worker's own clock has passed TARGET_ISO,
// so there's no request you can make, before then, that returns the
// plaintext. (This is obfuscation backed by a date check, not a formal
// time-lock — anyone who reads this file gets PEPPER too — but nothing
// public, and no client-visible bundle, contains the answer.)
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

import { CIPHERTEXT_B64, IV_B64 } from "./secret";

const TARGET_ISO = "2026-08-08T06:22:00Z";
const PEPPER = "9cdc858cd4de1fe8862c133d98c49917675a17c3975fe53b";

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function decryptPayload(): Promise<{ message: string; svg: string }> {
  const keyMaterial = new TextEncoder().encode(TARGET_ISO + PEPPER);
  const keyBytes = await crypto.subtle.digest("SHA-256", keyMaterial);
  const key = await crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["decrypt"]);
  const iv = base64ToBytes(IV_B64);
  const ciphertext = base64ToBytes(CIPHERTEXT_B64);
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  return JSON.parse(new TextDecoder().decode(plaintext));
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/reveal") {
      const now = new Date();
      const target = new Date(TARGET_ISO);
      if (now.getTime() < target.getTime()) {
        return json({ ready: false, target: TARGET_ISO, now: now.toISOString() });
      }
      try {
        const payload = await decryptPayload();
        return json({ ready: true, target: TARGET_ISO, ...payload });
      } catch {
        return json({ ready: false, target: TARGET_ISO, error: "decrypt failed" }, 500);
      }
    }

    return env.ASSETS.fetch(request);
  },
};
