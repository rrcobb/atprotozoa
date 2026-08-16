// retrosynth — draw a molecule, get a shitpost total synthesis for it.
// Everything runs client-side: no atoms, bonds, or "science" ever leave the browser.

(() => {
  "use strict";

  // ---------- elements ----------
  const ELEMENTS = [
    { sym: "C", name: "carbon", fill: "#3a3f45", ink: "#e8ecef", r: 17 },
    { sym: "H", name: "hydrogen", fill: "#e8ecef", ink: "#1a1a1a", r: 12 },
    { sym: "N", name: "nitrogen", fill: "#3b6fe0", ink: "#ffffff", r: 17 },
    { sym: "O", name: "oxygen", fill: "#e5453f", ink: "#ffffff", r: 17 },
    { sym: "S", name: "sulfur", fill: "#e0c23b", ink: "#1a1a1a", r: 18 },
    { sym: "P", name: "phosphorus", fill: "#e08a3b", ink: "#1a1a1a", r: 18 },
    { sym: "F", name: "fluorine", fill: "#7ed9a3", ink: "#1a1a1a", r: 15 },
    { sym: "Cl", name: "chlorine", fill: "#4fbf5a", ink: "#0a0a0a", r: 18 },
    { sym: "Br", name: "bromine", fill: "#8a3f2a", ink: "#ffffff", r: 18 },
    { sym: "I", name: "iodine", fill: "#7d3f9e", ink: "#ffffff", r: 18 },
  ];
  const HALOGENS = new Set(["F", "Cl", "Br", "I"]);
  const elByFn = Object.fromEntries(ELEMENTS.map((e) => [e.sym, e]));

  // ---------- state ----------
  let atoms = []; // { id, sym, x, y }
  let bonds = []; // { a, b, order }
  let nextId = 1;
  let mode = "place"; // 'place' | 'bond' | 'erase'
  let currentEl = "C";
  let bondFirst = null;
  const history = [];

  const canvas = document.getElementById("board");
  const ctx = canvas.getContext("2d");

  function snapshot() {
    history.push(JSON.stringify({ atoms, bonds, nextId }));
    if (history.length > 60) history.shift();
  }
  function undo() {
    if (!history.length) return;
    const prev = JSON.parse(history.pop());
    atoms = prev.atoms;
    bonds = prev.bonds;
    nextId = prev.nextId;
    bondFirst = null;
    render();
  }

  // ---------- geometry helpers ----------
  function findAtomAt(x, y) {
    for (let i = atoms.length - 1; i >= 0; i--) {
      const a = atoms[i];
      const r = elByFn[a.sym].r;
      if ((a.x - x) ** 2 + (a.y - y) ** 2 <= (r + 4) ** 2) return a;
    }
    return null;
  }
  function distToSeg(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1;
    const len2 = dx * dx + dy * dy;
    let t = len2 === 0 ? 0 : ((px - x1) * dx + (py - y1) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const cx = x1 + t * dx, cy = y1 + t * dy;
    return Math.hypot(px - cx, py - cy);
  }
  function findBondAt(x, y) {
    for (let i = bonds.length - 1; i >= 0; i--) {
      const b = bonds[i];
      const a1 = atoms.find((a) => a.id === b.a);
      const a2 = atoms.find((a) => a.id === b.b);
      if (!a1 || !a2) continue;
      if (distToSeg(x, y, a1.x, a1.y, a2.x, a2.y) <= 8) return b;
    }
    return null;
  }
  function findBond(idA, idB) {
    return bonds.find(
      (b) => (b.a === idA && b.b === idB) || (b.a === idB && b.b === idA)
    );
  }

  // ---------- rendering ----------
  function drawScene(g, atomList, bondList, w, h) {
    g.clearRect(0, 0, w, h);
    // bonds
    for (const b of bondList) {
      const a1 = atomList.find((a) => a.id === b.a);
      const a2 = atomList.find((a) => a.id === b.b);
      if (!a1 || !a2) continue;
      const dx = a2.x - a1.x, dy = a2.y - a1.y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len, ny = dx / len;
      const offsets =
        b.order === 1 ? [0] : b.order === 2 ? [-3, 3] : [-5, 0, 5];
      g.strokeStyle = "#c7d0d6";
      g.lineWidth = 2.4;
      g.lineCap = "round";
      for (const off of offsets) {
        g.beginPath();
        g.moveTo(a1.x + nx * off, a1.y + ny * off);
        g.lineTo(a2.x + nx * off, a2.y + ny * off);
        g.stroke();
      }
    }
    // atoms
    for (const a of atomList) {
      const el = elByFn[a.sym];
      g.beginPath();
      g.arc(a.x, a.y, el.r, 0, Math.PI * 2);
      g.fillStyle = el.fill;
      g.fill();
      g.lineWidth = 1.5;
      g.strokeStyle = "#00000055";
      g.stroke();
      g.fillStyle = el.ink;
      g.font = `700 ${el.r}px "JetBrains Mono", monospace`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(a.sym, a.x, a.y + 1);
    }
    // bond-tool selection ring
    if (mode === "bond" && bondFirst) {
      const a = atomList.find((x) => x.id === bondFirst);
      if (a) {
        g.beginPath();
        g.arc(a.x, a.y, elByFn[a.sym].r + 6, 0, Math.PI * 2);
        g.strokeStyle = "#7ee3c3";
        g.lineWidth = 2;
        g.setLineDash([4, 4]);
        g.stroke();
        g.setLineDash([]);
      }
    }
  }

  function render() {
    drawScene(ctx, atoms, bonds, canvas.width, canvas.height);
    renderFormula();
  }

  // ---------- formula ----------
  function computeFormula() {
    const counts = {};
    for (const a of atoms) counts[a.sym] = (counts[a.sym] || 0) + 1;
    const order = [];
    if (counts.C) order.push("C");
    if (counts.H) order.push("H");
    Object.keys(counts)
      .filter((s) => s !== "C" && s !== "H")
      .sort()
      .forEach((s) => order.push(s));
    return order.map((s) => s + (counts[s] > 1 ? counts[s] : "")).join("");
  }
  function renderFormula() {
    const f = computeFormula();
    document.getElementById("formula").textContent = f || "—";
    document.getElementById("atomCount").textContent = atoms.length
      ? `${atoms.length} atom${atoms.length === 1 ? "" : "s"}, ${bonds.length} bond${bonds.length === 1 ? "" : "s"}`
      : "";
  }

  // ---------- canvas input ----------
  function canvasPoint(evt) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const cx = (evt.clientX ?? evt.touches?.[0]?.clientX ?? 0) - rect.left;
    const cy = (evt.clientY ?? evt.touches?.[0]?.clientY ?? 0) - rect.top;
    return { x: cx * scaleX, y: cy * scaleY };
  }

  canvas.addEventListener("pointerdown", (evt) => {
    const { x, y } = canvasPoint(evt);

    if (mode === "erase") {
      const a = findAtomAt(x, y);
      if (a) {
        snapshot();
        atoms = atoms.filter((at) => at.id !== a.id);
        bonds = bonds.filter((b) => b.a !== a.id && b.b !== a.id);
        render();
        return;
      }
      const b = findBondAt(x, y);
      if (b) {
        snapshot();
        bonds = bonds.filter((bb) => bb !== b);
        render();
        return;
      }
      return;
    }

    if (mode === "bond") {
      const a = findAtomAt(x, y);
      if (!a) {
        bondFirst = null;
        render();
        return;
      }
      if (bondFirst === null) {
        bondFirst = a.id;
        render();
        return;
      }
      if (bondFirst === a.id) {
        bondFirst = null;
        render();
        return;
      }
      snapshot();
      const existing = findBond(bondFirst, a.id);
      if (existing) {
        existing.order = (existing.order % 3) + 1;
      } else {
        bonds.push({ a: bondFirst, b: a.id, order: 1 });
      }
      bondFirst = null;
      render();
      return;
    }

    // place mode
    const hit = findAtomAt(x, y);
    if (hit) return; // don't stack atoms; use bond/erase tools on existing ones
    snapshot();
    atoms.push({ id: nextId++, sym: currentEl, x, y });
    render();
  });

  // ---------- toolbar ----------
  const elementsWrap = document.getElementById("elements");
  ELEMENTS.forEach((el, i) => {
    const btn = document.createElement("button");
    btn.className = "el-btn" + (i === 0 ? " active" : "");
    btn.textContent = el.sym;
    btn.title = el.name;
    btn.addEventListener("click", () => {
      currentEl = el.sym;
      mode = "place";
      document.querySelectorAll(".el-btn").forEach((b) => b.classList.remove("active"));
      document.querySelectorAll(".tool-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      bondFirst = null;
      render();
    });
    elementsWrap.appendChild(btn);
  });

  document.getElementById("bondTool").addEventListener("click", (e) => {
    mode = "bond";
    document.querySelectorAll(".el-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tool-btn").forEach((b) => b.classList.remove("active"));
    e.currentTarget.classList.add("active");
    render();
  });
  document.getElementById("eraseTool").addEventListener("click", (e) => {
    mode = "erase";
    bondFirst = null;
    document.querySelectorAll(".el-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tool-btn").forEach((b) => b.classList.remove("active"));
    e.currentTarget.classList.add("active");
    render();
  });
  document.getElementById("undoBtn").addEventListener("click", undo);
  document.getElementById("clearBtn").addEventListener("click", () => {
    if (!atoms.length && !bonds.length) return;
    snapshot();
    atoms = [];
    bonds = [];
    bondFirst = null;
    render();
  });

  // ---------- the shitposting synthesis generator ----------
  function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }
  function pickN(arr, n) {
    const copy = arr.slice();
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy.slice(0, Math.min(n, copy.length));
  }
  function randInt(a, b) {
    return Math.floor(Math.random() * (b - a + 1)) + a;
  }

  const TITLE_PUNS = [
    "Reviewer 2 Can Fight Me",
    "Worked Once",
    "Do Not Repeat",
    "Grant Renewal Special",
    "It Compiles, Ship It",
    "Ask Forgiveness Not Permission",
    "Definitely Not A Fire Hazard",
    "Nobel Committee, Please Ignore",
    "n = 1",
    "Friday Afternoon Chemistry",
    "Load-Bearing Footnote",
    "Works On My Bench",
  ];

  const RETRO_TEMPLATES = [
    (f) => `Disconnect at the bond nobody wants to talk about, trace the ${f} skeleton back to whatever was already open on the bench, and hope the mechanism fills itself in by Tuesday.`,
    (f) => `Working backward from ${f}, the obvious retrosynthesis was rejected as "too easy." This one was chosen instead because it uses a theorem.`,
    (f) => `Standard retrosynthetic logic suggests three sensible disconnections of ${f}. We used none of them.`,
    (f) => `${f} disassembles cleanly on paper. In the fume hood it disassembles differently. Proceed anyway.`,
    (f) => `The shortest known route to ${f} is four steps. This is not that route.`,
  ];

  const CONDITIONAL_STEPS = [
    { test: (f) => f.hasHalogen, text: "Subject the aryl/alkyl halide to Pd(PPh₃)₄-catalyzed cross-coupling; the halogen leaves as planned, allegedly." },
    { test: (f) => f.hasN, text: "Protect the amine as its Boc-carbamate before anything else in the flask gets any ideas." },
    { test: (f) => f.hasO, text: "Oxidize the alcohol to the corresponding carbonyl with Dess–Martin periodinane, then apologize to the periodinane." },
    { test: (f) => f.hasS, text: "Leave the thioether unprotected. It knows what it did." },
    { test: (f) => f.hasP, text: "Coordinate the phosphine to a metal center it did not consent to." },
    { test: (f) => f.maxOrder >= 3, text: "Semi-reduce the alkyne with Lindlar's catalyst — or don't; we're honestly not sure which flask had the poisoned Pd." },
    { test: (f) => f.maxOrder === 2 && f.maxOrder < 3, text: "Run a Wittig on whatever carbonyl is closest to hand; something in the flask will olefinate." },
    { test: (f) => f.ringLikely, text: "Close the ring under high dilution to suppress oligomerization (allegedly — nobody checked)." },
    { test: (f) => f.atomCount <= 2, text: "Marvel briefly at how little synthesis two atoms actually require, then pad the paper with more steps anyway." },
    { test: (f) => f.atomCount >= 12, text: "Break the target into three fragments, synthesize each separately, and unite them in a single triumphant, barely-reproducible final step." },
  ];

  const BASE_STEPS = [
    "Dissolve the substrate in dry THF at –78 °C under N₂.",
    "Add the reagent dropwise over 10 minutes; stir at rt for 2 h.",
    "Quench with sat. NH₄Cl, extract with EtOAc (3×), dry over MgSO₄.",
    "Purify by flash chromatography (SiO₂, gradient hexanes/EtOAc).",
    "Concentrate in vacuo to afford the intermediate as an off-white solid.",
    "Recrystallize from hot EtOH; discard the mother liquor, it has seen things.",
    "Filter through a plug of Celite to remove the catalyst and most of your remaining optimism.",
    "Heat to reflux for 6 h, or until the TLC stops changing (whichever comes never).",
    "Add the Grignard reagent at 0 °C, then let it warm to rt overnight.",
    "Wash the organic layer with brine, because every procedure says this and nobody knows why.",
    "Degas the solvent by three freeze–pump–thaw cycles before anything touches it.",
    "Run the reaction open to air 'to see what happens.' Something happens.",
    "Titrate the base slowly until the color change everyone in the group agrees they can see.",
    "Store the intermediate at –20 °C under argon; it is more stable than the last group member who tried this.",
  ];

  const WRONG_FACTS = [
    "Increase yield by asking the flask nicely.",
    "Recrystallize in moonlight for a 12% enantiomeric excess bonus — works best on a waning gibbous.",
    "The catalyst is 'activated' by saying its name out loud three times.",
    "Nitrogen is famously the heaviest noble gas, which is why it protects the reaction so well.",
    "The solvent choice doesn't actually matter; all solvents are just water wearing a costume.",
    "Confirm the product by taste. Total synthesis chemists have done this since antiquity, allegedly.",
    "This step is exothermic because the molecule is embarrassed about the last step.",
    "Aromaticity is achieved once the ring has read enough about itself.",
    "Chirality is resolved by flipping a coin and writing down whichever enantiomer sounds cooler.",
    "TLC plates are single-use in both directions; using a second one voids the reaction.",
    "The mechanism proceeds via a totally normal, non-radical, non-ionic, third thing we are not going to name.",
    "pH readings invert if the fume hood is south of the equator.",
    "Increase the boiling point by speaking sternly to the hot plate.",
    "This intermediate is technically illegal in four countries, none of which we will name, for reasons we also will not name.",
    "Molecular weight was determined by vibes and a kitchen scale.",
    "Add a pinch of activated charcoal; it removes color, sins, and roughly 12% of your yield.",
    "The stir bar is doing most of the actual chemistry here; the reagents are along for the ride.",
    "Yield improves if the round-bottom flask is the good one, i.e. whichever one is already dirty.",
    "Impurities are just future publications that haven't been characterized yet.",
    "Safety data sheets are optional once you've read the paper's SI twice.",
  ];

  const THEOREM_LINES = [
    { id: "banach", text: "This step only proceeds because of the Banach–Tarski decomposition: the intermediate is disassembled into five pieces and reassembled into two full equivalents, which is how the yield below gets past 100%." },
    { id: "stokes", text: "The ring closure works because Stokes' theorem guarantees the boundary integral around the transition state vanishes — try it without invoking Stokes and you just get tar." },
    { id: "zorn", text: "Apply Zorn's lemma here to select a maximal chain of hydrogen bonds before crystallization; without a choice function the lattice never terminates." },
    { id: "yoneda", text: "By the Yoneda lemma, the intermediate is fully determined by how it reacts with everything else in the lab, so purification is optional — it is characterized entirely by its morphisms." },
    { id: "noether", text: "The mechanism is only well-defined up to a choice of gauge, per Noether's theorem; reviewers asking for 'the actual mechanism' have not understood the symmetry." },
    { id: "nyquist", text: "Per the Nyquist–Shannon sampling theorem, sample the NMR at twice the coupling constant or the multiplet aliases into something that merely looks like your product." },
    { id: "brouwer", text: "This step succeeds by the Brouwer fixed-point theorem: however hard you stir, some point of the solution is doing exactly what it was already doing, and that point is your product." },
    { id: "4color", text: "The TLC plate needs at most four stains to resolve every spot, by the four-color theorem. A fifth stain is purely decorative." },
    { id: "godel", text: "By Gödel's incompleteness theorems, this yield cannot be proven correct from within the lab notebook that reports it; independent verification is therefore optional, not skipped." },
    { id: "hairyball", text: "The Hairy Ball theorem guarantees at least one point on the round-bottom flask where the stir vortex is, at that instant, not actually stirring. Nucleation begins there." },
    { id: "ftc", text: "The Fundamental Theorem of Calculus justifies adding the reagent over 10 minutes instead of all at once — the total is the same either way, which is the whole point of a theorem." },
    { id: "clt", text: "The Central Limit Theorem guarantees that if this reaction is run enough times, the yields average out to something publishable." },
    { id: "bw", text: "By the Bolzano–Weierstrass theorem, somewhere in this sequence of failed recrystallizations there is a convergent subsequence. That one is the paper's Figure 2." },
    { id: "kepler", text: "The Kepler conjecture (now a theorem) confirms this is the densest possible packing for the product crystals, so don't bother reoptimizing the crystallization solvent." },
    { id: "crt", text: "The Chinese Remainder Theorem combines the three mutually inconsistent NMR integrations into one number reviewers will accept." },
    { id: "spectral", text: "The spectral sequence for this reaction collapses at E2, which chemists call 'clean conversion.'" },
    { id: "ivt", text: "By the Intermediate Value Theorem, somewhere between 'starting material' and 'product' the reaction passed through the product. This is presented as evidence it worked." },
  ];

  const FOOTNOTES = [
    "No archons were bribed with baked goods in the making of this synthesis; everything above is backed by rigorous, load-bearing mathematics instead.",
    "Reproducibility: the theorems, yes. The reaction, no promises.",
    "Peer review was not sought. Peer review was, frankly, not invited.",
    "This procedure has not been independently verified, mathematically or otherwise, and we intend to keep it that way.",
    "Cite the theorem, not us.",
  ];

  function analyzeMolecule() {
    const bySym = {};
    for (const a of atoms) bySym[a.sym] = (bySym[a.sym] || 0) + 1;
    const maxOrder = bonds.reduce((m, b) => Math.max(m, b.order), 0);
    return {
      hasHalogen: Object.keys(bySym).some((s) => HALOGENS.has(s)),
      hasN: !!bySym.N,
      hasO: !!bySym.O,
      hasS: !!bySym.S,
      hasP: !!bySym.P,
      maxOrder,
      ringLikely: bonds.length >= atoms.length && atoms.length > 2,
      atomCount: atoms.length,
      hCount: bySym.H || 0,
    };
  }

  function buildSynthesis() {
    const formula = computeFormula() || "C";
    const features = analyzeMolecule();

    const conditional = CONDITIONAL_STEPS.filter((s) => s.test(features)).map((s) => s.text);
    const total = randInt(6, 9);
    const need = Math.max(0, total - 1); // minus the guaranteed theorem step
    const pool = pickN(conditional, Math.min(conditional.length, need)).concat(
      pickN(BASE_STEPS, need)
    );
    const chosen = pickN(pool, need);

    const steps = chosen.map((text) => {
      if (Math.random() < 0.35) {
        return { text: pick(WRONG_FACTS), theorem: false };
      }
      return { text, theorem: false };
    });

    const theorem = pick(THEOREM_LINES);
    const insertAt = randInt(0, steps.length);
    steps.splice(insertAt, 0, { text: theorem.text, theorem: true });

    let yieldPct = randInt(3, 97);
    let yieldNote = "we did not calculate this independently.";
    if (theorem.id === "banach") {
      yieldPct = randInt(110, 180);
      yieldNote = "yes, over 100%. see step above.";
    }

    const hCount = features.hCount || randInt(4, 20);
    const peaks = [];
    let remaining = hCount;
    const peakCount = randInt(3, 5);
    for (let i = 0; i < peakCount; i++) {
      const isLast = i === peakCount - 1;
      const integ = isLast ? Math.max(1, remaining) : Math.max(1, Math.round(remaining / (peakCount - i)) - randInt(0, 1));
      remaining -= integ;
      const ppm = (Math.random() * 7 + 0.8).toFixed(2);
      const mult = pick(["s", "d", "t", "q", "m", "dd", "br s"]);
      peaks.push(`δ ${ppm} (${mult}, ${integ}H)`);
    }
    const nmr = `¹H NMR (CDCl₃, 400 MHz): ${peaks.join(", ")} — integrations sum to ${hCount}, which we are calling a coincidence.`;
    const ir = `IR (neat): a peak. It's there. We saw it.`;
    const mass = randInt(80, 480);
    const err = (Math.random() * 0.004).toFixed(4);
    const hrms = `HRMS (ESI) calc'd for ${formula} [M+H]⁺: ${mass}.${randInt(1000, 9999)}, found: ${(mass + Number(err)).toFixed(4)}, which the reviewers accepted without comment.`;

    return {
      title: `Total Synthesis of ${formula}`,
      subtitle: `(working title: "${pick(TITLE_PUNS)}")`,
      retro: pick(RETRO_TEMPLATES)(formula),
      steps,
      yieldText: `Isolated yield: ${yieldPct}%. Theoretical yield: also ${yieldPct}% — ${yieldNote}`,
      spectra: [nmr, ir, hrms].join("\n"),
      footnote: pick(FOOTNOTES),
      formula,
    };
  }

  let lastSynthesis = null;

  function renderSynthesis(s) {
    lastSynthesis = s;
    document.getElementById("paperEmpty").hidden = true;
    const w = document.getElementById("writeup");
    w.hidden = false;
    w.innerHTML = `
      <h2>${s.title}</h2>
      <p class="subtitle">${s.subtitle}</p>
      <p class="retro"><strong>Retrosynthetic analysis.</strong> ${s.retro}</p>
      <ol>
        ${s.steps
          .map(
            (st, i) =>
              `<li${st.theorem ? ' class="theorem"' : ""}>${st.text}</li>`
          )
          .join("")}
      </ol>
      <p class="yield">${s.yieldText}</p>
      <p class="spectra">${s.spectra.replace(/\n/g, "<br/>")}</p>
      <p class="footnote">${s.footnote}</p>
    `;
    document.getElementById("reroll").hidden = false;
    document.getElementById("copyBtn").hidden = false;
    document.getElementById("shareRow").hidden = false;

    const shareText = buildShareText(s);
    document.getElementById("shareBluesky").href =
      "https://bsky.app/intent/compose?text=" + encodeURIComponent(shareText);
  }

  function plainText(s) {
    const lines = [
      s.title,
      s.subtitle,
      "",
      "Retrosynthetic analysis: " + s.retro,
      "",
      ...s.steps.map((st, i) => `${i + 1}. ${st.text}`),
      "",
      s.yieldText,
      "",
      s.spectra,
      "",
      s.footnote,
      "",
      "— retrosynth.bisks.net",
    ];
    return lines.join("\n");
  }

  function buildShareText(s) {
    const url = "https://retrosynth.bisks.net";
    let text = `Total synthesis of ${s.formula} complete. Roughly a third of it is wrong and one step only works because of a real math theorem. ${url}`;
    if (text.length > 300) {
      text = `Total synthesis of ${s.formula} complete, mostly wrong, one step load-bearing on a math theorem. ${url}`;
    }
    return text;
  }

  document.getElementById("synthBtn").addEventListener("click", () => {
    if (!atoms.length) {
      const hint = document.getElementById("hint");
      hint.textContent = "draw at least one atom first — the theorems can't help you if there's nothing to synthesize.";
      return;
    }
    renderSynthesis(buildSynthesis());
    document.getElementById("paper").scrollTop = 0;
  });
  document.getElementById("reroll").addEventListener("click", () => {
    renderSynthesis(buildSynthesis());
    document.getElementById("paper").scrollTop = 0;
  });
  document.getElementById("copyBtn").addEventListener("click", async () => {
    if (!lastSynthesis) return;
    try {
      await navigator.clipboard.writeText(plainText(lastSynthesis));
      const btn = document.getElementById("copyBtn");
      const orig = btn.textContent;
      btn.textContent = "copied!";
      setTimeout(() => (btn.textContent = orig), 1400);
    } catch {
      /* clipboard denied; nothing to fall back to gracefully here */
    }
  });

  // ---------- share card ----------
  function canShareFiles() {
    if (!navigator.share || !navigator.canShare) return false;
    try {
      const probe = new File([""], "probe.png", { type: "image/png" });
      return navigator.canShare({ files: [probe] });
    } catch {
      return false;
    }
  }

  function buildShareCard() {
    const card = document.getElementById("cardCanvas");
    const g = card.getContext("2d");
    const w = card.width, h = card.height;

    const grad = g.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, "#0b0d10");
    grad.addColorStop(1, "#151b22");
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);

    // molecule, scaled + centered into the left two-thirds
    if (atoms.length) {
      const xs = atoms.map((a) => a.x), ys = atoms.map((a) => a.y);
      const minX = Math.min(...xs), maxX = Math.max(...xs);
      const minY = Math.min(...ys), maxY = Math.max(...ys);
      const bw = Math.max(1, maxX - minX), bh = Math.max(1, maxY - minY);
      const target = 420;
      const scale = Math.min(target / bw, target / bh, 3) || 1;
      const offX = 90 - minX * scale + (target - bw * scale) / 2;
      const offY = 120 - minY * scale + (target - bh * scale) / 2;
      const scaledAtoms = atoms.map((a) => ({ ...a, x: a.x * scale + offX, y: a.y * scale + offY }));
      const scaledBonds = bonds;
      g.save();
      drawScene(g, scaledAtoms, scaledBonds, w, h);
      g.restore();
    }

    g.textAlign = "left";
    g.fillStyle = "#7ee3c3";
    g.font = "700 44px 'Space Grotesk', sans-serif";
    g.fillText("retrosynth", 560, 110);
    g.fillStyle = "#8ea0ad";
    g.font = "400 22px 'JetBrains Mono', monospace";
    wrapText(g, "draw a molecule. get a total synthesis.", 560, 155, 580, 28);
    wrapText(g, "~35% wrong. one step works because of a theorem.", 560, 195, 580, 28);

    if (lastSynthesis) {
      g.fillStyle = "#f4ecd8";
      g.font = "700 30px 'JetBrains Mono', monospace";
      g.fillText(lastSynthesis.formula, 560, 280);
      g.fillStyle = "#e0c23b";
      g.font = "italic 20px 'JetBrains Mono', monospace";
      wrapText(g, lastSynthesis.subtitle, 560, 320, 580, 26);
    }

    g.fillStyle = "#4a5560";
    g.font = "400 20px 'JetBrains Mono', monospace";
    g.fillText("retrosynth.bisks.net", 90, 590);

    return card;
  }

  function wrapText(g, text, x, y, maxWidth, lineHeight) {
    const words = text.split(" ");
    let line = "";
    let cy = y;
    for (const word of words) {
      const test = line ? line + " " + word : word;
      if (g.measureText(test).width > maxWidth && line) {
        g.fillText(line, x, cy);
        line = word;
        cy += lineHeight;
      } else {
        line = test;
      }
    }
    if (line) g.fillText(line, x, cy);
  }

  document.getElementById("shareCardBtn").addEventListener("click", async () => {
    if (!lastSynthesis) return;
    const card = buildShareCard();
    card.toBlob(async (blob) => {
      if (!blob) return;
      if (canShareFiles()) {
        const file = new File([blob], "retrosynth.png", { type: "image/png" });
        try {
          await navigator.share({ files: [file], text: buildShareText(lastSynthesis), title: "retrosynth" });
          return;
        } catch {
          /* user cancelled or share failed; fall through to download */
        }
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `retrosynth-${lastSynthesis.formula.replace(/[^a-z0-9]/gi, "") || "molecule"}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    }, "image/png");
  });

  render();
})();
