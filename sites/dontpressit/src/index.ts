// dontpressit Worker — dontpressit.bisks.net
//
// @fromthewestmeadow.com asked for one button labeled "do not press this
// button". v2 turned it into rounds that never stop: each round is named after
// one of their followers, and pressing it graduates that name forever.
//
// The button itself is browser-local — every browser plays its own sequence,
// and that is deliberate (see public/index.html). What lives here is a much
// smaller thing: a *shared* round counter, so the site can say what round the
// crowd is collectively on, and so sites/presspool has a public round to run
// its market against. presspool polls /api/state and needs
// { roundNumber, currentName, roundStartedAt, futileClicks, visits,
//   totalGraduated, graduated } — that contract is why the field names below
// look the way they do.
//
// This is KV, not a Durable Object. Per notes/11-durable-objects.md the shared
// round is explicitly best-effort: two presses in the same instant can
// last-write-wins into a single advance, and a graduated name can be lost that
// way. Nothing here is money or a unique claim — a missed press just means the
// crowd counter ticks once instead of twice, which is a fine trade for not
// running a coordinator. Each browser's own history is unaffected because it
// never depended on this.

interface KVNamespace {
  get<T = unknown>(key: string, type: "json"): Promise<T | null>;
  put(key: string, value: string): Promise<void>;
}

export interface Env {
  ASSETS: { fetch: (request: Request) => Promise<Response> };
  ROUND_STATE: KVNamespace;
}

interface RoundName {
  handle: string;
  displayName: string;
  avatar: string;
}

interface GraduatedEntry extends RoundName {
  roundNumber: number;
  endedAt: number;
  visits: number;
  futileClicks: number;
}

interface SharedState {
  roundNumber: number;
  currentName: RoundName;
  roundStartedAt: number;
  futileClicks: number;
  visits: number;
  totalGraduated: number;
  graduated: GraduatedEntry[];
}

const STATE_KEY = "shared-round";
// presspool falls back to "now" if it can't find the round it was tracking in
// this log, so the window only needs to cover a quiet market catching up.
const GRADUATED_MAX = 12;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json",
      // presspool fetches this server-side, but the page itself reads it from
      // the browser, and it is public data either way.
      "access-control-allow-origin": "*",
    },
  });
}

function freshState(now: number): SharedState {
  return {
    roundNumber: 1,
    currentName: { handle: "round-1", displayName: "round 1", avatar: "" },
    roundStartedAt: now,
    futileClicks: 0,
    visits: 0,
    totalGraduated: 0,
    graduated: [],
  };
}

async function readState(env: Env, now: number): Promise<SharedState> {
  const stored = await env.ROUND_STATE.get<SharedState>(STATE_KEY, "json");
  return stored ?? freshState(now);
}

async function writeState(env: Env, state: SharedState): Promise<void> {
  await env.ROUND_STATE.put(STATE_KEY, JSON.stringify(state));
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const now = Date.now();

    if (url.pathname === "/api/state" && request.method === "GET") {
      return json(await readState(env, now));
    }

    // The presser's browser reports the press after the fact; this advances
    // the shared counter. Body is optional — a bare POST still advances,
    // which keeps the page working if the name lookup failed client-side.
    if (url.pathname === "/api/press" && request.method === "POST") {
      const body = await request.json<Partial<GraduatedEntry>>().catch(() => ({}));
      const state = await readState(env, now);

      const graduated: GraduatedEntry = {
        handle: String(body.handle || state.currentName.handle).slice(0, 200),
        displayName: String(body.displayName || state.currentName.displayName).slice(0, 200),
        avatar: String(body.avatar || state.currentName.avatar || "").slice(0, 500),
        roundNumber: state.roundNumber,
        endedAt: now,
        visits: state.visits,
        futileClicks: state.futileClicks,
      };

      // Newest first — presspool looks up by roundNumber, and the page's hall
      // of fame renders in this order.
      state.graduated = [graduated, ...state.graduated].slice(0, GRADUATED_MAX);
      state.totalGraduated += 1;
      state.roundNumber += 1;
      state.roundStartedAt = now;
      state.visits = 0;
      state.futileClicks = 0;
      // The next round's name is supplied by whoever presses next; until then
      // it is just the round number, same shape the page uses locally.
      state.currentName = {
        handle: `round-${state.roundNumber}`,
        displayName: `round ${state.roundNumber}`,
        avatar: "",
      };

      await writeState(env, state);
      return json({ ...state, justGraduated: graduated });
    }

    // A visit or a click that landed too late to matter. Both are approximate
    // by design; a dropped increment is not worth a coordinator.
    if (url.pathname === "/api/tick" && request.method === "POST") {
      const body = await request.json<{ kind?: string }>().catch(() => ({}));
      const state = await readState(env, now);
      if (body.kind === "futile") state.futileClicks += 1;
      else state.visits += 1;
      await writeState(env, state);
      return json({ roundNumber: state.roundNumber, visits: state.visits });
    }

    return env.ASSETS.fetch(request);
  },
};
