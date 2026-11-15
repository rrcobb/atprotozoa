const SKIES = [
  ["☀️", "clear skies"], ["⛅", "partly cloudy"], ["🌧️", "light drizzle"], ["⛈️", "scattered hot takes"],
  ["🌫️", "fog of discourse"], ["❄️", "frosty replies"], ["🌈", "rainbows after quote-posts"], ["🌪️", "ratio tornado"],
];
const WIND = ["calm", "a gentle repost breeze", "brisk subtweet gusts", "gale-force dogpiling"];
const ADVISORY = [
  "no advisories. enjoy it.", "mute filters recommended after 3pm.", "avoid the trending tab.",
  "bring an umbrella for quote-posts.", "good day to log off briefly.", "high likelihood of a banger.",
  "drafts should stay drafts.", "like-to-reply ratio looks healthy.",
];

// FNV-1a: tiny, stable, plenty for picking from short lists.
function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export function forecast(handle, day) {
  const h = hash(handle + "|" + day);
  const pick = (n, shift) => ((h >>> shift) ^ hash(handle + shift)) % n;
  const sky = SKIES[pick(SKIES.length, 0)];
  return {
    icon: sky[0], sky: sky[1],
    temp: 20 + (hash(day + handle + "t") % 90) - 40,
    wind: WIND[hash(handle + day + "w") % WIND.length],
    pop: hash(handle + day + "p") % 101,
    adv: ADVISORY[hash(handle + day + "a") % ADVISORY.length],
  };
}

export function normalize(raw) {
  return raw.trim().replace(/^@+/, "").toLowerCase();
}

if (typeof document !== "undefined") {
  const $ = (id) => document.getElementById(id);
  const day = new Date().toISOString().slice(0, 10);
  $("day").textContent = day;
  $("seed").onclick = () => { $("handle").value = "@cee.wtf"; $("handle").dispatchEvent(new Event("input")); $("handle").focus(); };
  $("f").addEventListener("submit", (e) => {
    e.preventDefault();
    const handle = normalize($("handle").value);
    if (!handle) return;
    const r = forecast(handle, day);
    $("icon").textContent = r.icon;
    $("temp").textContent = r.temp + "°F";
    $("sky").textContent = r.sky;
    $("wind").textContent = r.wind;
    $("pop").textContent = r.pop + "%";
    $("adv").textContent = r.adv;
    const text = `today's forecast for @${handle}: ${r.icon} ${r.sky}, ${r.temp}°F, ${r.wind}. ${r.adv}\nhttps://handlecast.bisks.net/`;
    $("share").href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(text);
    $("out").hidden = false;
  });
}
