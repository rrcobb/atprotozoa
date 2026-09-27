// Static asset worker. The ontology is a fixed JSON file, rendered and
// navigated entirely client-side — no state, no API calls, nothing to run
// server-side.
export interface Env { ASSETS: { fetch: (req: Request) => Promise<Response> }; }
export default { async fetch(request: Request, env: Env): Promise<Response> { return env.ASSETS.fetch(request); } };
