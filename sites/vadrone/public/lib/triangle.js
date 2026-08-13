// triangle.js — a draggable point inside a triangle, read out as barycentric
// weights over three labeled vertices (Valence / Arousal / Dominance). Pure
// DOM + math, no audio in here.

export const VERTS = {
  v: { x: 200, y: 26 },
  a: { x: 34, y: 324 },
  d: { x: 366, y: 324 },
};

export function weightsToPoint(w) {
  return {
    x: w.v * VERTS.v.x + w.a * VERTS.a.x + w.d * VERTS.d.x,
    y: w.v * VERTS.v.y + w.a * VERTS.a.y + w.d * VERTS.d.y,
  };
}

// Barycentric coordinates of p w.r.t. VERTS, clamped so a point dragged
// outside the triangle snaps to the nearest edge/corner in weight-space
// (cheap and good enough — a true nearest-point projection isn't needed for
// a drag handle).
export function pointToWeights(p) {
  const { v: V, a: A, d: D } = VERTS;
  const denom = (A.y - D.y) * (V.x - D.x) + (D.x - A.x) * (V.y - D.y);
  let w1 = ((A.y - D.y) * (p.x - D.x) + (D.x - A.x) * (p.y - D.y)) / denom;
  let w2 = ((D.y - V.y) * (p.x - D.x) + (V.x - D.x) * (p.y - D.y)) / denom;
  let w3 = 1 - w1 - w2;
  w1 = Math.max(0, w1);
  w2 = Math.max(0, w2);
  w3 = Math.max(0, w3);
  const sum = w1 + w2 + w3 || 1;
  return { v: w1 / sum, a: w2 / sum, d: w3 / sum };
}

export function createTriangle(svg, dot, onChange) {
  let current = { v: 1 / 3, a: 1 / 3, d: 1 / 3 };

  function render() {
    const p = weightsToPoint(current);
    dot.setAttribute("cx", p.x);
    dot.setAttribute("cy", p.y);
  }

  function setFromClientXY(clientX, clientY) {
    const rect = svg.getBoundingClientRect();
    const vb = svg.viewBox.baseVal;
    const x = ((clientX - rect.left) / rect.width) * vb.width + vb.x;
    const y = ((clientY - rect.top) / rect.height) * vb.height + vb.y;
    current = pointToWeights({ x, y });
    render();
    onChange(current);
  }

  let dragging = false;
  svg.addEventListener("pointerdown", (e) => {
    dragging = true;
    svg.setPointerCapture(e.pointerId);
    setFromClientXY(e.clientX, e.clientY);
  });
  svg.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    setFromClientXY(e.clientX, e.clientY);
  });
  svg.addEventListener("pointerup", () => {
    dragging = false;
  });
  svg.addEventListener("pointercancel", () => {
    dragging = false;
  });

  render();
  return {
    get: () => current,
    set(w) {
      current = w;
      render();
      onChange(current);
    },
  };
}
