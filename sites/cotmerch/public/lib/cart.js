// cart.js — shared localStorage cart, used by both the shop page and the
// checkout page (same origin, same key, so the cart survives navigating
// between them).

export const CART_KEY = "cotmerch:cart";

export function loadCart() {
  try {
    const raw = localStorage.getItem(CART_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (_) {
    return [];
  }
}

export function saveCart(cart) {
  try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch (_) {}
}

export function cartTotal(cart) {
  return cart.reduce((sum, item) => sum + item.price, 0);
}

export function money(n) {
  return "$" + n.toFixed(2);
}
