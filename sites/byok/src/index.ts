// byok Worker — static assets plus a narrow same-origin Hydracept voice proxy.
// Each visitor sends their own Bearer token per request; the Worker stores no
// Hydracept key and never fronts a site owner's account.
import {
  bearerFromRequest,
  bytesToBase64,
  clientIp,
  crossOriginRequest,
  quoteCapability,
  quoteDisplay,
  runCapabilityJob,
  fetchSessionProject,
  rateLimitIp,
  validateCapabilityInput,
} from "./hydracept";

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

const JSON_HEADERS = {
  "content-type": "application/json",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

const JOB_DEADLINE_MS: Record<string, number> = {
  "audio.voice.generate.v1": 300_000,
};

function unauthorized(): Response {
  return json({ error: "no Hydracept credentials" }, 401);
}

async function resolveContext(token: string) {
  const session = await fetchSessionProject(token);
  if (!session.ok) return { ok: false as const, message: session.message };
  return { ok: true as const, context: { projectId: session.projectId, environment: session.environment } };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/hydracept")) {
      return env.ASSETS.fetch(request);
    }

    // Same-origin only: the page that owns this proxy is the only caller.
    if (crossOriginRequest(request.headers.get("origin"), request.url)) {
      return json({ error: "cross-origin requests are not allowed" }, 403);
    }

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204 });
    }

    const ip = clientIp(request);

    const token = bearerFromRequest(request);
    if (!token) return unauthorized();

    if (url.pathname === "/api/hydracept/session" && request.method === "GET") {
      const rate = await rateLimitIp(ip, "session", 120, 3600);
      if (!rate.allowed) return json({ error: "rate limit — try again later" }, 429);
      const session = await fetchSessionProject(token);
      if (!session.ok) return json({ error: session.message }, 502);
      return json({ projectId: session.projectId, environment: session.environment });
    }

    if (url.pathname === "/api/hydracept/quote" && request.method === "POST") {
      const rate = await rateLimitIp(ip, "quote", 60, 3600);
      if (!rate.allowed) return json({ error: "rate limit — try again later" }, 429);

      let body: { capability?: string; input?: unknown };
      try {
        body = (await request.json()) as typeof body;
      } catch {
        return json({ error: "bad json" }, 400);
      }
      const capability = String(body.capability || "");
      const validated = validateCapabilityInput(capability, body.input);
      if (!validated.ok) return json({ error: validated.error }, 400);

      // Quote against the same workspace the job will use. Hydracept fingerprints
      // input, not context, but keeping them equal avoids future drift.
      const ctx = await resolveContext(token);
      if (!ctx.ok) return json({ error: ctx.message }, 502);

      const quoted = await quoteCapability(token, capability, validated.input, ctx.context);
      if (!quoted.ok) return json({ error: quoted.message }, quoted.status >= 500 ? 502 : quoted.status);
      return json({
        quoteId: quoted.body.quoteId,
        display: quoteDisplay(quoted.body),
        expiresAt: quoted.body.expiresAt,
        capability,
      });
    }

    if (url.pathname === "/api/hydracept/run" && request.method === "POST") {
      const rate = await rateLimitIp(ip, "run", 30, 3600);
      if (!rate.allowed) return json({ error: "rate limit — try again later" }, 429);

      let body: { capability?: string; input?: unknown; quoteId?: string };
      try {
        body = (await request.json()) as typeof body;
      } catch {
        return json({ error: "bad json" }, 400);
      }
      const capability = String(body.capability || "");
      const quoteId = String(body.quoteId || "").trim();
      if (!quoteId) return json({ error: "quoteId required" }, 400);

      const validated = validateCapabilityInput(capability, body.input);
      if (!validated.ok) return json({ error: validated.error }, 400);

      const ctx = await resolveContext(token);
      if (!ctx.ok) return json({ error: ctx.message }, 502);

      const ran = await runCapabilityJob(
        token,
        capability,
        validated.input,
        quoteId,
        ctx.context,
        { deadlineMs: JOB_DEADLINE_MS[capability] ?? 120_000 },
      );
      if (!ran.ok) return json({ error: ran.message }, ran.status >= 500 ? 502 : ran.status);

      const b64 = bytesToBase64(ran.bytes);
      return json({
        jobId: ran.jobId,
        mediaType: ran.mediaType,
        dataBase64: b64,
      });
    }

    return json({ error: "not found" }, 404);
  },
};
