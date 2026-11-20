// neoluddite goonfuel: a bottomless feed assembled client-side from a pool of
// period vignettes. Nothing leaves the browser.
(function () {
  const scenes = [
    "Burning a CD of it. Forty minutes. The progress bar is honest.",
    "Mailing the document to New York. You will hear back in a few days.",
    "Waiting on hold with a human being who has a name tag and a cardigan.",
    "Rewinding the tape before returning it. Be kind.",
    "Looking something up by walking to the encyclopedia shelf.",
    "The dial-up handshake, in full, with the screeching, uninterrupted.",
    "Asking a stranger for directions and getting directions.",
    "A paper map, refolded wrong, immediately and forever.",
    "Calling the landline and letting it ring in an empty kitchen.",
    "Waiting for the photos to come back from the drugstore. Two are your thumb.",
    "Faxing a signature. Hearing it go through the wall.",
    "Reading the TV Guide with a highlighter, planning your whole Thursday.",
    "Saying 'no, that style isn't popular up here yet' and meaning it.",
    "A busy signal. Meaning: someone is home and talking to someone else.",
    "Driving to the store to find out if they have it. They do not have it.",
    "A mixtape, with the person's handwriting on the J-card.",
    "Buying the album, the whole album, on a Tuesday, at a store.",
    "Paying the late fee. It is two dollars. It is over.",
    "Cutting a coupon out of the Sunday paper with the good scissors.",
    "A phone that cannot do anything until you are standing next to it.",
    "Not knowing who was in that other movie until Thursday.",
    "A webpage that loads top to bottom, slowly, one gif at a time.",
    "Letting the answering machine pick up and listening to them talk.",
    "Defragmenting. Watching the little blocks. Finding peace.",
    "A man at a bank who knows your name and your mother's name.",
    "Blowing on a cartridge. It works. Nobody knows why.",
    "Passing a handwritten note about a feeling, folded into a tiny triangle.",
    "A server room the size of a closet, humming, owned by a guy named Gary.",
    "Checking your email once, in the evening, at the family computer.",
    "A local newspaper reporting the weather it can see out its own window."
  ];
  const hooks = [
    "You won't believe how slowly",
    "Hot local",
    "She's still on the line:",
    "Nobody talks about",
    "Slow, deliberate",
    "Please, just one more minute of",
    "Unfiltered, unbuffered,",
    "Thick, analog",
    "Down to one bar and still",
    "Deep, patient",
    "Barely legal, barely wired:",
    "Warm, humming, offline:",
    "Watch until the end of the hold music:",
    "Tonight only, no refresh needed:"
  ];
  const payoffs = [
    "hnnnnnnnngggggg",
    "and then we'll burn a CD of it",
    "anyway, that's a few days out",
    "it was a different time up here",
    "nobody had a screenshot, so it just happened",
    "the whole thing fit on one floppy, barely",
    "you had to be there, and you were there",
    "no one was ranking it",
    "it did not need to be summarized",
    "it stayed on the one computer",
    "you'll hear back",
    "and that was the whole internet, for the evening",
    "you could just stop. you could just go outside.",
    "it was not trying to keep you"
  ];
  const handles = ["dialtone_dan", "mildred.fax", "gary_in_the_closet", "tapewinder", "blockbuster_widow", "mapfolder", "the_good_scissors", "oregontrail_97", "ellie.landline", "xerox_priest", "cardigan_bank", "burner_of_cds"];
  const tags = ["#FloppyCore", "#HoldMusic", "#OffPeakMinutes", "#NoRefresh", "#PostalBrain", "#LocalOnly", "#ThursdayOrLater", "#Analog", "#Cardigan"];
  const milestones = [
    "you have been scrolling for a while. nothing is wrong. nothing is being served.",
    "you are now barely-pre-datacenter",
    "this feed is a closed loop of 30 scenes. it simply sounds endless",
    "a gentle reminder: the monitor is warm",
    "you could burn a CD of this. you could not, but you could",
    "scroll depth achieved. a librarian nods slowly"
  ];

  const feed = document.getElementById("feed");
  const hud = document.getElementById("hud");
  const autoBtn = document.getElementById("auto");
  const speedSel = document.getElementById("speed");
  const sentinel = document.getElementById("sentinel");
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const fmtN = (n) => (n >= 1000 ? (n / 1000).toFixed(1) + "k" : String(n));

  let count = 0;
  const started = Date.now();

  function addCard() {
    count++;
    if (count % 12 === 0) {
      const m = document.createElement("div");
      m.className = "milestone";
      m.textContent = pick(milestones);
      feed.appendChild(m);
    }
    const c = document.createElement("article");
    c.className = "card";
    const meta = document.createElement("div");
    meta.className = "meta";
    const who = document.createElement("span");
    who.textContent = "@" + pick(handles);
    const tag = document.createElement("span");
    tag.className = "tag";
    tag.textContent = pick(tags);
    meta.append(who, tag);
    const p = document.createElement("p");
    p.textContent = pick(hooks) + " " + pick(scenes).replace(/^./, (ch) => ch.toLowerCase());
    const pay = document.createElement("p");
    pay.style.color = "var(--hot)";
    pay.style.fontStyle = "italic";
    pay.textContent = pick(payoffs);
    const bar = document.createElement("div");
    bar.className = "bar";
    let likes = 40 + Math.floor(Math.random() * 9000);
    const like = document.createElement("button");
    like.textContent = "♥ " + fmtN(likes);
    like.addEventListener("click", () => {
      const on = like.classList.toggle("liked");
      like.textContent = "♥ " + fmtN(likes + (on ? 1 : 0));
    });
    const rep = document.createElement("span");
    rep.textContent = "↻ " + fmtN(Math.floor(likes / 7));
    const rep2 = document.createElement("span");
    rep2.textContent = "✉ by mail, in a few days";
    bar.append(like, rep, rep2);
    c.append(meta, p, pay, bar);
    feed.appendChild(c);
  }

  function fill() {
    // Keep a few screens of cards below the viewport; the feed has no end.
    while (document.documentElement.scrollHeight - window.scrollY < window.innerHeight * 4) addCard();
  }

  new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) fill(); }, { rootMargin: "1500px" }).observe(sentinel);
  window.addEventListener("scroll", fill, { passive: true });

  // Timer-based autoscroller: ticks every 16ms, moving speed px/second.
  // Fractional scroll positions are lost on some browsers, so carry the remainder.
  let timer = null, last = 0, carry = 0;
  function tick() {
    const now = performance.now();
    const dt = Math.min(now - last, 100);
    last = now;
    carry += (Number(speedSel.value) * dt) / 1000;
    const step = Math.floor(carry);
    if (step > 0) {
      carry -= step;
      window.scrollBy(0, step);
    }
    fill();
  }
  function setAuto(on) {
    autoBtn.classList.toggle("on", on);
    autoBtn.setAttribute("aria-pressed", String(on));
    autoBtn.textContent = on ? "❚❚ stop autoscroll" : "▶ autoscroll";
    clearInterval(timer);
    timer = null;
    if (on) {
      last = performance.now();
      carry = 0;
      timer = setInterval(tick, 16);
    }
  }
  autoBtn.addEventListener("click", () => setAuto(!timer));
  // Taking over with wheel, touch, or keys is a vote to stop.
  ["wheel", "touchstart", "keydown"].forEach((ev) =>
    window.addEventListener(ev, () => { if (timer) setAuto(false); }, { passive: true })
  );

  setInterval(() => {
    const s = Math.floor((Date.now() - started) / 1000);
    hud.textContent = count + " posts · " + Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
  }, 1000);

  fill();
})();
