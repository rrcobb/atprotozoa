// Static asset worker. Every syllable is generated client-side from the
// clicked chart position — no state, no API calls, nothing to run server-side.
export interface Env { ASSETS: { fetch: (req: Request) => Promise<Response> }; }
export default { async fetch(request: Request, env: Env): Promise<Response> { return env.ASSETS.fetch(request); } };
