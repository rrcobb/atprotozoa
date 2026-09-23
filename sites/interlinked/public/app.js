import { buildTest } from "./lib/baseline.js";

const transcript = document.getElementById("transcript");
const beginBtn = document.getElementById("begin-btn");
const againBtn = document.getElementById("again-btn");
const statusDot = document.getElementById("status-dot");
const statusText = document.getElementById("status-text");
const resultBox = document.getElementById("result");
const resultText = document.getElementById("result-text");
const shareLink = document.getElementById("share-link");

const SITE_URL = "https://interlinked.bisks.net/";
const TYPE_MS = 16; // per character
const LINE_PAUSE_MS = 380;
const TURN_PAUSE_MS = 550;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function addLine(speaker, text, { echo = false, silence = false } = {}) {
  const row = document.createElement("p");
  row.className = "line";
  const label = document.createElement("span");
  label.className = `speaker ${speaker.toLowerCase()}`;
  label.textContent = speaker.toUpperCase() + ":";
  const body = document.createElement("span");
  body.className = "text" + (echo ? " echo" : "") + (silence ? " silence" : "");
  const cursor = document.createElement("span");
  cursor.className = "cursor";
  row.appendChild(label);
  row.appendChild(document.createTextNode(" "));
  row.appendChild(body);
  row.appendChild(cursor);
  transcript.appendChild(row);
  transcript.scrollTop = transcript.scrollHeight;
  return { row, body, cursor };
}

async function typeLine(speaker, text, opts = {}) {
  const { body, cursor } = addLine(speaker, "", opts);
  for (let i = 0; i < text.length; i++) {
    body.textContent += text[i];
    await sleep(TYPE_MS);
  }
  cursor.remove();
  await sleep(LINE_PAUSE_MS);
}

function clearTranscript() {
  transcript.innerHTML = "";
}

function setStatus(live, label) {
  statusDot.classList.toggle("live", live);
  statusText.textContent = label;
}

function buildShareText(climax) {
  const prefix = `"`;
  const suffix = `" — ${SITE_URL}`;
  const base = prefix + climax + suffix;
  if (base.length <= 300) return base;
  // Bluesky's 300-grapheme cap — trim the quoted climax, keep the url intact.
  const trimmedSuffix = `..." — ${SITE_URL}`;
  const room = 300 - prefix.length - trimmedSuffix.length;
  return prefix + climax.slice(0, Math.max(0, room)) + trimmedSuffix;
}

async function runTest() {
  beginBtn.disabled = true;
  againBtn.style.display = "none";
  resultBox.style.display = "none";
  clearTranscript();
  setStatus(true, "test in progress");

  const test = buildTest();

  await typeLine("examiner", "let's begin.");

  for (let i = 0; i < test.recitation.length; i++) {
    const line = test.recitation[i];
    await typeLine("examiner", line);
    if (i < test.recitation.length - 1) {
      await typeLine("subject", line, { echo: true });
    } else {
      await typeLine("subject", line + " ...", { echo: true });
    }
    await sleep(TURN_PAUSE_MS - LINE_PAUSE_MS > 0 ? TURN_PAUSE_MS - LINE_PAUSE_MS : 0);
  }

  await typeLine("examiner", test.interjection);
  await typeLine("subject", "...", { silence: true });
  await sleep(TURN_PAUSE_MS);

  await typeLine("examiner", test.climax);
  await typeLine("subject", "(interlinked.)", { silence: true });

  setStatus(false, "test complete");
  resultText.textContent = test.climax;
  shareLink.href =
    "https://bsky.app/intent/compose?text=" + encodeURIComponent(buildShareText(test.climax));
  resultBox.style.display = "block";
  beginBtn.disabled = false;
  beginBtn.textContent = "begin test";
  againBtn.style.display = "inline-block";
}

beginBtn.addEventListener("click", runTest);
againBtn.addEventListener("click", runTest);
