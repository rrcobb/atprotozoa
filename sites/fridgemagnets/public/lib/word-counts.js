// Live "seen N times" tally for the fridge words, sourced from the public
// Bluesky firehose. Runs entirely in the browser — connects straight to
// Jetstream, no Cloudflare-side state. Counts persist per-client in
// localStorage; there is no global/shared count (see notes/11-durable-objects.md
// for why this site doesn't reach for a Durable Object to share one).
(function (global) {
  "use strict";

  var JETSTREAM_URL =
    "wss://jetstream2.us-east.bsky.network/subscribe?wantedCollections=app.bsky.feed.post";
  var CACHE_KEY = "fridgemagnets:seen-counts:v1";
  var TOKEN_RE = /[a-z0-9']+(?:[-/][a-z0-9']+)*/g;

  function WordCounter(words) {
    this.words = words.slice();
    this.wordSet = new Set(this.words);
    this.counts = Object.create(null);
    for (var i = 0; i < this.words.length; i++) this.counts[this.words[i]] = 0;
    this.postsSeen = 0;
    this.matchesSeen = 0;
    this.connected = false;
    this.status = "connecting";

    this.onUpdate = function () {};
    this.socket = null;
    this.reconnectTimer = null;
    this.reconnectDelay = 1000;
    this.persistTimer = null;
    this.emitTimer = null;
    this.paused = false;
    this.started = false;

    this._onVisibility = this._onVisibility.bind(this);
    this._restore();
  }

  WordCounter.prototype._restore = function () {
    try {
      var raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return;
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed.counts !== "object") return;
      for (var word in parsed.counts) {
        if (this.wordSet.has(word) && Number.isFinite(parsed.counts[word])) {
          this.counts[word] = Math.max(0, Math.round(parsed.counts[word]));
        }
      }
      this.postsSeen = Number(parsed.postsSeen) || 0;
      this.matchesSeen = Number(parsed.matchesSeen) || 0;
    } catch (_) {
      // Missing/corrupt/blocked localStorage just starts the tally at zero.
    }
  };

  WordCounter.prototype._schedulePersist = function () {
    var self = this;
    if (self.persistTimer) return;
    self.persistTimer = setTimeout(function () {
      self.persistTimer = null;
      try {
        localStorage.setItem(
          CACHE_KEY,
          JSON.stringify({
            savedAt: Date.now(),
            counts: self.counts,
            postsSeen: self.postsSeen,
            matchesSeen: self.matchesSeen,
          })
        );
      } catch (_) {
        // Counts stay live in memory even if the write is rejected (quota, private mode).
      }
    }, 1500);
  };

  WordCounter.prototype._scheduleEmit = function () {
    var self = this;
    if (self.emitTimer) return;
    self.emitTimer = setTimeout(function () {
      self.emitTimer = null;
      try {
        self.onUpdate(self);
      } catch (err) {
        console.error("fridgemagnets word counter render failed", err);
      }
    }, 400);
  };

  WordCounter.prototype.start = function () {
    if (this.started) return;
    this.started = true;
    document.addEventListener("visibilitychange", this._onVisibility);
    this.paused = document.visibilityState === "hidden";
    if (!this.paused) this._connect();
  };

  WordCounter.prototype._onVisibility = function () {
    if (document.visibilityState === "hidden") this._pause();
    else this._resume();
  };

  WordCounter.prototype._pause = function () {
    this.paused = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    if (this.socket) {
      try {
        this.socket.close();
      } catch (_) {
        // Already closing.
      }
    }
    this.socket = null;
    this.connected = false;
    this.status = "paused";
    this._scheduleEmit();
  };

  WordCounter.prototype._resume = function () {
    this.paused = false;
    if (!this.started) return;
    this._connect();
  };

  WordCounter.prototype._connect = function () {
    if (!this.started || this.paused || this.socket) return;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.status = "connecting";
    var socket;
    try {
      socket = new WebSocket(JETSTREAM_URL);
    } catch (_) {
      this._scheduleReconnect();
      return;
    }
    var self = this;
    this.socket = socket;
    socket.addEventListener("open", function () {
      if (self.socket !== socket) return;
      self.reconnectDelay = 1000;
      self.connected = true;
      self.status = "live";
      self._scheduleEmit();
    });
    socket.addEventListener("message", function (event) {
      self._handleMessage(String(event.data));
    });
    socket.addEventListener("error", function () {
      try {
        socket.close();
      } catch (_) {
        // The close event drives reconnecting.
      }
    });
    socket.addEventListener("close", function () {
      if (self.socket === socket) self.socket = null;
      self.connected = false;
      if (!self.paused) {
        self.status = "reconnecting";
        self._scheduleReconnect();
      }
      self._scheduleEmit();
    });
  };

  WordCounter.prototype._scheduleReconnect = function () {
    var self = this;
    if (!this.started || this.paused || this.reconnectTimer) return;
    var delay = this.reconnectDelay;
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30000);
    this.reconnectTimer = setTimeout(function () {
      self.reconnectTimer = null;
      self._connect();
    }, delay);
  };

  WordCounter.prototype._handleMessage = function (raw) {
    var event;
    try {
      event = JSON.parse(raw);
    } catch (_) {
      return;
    }
    if (event.kind !== "commit") return;
    var commit = event.commit;
    if (!commit || commit.collection !== "app.bsky.feed.post" || commit.operation !== "create") return;
    var text = commit.record && commit.record.text;
    if (typeof text !== "string" || !text) return;

    this.postsSeen++;
    var tokens = text.toLowerCase().match(TOKEN_RE);
    var changed = false;
    if (tokens) {
      for (var i = 0; i < tokens.length; i++) {
        var tok = tokens[i];
        if (this.wordSet.has(tok)) {
          this.counts[tok] = (this.counts[tok] || 0) + 1;
          this.matchesSeen++;
          changed = true;
        }
      }
    }
    if (changed) this._schedulePersist();
    this._scheduleEmit();
  };

  global.FridgeWordCounter = WordCounter;
})(window);
