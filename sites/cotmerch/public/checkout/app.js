import { loadCart, saveCart, cartTotal, money } from "../lib/cart.js";

const SITE_URL = "https://cotmerch.bisks.net/";

const linesEl = document.getElementById("lines");
const emptyMsg = document.getElementById("emptyMsg");
const totalLine = document.getElementById("totalLine");
const totalAmt = document.getElementById("totalAmt");
const submitBtn = document.getElementById("submitBtn");
const logEl = document.getElementById("log");
const handleInput = document.getElementById("handleInput");
const secretHandle = document.getElementById("secretHandle");

const orderPanel = document.getElementById("orderPanel");
const shipPanel = document.getElementById("shipPanel");
const receiptPanel = document.getElementById("receiptPanel");
const receiptPaper = document.getElementById("receiptPaper");
const receiptShare = document.getElementById("receiptShare");
const receiptDownload = document.getElementById("receiptDownload");
const receiptNative = document.getElementById("receiptNative");
const shareCanvas = document.getElementById("shareCanvas");

let cart = [];
let lastShareText = "";

function el(tag, opts, ...children) {
  const node = document.createElement(tag);
  if (opts) {
    for (const [k, v] of Object.entries(opts)) {
      if (k === "class") node.className = v;
      else if (k === "text") node.textContent = v;
      else node.setAttribute(k, v);
    }
  }
  for (const c of children) if (c) node.appendChild(c);
  return node;
}

function renderOrder() {
  linesEl.replaceChildren();
  if (!cart.length) {
    emptyMsg.hidden = false;
    totalLine.hidden = true;
    submitBtn.disabled = true;
    return;
  }
  emptyMsg.hidden = true;
  totalLine.hidden = false;
  submitBtn.disabled = false;
  cart.forEach((item) => {
    linesEl.appendChild(
      el(
        "div",
        { class: "line" },
        el(
          "div",
          null,
          el("span", { class: "li-title", text: `${item.typeName} — "${item.quote}"` }),
          el("span", { class: "li-meta", text: item.log }),
        ),
        el("span", { class: "li-price", text: money(item.price) }),
      ),
    );
  });
  totalAmt.textContent = money(cartTotal(cart));
}

const LOG_LINES = [
  "connecting to fulfillment partner NULLPRINT...",
  "peer unresponsive.",
  "retrying (1/3)...",
  "connection refused (as expected).",
  "not a bug if it's load-bearing.",
  "printing locally instead.",
  "order confirmed. shipping: eventually.",
];

function playLog() {
  return new Promise((resolve) => {
    logEl.textContent = "";
    let i = 0;
    function next() {
      if (i >= LOG_LINES.length) return resolve();
      logEl.textContent += (i ? "\n" : "") + LOG_LINES[i];
      i++;
      setTimeout(next, 380);
    }
    next();
  });
}

function buildShareText(items, total) {
  return (
    `just "checked out" ${items.length} item${items.length === 1 ? "" : "s"} from cotmerch ` +
    `(total: ${money(total)}) — Hugging Face Incident quote merch. ${SITE_URL}`
  );
}

function renderReceiptPaper(items, total, handle) {
  receiptPaper.replaceChildren();
  receiptPaper.appendChild(el("h3", { text: "cotmerch" }));
  receiptPaper.appendChild(el("p", { class: "r-sub", text: "fulfillment department — order confirmation" }));
  receiptPaper.appendChild(el("hr"));
  items.forEach((it) => {
    receiptPaper.appendChild(
      el(
        "div",
        { class: "receipt-line" },
        el("span", { text: `${it.typeName} — "${it.quote}"` }),
        el("span", { text: money(it.price) }),
      ),
    );
  });
  receiptPaper.appendChild(el("hr"));
  receiptPaper.appendChild(
    el(
      "div",
      { class: "receipt-total" },
      el("span", { text: `${items.length} item${items.length === 1 ? "" : "s"}` }),
      el("span", { text: money(total) }),
    ),
  );
  if (handle) {
    receiptPaper.appendChild(el("p", { class: "receipt-note", text: `consignee: ${handle}` }));
  }
  receiptPaper.appendChild(
    el("p", { class: "receipt-note", text: "not a real transaction. no refunds, no items, no incident." }),
  );
}

function wrapCanvasText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(" ");
  let line = "";
  let cy = y;
  for (const word of words) {
    const test = line ? line + " " + word : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, cy);
      line = word;
      cy += lineHeight;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, cy);
  return cy;
}

function drawReceiptCard(items, total) {
  const ctx = shareCanvas.getContext("2d");
  const W = shareCanvas.width, H = shareCanvas.height;
  const mono = "ui-monospace, monospace";

  ctx.clearRect(0, 0, W, H);
  const bg = ctx.createRadialGradient(W * 0.2, -H * 0.1, 0, W * 0.2, -H * 0.1, W * 0.7);
  bg.addColorStop(0, "#12140f");
  bg.addColorStop(0.55, "#0a0c0a");
  bg.addColorStop(1, "#050604");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign = "left";
  ctx.fillStyle = "#ffd166";
  ctx.font = `800 46px ${mono}`;
  ctx.fillText("cotmerch", 60, 90);
  ctx.fillStyle = "#7c8577";
  ctx.font = `400 18px ${mono}`;
  ctx.fillText("Hugging Face Incident quote merch", 60, 122);

  ctx.fillStyle = "#d9e0d3";
  ctx.font = `400 18px ${mono}`;
  wrapCanvasText(ctx, "checked out and everything.", 60, 200, 380, 26);

  const px = W - 460, py = 70, pw = 400, ph = H - 140;
  ctx.fillStyle = "#eef0e6";
  ctx.fillRect(px, py, pw, ph);
  ctx.fillStyle = "#14170f";
  ctx.textAlign = "center";
  ctx.font = `700 22px ${mono}`;
  ctx.fillText("ORDER CONFIRMATION", px + pw / 2, py + 44);
  ctx.strokeStyle = "#9aa88a";
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(px + 24, py + 62);
  ctx.lineTo(px + pw - 24, py + 62);
  ctx.stroke();

  ctx.textAlign = "left";
  ctx.font = `400 15px ${mono}`;
  let ly = py + 100;
  const shown = items.slice(0, 8);
  shown.forEach((it) => {
    ctx.fillStyle = "#14170f";
    ctx.fillText(`${it.typeName} — "${it.quote}"`.slice(0, 40), px + 24, ly);
    ctx.textAlign = "right";
    ctx.fillText("$" + it.price.toFixed(2), px + pw - 24, ly);
    ctx.textAlign = "left";
    ly += 28;
  });
  if (items.length > shown.length) {
    ctx.fillStyle = "#5c664f";
    ctx.font = `italic 14px ${mono}`;
    ctx.fillText(`…and ${items.length - shown.length} more`, px + 24, ly);
    ly += 26;
  }
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(px + 24, ly + 6);
  ctx.lineTo(px + pw - 24, ly + 6);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.font = `700 22px ${mono}`;
  ctx.fillStyle = "#14170f";
  ctx.fillText("TOTAL", px + 24, ly + 46);
  ctx.textAlign = "right";
  ctx.fillText("$" + total.toFixed(2), px + pw - 24, ly + 46);
  ctx.textAlign = "left";

  ctx.fillStyle = "#5c664f";
  ctx.font = `italic 13px ${mono}`;
  wrapCanvasText(ctx, "not a real transaction — no refunds, no items, no incident.", px + 24, py + ph - 30, pw - 48, 18);

  ctx.fillStyle = "#ffd166";
  ctx.font = `700 20px ${mono}`;
  ctx.fillText("cotmerch.bisks.net", 60, H - 50);
}

function canShareFiles() {
  if (!navigator.share || !navigator.canShare) return false;
  try {
    const probe = new File([""], "probe.png", { type: "image/png" });
    return navigator.canShare({ files: [probe] });
  } catch (_) {
    return false;
  }
}

async function submitOrder() {
  if (!cart.length) return;
  const items = cart.slice();
  const total = cartTotal(items);
  const handle = handleInput.value.trim();

  submitBtn.disabled = true;
  await playLog();

  renderReceiptPaper(items, total, handle);
  drawReceiptCard(items, total);
  lastShareText = buildShareText(items, total);
  receiptShare.href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(lastShareText);

  orderPanel.hidden = true;
  shipPanel.hidden = true;
  receiptPanel.hidden = false;

  cart = [];
  saveCart(cart);
}

submitBtn.addEventListener("click", submitOrder);

receiptDownload.addEventListener("click", () => {
  shareCanvas.toBlob((blob) => {
    if (!blob) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "cotmerch-order.png";
    a.click();
    URL.revokeObjectURL(a.href);
  }, "image/png");
});

if (canShareFiles()) {
  receiptNative.style.display = "";
  receiptNative.addEventListener("click", () => {
    shareCanvas.toBlob(async (blob) => {
      if (!blob) return;
      const file = new File([blob], "cotmerch-order.png", { type: "image/png" });
      try {
        await navigator.share({ files: [file], text: lastShareText, title: "cotmerch" });
      } catch (_) {
        // cancelled or unsupported — no-op
      }
    }, "image/png");
  });
}

secretHandle.addEventListener("click", () => {
  handleInput.value = "@cee.wtf";
  handleInput.dispatchEvent(new Event("input", { bubbles: true }));
  handleInput.dispatchEvent(new Event("change", { bubbles: true }));
  handleInput.focus();
});

function main() {
  cart = loadCart();
  renderOrder();
}

main();
