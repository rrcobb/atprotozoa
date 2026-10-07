// Runs the interpreter off the main thread so a slow `decide` never freezes
// the page; the page terminates this worker if it overruns its wall-clock.
import { runLean } from "./lean.js";
self.onmessage = (e) => {
  try { self.postMessage({ id: e.data.id, msgs: runLean(e.data.src) }); }
  catch (err) { self.postMessage({ id: e.data.id, msgs: [{ kind: "error", line: 1, text: "internal error: " + err.message }] }); }
};
