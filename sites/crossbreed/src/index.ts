// Static asset worker. Breeding and saved snapshots are client-side.
export interface Env { ASSETS: { fetch: (req: Request) => Promise<Response> }; }
export default { async fetch(request: Request, env: Env): Promise<Response> { return env.ASSETS.fetch(request); } };
