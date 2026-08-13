// dosimeter is intentionally a static, browser-owned firehose experiment.
// The browser opens Jetstream, derives its own rolling situation reading, and
// stops the socket when the tab is hidden. There is no server state to keep
// alive and no API route to proxy.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
