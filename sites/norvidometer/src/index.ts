// Served at the root of norvidometer.bisks.net. The quiz itself still runs
// client-side off public/lib/posts.js — this Worker's only server-side
// surface is /api/vote, a best-effort shared tally of which answer visitors
// picked per question, so the quiz can show "% of users who said X" next to
// norvid's real answer. Everything else falls through to the static assets.

interface KVNamespace {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
}

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
  STATS: KVNamespace;
}

const ANSWERS = ["claim", "heuristic", "neither"] as const;
type Answer = (typeof ANSWERS)[number];
type Counts = Record<Answer, number>;

function isAnswer(v: unknown): v is Answer {
  return typeof v === "string" && (ANSWERS as readonly string[]).includes(v);
}

async function handleVote(request: Request, env: Env): Promise<Response> {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "bad json" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const qid = typeof body?.qid === "string" ? body.qid.slice(0, 200) : "";
  const answer = body?.answer;
  if (!qid || !isAnswer(answer)) {
    return new Response(JSON.stringify({ error: "bad request" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const key = "q:" + qid;
  const counts: Counts = { claim: 0, heuristic: 0, neither: 0 };
  const existing = await env.STATS.get(key);
  if (existing) {
    try {
      const parsed = JSON.parse(existing);
      for (const a of ANSWERS) {
        if (typeof parsed[a] === "number") counts[a] = parsed[a];
      }
    } catch {
      // corrupt entry — start this question's tally fresh rather than fail the vote
    }
  }
  counts[answer]++;
  await env.STATS.put(key, JSON.stringify(counts));

  const total = counts.claim + counts.heuristic + counts.neither;
  return new Response(JSON.stringify({ counts, total }), {
    headers: { "content-type": "application/json" },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/api/vote" && request.method === "POST") {
      return handleVote(request, env);
    }
    return env.ASSETS.fetch(request);
  },
};
