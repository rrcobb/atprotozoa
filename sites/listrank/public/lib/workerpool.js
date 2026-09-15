// workerpool.js — a small pool of identical module Workers, so a fan-out
// over many independent items (one repo CAR download + DAG-CBOR/MST decode
// per item) runs on several real threads instead of piling onto whichever
// thread called rank.js.
//
// @vikanezrimaya.xyz asked, after listrank's progress bar froze their tab on
// a big scan: are you doing the list crunching on a web worker? because the
// progress bar "freezes" otherwise, and workers might also speed things up
// via parallelism. They were right on both counts — rank.js's per-list full
// membership read downloads and synchronously decodes a repo CAR, and that
// decode (see car.js's cborValue/walk) has no yield points, so several of
// them finishing in the same microtask flush could stall the main thread
// for a visible stretch with no in-between paint. Moving that work into
// worker threads removes it from the calling thread's queue entirely,
// regardless of how much CBOR decoding is happening — and using more than
// one worker gets genuine multi-core parallelism for it, not just
// off-main-thread relief.
//
// `run(task, payload)` posts `{type:"task", id, task, payload}` to whichever
// pool worker is idle (queuing the rest) and resolves with that worker's
// `{id, result}` reply, or rejects on `{id, error}` / a worker-level error.
// Every pool worker runs the exact same script — dispatch by a `task` string
// in the payload, not by worker identity.
export function createWorkerPool(workerUrl, size) {
  const n = Math.max(1, size | 0);
  const workers = [];
  const idle = [];
  const queue = [];
  const pending = new Map();
  const assigned = new Map(); // worker -> job id currently running on it, so onerror knows what to reject
  let nextId = 0;

  function pump() {
    while (idle.length && queue.length) {
      const w = idle.pop();
      const job = queue.shift();
      assigned.set(w, job.id);
      w.postMessage({ type: "task", id: job.id, task: job.task, payload: job.payload });
    }
  }

  function settle(w, id, error, result) {
    const job = pending.get(id);
    assigned.delete(w);
    idle.push(w);
    pump();
    if (!job) return; // already settled — ignore a late/duplicate reply
    pending.delete(id);
    if (error) job.reject(new Error(error));
    else job.resolve(result);
  }

  for (let i = 0; i < n; i++) {
    const w = new Worker(workerUrl, { type: "module" });
    w.onmessage = (ev) => {
      const { id, result, error } = ev.data || {};
      settle(w, id, error, result);
    };
    w.onerror = () => {
      // A worker-level failure (e.g. the module failed to import, or an
      // uncaught exception outside the task's own try/catch). Whatever job
      // was in flight on this worker would otherwise hang forever waiting
      // for a message that's never coming — reject it instead so rank.js's
      // try/catch around pool.run() falls back to reading that one item
      // inline, and put the worker back in rotation for the next job.
      const id = assigned.get(w);
      if (id !== undefined) settle(w, id, "worker error");
    };
    workers.push(w);
    idle.push(w);
  }

  function run(task, payload) {
    return new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      queue.push({ id, task, payload });
      pump();
    });
  }

  function terminate() {
    workers.forEach((w) => w.terminate());
  }

  return { run, terminate, size: n };
}
