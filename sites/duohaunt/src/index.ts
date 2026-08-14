// Static asset worker. State belongs to the browser or the user's PDS.
export interface Env { ASSETS: { fetch: (req: Request) => Promise<Response> }; }
export default { async fetch(request: Request, env: Env): Promise<Response> { return env.ASSETS.fetch(request); } };
