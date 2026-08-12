import { resolveDid, resolvePds, getProfile, getAuthorFeed, getFollows, getFollowers, listRecords } from "./lib/atproto.js";
import { extractFeatures, pickVuln, severityFor, cveFor } from "./lib/analyze.js";

const els = {
  form: document.getElementById("scanForm"),
  input: document.getElementById("handleInput"),
  btn: document.getElementById("scanBtn"),
  status: document.getElementById("status"),
  card: document.getElementById("card"),
  avatar: document.getElementById("avatar"),
  handleOut: document.getElementById("handleOut"),
  didOut: document.getElementById("didOut"),
  cveId: document.getElementById("cveId"),
  sevBadge: document.getElementById("sevBadge"),
  cweBadge: document.getElementById("cweBadge"),
  vulnEmoji: document.getElementById("vulnEmoji"),
  vulnName: document.getElementById("vulnName"),
  affected: document.getElementById("affected"),
  tagline: document.getElementById("tagline"),
  cvssFill: document.getElementById("cvssFill"),
  cvssNum: document.getElementById("cvssNum"),
  desc: document.getElementById("desc"),
  evidence: document.getElementById("evidence"),
  patchStatus: document.getElementById("patchStatus"),
  exploitMaturity: document.getElementById("exploitMaturity"),
  shareBluesky: document.getElementById("shareBluesky"),
  shareDownload: document.getElementById("shareDownload"),
  shareNative: document.getElementById("shareNative"),
  shareCanvas: document.getElementById("shareCanvas"),
};

function setStatus(msg, isErr) {
  els.status.textContent = msg;
  els.status.classList.toggle("err", !!isErr);
}

function cleanHandle(raw) {
  return (raw || "")
    .trim()
    .replace(/^@/, "")
    .replace(/^https?:\/\/(bsky\.app\/profile\/)?/, "")
    .split(/[/\s]/)[0];
}

const SCAN_STEPS = [
  "resolving identity...",
  "reading app.bsky.feed.post records...",
  "reading app.bsky.graph.follow records off your PDS...",
  "walking the follow graph...",
  "running static analysis...",
];

let lastShareText = "";

async function scan(rawHandle) {
  const handle = cleanHandle(rawHandle);
  if (!handle) {
    setStatus("enter a handle first.", true);
    return;
  }

  els.btn.disabled = true;
  els.card.classList.remove("show");
  let step = 0;
  setStatus(SCAN_STEPS[0]);
  const stepTimer = setInterval(() => {
    step = Math.min(step + 1, SCAN_STEPS.length - 1);
    setStatus(SCAN_STEPS[step]);
  }, 550);

  try {
    const did = await resolveDid(handle);
    const [profile, pds] = await Promise.all([getProfile(did), resolvePds(did)]);

    const [feedItems, follows, followers] = await Promise.all([
      getAuthorFeed(did, 2),
      getFollows(did, 300),
      getFollowers(did, 300),
    ]);

    let followRecords = [];
    if (pds) {
      try {
        followRecords = await listRecords(pds, did, "app.bsky.graph.follow", 3);
      } catch {
        followRecords = [];
      }
    }

    const features = extractFeatures({ profile, feedItems, follows, followers, followRecords });
    const result = pickVuln(features, did);
    const { vuln, evidence } = result;
    const { cvss, label } = severityFor(result.score);
    const cve = cveFor(did, vuln.id);

    render({ profile, did, vuln, evidence, cvss, label, cve, features });
    setStatus("");
  } catch (err) {
    setStatus("scan failed: " + err.message, true);
  } finally {
    clearInterval(stepTimer);
    els.btn.disabled = false;
  }
}

function render({ profile, did, vuln, evidence, cvss, label, cve, features }) {
  els.avatar.src = profile.avatar || "";
  els.avatar.style.visibility = profile.avatar ? "visible" : "hidden";
  els.handleOut.textContent = "@" + profile.handle;
  els.didOut.textContent = did;

  els.cveId.textContent = cve.id;
  els.sevBadge.textContent = label + " severity";
  els.sevBadge.className = "badge sev-" + label.toLowerCase();
  els.cweBadge.textContent = vuln.cwe;

  els.vulnEmoji.textContent = vuln.emoji;
  els.vulnName.textContent = vuln.name;
  els.affected.textContent = "affected component: @" + profile.handle;
  els.tagline.textContent = "“" + vuln.tagline + "”";

  els.cvssFill.style.width = Math.round((cvss / 10) * 100) + "%";
  els.cvssNum.textContent = cvss.toFixed(1) + " / 10";

  els.desc.textContent = vuln.describe(features);
  if (features.postCount < 5) {
    els.desc.textContent += " (small sample — your repo didn't have many recent posts to scan, so treat this finding as low-confidence.)";
  }

  els.evidence.innerHTML = "";
  for (const line of evidence.length ? evidence : ["not enough signal to cite specific findings"]) {
    const li = document.createElement("li");
    li.textContent = line;
    els.evidence.appendChild(li);
  }

  els.patchStatus.textContent = cve.patchStatus;
  els.exploitMaturity.textContent = cve.exploitMaturity;

  els.card.classList.add("show");

  lastShareText = buildShareText({ profile, vuln, cve, cvss });
  els.shareBluesky.href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(lastShareText);
  buildShareCard({ profile, did, vuln, evidence, cvss, label, cve });
}

function buildShareText({ profile, vuln, cve, cvss }) {
  const url = `https://vulnscope.bisks.net/s/${encodeURIComponent(profile.handle)}`;
  let text = `vulnscope scanned @${profile.handle}'s repo and filed ${cve.id}: ${vuln.name} (CVSS ${cvss.toFixed(1)}). "${vuln.tagline}" ${url}`;
  // Bluesky's compose limit is 300 graphemes; this is ASCII-heavy so .length
  // is a safe proxy. Trim the tagline first, then the whole thing, keeping
  // the URL intact since that's the only way back to the site.
  if (text.length > 295) {
    text = `vulnscope scanned @${profile.handle}'s repo and filed ${cve.id}: ${vuln.name} (CVSS ${cvss.toFixed(1)}). ${url}`;
  }
  if (text.length > 295) text = text.slice(0, 292) + "... " + url;
  return text;
}

let avatarImgCache = null;
async function loadImage(src) {
  if (!src) return null;
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function wrapCanvasText(ctx, text, x, y, maxWidth, lineHeight, maxLines = 6) {
  const words = text.split(" ");
  let line = "";
  let lines = 0;
  for (let i = 0; i < words.length; i++) {
    const test = line ? line + " " + words[i] : words[i];
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, y);
      line = words[i];
      y += lineHeight;
      lines++;
      if (lines >= maxLines - 1) {
        ctx.fillText(line + (i < words.length - 1 ? "..." : ""), x, y);
        return y + lineHeight;
      }
    } else {
      line = test;
    }
  }
  if (line) {
    ctx.fillText(line, x, y);
    y += lineHeight;
  }
  return y;
}

async function buildShareCard({ profile, did, vuln, evidence, cvss, label, cve }) {
  const canvas = els.shareCanvas;
  const ctx = canvas.getContext("2d");
  const W = canvas.width,
    H = canvas.height;
  const mono = 'ui-monospace, "JetBrains Mono", "SF Mono", Menlo, Consolas, monospace';

  avatarImgCache = await loadImage(profile.avatar);

  ctx.fillStyle = "#0a0e0d";
  ctx.fillRect(0, 0, W, H);
  const g1 = ctx.createRadialGradient(W * 0.15, -50, 0, W * 0.15, -50, 500);
  g1.addColorStop(0, "#1a3a2c");
  g1.addColorStop(1, "rgba(10,14,13,0)");
  ctx.fillStyle = g1;
  ctx.fillRect(0, 0, W, H);
  const g2 = ctx.createRadialGradient(W * 0.9, 40, 0, W * 0.9, 40, 450);
  g2.addColorStop(0, "#3a1414");
  g2.addColorStop(1, "rgba(10,14,13,0)");
  ctx.fillStyle = g2;
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign = "left";
  ctx.fillStyle = "#43ffa0";
  ctx.font = `800 46px ${mono}`;
  ctx.fillText("vulnscope", 56, 88);

  const who = "@" + profile.handle;
  ctx.fillStyle = "#e7f3ec";
  ctx.font = `700 26px ${mono}`;
  let textX = 56;
  if (avatarImgCache) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(80, 128, 24, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(avatarImgCache, 56, 104, 48, 48);
    ctx.restore();
    textX = 118;
  }
  ctx.fillText(who, textX, 136);

  const cardX = 56,
    cardY = 180,
    cardW = W - 112,
    cardH = H - 240;
  ctx.strokeStyle = "#24332e";
  ctx.lineWidth = 1.5;
  ctx.fillStyle = "#101815";
  ctx.beginPath();
  ctx.roundRect(cardX, cardY, cardW, cardH, 18);
  ctx.fill();
  ctx.stroke();

  ctx.textAlign = "left";
  ctx.fillStyle = "#43ffa0";
  ctx.font = `700 15px ${mono}`;
  ctx.fillText(cve.id + "  ·  " + vuln.cwe, cardX + 40, cardY + 46);

  const sevColor = label === "Critical" || label === "High" ? "#ff5c5c" : label === "Medium" ? "#ffb454" : "#43ffa0";
  ctx.fillStyle = sevColor;
  ctx.font = `700 15px ${mono}`;
  ctx.textAlign = "right";
  ctx.fillText(label.toUpperCase() + " · CVSS " + cvss.toFixed(1), cardX + cardW - 40, cardY + 46);

  ctx.textAlign = "left";
  ctx.font = `800 44px ${mono}`;
  ctx.fillStyle = "#e7f3ec";
  ctx.fillText(vuln.emoji + "  " + vuln.name, cardX + 40, cardY + 108);

  ctx.font = `italic 18px ${mono}`;
  ctx.fillStyle = "#43ffa0";
  const taglineY = wrapCanvasText(ctx, "“" + vuln.tagline + "”", cardX + 40, cardY + 148, cardW - 80, 24, 2);

  ctx.fillStyle = "#7f978f";
  ctx.font = `700 13px ${mono}`;
  let ey = Math.max(taglineY + 24, cardY + 210);
  ctx.fillText("SCAN FINDINGS", cardX + 40, ey);
  ey += 26;
  ctx.font = `15px ${mono}`;
  for (const line of evidence.slice(0, 3)) {
    ctx.fillStyle = "#43ffa0";
    ctx.fillText("+", cardX + 40, ey);
    ctx.fillStyle = "#e7f3ec";
    ey = wrapCanvasText(ctx, line, cardX + 60, ey, cardW - 100, 21, 2);
    ey += 4;
  }

  ctx.textAlign = "left";
  ctx.fillStyle = "#43ffa0";
  ctx.font = `700 20px ${mono}`;
  ctx.fillText("vulnscope.bisks.net", 56, H - 36);
}

els.shareDownload.addEventListener("click", () => {
  els.shareCanvas.toBlob((blob) => {
    if (!blob) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    const who = (els.handleOut.textContent || "card").replace(/[^a-z0-9.-]/gi, "_");
    a.download = "vulnscope-" + who + ".png";
    a.click();
    URL.revokeObjectURL(a.href);
  }, "image/png");
});

function canShareFiles() {
  if (!navigator.share || !navigator.canShare) return false;
  try {
    const probe = new File([""], "probe.png", { type: "image/png" });
    return navigator.canShare({ files: [probe] });
  } catch (_) {
    return false;
  }
}
if (canShareFiles()) {
  els.shareNative.style.display = "";
  els.shareNative.addEventListener("click", () => {
    els.shareCanvas.toBlob(async (blob) => {
      if (!blob) return;
      const who = (els.handleOut.textContent || "card").replace(/[^a-z0-9.-]/gi, "_");
      const file = new File([blob], "vulnscope-" + who + ".png", { type: "image/png" });
      try {
        await navigator.share({ files: [file], text: lastShareText, title: "vulnscope" });
      } catch (_) {}
    }, "image/png");
  });
}

els.form.addEventListener("submit", (e) => {
  e.preventDefault();
  scan(els.input.value);
});

const pathHandle = (location.pathname.match(/^\/s\/([^/]+)\/?$/) || [])[1];
const sharedHandle = new URLSearchParams(location.search).get("h") || (pathHandle && decodeURIComponent(pathHandle));
if (sharedHandle) {
  els.input.value = sharedHandle;
  scan(sharedHandle);
}
