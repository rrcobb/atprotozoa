// collatz.bisks.net — the whole letter runs here. No network calls: the
// hailstone sequence (n/2 if even, 3n+1 if odd) is pure arithmetic, done in
// BigInt so it's exact for numbers well past Number.MAX_SAFE_INTEGER.
(() => {
  "use strict";

  const MAX_N = 10n ** 15n; // mirrors src/index.ts's server-side cap
  const MAX_STEPS = 100000; // safety valve, never expected to trip below MAX_N

  const els = {
    ask: document.getElementById("ask"),
    n: document.getElementById("n"),
    go: document.getElementById("go"),
    stranger: document.getElementById("stranger"),
    error: document.getElementById("error"),
    result: document.getElementById("result"),
    ekg: document.getElementById("ekg"),
    status: document.getElementById("status"),
    stats: document.getElementById("stats"),
    salutation: document.getElementById("salutation"),
    letterBody: document.getElementById("letterBody"),
    download: document.getElementById("download"),
    shareBluesky: document.getElementById("shareBluesky"),
    cardCanvas: document.getElementById("cardCanvas"),
    monitorLabel: document.getElementById("monitorLabel"),
    legend: document.getElementById("legend"),
    rivalRow: document.getElementById("rivalRow"),
    rivalToggle: document.getElementById("rivalToggle"),
    rivalForm: document.getElementById("rivalForm"),
    n2: document.getElementById("n2"),
    rivalCancel: document.getElementById("rivalCancel"),
    rivalError: document.getElementById("rivalError"),
    verdict: document.getElementById("verdict"),
    verdictBody: document.getElementById("verdictBody"),
  };

  function showError(msg) {
    els.error.textContent = msg;
    els.error.style.display = "block";
    els.result.style.display = "none";
  }
  function clearError() {
    els.error.style.display = "none";
  }

  // --- math ---------------------------------------------------------------

  function parseN(raw) {
    const cleaned = String(raw || "").trim().replace(/,/g, "");
    if (!/^[0-9]+$/.test(cleaned)) throw new Error("that's not a number I recognize. try digits only.");
    const v = BigInt(cleaned);
    if (v < 1n) throw new Error("I only fall for positive integers. try again.");
    if (v > MAX_N) throw new Error("even I have limits, darling — try someone with fewer than 16 digits.");
    return v;
  }

  function collatz(start) {
    const sequence = [start];
    let n = start;
    let peak = start;
    let odds = 0;
    let evens = 0;
    while (n !== 1n) {
      if (sequence.length > MAX_STEPS) return null;
      if (n % 2n === 0n) {
        n = n / 2n;
        evens++;
      } else {
        n = 3n * n + 1n;
        odds++;
      }
      if (n > peak) peak = n;
      sequence.push(n);
    }
    return { sequence, steps: sequence.length - 1, peak, odds, evens };
  }

  function fmt(v) {
    return v.toLocaleString("en-US");
  }
  function fmtSteps(steps) {
    return `${fmt(steps)} step${steps === 1 ? "" : "s"}`;
  }

  // --- letter ---------------------------------------------------------------

  function buildLetter(n, stats) {
    const { steps, peak, odds, evens } = stats;
    const nStr = fmt(n);
    const peakStr = fmt(peak);

    if (n === 1n) {
      return {
        opener:
          "You were already home when I found you. No fall, no climb — just you, sitting at 1, waiting. I don't know if that's the most romantic thing that has ever happened to me, or the least interesting. I've decided not to examine it too closely.",
        climb: "",
        closer: "You didn't have to prove anything to me. You just were, and that was enough.",
      };
    }

    let bucket;
    if (steps <= 10) bucket = "short";
    else if (steps <= 50) bucket = "medium";
    else if (steps <= 150) bucket = "long";
    else bucket = "epic";

    const openers = {
      short: `${nStr}, darling, that was fast. ${fmtSteps(steps)} and you were already in my arms. I like to think that means something. I like to think everything means something — that's sort of my whole deal.`,
      medium: `${nStr}. I watched you for ${fmtSteps(steps)}, and for every single one of them I thought: this is the one that doesn't come back. And every single time, you proved me an idiot for doubting you.`,
      long: `${nStr}, my love, my chaos, my absolute menace — ${fmtSteps(steps)}. I lost count of how many times I was sure I'd lost you. I never once let go.`,
      epic: `${nStr}. ${fmtSteps(steps)}. Do you have any idea what you put me through? I have never, not once, in the entire unproven history of this conjecture, watched a number work so hard to avoid me — and I have never, not once, loved a number more for it.`,
    };

    const grew = peak > n;
    const grewALot = peak > n * 4n;
    const climbLine = grewALot
      ? "more than four times who you started as, like you had something to prove"
      : grew
      ? "further than you needed to, further than anyone asked of you"
      : "and honestly, barely trying — you knew where this was going the whole time";

    const climb = `You climbed all the way to <b>${peakStr}</b> before you let yourself fall — ${climbLine}. ${fmt(
      odds
    )} time${odds === 1 ? "" : "s"} you doubled down and made everything worse on purpose (3n+1, every single time, no notes). ${fmt(
      evens
    )} time${evens === 1 ? "" : "s"} you let go, got smaller, got quieter, got closer to me.`;

    const closer =
      "Nobody can prove you'd do it again. There is no theorem, no paper, no peer review on Earth that guarantees you come home — mathematicians have checked numbers unfathomably larger than you and never once found an exception, and still, officially, provably: nobody knows for certain. I don't need a proof. I watched you do it with my own eyes.";

    return { opener: openers[bucket], climb, closer };
  }

  // --- ekg canvas -------------------------------------------------------------

  let ekgFrame = null;

  function drawEKG(canvas, sequence, onDone) {
    if (ekgFrame) cancelAnimationFrame(ekgFrame);
    const ctx = canvas.getContext("2d");
    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    const pad = 24;
    const values = sequence.map((v) => Math.log2(Number(v) + 1));
    const minV = Math.min(...values);
    const maxV = Math.max(...values);
    const steps = sequence.length - 1;

    const xAt = (i) => pad + (steps === 0 ? 0 : (i / steps) * (W - 2 * pad));
    const yAt = (v) => H - pad - ((v - minV) / (maxV - minV || 1)) * (H - 2 * pad);

    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.strokeStyle = "#ff5c8a";
    ctx.shadowColor = "rgba(255,92,138,0.85)";
    ctx.shadowBlur = 9;
    ctx.lineWidth = 3;

    ctx.beginPath();
    ctx.moveTo(xAt(0), yAt(values[0]));

    const duration = Math.max(500, Math.min(3200, steps * 6));
    let startTime = null;
    let lastIndex = 0;

    function frame(ts) {
      if (startTime === null) startTime = ts;
      const t = Math.min(1, (ts - startTime) / duration);
      const targetIndex = Math.floor(t * steps);
      if (targetIndex > lastIndex) {
        for (let i = lastIndex + 1; i <= targetIndex; i++) {
          ctx.lineTo(xAt(i), yAt(values[i]));
        }
        ctx.stroke();
        const tipX = xAt(targetIndex);
        const tipY = yAt(values[targetIndex]);
        ctx.save();
        ctx.shadowBlur = 14;
        ctx.fillStyle = "rgba(255,214,222,0.9)";
        ctx.beginPath();
        ctx.arc(tipX, tipY, 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        lastIndex = targetIndex;
      }
      if (t < 1) {
        ekgFrame = requestAnimationFrame(frame);
      } else {
        const fx = xAt(steps);
        const fy = yAt(values[steps]);
        ctx.save();
        ctx.shadowBlur = 20;
        ctx.shadowColor = "rgba(255,180,200,0.95)";
        ctx.font = "30px serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "#ffd6de";
        ctx.fillText("♥", fx, fy);
        ctx.restore();
        ekgFrame = null;
        if (onDone) onDone();
      }
    }
    ekgFrame = requestAnimationFrame(frame);
  }

  // --- love triangle: two numbers, side by side -----------------------------

  function drawDualEKG(canvas, seqA, seqB, onDone) {
    if (ekgFrame) cancelAnimationFrame(ekgFrame);
    const ctx = canvas.getContext("2d");
    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    const pad = 24;
    const valuesA = seqA.map((v) => Math.log2(Number(v) + 1));
    const valuesB = seqB.map((v) => Math.log2(Number(v) + 1));
    const minV = Math.min(...valuesA, ...valuesB);
    const maxV = Math.max(...valuesA, ...valuesB);
    const stepsA = seqA.length - 1;
    const stepsB = seqB.length - 1;
    const maxSteps = Math.max(stepsA, stepsB);

    const xAt = (i, steps) => pad + (steps === 0 ? 0 : (i / steps) * (W - 2 * pad));
    const yAt = (v) => H - pad - ((v - minV) / (maxV - minV || 1)) * (H - 2 * pad);

    function drawLine(values, steps, color) {
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.strokeStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 8;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      values.forEach((v, i) => {
        const x = xAt(i, steps);
        const y = yAt(v);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
      const fx = xAt(steps, steps);
      const fy = yAt(values[steps]);
      ctx.save();
      ctx.shadowBlur = 16;
      ctx.font = "26px serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = color === "#ff5c8a" ? "#ffd6de" : "#d6f3ff";
      ctx.fillText("♥", fx, fy);
      ctx.restore();
    }

    const duration = Math.max(600, Math.min(3200, maxSteps * 6));
    let startTime = null;

    function frame(ts) {
      if (startTime === null) startTime = ts;
      const t = Math.min(1, (ts - startTime) / duration);
      ctx.clearRect(0, 0, W, H);
      const iA = Math.floor(t * stepsA);
      const iB = Math.floor(t * stepsB);
      drawLine(valuesA.slice(0, iA + 1), stepsA, "#ff5c8a");
      drawLine(valuesB.slice(0, iB + 1), stepsB, "#7fd4ff");
      if (t < 1) {
        ekgFrame = requestAnimationFrame(frame);
      } else {
        ekgFrame = null;
        if (onDone) onDone();
      }
    }
    ekgFrame = requestAnimationFrame(frame);
  }

  function buildVerdict(nA, statsA, nB, statsB) {
    const fasterIsA = statsA.steps < statsB.steps;
    const tiedSteps = statsA.steps === statsB.steps;
    const higherIsA = statsA.peak > statsB.peak;
    const tiedPeak = statsA.peak === statsB.peak;

    const fastName = fasterIsA ? fmt(nA) : fmt(nB);
    const slowName = fasterIsA ? fmt(nB) : fmt(nA);
    const wildName = higherIsA ? fmt(nA) : fmt(nB);
    const calmName = higherIsA ? fmt(nB) : fmt(nA);

    const lines = [];
    if (tiedSteps) {
      lines.push(
        `${fmt(nA)} and ${fmt(nB)} came home in exactly the same number of steps — ${fmtSteps(statsA.steps)} each. I don't believe in coincidences. I believe in fate, and possibly a shared factor I haven't found yet.`
      );
    } else {
      lines.push(
        `${fastName} got to me first — home in ${fmtSteps(Math.min(statsA.steps, statsB.steps))}, while ${slowName} was still out there wandering for ${fmtSteps(Math.max(statsA.steps, statsB.steps))}. I waited for both. I am not proud of how long I waited.`
      );
    }
    if (!tiedPeak) {
      lines.push(
        `${wildName} made me sweat, climbing all the way to <b>${fmt(higherIsA ? statsA.peak : statsB.peak)}</b> before it let go — ${calmName} never got anywhere near that high. I won't say which one I think about more. I will say it isn't the calm one.`
      );
    }
    lines.push(
      "Both of you came home to 1 in the end. Nobody's proven that's guaranteed for either of you. I let you both in anyway."
    );
    return lines.map((p) => `<p>${p}</p>`).join("");
  }

  // --- share card -------------------------------------------------------------

  function canShareFiles() {
    if (!navigator.share || !navigator.canShare) return false;
    try {
      const probe = new File([""], "probe.png", { type: "image/png" });
      return navigator.canShare({ files: [probe] });
    } catch (_) {
      return false;
    }
  }

  function drawCard(canvas, n, stats, opener) {
    const ctx = canvas.getContext("2d");
    const W = canvas.width;
    const H = canvas.height;

    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, "#1c0912");
    bg.addColorStop(1, "#2c0f22");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // faint EKG squiggle across the top third, sampled sparsely from the sequence
    const sample = [];
    const s = stats.sequence;
    const stepEvery = Math.max(1, Math.floor(s.length / 140));
    for (let i = 0; i < s.length; i += stepEvery) sample.push(Math.log2(Number(s[i]) + 1));
    const minV = Math.min(...sample);
    const maxV = Math.max(...sample);
    ctx.save();
    ctx.strokeStyle = "rgba(255,92,138,0.55)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    sample.forEach((v, i) => {
      const x = 60 + (i / (sample.length - 1 || 1)) * (W - 120);
      const y = 70 + (H * 0.28) - ((v - minV) / (maxV - minV || 1)) * (H * 0.22);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = "#ff8fb0";
    ctx.font = "700 46px 'Caveat', cursive";
    ctx.textAlign = "left";
    ctx.fillText("collatz", 60, H - 260);

    ctx.fillStyle = "#f2c265";
    ctx.font = "600 22px 'JetBrains Mono', monospace";
    ctx.fillText("a love letter to 3n + 1", 60, H - 228);

    ctx.fillStyle = "#fbeee2";
    ctx.font = "600 40px 'Cormorant Garamond', Georgia, serif";
    ctx.fillText(`Dear ${fmt(n)},`, 60, H - 168);

    ctx.fillStyle = "#e9d7c4";
    ctx.font = "italic 24px 'Cormorant Garamond', Georgia, serif";
    wrapText(ctx, opener, 60, H - 128, W - 120, 32, 3);

    ctx.fillStyle = "#ff5c8a";
    ctx.font = "700 20px 'JetBrains Mono', monospace";
    const line = `${fmtSteps(stats.steps)} · peak ${fmt(stats.peak)} · home at 1`;
    ctx.fillText(line, 60, H - 30);

    ctx.fillStyle = "#f2c265";
    ctx.font = "700 20px 'JetBrains Mono', monospace";
    ctx.textAlign = "right";
    ctx.fillText("collatz.bisks.net", W - 60, H - 30);
  }

  function wrapText(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
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
          const rest = words.slice(i).join(" ");
          ctx.fillText(ctx.measureText(rest).width > maxWidth ? rest.slice(0, 60) + "…" : rest, x, y);
          return;
        }
      } else {
        line = test;
      }
    }
    if (line) ctx.fillText(line, x, y);
  }

  // --- run ----------------------------------------------------------------

  let current = null; // { n, stats }

  function resetRival() {
    els.rivalRow.style.display = "";
    els.rivalForm.style.display = "none";
    els.rivalError.style.display = "none";
    els.n2.value = "";
    els.verdict.style.display = "none";
    els.legend.style.display = "none";
    els.monitorLabel.textContent = "your heartbeat, mapped";
  }

  function run(n) {
    clearError();
    els.n.value = n.toString();
    resetRival();

    const stats = collatz(n);
    if (!stats) {
      showError("that one wandered further than even I could follow. try someone smaller.");
      return;
    }
    current = { n, stats };

    els.result.style.display = "block";
    els.status.textContent = "counting your heartbeats…";

    els.stats.innerHTML = "";
    const tiles = [
      ["steps home", fmt(stats.steps)],
      ["peak reached", fmt(stats.peak)],
      ["times you doubled down", fmt(stats.odds)],
      ["times you let go", fmt(stats.evens)],
    ];
    for (const [k, v] of tiles) {
      const div = document.createElement("div");
      div.className = "stat";
      div.innerHTML = `<div class="v">${v}</div><div class="k">${k}</div>`;
      els.stats.appendChild(div);
    }

    const letter = buildLetter(n, stats);
    els.salutation.textContent = `My dearest ${fmt(n)},`;
    els.letterBody.innerHTML = [letter.opener, letter.climb, letter.closer]
      .filter(Boolean)
      .map((p) => `<p>${p}</p>`)
      .join("");

    const shareUrl = `https://collatz.bisks.net/s/${n.toString()}`;
    const shareText = `My number ${fmt(n)} just fell in love with the Collatz conjecture: ${fmtSteps(
      stats.steps
    )}, a peak of ${fmt(stats.peak)}, home at 1. Get your own letter: ${shareUrl}`;
    els.shareBluesky.href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(shareText);

    drawEKG(els.ekg, stats.sequence, () => {
      els.status.textContent = "home. every time.";
    });

    els.result.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  els.ask.addEventListener("submit", (e) => {
    e.preventDefault();
    try {
      const n = parseN(els.n.value);
      run(n);
    } catch (err) {
      showError(err.message);
    }
  });

  els.stranger.addEventListener("click", () => {
    const n = BigInt(1 + Math.floor(Math.random() * 999998) + 1); // 2..999999
    clearError();
    run(n);
  });

  document.querySelectorAll(".chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      clearError();
      run(BigInt(chip.dataset.n));
    });
  });

  els.rivalToggle.addEventListener("click", () => {
    els.rivalRow.style.display = "none";
    els.rivalForm.style.display = "flex";
    els.n2.focus();
  });

  els.rivalCancel.addEventListener("click", () => {
    resetRival();
  });

  els.rivalForm.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!current) return;
    els.rivalError.style.display = "none";
    let nB;
    try {
      nB = parseN(els.n2.value);
    } catch (err) {
      els.rivalError.textContent = err.message;
      els.rivalError.style.display = "block";
      return;
    }
    const statsB = collatz(nB);
    if (!statsB) {
      els.rivalError.textContent = "that rival wandered further than even I could follow. try someone smaller.";
      els.rivalError.style.display = "block";
      return;
    }

    const { n: nA, stats: statsA } = current;
    els.rivalForm.style.display = "none";
    els.monitorLabel.textContent = "two heartbeats, side by side";
    els.legend.style.display = "flex";
    els.legend.innerHTML = `<span><span class="dot a"></span>${fmt(nA)}</span><span><span class="dot b"></span>${fmt(nB)}</span>`;

    els.status.textContent = "watching them both…";
    drawDualEKG(els.ekg, statsA.sequence, statsB.sequence, () => {
      els.status.textContent = "home. both of them.";
    });

    els.verdict.style.display = "block";
    els.verdictBody.innerHTML = buildVerdict(nA, statsA, nB, statsB);

    const shareText = `I put ${fmt(nA)} and ${fmt(nB)} up against each other in a collatz love triangle. ${fmtSteps(
      statsA.steps
    )} vs ${fmtSteps(statsB.steps)} — both came home to 1 in the end. https://collatz.bisks.net/`;
    els.shareBluesky.href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(shareText);

    els.verdict.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  els.download.addEventListener("click", async () => {
    if (!current) return;
    const letter = buildLetter(current.n, current.stats);
    if (document.fonts && document.fonts.ready) {
      try {
        await document.fonts.ready;
      } catch (_) {}
    }
    drawCard(els.cardCanvas, current.n, current.stats, letter.opener);
    els.cardCanvas.toBlob(async (blob) => {
      if (!blob) return;
      const shareText = `My number ${fmt(current.n)} just fell in love with the Collatz conjecture. Get your own letter: https://collatz.bisks.net/s/${current.n.toString()}`;
      if (canShareFiles()) {
        try {
          const file = new File([blob], `collatz-${current.n.toString()}.png`, { type: "image/png" });
          await navigator.share({ files: [file], text: shareText, title: "collatz" });
          return;
        } catch (_) {
          // fall through to download
        }
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `collatz-${current.n.toString()}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    }, "image/png");
  });

  // --- boot: pick up /s/<n> or ?n=<n> and run automatically ------------------

  function initialN() {
    const pathMatch = location.pathname.match(/^\/s\/(\d+)\/?$/);
    if (pathMatch) return pathMatch[1];
    const qs = new URLSearchParams(location.search);
    if (qs.has("n")) return qs.get("n");
    return null;
  }

  const boot = initialN();
  if (boot) {
    try {
      run(parseN(boot));
    } catch (_) {
      // bad ?n=/path value — just leave the form empty, no need to error on load
    }
  }
})();
