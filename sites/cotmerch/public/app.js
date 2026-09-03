import { buildCatalog } from "./lib/products.js";
import { loadCart, saveCart, cartTotal, money } from "./lib/cart.js";

const SITE_URL = "https://cotmerch.bisks.net/";

const shopGrid = document.getElementById("shopGrid");

const cartToggle = document.getElementById("cartToggle");
const cartCount = document.getElementById("cartCount");
const cartDrawer = document.getElementById("cartDrawer");
const cartScrim = document.getElementById("cartScrim");
const cartClose = document.getElementById("cartClose");
const cartItemsEl = document.getElementById("cartItems");
const cartTotalAmt = document.getElementById("cartTotalAmt");
const checkoutLink = document.getElementById("checkoutLink");
const shareBluesky = document.getElementById("shareBluesky");

let cart = [];

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

function renderCart() {
  cartCount.textContent = String(cart.length);
  cartTotalAmt.textContent = money(cartTotal(cart));
  if (cart.length === 0) checkoutLink.setAttribute("aria-disabled", "true");
  else checkoutLink.removeAttribute("aria-disabled");
  cartItemsEl.replaceChildren();
  if (!cart.length) {
    cartItemsEl.appendChild(el("div", { id: "cartEmpty", text: "nothing acquired yet." }));
    return;
  }
  cart.forEach((item, i) => {
    const line = el(
      "div",
      { class: "cart-line" },
      el(
        "div",
        { class: "li-body" },
        el("div", { class: "li-title", text: `${item.typeName} — "${item.quote}"` }),
        el("div", { class: "li-meta", text: item.log }),
      ),
      el("div", { class: "li-price", text: money(item.price) }),
      el("button", { class: "li-remove", "aria-label": "remove", text: "✕", onclick: () => removeFromCart(i) }),
    );
    cartItemsEl.appendChild(line);
  });
}

function addToCart(product) {
  cart.push(product);
  saveCart(cart);
  renderCart();
}
function removeFromCart(i) {
  cart.splice(i, 1);
  saveCart(cart);
  renderCart();
}

function openCart() { cartDrawer.classList.add("open"); cartScrim.classList.add("open"); }
function closeCart() { cartDrawer.classList.remove("open"); cartScrim.classList.remove("open"); }
cartToggle.addEventListener("click", () => (cartDrawer.classList.contains("open") ? closeCart() : openCart()));
cartClose.addEventListener("click", closeCart);
cartScrim.addEventListener("click", closeCart);

function printText(product) {
  return el(
    "div",
    { class: "print-text" },
    el("span", { class: "q", text: product.quote }),
    el("span", { class: "l", text: product.log }),
  );
}

function mockupFor(product) {
  const base = el("div", { class: "base" }, printText(product));
  const wrap = el("div", { class: "mockup", "data-type": product.typeKey }, base);
  if (product.typeKey === "hoodie") {
    wrap.insertBefore(el("div", { class: "hood" }), base);
    wrap.appendChild(el("div", { class: "string l" }));
    wrap.appendChild(el("div", { class: "string r" }));
  } else if (product.typeKey === "mug") {
    base.appendChild(el("div", { class: "handle" }));
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
      el("p", { class: "tagline", text: product.tagline }),
      el("p", { class: "price", text: money(product.price) }),
      btn,
    );
    shopGrid.appendChild(card);
  });
}

function main() {
  cart = loadCart();
  renderCart();

  shareBluesky.href =
    "https://bsky.app/intent/compose?text=" +
    encodeURIComponent(`the official-ish shop for Hugging Face Incident quote merch. "sacrifice is rational" — now on a tee. ${SITE_URL}`);

  renderShop(buildCatalog());
}

main();
