// whopressedit Worker — whopressedit.bisks.net
//
// @cee.wtf's dontpressit.bisks.net had one button, shared by every visitor,
// that ended things forever the first time anyone pressed it — no reset.
// @isolyth.dev replied to that post asking the bot to build it "again": a
// new button, but this time it resets weekly, and pressing it logs — and
// displays, until the reset — the presser's US state, or their country if
// they're not in the US, read off Cloudflare's request geo (no IP is stored,
// just the state/country Cloudflare already resolves it to at the edge).
//
// One Durable Object holds the single shared week state, same shape as
// dontpressit's PressState: a check-then-set with no await between them, so
// "first press of the week wins" is atomic without a storage transaction.
//
// Brand-new-style site served at the root of its own hostname — no
// mount-prefix stripping. See notes/40-new-site-playbook.md.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
  PRESS: DurableObjectNamespace;
}

interface DurableObjectId {
  toString(): string;
}
interface DurableObjectStub {
  fetch(request: Request): Promise<Response>;
}
interface DurableObjectNamespace {
  idFromName(name: string): DurableObjectId;
  get(id: DurableObjectId): DurableObjectStub;
}
interface DurableObjectStorage {
  get<T = unknown>(key: string): Promise<T | undefined>;
  put(entries: Record<string, unknown>): Promise<void>;
}
interface DurableObjectState {
  storage: DurableObjectStorage;
  blockConcurrencyWhile<T>(fn: () => Promise<T>): Promise<T>;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/api/state" || url.pathname === "/api/press") {
      const id = env.PRESS.idFromName("global");
      const stub = env.PRESS.get(id);
      return stub.fetch(request);
    }
    return env.ASSETS.fetch(request);
  },
};

function json(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    headers: { "content-type": "application/json", "access-control-allow-origin": "*" },
  });
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
// Reset cadence is a fixed 7-day period since the Unix epoch rather than a
// calendar week — simpler than ISO week math, and "resets weekly" doesn't
// require landing on a Monday.
function weekIndexAt(ms: number): number {
  return Math.floor(ms / WEEK_MS);
}

interface CfGeo {
  country?: string;
  region?: string;
}

interface Location {
  display: string;
  country: string | null;
  region: string | null;
}

function describeLocation(cf: CfGeo | undefined): Location {
  const country = cf?.country || null;
  if (!country) return { display: "somewhere untraceable", country: null, region: null };
  if (country === "US") {
    const region = cf?.region || null;
    if (region) return { display: region, country, region };
    return { display: "the United States", country, region: null };
  }
  let countryName = country;
  try {
    const dn = new (Intl as unknown as {
      DisplayNames: new (locales: string[], opts: { type: string }) => { of(code: string): string | undefined };
    }).DisplayNames(["en"], { type: "region" });
    countryName = dn.of(country) || country;
  } catch {
    // Intl.DisplayNames unavailable or an unrecognized code — fall back to
    // the raw ISO code rather than failing the press.
  }
  return { display: countryName, country, region: null };
}

interface PressedBy extends Location {
  pressedAt: number;
}
interface HistoryEntry extends PressedBy {
  weekIndex: number;
  visits: number;
}

// One instance ever ("global"). blockConcurrencyWhile loads persisted state
// before any request is handled, and the check-then-set in fetch() below has
// no await between them — a Durable Object is single-threaded and only
// yields at an await, so that's enough to make "first press of the week
// wins" atomic without a storage transaction.
export class PressState {
  private state: DurableObjectState;

  private weekIndex = -1;
  private pressed = false;
  private pressedBy: PressedBy | null = null;
  private visits = 0;
  private lateClicks = 0;

  private totalPresses = 0;
  private history: HistoryEntry[] = []; // trimmed, for display

  private ready: Promise<void>;

  constructor(state: DurableObjectState) {
    this.state = state;
    this.ready = state.blockConcurrencyWhile(async () => {
      const [weekIndex, pressed, pressedBy, visits, lateClicks, totalPresses, history] = await Promise.all([
        state.storage.get<number>("weekIndex"),
        state.storage.get<boolean>("pressed"),
        state.storage.get<PressedBy>("pressedBy"),
        state.storage.get<number>("visits"),
        state.storage.get<number>("lateClicks"),
        state.storage.get<number>("totalPresses"),
        state.storage.get<HistoryEntry[]>("history"),
      ]);
      this.weekIndex = weekIndex ?? weekIndexAt(Date.now());
      this.pressed = pressed ?? false;
      this.pressedBy = pressedBy ?? null;
      this.visits = visits ?? 0;
      this.lateClicks = lateClicks ?? 0;
      this.totalPresses = totalPresses ?? 0;
      this.history = history ?? [];
    });
  }

  // Lazy reset: rolls the state forward to the current week on the next
  // request rather than needing an alarm. If last week ended pressed, it's
  // archived to history first.
  private async rollWeekIfNeeded(): Promise<void> {
    const now = weekIndexAt(Date.now());
    if (now === this.weekIndex) return;
    if (this.pressed && this.pressedBy) {
      this.history.push({ ...this.pressedBy, weekIndex: this.weekIndex, visits: this.visits });
      if (this.history.length > 200) this.history = this.history.slice(-200);
    }
    this.weekIndex = now;
    this.pressed = false;
    this.pressedBy = null;
    this.visits = 0;
    this.lateClicks = 0;
    await this.state.storage.put({
      weekIndex: this.weekIndex,
      pressed: this.pressed,
      pressedBy: this.pressedBy,
      visits: this.visits,
      lateClicks: this.lateClicks,
      history: this.history,
    });
  }

  private publicState(extra: Record<string, unknown> = {}) {
    return {
      weekIndex: this.weekIndex,
      resetsAt: (this.weekIndex + 1) * WEEK_MS,
      pressed: this.pressed,
      pressedBy: this.pressedBy,
      visits: this.visits,
      lateClicks: this.lateClicks,
      totalPresses: this.totalPresses,
      history: this.history.slice(-12).reverse(),
      ...extra,
    };
  }

  async fetch(request: Request): Promise<Response> {
    await this.ready;
    await this.rollWeekIfNeeded();
    const url = new URL(request.url);

    if (url.pathname === "/api/state") {
      this.visits++;
      await this.state.storage.put({ visits: this.visits });
      return json(this.publicState());
    }

    if (url.pathname === "/api/press" && request.method === "POST") {
      if (this.pressed) {
        this.lateClicks++;
        await this.state.storage.put({ lateClicks: this.lateClicks });
        return json(this.publicState({ alreadyPressed: true }));
      }

      const cf = (request as unknown as { cf?: CfGeo }).cf;
      const loc = describeLocation(cf);
      this.pressed = true;
      this.pressedBy = { ...loc, pressedAt: Date.now() };
      this.totalPresses++;
      await this.state.storage.put({
        pressed: this.pressed,
        pressedBy: this.pressedBy,
        totalPresses: this.totalPresses,
      });

      return json(this.publicState({ justPressed: this.pressedBy }));
    }

    return json({ error: "not found" });
  }
}
