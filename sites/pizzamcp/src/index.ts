// Stateless MCP server over streamable HTTP (POST /mcp, JSON-RPC 2.0).
// Everything else is served from the static assets.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

const SIZES: Record<string, { label: string; base: number }> = {
  small: { label: 'Small 10"', base: 7.99 },
  medium: { label: 'Medium 12"', base: 10.99 },
  large: { label: 'Large 14"', base: 13.99 },
  xl: { label: 'XL 16"', base: 16.99 },
};
const CRUSTS: Record<string, number> = { hand_tossed: 0, thin: 0, pan: 1.5, stuffed: 2.5, gluten_free: 3 };
const TOPPINGS: Record<string, number> = {
  pepperoni: 1.5, sausage: 1.5, ham: 1.5, bacon: 1.75, chicken: 1.75, mushroom: 1,
  onion: 1, green_pepper: 1, black_olive: 1, jalapeno: 1, pineapple: 1.25,
  extra_cheese: 1.25, spinach: 1, tomato: 1, anchovy: 1.5, banana_pepper: 1,
};
const SIDES: Record<string, number> = {
  garlic_bread: 5.99, cheesy_bread: 6.99, wings_8: 8.99, cinnamon_twists: 5.49,
  lava_cake: 4.99, soda_2l: 3.49,
};
const MAX_TOPPINGS = 10; // a pie physically can't hold more than this

const PIZZA_SCHEMA = {
  type: 'object',
  properties: {
    size: { type: 'string', enum: Object.keys(SIZES), default: 'large' },
    crust: { type: 'string', enum: Object.keys(CRUSTS), default: 'hand_tossed' },
    toppings: { type: 'array', items: { type: 'string', enum: Object.keys(TOPPINGS) }, default: [] },
    quantity: { type: 'integer', minimum: 1, default: 1 },
  },
};
const ORDER_PROPS = {
  pizzas: { type: 'array', items: PIZZA_SCHEMA, description: 'Pizzas in the order' },
  sides: { type: 'array', items: { type: 'string', enum: Object.keys(SIDES) } },
  method: { type: 'string', enum: ['carryout', 'delivery'], default: 'carryout' },
};

const TOOLS = [
  { name: 'get_menu', description: 'List sizes, crusts, toppings and sides with prices.', inputSchema: { type: 'object', properties: {} } },
  {
    name: 'build_pizza',
    description: 'Validate one pizza configuration and return its price and a one-line description.',
    inputSchema: PIZZA_SCHEMA,
  },
  {
    name: 'price_order',
    description: 'Price a whole order (pizzas + sides) including tax and delivery fee.',
    inputSchema: { type: 'object', properties: ORDER_PROPS, required: ['pizzas'] },
  },
  {
    name: 'place_order',
    description: 'Place a PRETEND order. Nothing is actually ordered or charged. Returns an order id and ETA.',
    inputSchema: { type: 'object', properties: { ...ORDER_PROPS, name: { type: 'string' } }, required: ['pizzas', 'name'] },
  },
  {
    name: 'track_order',
    description: 'Track a pretend order by the id place_order returned.',
    inputSchema: { type: 'object', properties: { order_id: { type: 'string' } }, required: ['order_id'] },
  },
];

const money = (n: number) => Math.round(n * 100) / 100;

function pizza(a: any) {
  const size = a?.size ?? 'large';
  const crust = a?.crust ?? 'hand_tossed';
  const toppings: string[] = a?.toppings ?? [];
  const qty = Number.isInteger(a?.quantity) && a.quantity > 0 ? a.quantity : 1;
  if (!SIZES[size]) throw new Error(`unknown size "${size}"`);
  if (!(crust in CRUSTS)) throw new Error(`unknown crust "${crust}"`);
  if (!Array.isArray(toppings) || toppings.length > MAX_TOPPINGS) throw new Error(`at most ${MAX_TOPPINGS} toppings`);
  for (const t of toppings) if (!(t in TOPPINGS)) throw new Error(`unknown topping "${t}"`);
  const each = SIZES[size].base + CRUSTS[crust] + toppings.reduce((s, t) => s + TOPPINGS[t], 0);
  const desc = `${qty}× ${SIZES[size].label} ${crust.replace('_', ' ')}, ${toppings.length ? toppings.join(', ').replace(/_/g, ' ') : 'plain cheese'}`;
  return { desc, each: money(each), total: money(each * qty) };
}

function price(a: any) {
  if (!Array.isArray(a?.pizzas) || !a.pizzas.length) throw new Error('order needs at least one pizza');
  const ps = a.pizzas.map(pizza);
  const sides: string[] = a.sides ?? [];
  for (const s of sides) if (!(s in SIDES)) throw new Error(`unknown side "${s}"`);
  const delivery = a.method === 'delivery';
  const subtotal = ps.reduce((s: number, p: any) => s + p.total, 0) + sides.reduce((s, x) => s + SIDES[x], 0);
  const fee = delivery ? 3.99 : 0;
  const tax = money(subtotal * 0.08);
  return {
    items: [...ps.map((p: any) => `${p.desc} — $${p.total.toFixed(2)}`), ...sides.map((s) => `${s.replace(/_/g, ' ')} — $${SIDES[s].toFixed(2)}`)],
    subtotal: money(subtotal), delivery_fee: fee, tax, total: money(subtotal + fee + tax),
    method: delivery ? 'delivery' : 'carryout',
  };
}

// Order ids carry their own placement time (base36 ms) so tracking needs no storage.
const STAGES = ['order received', 'in the oven', 'quality check', 'out for delivery / ready for pickup', 'enjoy'];
const STAGE_SECONDS = [0, 120, 600, 780, 1200];

async function tool(name: string, a: any) {
  switch (name) {
    case 'get_menu':
      return { sizes: SIZES, crusts: CRUSTS, toppings: TOPPINGS, sides: SIDES, note: 'Pretend menu. Nothing here can be really ordered.' };
    case 'build_pizza':
      return pizza(a);
    case 'price_order':
      return price(a);
    case 'place_order': {
      const p = price(a);
      const name = String(a?.name ?? '').trim().slice(0, 60);
      if (!name) throw new Error('name is required');
      const id = `PZ-${Date.now().toString(36).toUpperCase()}`;
      return { order_id: id, name, ...p, eta_minutes: p.method === 'delivery' ? 30 : 15, pretend: true, note: 'No pizza was ordered and no payment was taken.' };
    }
    case 'track_order': {
      const m = /^PZ-([0-9A-Z]+)$/i.exec(String(a?.order_id ?? ''));
      const t = m ? parseInt(m[1], 36) : NaN;
      if (!Number.isFinite(t)) throw new Error('unrecognized order id');
      const age = (Date.now() - t) / 1000;
      let i = 0;
      STAGE_SECONDS.forEach((s, k) => { if (age >= s) i = k; });
      return { order_id: a.order_id, stage: STAGES[i], step: `${i + 1}/${STAGES.length}`, minutes_since_order: Math.floor(age / 60), pretend: true };
    }
  }
  throw new Error(`unknown tool "${name}"`);
}

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'content-type, mcp-session-id, mcp-protocol-version, accept',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...CORS } });

async function rpc(msg: any) {
  const { id, method, params } = msg ?? {};
  if (id === undefined) return null; // notification
  const ok = (result: unknown) => ({ jsonrpc: '2.0', id, result });
  const err = (code: number, message: string) => ({ jsonrpc: '2.0', id, error: { code, message } });
  switch (method) {
    case 'initialize':
      return ok({
        protocolVersion: params?.protocolVersion ?? '2025-03-26',
        capabilities: { tools: {} },
        serverInfo: { name: 'pizzamcp', version: '1.0.0' },
        instructions: 'A pretend pizza shop. Use get_menu, build_pizza, price_order, place_order, track_order. Nothing is really ordered.',
      });
    case 'ping':
      return ok({});
    case 'tools/list':
      return ok({ tools: TOOLS });
    case 'tools/call':
      try {
        const out = await tool(params?.name, params?.arguments ?? {});
        return ok({ content: [{ type: 'text', text: JSON.stringify(out, null, 2) }] });
      } catch (e: any) {
        return ok({ isError: true, content: [{ type: 'text', text: String(e?.message ?? e) }] });
      }
  }
  return err(-32601, `method not found: ${method}`);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/mcp') {
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
      if (request.method !== 'POST') return json({ error: 'POST JSON-RPC here (streamable HTTP MCP)' }, 405);
      let body: any;
      try { body = await request.json(); } catch { return json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'parse error' } }, 400); }
      if (Array.isArray(body)) {
        const outs = (await Promise.all(body.map(rpc))).filter(Boolean);
        return outs.length ? json(outs) : new Response(null, { status: 202, headers: CORS });
      }
      const out = await rpc(body);
      return out ? json(out) : new Response(null, { status: 202, headers: CORS });
    }
    return env.ASSETS.fetch(request);
  },
};
