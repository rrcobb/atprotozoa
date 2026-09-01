import { buildExhibit } from "./lib/gallery.js";
import { buildCatalog } from "./lib/products.js";

const SITE_URL = "https://reygiftshop.bisks.net/";
const CART_KEY = "reygiftshop:cart";

const statusEl = document.getElementById("status");
const shopSection = document.getElementById("shop");
const shopGrid = document.getElementById("shopGrid");

const cartToggle = document.getElementById("cartToggle");
const cartCount = document.getElementById("cartCount");
const cartDrawer = document.getElementById("cartDrawer");
const cartScrim = document.getElementById("cartScrim");
const cartClose = document.getElementById("cartClose");
const cartItemsEl = document.getElementById("cartItems");
const cartTotalAmt = document.getElementById("cartTotalAmt");
const checkoutBtn = document.getElementById("checkoutBtn");

const receiptModal = document.getElementById("receiptModal");
const receiptClose = document.getElementById("receiptClose");
const receiptPaper = document.getElementById("receiptPaper");
const receiptShare = document.getElementById("receiptShare");
const receiptDownload = document.getElementById("receiptDownload");
const receiptNative = document.getElementById("receiptNative");
const shareCanvas = document.getElementById("shareCanvas");
const shareBluesky = document.getElementById("shareBluesky");

let cart = [];
let lastReceiptText = "";

function el(tag, opts, ...children) {
  const node = document.createElement(tag);
  if (opts) {
    for (const [k, v] of Object.entries(opts)) {
      if (k === "class") node.className = v;
      else if (k === "text") node.textContent = v;
      else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v);
    }
  }
  for (const c of children) if (c) node.appendChild(c);
  return node;
}

function money(n) {
  return "$" + n.toFixed(2);
}

function loadCart() {
  try {
    const raw = localStorage.getItem(CART_KEY);
    cart = raw ? JSON.parse(raw) : [];
  } catch (_) {
    cart = [];
  }
}
function saveCart() {
  try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch (_) {}
}

function cartTotal() {
  return cart.reduce((sum, item) => sum + item.price, 0);
}

function renderCart() {
  cartCount.textContent = String(cart.length);
  cartTotalAmt.textContent = money(cartTotal());
  checkoutBtn.disabled = cart.length === 0;
  cartItemsEl.replaceChildren();
  if (!cart.length) {
    cartItemsEl.appendChild(el("div", { id: "cartEmpty", text: "nothing acquired yet." }));
    return;
  }
  cart.forEach((item, i) => {
    const line = el(
      "div",
      { class: "cart-line" },
      el("img", { src: item.workImage, alt: "" }),
      el(
        "div",
        { class: "li-body" },
        el("div", { class: "li-title", text: `${item.typeName} — “${item.workTitle}”` }),
        el("div", { class: "li-meta", text: `after ${item.workArtist}, ${item.workYear}` }),
      ),
      el("div", { class: "li-price", text: money(item.price) }),
      el("button", { class: "li-remove", "aria-label": "remove", text: "✕", onclick: () => removeFromCart(i) }),
    );
    cartItemsEl.appendChild(line);
  });
}

function addToCart(product) {
  cart.push(product);
  saveCart();
  renderCart();
}
function removeFromCart(i) {
  cart.splice(i, 1);
  saveCart();
  renderCart();
}

function openCart() { cartDrawer.classList.add("open"); cartScrim.classList.add("open"); }
function closeCart() { cartDrawer.classList.remove("open"); cartScrim.classList.remove("open"); }
cartToggle.addEventListener("click", () => (cartDrawer.classList.contains("open") ? closeCart() : openCart()));
cartClose.addEventListener("click", closeCart);
cartScrim.addEventListener("click", closeCart);

function mockupFor(product) {
  const base = el("div", { class: "base" });
  const wrap = el("div", { class: "mockup", "data-type": product.typeKey }, base);
  if (product.typeKey === "tote") {
    base.appendChild(el("div", { class: "strap left" }));
    base.appendChild(el("div", { class: "strap right" }));
    base.appendChild(el("img", { class: "print", src: product.workImage, alt: "", loading: "lazy" }));
  } else if (product.typeKey === "mug") {
    base.appendChild(el("div", { class: "handle" }));
    base.appendChild(el("img", { class: "print", src: product.workImage, alt: "", loading: "lazy" }));
  } else if (product.typeKey === "postcard") {
    base.appendChild(el("img", { class: "print", src: product.workImage, alt: "", loading: "lazy" }));
    base.appendChild(el("div", { class: "stamp" }));
  } else {
    base.appendChild(el("img", { class: "print", src: product.workImage, alt: "", loading: "lazy" }));
  }
  return wrap;
}

function renderShop(catalog) {
  catalog.forEach((product) => {
    const btn = el("button", { class: "add", text: "add to cart" });
    btn.addEventListener("click", () => {
      addToCart(product);
      btn.textContent = "added ✓";
      btn.classList.add("added");
      setTimeout(() => {
        btn.textContent = "add to cart";
        btn.classList.remove("added");
      }, 900);
    });
    const card = el(
      "div",
      { class: "card" },
      mockupFor(product),
      el("h3", { text: product.typeName }),
      el("p", { class: "from", text: `after “${product.workTitle}” — ${product.workArtist}, ${product.workYear}` }),
      el("p", { class: "tagline", text: product.tagline }),
      el("p", { class: "price", text: money(product.price) }),
      btn,
    );
    shopGrid.appendChild(card);
  });
  shopSection.hidden = false;
}

function buildReceiptText(items, total) {
  const lines = [
    "REYGIFTSHOP — ACQUISITIONS RECEIPT",
    ...items.map((it) => `${it.typeName} — “${it.workTitle}”  ${money(it.price)}`),
    `TOTAL  ${money(total)}`,
    `${SITE_URL}`,
  ];
  return lines.join("\n");
}

function renderReceiptPaper(items, total) {
  receiptPaper.replaceChildren();
  receiptPaper.appendChild(el("h3", { text: "reygiftshop" }));
  receiptPaper.appendChild(el("p", { class: "r-sub", text: "acquisitions department — official receipt" }));
  receiptPaper.appendChild(el("hr"));
  items.forEach((it) => {
    receiptPaper.appendChild(
      el(
        "div",
        { class: "receipt-line" },
        el("span", { class: "rl-name", text: `${it.typeName} — “${it.workTitle}”` }),
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
  receiptPaper.appendChild(
    el("p", { class: "receipt-note", text: "not a real transaction. no refunds, no items, no regrets." }),
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
  bg.addColorStop(0, "#26200f");
  bg.addColorStop(0.55, "#16110c");
  bg.addColorStop(1, "#0a0704");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign = "left";
  ctx.fillStyle = "#f2d9a1";
  ctx.font = `800 46px ${mono}`;
  ctx.fillText("reygiftshop", 60, 90);
  ctx.fillStyle = "#a8977f";
  ctx.font = `400 18px ${mono}`;
  ctx.fillText("the gift shop for reygallery", 60, 122);

  const px = W - 460, py = 70, pw = 400, ph = H - 140;
  ctx.fillStyle = "#f3ece0";
  ctx.fillRect(px, py, pw, ph);
  ctx.fillStyle = "#2a2016";
  ctx.textAlign = "center";
  ctx.font = `700 24px ${mono}`;
  ctx.fillText("ACQUISITIONS RECEIPT", px + pw / 2, py + 44);
  ctx.strokeStyle = "#b9a97f";
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(px + 24, py + 62);
  ctx.lineTo(px + pw - 24, py + 62);
  ctx.stroke();

  ctx.textAlign = "left";
  ctx.font = `400 16px ${mono}`;
  let ly = py + 100;
  const shown = items.slice(0, 8);
  shown.forEach((it) => {
    ctx.fillStyle = "#2a2016";
    ctx.fillText(`${it.typeName} — "${it.workTitle}"`.slice(0, 40), px + 24, ly);
    ctx.textAlign = "right";
    ctx.fillText(("$" + it.price.toFixed(2)), px + pw - 24, ly);
    ctx.textAlign = "left";
    ly += 30;
  });
  if (items.length > shown.length) {
    ctx.fillStyle = "#6b5c3f";
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
  ctx.fillStyle = "#2a2016";
  ctx.fillText("TOTAL", px + 24, ly + 46);
  ctx.textAlign = "right";
  ctx.fillText("$" + total.toFixed(2), px + pw - 24, ly + 46);
  ctx.textAlign = "left";

  ctx.fillStyle = "#6b5c3f";
  ctx.font = `italic 13px ${mono}`;
  wrapCanvasText(ctx, "not a real transaction — no refunds, no items, no regrets.", px + 24, py + ph - 30, pw - 48, 18);

  ctx.fillStyle = "#a8977f";
  ctx.font = `400 18px ${mono}`;
  ctx.textAlign = "left";
  wrapCanvasText(ctx, "the museum store for @rey-notnecessarily.bsky.social's art,", 60, 200, 380, 26);
  ctx.fillText("assembled live from their own repo.", 60, 226);

  ctx.fillStyle = "#f2d9a1";
  ctx.font = `700 20px ${mono}`;
  ctx.fillText("reygiftshop.bisks.net", 60, H - 50);
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

function openReceipt() {
  if (!cart.length) return;
  const items = cart.slice();
  const total = cartTotal();
  renderReceiptPaper(items, total);
  drawReceiptCard(items, total);
  lastReceiptText =
    `just acquired ${items.length} item${items.length === 1 ? "" : "s"} from the reygiftshop gift shop ` +
    `(total: ${money(total)}) — ${SITE_URL}`;
  receiptShare.href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(lastReceiptText);
  receiptModal.hidden = false;
  closeCart();
}
function closeReceipt() { receiptModal.hidden = true; }

checkoutBtn.addEventListener("click", openReceipt);
receiptClose.addEventListener("click", closeReceipt);
receiptModal.addEventListener("click", (e) => { if (e.target === receiptModal) closeReceipt(); });

receiptDownload.addEventListener("click", () => {
  shareCanvas.toBlob((blob) => {
    if (!blob) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "reygiftshop-receipt.png";
    a.click();
    URL.revokeObjectURL(a.href);
  }, "image/png");
});

if (canShareFiles()) {
  receiptNative.style.display = "";
  receiptNative.addEventListener("click", () => {
    shareCanvas.toBlob(async (blob) => {
      if (!blob) return;
      const file = new File([blob], "reygiftshop-receipt.png", { type: "image/png" });
      try {
        await navigator.share({ files: [file], text: lastReceiptText, title: "reygiftshop" });
      } catch (_) {
        // cancelled or unsupported — no-op
      }
    }, "image/png");
  });
}

async function main() {
  loadCart();
  renderCart();

  shareBluesky.href =
    "https://bsky.app/intent/compose?text=" +
    encodeURIComponent(`the gift shop for @rey-notnecessarily.bsky.social's museum, reygallery — ${SITE_URL}`);

  try {
    const exhibit = await buildExhibit((step) => {
      statusEl.textContent = step;
    });

    if (!exhibit.selfPortrait && exhibit.pieces.length === 0) {
      statusEl.textContent = "the artist hasn't hung anything yet, so there's nothing to print merch from — check back later.";
      return;
    }

    const catalog = buildCatalog(exhibit);
    statusEl.remove();
    renderShop(catalog);
  } catch (err) {
    console.error(err);
    statusEl.textContent = "couldn't open the shop (" + (err && err.message ? err.message : "unknown error") + ") — reload to try again.";
    statusEl.classList.add("error");
  }
}

main();
