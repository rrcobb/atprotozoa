// A real connectome, queried live — not simulated.
//
// The ask was to swap the stylized sim (brain.js) for "the real full
// 130,000-neuron reconstruction," and to look for a public API for a running
// instance. Here's what that search actually found:
//
//   - The 130k-neuron dataset is FlyWire's full adult fly brain (FAFB/BANC).
//     Its query surface — Codex, backed by CAVE — explicitly does not offer a
//     public bulk/live query API: Codex's own FAQ states interactive queries
//     require Google sign-in "to prevent abuse... and keep the service
//     available," and that Codex "intentionally does not provide a general
//     programmatic live-query API for bulk access," pointing scripted users
//     at static CSV dumps instead. There's no way to wire that up from a
//     static site with no backend and no secret to hold.
//   - Janelia's neuPrint, though, *is* a real public API in front of a real,
//     running database of an actual EM reconstruction: the hemibrain
//     (~25,000 traced neurons in the central brain — the same fly, a smaller
//     slice of it, but genuine connectome data, not a simulation of one).
//     Auth is a personal bearer token, free, self-serve, no application
//     process — get one at neuprint.janelia.org (account menu -> "Auth
//     Token") and it's yours. That token is *yours*, not a secret of ours to
//     hold, so it's fair game for a visitor to paste into their own browser:
//     this file sends it straight from your browser to neuprint.janelia.org
//     and nowhere else, over a plain fetch(), no server of ours in the loop.
//
// So: this panel doesn't drive the garden (see brain.js's own comment for why
// a literal 130k/25k-neuron real-time sim can't run in a browser tab at
// 60fps regardless of where the data comes from). It's a separate, honest
// window onto the real thing — look up an actual traced neuron type and see
// its actual strongest synaptic partners, straight from Janelia's live
// database, right of the toy garden that's inspired by the same wiring.

const RealConnectome = (() => {
  const BASE = "https://neuprint.janelia.org";
  const DATASET = "hemibrain:v1.2.1";
  const TOKEN_KEY = "fruitflyheaven.neuprintToken";

  function loadToken() {
    try {
      return localStorage.getItem(TOKEN_KEY) || "";
    } catch (_) {
      return "";
    }
  }

  function saveToken(token) {
    try {
      localStorage.setItem(TOKEN_KEY, token);
    } catch (_) {
      // ignore — worst case the visitor re-pastes it next visit
    }
  }

  // The visitor's search term is spliced into a Cypher string sent with
  // their own token to their own neuPrint session — the only account at risk
  // of a malformed query is theirs, same as pasting odd input into any query
  // tool. Still worth keeping well-formed: strip quotes/backslashes so a
  // stray character can't break out of the string literal by accident.
  function escapeForCypher(s) {
    return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  }

  async function cypher(token, query) {
    let res;
    try {
      res = await fetch(BASE + "/api/custom/custom", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token,
        },
        body: JSON.stringify({ cypher: query, dataset: DATASET }),
      });
    } catch (err) {
      throw new Error(
        "couldn't reach neuprint.janelia.org from here (network error or the browser blocked the cross-site request)"
      );
    }
    if (!res.ok) {
      let detail = "";
      try {
        detail = (await res.text()).slice(0, 200);
      } catch (_) {}
      if (res.status === 401 || res.status === 403) {
        throw new Error("neuPrint rejected that token (expired or mistyped?)");
      }
      throw new Error(`neuPrint returned ${res.status}${detail ? ": " + detail : ""}`);
    }
    return res.json();
  }

  function rowsToObjects(result) {
    const cols = (result && result.columns) || [];
    const data = (result && result.data) || [];
    return data.map((row) => {
      const obj = {};
      cols.forEach((c, i) => (obj[c] = row[i]));
      return obj;
    });
  }

  async function lookupNeuron(token, rawName) {
    const name = (rawName || "").trim();
    if (!name) throw new Error("enter a cell type or instance name first");
    if (!token) throw new Error("paste a neuPrint token first — get a free one at neuprint.janelia.org");
    const safe = escapeForCypher(name);

    const matchClause = `toLower(n.type) = toLower("${safe}") OR toLower(n.instance) = toLower("${safe}")`;

    const existsQ = `MATCH (n:Neuron) WHERE ${matchClause} RETURN n.bodyId AS bodyId, n.type AS type, n.instance AS instance, n.pre AS pre, n.post AS post LIMIT 6`;
    const downQ = `MATCH (n:Neuron)-[c:ConnectsTo]->(m:Neuron) WHERE ${matchClause} RETURN m.type AS type, m.instance AS instance, sum(c.weight) AS weight ORDER BY weight DESC LIMIT 12`;
    const upQ = `MATCH (m:Neuron)-[c:ConnectsTo]->(n:Neuron) WHERE ${matchClause} RETURN m.type AS type, m.instance AS instance, sum(c.weight) AS weight ORDER BY weight DESC LIMIT 12`;

    const [existsR, downR, upR] = await Promise.all([cypher(token, existsQ), cypher(token, downQ), cypher(token, upQ)]);

    const matches = rowsToObjects(existsR);
    if (matches.length === 0) {
      throw new Error(`no neuron found matching "${name}" in ${DATASET} — try a cell type like PAM01, MBON01, KCg-m, or LC4`);
    }

    return {
      dataset: DATASET,
      query: name,
      matches,
      downstream: rowsToObjects(downR).filter((r) => r.type || r.instance),
      upstream: rowsToObjects(upR).filter((r) => r.type || r.instance),
    };
  }

  return { DATASET, loadToken, saveToken, lookupNeuron };
})();

if (typeof module !== "undefined") module.exports = RealConnectome;
