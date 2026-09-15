// rank-pool-worker.js — the script every worker in rank.js's pool runs (see
// workerpool.js's header for why this pool exists at all). Each instance is
// stateless between messages: it just answers `{type:"task", id, task,
// payload}` with `{id, result}` or `{id, error}`, doing whatever repo CAR
// download + DAG-CBOR/MST decode the task needs entirely off the thread that
// called rank.js.

import { fetchListMemberships } from "./constellation.js";
import { fetchOwnRecords, fetchListMembers, fullListStats } from "./list-io.js";

self.onmessage = async (ev) => {
  const { id, task, payload } = ev.data || {};
  try {
    const result = await runTask(task, payload);
    self.postMessage({ id, result });
  } catch (e) {
    self.postMessage({ id, error: (e && e.message) || String(e) });
  }
};

async function runTask(task, payload) {
  if (task === "ownRecords") {
    return await fetchOwnRecords(payload.did);
  }
  if (task === "discover") {
    const lists = await fetchListMemberships(payload.did);
    return Array.from(new Set(lists));
  }
  if (task === "fullMembership") {
    let memberDids = [];
    try {
      memberDids = await fetchListMembers(payload.uri);
    } catch {
      memberDids = [];
    }
    return await fullListStats(memberDids, payload.blockedDids, payload.followDids);
  }
  throw new Error("unknown task: " + task);
}
