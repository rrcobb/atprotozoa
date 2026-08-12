// taste.bisks.net — reads generate.mjs's data.json (built from every
// sites/*/site.json manifest in the repo) and renders a Taste Score
// certificate for a looked-up handle, plus a leaderboard across everyone
// buildthis has ever built for. No server round-trip after the initial
// fetch: the same handle always produces the same result, so a plain query
// string (?h=handle) is enough to make a result shareable and reloadable.
(function () {
  const SITE_URL = "https://taste.bisks.net/";
  const DEFAULT_HANDLE = "cee.wtf";

  const form = document.getElementById("lookupForm");
  const input = document.getElementById("handleInput");
  const datalist = document.getElementById("handleList");
  const cert = document.getElementById("certificate");
  const boardEl = document.getElementById("board");
  const footerNote = document.getElementById("footerNote");

  let DATA = null;
  let byHandle = new Map();

  function tierFor(score) {
    if (score <= 0) return "no taste on record (yet)";
    if (score <= 3) return "emerging taste";
    if (score <= 9) return "certified taste";
    if (score <= 19) return "main character taste";
    if (score <= 39) return "undisputed taste";
    return "immaculate. untouchable. taste.";
  }

  function esc(s) {
    const d = document.createElement("div");
    d.textContent = String(s);
    return d.innerHTML;
  }

  function renderList(el, items, kind) {
    el.innerHTML = "";
    if (!items.length) {
      const li = document.createElement("li");
      li.className = "cert-empty";
      li.textContent =
        kind === "own" ? "nothing credited to them yet." : "nobody's picked this up yet — could be first.";
      el.appendChild(li);
      return;
    }
    for (const s of items) {
      const li = document.createElement("li");
      const a = document.createElement("a");
      a.href = s.url;
      a.target = "_blank";
      a.rel = "noopener";
      a.textContent = s.title || s.name;
      li.appendChild(a);
      if (kind === "borrowed" && s.by) {
        const tag = document.createElement("span");
        tag.className = "by-tag";
        tag.textContent = ` — built by @${s.by}`;
        li.appendChild(tag);
      }
      el.appendChild(li);
    }
  }

  function renderCertificate(handle) {
    const entry = byHandle.get(handle.toLowerCase());
    const rank = entry ? DATA.board.indexOf(entry) + 1 : null;
    const score = entry ? entry.tasteScore : 0;
    const own = entry ? entry.ownBuilds : [];
    const borrowed = entry ? entry.borrowedBy : [];

    document.getElementById("certHandle").textContent = "@" + handle;
    document.getElementById("certTier").textContent = tierFor(score);
    document.getElementById("certDate").textContent = "verified live";
    document.getElementById("certScore").textContent = String(score);
    document.getElementById("certOwn").textContent = String(own.length);
    document.getElementById("certBorrowed").textContent = String(borrowed.length);

    const rankEl = document.getElementById("certRank");
    if (rank) {
      rankEl.innerHTML = `ranked <strong>#${rank}</strong> of ${DATA.board.length} people buildthis has built for`;
    } else if (entry) {
      rankEl.textContent = "";
    } else {
      rankEl.innerHTML = `no record on bisks.net yet &mdash; tag <a href="https://bsky.app/profile/buildthis.bisks.net">@buildthis.bisks.net</a> with an idea to start one.`;
    }

    renderList(document.getElementById("borrowedList"), borrowed, "borrowed");
    renderList(document.getElementById("ownList"), own, "own");

    const shareUrl = SITE_URL + "?h=" + encodeURIComponent(handle);
    let shareText;
    if (borrowed.length > 0) {
      shareText = `my Taste Score is ${score} — ${own.length} buildthis creation${own.length === 1 ? "" : "s"} of mine, and ${borrowed.length} other builder${borrowed.length === 1 ? "" : "s"} ran with my ideas. ${shareUrl}`;
    } else if (own.length > 0) {
      shareText = `Taste Score: ${score}. ${own.length} buildthis creation${own.length === 1 ? "" : "s"} credited to me so far. ${shareUrl}`;
    } else {
      shareText = `checking my Taste Score on bisks.net — currently 0, be the change. ${shareUrl}`;
    }
    document.getElementById("shareLink").href =
      "https://bsky.app/intent/compose?text=" + encodeURIComponent(shareText);

    cert.classList.add("shown");
    cert.dataset.handle = handle;
    cert.dataset.score = String(score);
    cert.dataset.tier = tierFor(score);
    cert.dataset.own = String(own.length);
    cert.dataset.borrowed = String(borrowed.length);
  }

  function lookup(handle, pushState) {
    handle = handle.trim().replace(/^@/, "");
    if (!handle) return;
    input.value = handle;
    renderCertificate(handle);
    if (pushState) {
      const url = new URL(location.href);
      url.searchParams.set("h", handle);
      history.pushState({ handle }, "", url);
    }
    cert.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function renderBoard() {
    boardEl.innerHTML = "";
    const top = DATA.board.slice(0, 20);
    top.forEach((entry, i) => {
      const li = document.createElement("li");
      li.innerHTML = `<span class="rank">${i + 1}</span><span class="handle">@${esc(entry.handle)}</span><span class="score">${entry.tasteScore}</span>`;
      li.addEventListener("click", () => lookup(entry.handle, true));
      boardEl.appendChild(li);
    });
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    lookup(input.value || DEFAULT_HANDLE, true);
  });

  window.addEventListener("popstate", () => {
    const h = new URL(location.href).searchParams.get("h") || DEFAULT_HANDLE;
    lookup(h, false);
  });

  fetch("data.json")
    .then((r) => r.json())
    .then((data) => {
      DATA = data;
      byHandle = new Map(data.board.map((e) => [e.handle.toLowerCase(), e]));

      datalist.innerHTML = data.board
        .map((e) => `<option value="${esc(e.handle)}"></option>`)
        .join("");

      footerNote.textContent = `generated from ${data.generatedFromSites} bisks.net site manifests · own builds count ${data.ownWeight}x, other builders using your idea counts ${data.borrowedWeight}x`;

      renderBoard();

      const startHandle = new URL(location.href).searchParams.get("h") || DEFAULT_HANDLE;
      lookup(startHandle, false);
    })
    .catch(() => {
      footerNote.textContent = "couldn't load the taste data — try reloading.";
    });

  // ---- certificate image (canvas, for download / native share) ----
  const canvas = document.getElementById("cardCanvas");
  const shareCardBtn = document.getElementById("shareCardBtn");

  function drawCard() {
    const ctx = canvas.getContext("2d");
    const W = canvas.width, H = canvas.height;

    ctx.fillStyle = "#100e0a";
    ctx.fillRect(0, 0, W, H);
    const grad = ctx.createRadialGradient(180, 100, 20, 180, 100, 700);
    grad.addColorStop(0, "rgba(212,175,55,0.16)");
    grad.addColorStop(1, "rgba(212,175,55,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = "#d4af37";
    ctx.lineWidth = 4;
    ctx.strokeRect(24, 24, W - 48, H - 48);
    ctx.lineWidth = 1;
    ctx.strokeRect(34, 34, W - 68, H - 68);

    ctx.fillStyle = "#b3a48a";
    ctx.font = "20px Georgia, serif";
    ctx.textAlign = "center";
    ctx.fillText("BISKS.NET  ·  PROVENANCE OFFICE", W / 2, 90);

    ctx.fillStyle = "#f2ead9";
    ctx.font = "bold 56px Georgia, serif";
    ctx.fillText("@" + (cert.dataset.handle || ""), W / 2, 190);

    ctx.fillStyle = "#f0cd5c";
    ctx.font = "italic 30px Georgia, serif";
    ctx.fillText(cert.dataset.tier || "", W / 2, 240);

    const stats = [
      [cert.dataset.score || "0", "TASTE SCORE"],
      [cert.dataset.own || "0", "OWN BUILDS"],
      [cert.dataset.borrowed || "0", "USED BY OTHERS"],
    ];
    const spacing = 320;
    const startX = W / 2 - spacing;
    stats.forEach(([num, label], i) => {
      const x = startX + i * spacing;
      ctx.fillStyle = "#f0cd5c";
      ctx.font = "bold 72px ui-monospace, Menlo, monospace";
      ctx.fillText(num, x, 400);
      ctx.fillStyle = "#b3a48a";
      ctx.font = "18px Georgia, serif";
      ctx.fillText(label, x, 435);
    });

    ctx.fillStyle = "#b3a48a";
    ctx.font = "20px Georgia, serif";
    ctx.fillText("“the people with Taste and Style will remain” — verified at taste.bisks.net", W / 2, 570);
  }

  function canShareFiles() {
    if (!navigator.share || !navigator.canShare) return false;
    try {
      const probe = new File([""], "probe.png", { type: "image/png" });
      return navigator.canShare({ files: [probe] });
    } catch {
      return false;
    }
  }

  shareCardBtn.addEventListener("click", () => {
    drawCard();
    canvas.toBlob(async (blob) => {
      if (!blob) return;
      const handle = cert.dataset.handle || "taste";
      const file = new File([blob], `${handle}-taste.png`, { type: "image/png" });
      if (canShareFiles()) {
        try {
          await navigator.share({
            files: [file],
            title: "my Taste Score",
            text: document.getElementById("shareLink").href,
          });
          return;
        } catch {
          // fall through to download
        }
      }
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${handle}-taste.png`;
      a.click();
      URL.revokeObjectURL(a.href);
    }, "image/png");
  });
})();
