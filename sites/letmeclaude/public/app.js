// let me claude that for you: the question rides in ?q=, the page replays it
// being typed into a chat box, then hands over a link to ask for real.
const $ = (id) => document.getElementById(id);
const ORIGIN = "https://letmeclaude.bisks.net/";
const params = new URLSearchParams(location.search);
const question = (params.get("q") || "").trim();

function linkFor(q) {
  return ORIGIN + "?q=" + encodeURIComponent(q);
}

function setupMaker() {
  const q = $("q");
  $("make").addEventListener("click", () => {
    const text = q.value.trim();
    if (!text) { q.focus(); return; }
    const url = linkFor(text);
    $("url").value = url;
    $("preview").href = "?q=" + encodeURIComponent(text);
    $("share").href = "https://bsky.app/intent/compose?text=" +
      encodeURIComponent("let me claude that for you: " + url);
    $("result").hidden = false;
  });
  $("copy").addEventListener("click", async () => {
    $("url").select();
    try { await navigator.clipboard.writeText($("url").value); $("copy").textContent = "copied ✓"; }
    catch { document.execCommand("copy"); $("copy").textContent = "copied ✓"; }
    setTimeout(() => ($("copy").textContent = "copy"), 1500);
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function play() {
  $("maker").hidden = true;
  $("player").hidden = false;
  const cursor = $("cursor"), typed = $("typed"), send = $("send");
  const win = document.querySelector(".win");
  // aim the cursor at the composer, type, then glide to the send button
  await sleep(500);
  cursor.style.left = "30%"; cursor.style.top = "78%";
  await sleep(1100);
  for (const ch of question) {
    typed.textContent += ch;
    await sleep(35 + Math.random() * 70);
  }
  await sleep(600);
  const wr = win.getBoundingClientRect(), sr = send.getBoundingClientRect();
  cursor.style.left = (sr.left - wr.left + sr.width / 2) + "px";
  cursor.style.top = (sr.top - wr.top + sr.height / 2) + "px";
  await sleep(1100);
  send.classList.add("press");
  await sleep(200);
  send.classList.remove("press");
  const m = document.createElement("div");
  m.className = "m";
  m.textContent = question;
  $("msgs").appendChild(m);
  typed.textContent = "";
  await sleep(900);
  $("verdict").textContent = "that's it. that's the whole thing.";
  $("verdict").hidden = false;
  $("ask").href = "https://claude.ai/new?q=" + encodeURIComponent(question);
  $("after").hidden = false;
}

if (question) play(); else setupMaker();
