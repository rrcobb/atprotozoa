// dreamloom Worker — static assets plus a narrow same-origin Hydracept proxy.
// The site owner's key lives in wrangler secrets; visitors may instead send
// their own Bearer token per request (BYOK) without the Worker storing it.
import {
  bearerFromRequest,
  bytesToBase64,
  clientIp,
  crossOriginRequest,
  hostedConfigured,
  quoteCapability,
  quoteDisplay,
  runCapabilityJob,
  fetchSessionProject,
  rateLimitIp,
  validateCapabilityInput,
} from "./hydracept";

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
  HYDRACEPT_API_KEY?: string;
  HYDRACEPT_PROJECT?: string;
  HYDRACEPT_ENVIRONMENT?: string;
}

const JSON_HEADERS = {
  "content-type": "application/json",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

const JOB_DEADLINE_MS: Record<string, number> = {
  "image.generate.v1": 180_000,
  "audio.voice.generate.v1": 300_000,
};

function unauthorized(): Response {
  return json({ error: "no Hydracept credentials" }, 401);
}

async function resolveContext(request: Request, env: Env, token: string) {
  const usingHosted = Boolean(env.HYDRACEPT_API_KEY?.trim()) && token === env.HYDRACEPT_API_KEY?.trim();

  if (usingHosted) {
    const projectId = env.HYDRACEPT_PROJECT?.trim();
    const environment = env.HYDRACEPT_ENVIRONMENT?.trim();
    if (projectId && environment) {
      return { ok: true as const, context: { projectId, environment } };
    }
    // Fall back to the key's own workspace so a missing env var cannot silently
    // submit the job against "development".
    const session = await fetchSessionProject(token);
    if (!session.ok) return { ok: false as const, message: session.message };
    return {
      ok: true as const,
      context: {
        projectId: projectId || session.projectId,
        environment: environment || session.environment,
      },
    };
  }

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

    // Same-origin only. Without this, any page could run a hosted job on the
    // site owner's Hydracept key.
    if (crossOriginRequest(request.headers.get("origin"), request.url)) {
      return json({ error: "cross-origin requests are not allowed" }, 403);
    }

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204 });
    }

    const ip = clientIp(request);

    if (url.pathname === "/api/hydracept/status" && request.method === "GET") {
      return json({ hosted: hostedConfigured(env) });
    }

    const token = bearerFromRequest(request, env);
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
      const ctx = await resolveContext(request, env, token);
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
      const hostedToken = Boolean(env.HYDRACEPT_API_KEY?.trim()) && token === env.HYDRACEPT_API_KEY?.trim();
      const rate = await rateLimitIp(ip, "run", hostedToken ? 12 : 30, 3600);
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

      const ctx = await resolveContext(request, env, token);
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
