// footfall beacon — embedded on other sites, not this one's own page views
// (footfall tracks the rest of the constellation, not itself, to avoid the
// tracker inflating its own leaderboard). Reports one "hit" on load and one
// "dwell" (ms on page) when the tab hides or unloads, whichever comes first.
//
// Fire-and-forget: wrapped in try/catch throughout so a beacon failure never
// breaks the host page. Uses sendBeacon with a text/plain Blob (not fetch
// with a json content-type) specifically to stay a CORS "simple request" —
// no preflight round trip needed just to increment a counter.
(function () {
  try {
    var el = document.currentScript;
    var site = (el && el.dataset && el.dataset.site) || (location.hostname.split(".")[0] || "");
    if (!site) return;

    var ORIGIN = "https://footfall.bisks.net";
    var t0 = Date.now();
    var dwellSent = false;

    function send(path, payload) {
      try {
        var body = JSON.stringify(payload);
        if (navigator.sendBeacon) {
          navigator.sendBeacon(ORIGIN + path, new Blob([body], { type: "text/plain" }));
        } else {
          fetch(ORIGIN + path, { method: "POST", body: body, keepalive: true, mode: "cors" }).catch(function () {});
        }
      } catch (e) {
        /* never let a beacon failure touch the host page */
      }
    }

    send("/api/hit", { site: site });

    function sendDwell() {
      if (dwellSent) return;
      var ms = Date.now() - t0;
      if (ms < 1000) return;
      dwellSent = true;
      send("/api/dwell", { site: site, ms: ms });
    }

    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "hidden") sendDwell();
    });
    window.addEventListener("pagehide", sendDwell);
  } catch (e) {
    /* never let a beacon failure touch the host page */
  }
})();
