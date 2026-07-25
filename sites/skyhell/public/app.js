import { getProfile } from "./lib/atproto.js";

// --- boot / dial-up sequence ------------------------------------------------

const BOOT_LINES = [
  "SkyHell BIOS v1.0 ......... OK",
  "detecting modem ........... US Robotics Courier 33.6k (emulated)",
  "dialing bisks.net ......... ",
  "handshaking ...............",
  "negotiating protocol ...... PPP over Jetstream",
  "authenticating ............ guest@skyhell (no password needed, we're chill)",
  "loading warez.dll ......... done",
  "loading toolz.dll ......... done",
  "checking for viruses ...... none found (this app IS the joke, not a virus)",
  "you have 0 new mail.",
];

function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const dur = 1.6;
    const bufferSize = ctx.sampleRate * dur;
    const buf = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buf.getChannelData(0);
    // crude dial-tone-ish screech: a few sweeping tones + noise, just for the vibe
    for (let i = 0; i < bufferSize; i++) {
      const t = i / ctx.sampleRate;
      const sweep = Math.sin(2 * Math.PI * (800 + 2000 * (t / dur)) * t);
      const warble = Math.sin(2 * Math.PI * 1400 * t) * 0.4;
      const noise = (Math.random() * 2 - 1) * 0.15;
      data[i] = (sweep * 0.4 + warble + noise) * Math.min(1, (dur - t) * 2);
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const gain = ctx.createGain();
    gain.gain.value = 0.25;
    src.connect(gain).connect(ctx.destination);
    src.start();
  } catch {
    // audio is a bonus, not a requirement
  }
}

document.getElementById("connect-btn").addEventListener("click", () => {
  const btn = document.getElementById("connect-btn");
  const log = document.getElementById("boot-log");
  const bar = document.getElementById("boot-bar");
  btn.disabled = true;
  btn.textContent = "DIALING...";
  beep();
  log.textContent = "";
  let i = 0;
  const timer = setInterval(() => {
    if (i < BOOT_LINES.length) {
      log.textContent += BOOT_LINES[i] + "\n";
      log.scrollTop = log.scrollHeight;
      bar.style.width = Math.round(((i + 1) / BOOT_LINES.length) * 100) + "%";
      i++;
    } else {
      clearInterval(timer);
      setTimeout(() => {
        document.getElementById("boot").classList.add("hidden");
        document.getElementById("desktop").classList.remove("hidden");
      }, 500);
    }
  }, 260);
});

// --- desktop clock -----------------------------------------------------------

setInterval(() => {
  const el = document.getElementById("status-right");
  if (!el) return;
  el.textContent = "local time: " + new Date().toLocaleTimeString();
}, 1000);

// --- tool panel switching ----------------------------------------------------

const panel = document.getElementById("panel");
const RENDERERS = {
  punter: renderPunter,
  bomber: renderBomber,
  chat: renderChat,
  snoop: renderSnoop,
  keygen: renderKeygen,
  greetz: renderGreetz,
};

document.querySelectorAll(".tool-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tool-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    RENDERERS[btn.dataset.tool]();
  });
});

renderPunter();

// --- Skeet Punter (100% cosmetic — no target is ever contacted) ------------

const PUNT_COMPLIMENTS = [
  "actually your last skeet was pretty good",
  "the algorithm loves you and so do we",
  "your pfp slaps",
  "you have never once been cringe",
  "your ratio is 1:1 with the universe's love for you",
  "certified mutual-worthy",
];

function renderPunter() {
  panel.innerHTML = `
    <h2>💥 Skeet Punter</h2>
    <p>Classic AOHell let you "punt" someone off the service. This one doesn't
       do that to anyone — bluesky doesn't have a kick button and we're not
       building one. Type a handle, hit punt, watch the drama fizzle out into
       a compliment instead.</p>
    <div class="field">
      <input type="text" id="punt-target" placeholder="@handle.bsky.social (purely decorative)" />
      <button class="action" id="punt-go">PUNT</button>
    </div>
    <div class="console" id="punt-console">awaiting target...</div>
    <p class="disclaimer">No network requests are made. No one is punted. Ever.</p>
  `;
  document.getElementById("punt-go").addEventListener("click", () => {
    const target = document.getElementById("punt-target").value.trim() || "the void";
    const c = document.getElementById("punt-console");
    const compliment = PUNT_COMPLIMENTS[Math.floor(Math.random() * PUNT_COMPLIMENTS.length)];
    c.textContent = "";
    const lines = [
      `> locking onto ${target}...`,
      `> spooling up the punt cannon...`,
      `> ERROR 1998: bluesky has no disconnect packet.`,
      `> rerouting energy into kindness subroutine...`,
      `> PUNT CANCELLED. sending compliment instead:`,
      `> "${compliment}"`,
    ];
    let i = 0;
    const t = setInterval(() => {
      if (i >= lines.length) return clearInterval(t);
      c.textContent += lines[i++] + "\n";
      c.scrollTop = c.scrollHeight;
    }, 260);
  });
}

// --- Skeet Bomber (also 100% cosmetic — nothing is ever sent) --------------

function renderBomber() {
  panel.innerHTML = `
    <h2>📨 Skeet Bomber</h2>
    <p>The original mail bomber flooded someone's inbox. This one floods
       nothing — it just simulates the console so you can feel the 1998
       power fantasy without being a menace to anyone's mentions.</p>
    <div class="field">
      <label for="bomb-count">payload count:</label>
      <input type="range" id="bomb-count" min="1" max="9999" value="500" />
      <span id="bomb-count-label">500</span>
    </div>
    <div class="field">
      <button class="action" id="bomb-go">DETONATE (not really)</button>
    </div>
    <div class="console" id="bomb-console">payload armed. awaiting detonation...</div>
    <p class="disclaimer">This button has never sent a single skeet, DM, or packet to anyone.</p>
  `;
  const range = document.getElementById("bomb-count");
  const label = document.getElementById("bomb-count-label");
  range.addEventListener("input", () => (label.textContent = range.value));
  document.getElementById("bomb-go").addEventListener("click", () => {
    const n = Number(range.value);
    const c = document.getElementById("bomb-console");
    c.textContent = `arming ${n} payload(s)...\n`;
    let sent = 0;
    const step = Math.max(1, Math.round(n / 12));
    const t = setInterval(() => {
      sent = Math.min(n, sent + step);
      c.textContent += `sending... ${sent}/${n}\n`;
      c.scrollTop = c.scrollHeight;
      if (sent >= n) {
        clearInterval(t);
        c.textContent += `RATE LIMITED by the concept of being a decent person.\nzero packets actually left your browser. go touch grass instead.\n`;
        c.scrollTop = c.scrollHeight;
      }
    }, 120);
  });
}

// --- Chat Roomz (a fully local, fake IRC/AOL-style room) --------------------

const CHAT_SCRIPT = [
  ["sys", "*** now entering: BlueskyHell Lobby (24 users) ***"],
  ["xXx_skeeter_xXx", "yo anyone got the algorithm cracked yet"],
  ["moot4moot", "lol no such thing, just post and pray"],
  ["ratio_king_99", "A/S/L? jk this isn't 1998 wait actually it kind of is"],
  ["sys", "*** feed_lurker99 has entered the room ***"],
  ["feed_lurker99", "does anyone actually read the quote skeets or just the ratio count"],
  ["dial_up_daryl", "brb mom needs the phone line"],
  ["mod_glowfish", "no piracy talk in here 😤 this is a SAFE for work warez room"],
  ["xXx_skeeter_xXx", "found a trick: be nice to people. shhh don't tell anyone"],
  ["sys", "*** dial_up_daryl has left the room (connection reset by mother) ***"],
];

function renderChat() {
  panel.innerHTML = `
    <h2>💬 Chat Roomz — BlueskyHell Lobby</h2>
    <div class="bevel-in" id="chat-log"></div>
    <div class="field">
      <input type="text" id="chat-input" placeholder="say something (stays on your machine)" />
      <button class="action" id="chat-send">SEND</button>
    </div>
    <p class="disclaimer">Everyone else in here is a scripted NPC. Nothing you type leaves your browser.</p>
  `;
  const log = document.getElementById("chat-log");
  function addLine(who, text) {
    const p = document.createElement("p");
    if (who === "sys") {
      p.className = "sys";
      p.textContent = text;
    } else if (who === "me") {
      p.className = "me";
      p.innerHTML = `<b>you:</b> ${text}`;
    } else {
      p.innerHTML = `<b>${who}:</b> ${text}`;
    }
    log.appendChild(p);
    log.scrollTop = log.scrollHeight;
  }
  let i = 0;
  const t = setInterval(() => {
    if (i >= CHAT_SCRIPT.length) return clearInterval(t);
    const [who, text] = CHAT_SCRIPT[i++];
    addLine(who, text);
  }, 900);
  const input = document.getElementById("chat-input");
  function send() {
    const v = input.value.trim();
    if (!v) return;
    addLine("me", v);
    input.value = "";
  }
  document.getElementById("chat-send").addEventListener("click", send);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") send();
  });
}

// --- Profile Snoop (the one real feature: public, read-only getProfile) ----

function renderSnoop() {
  panel.innerHTML = `
    <h2>🔍 Profile Snoop</h2>
    <p>The one tool in here that's actually real: a read-only lookup against
       Bluesky's public AppView. Same as a "whois" — no login, no writes,
       nothing sent anywhere except the request itself.</p>
    <div class="field">
      <input type="text" id="snoop-handle" placeholder="@handle.bsky.social or did:plc:..." />
      <button class="action" id="snoop-go">SNOOP</button>
    </div>
    <div id="snoop-result"></div>
  `;
  const result = document.getElementById("snoop-result");
  document.getElementById("snoop-go").addEventListener("click", async () => {
    const handle = document.getElementById("snoop-handle").value.trim();
    if (!handle) return;
    result.innerHTML = `<div class="console">looking up ${handle}...</div>`;
    try {
      const p = await getProfile(handle);
      result.innerHTML = `
        <div class="bevel-in" id="profile-card">
          <img src="${p.avatar || ""}" alt="" onerror="this.style.visibility='hidden'" />
          <div>
            <div><b>${p.displayName || p.handle}</b> · @${p.handle}</div>
            <div class="stats">
              ${p.followersCount ?? "?"} followers ·
              ${p.followsCount ?? "?"} follows ·
              ${p.postsCount ?? "?"} skeets
            </div>
            <div style="margin-top:6px; max-width: 380px;">${(p.description || "(no bio)").replace(/</g, "&lt;")}</div>
          </div>
        </div>
      `;
    } catch (e) {
      result.innerHTML = `<div class="console">SNOOP FAILED: ${String(e.message || e)}</div>`;
    }
  });
}

// --- Serial Keygen (cosmetic random string generator, not a real crack) ----

function block() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 5; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function renderKeygen() {
  panel.innerHTML = `
    <h2>🔑 Serial Keygen</h2>
    <p>Every good '98 warez app has a keygen. This one "unlocks" nothing —
       there's no paid tier of being on bluesky — but it'll happily print
       you a very convincing fake license key.</p>
    <div class="field">
      <button class="action" id="keygen-go">GENERATE KEY</button>
    </div>
    <div id="keygen-out">click generate...</div>
    <p class="disclaimer">100% legally meaningless. Unlocks: nothing. Vibes: maximum.</p>
  `;
  document.getElementById("keygen-go").addEventListener("click", () => {
    document.getElementById("keygen-out").textContent =
      `SKYHELL-${block()}-${block()}-${block()}-${block()}`;
  });
}

// --- Greetz -------------------------------------------------------------

function renderGreetz() {
  panel.innerHTML = `
    <h2>📜 Greetz</h2>
    <pre style="white-space: pre-wrap; font-family: 'Courier New', monospace;">
SkyHell v1.0 — a nostalgia toy, not a hacking tool.

greetz fly out to:
  - the algorithm, wherever it is tonight
  - your mutuals, the real MVPs
  - dial-up modems, may they screech forever
  - geocities, angelfire, and every under-construction gif
  - AOHell itself (rest in piss — this is a tribute, not a rebuild;
    every "tool" above is cosmetic and does nothing to anyone but you)
  - @ver.ooo, who asked for this

no passwords were cracked, no one was punted, no mentions were bombed,
and no packets left this browser except the one Profile Snoop lookup
you asked for. it's all just buttons that feel like 1998.

— @buildthis.bisks.net
    </pre>
  `;
}
