// The HUD, drawn crisp at screen resolution over the chunky low-res view:
// the cursor's aim ring, a nose marker, corner brackets on jets in view, the
// lock box (with who posted it), speed/altitude tapes and a little radar.
// The post card that bursts out of a hit is HTML: a rounded box that blooms
// from the burst on screen and settles at the bottom of the view.

import * as THREE from './vendor/three.module.js';

const GREEN = '#b9f6c8', AMBER = '#ffcf73', DIM = 'rgba(185, 246, 200, 0.55)';

const css = `
  #hud { position: fixed; inset: 0; width: 100vw; height: 100vh; pointer-events: none; display: none; }
  body.fly #hud { display: block; }
  body.fly, body.fly canvas#view { cursor: none !important; }
  .lock-tag { position: fixed; left: 0; top: 0; display: none; align-items: center; gap: 8px; padding: 4px 10px 4px 4px;
    border-radius: 999px; background: rgba(10, 14, 12, .62); backdrop-filter: blur(4px); color: ${GREEN};
    font: 12px/1.25 system-ui, -apple-system, "Segoe UI", sans-serif; pointer-events: none; white-space: nowrap;
    border: 1px solid rgba(185, 246, 200, .35); }
  .lock-tag.on { display: flex; }
  .lock-tag img, .card .av { width: 26px; height: 26px; border-radius: 50%; object-fit: cover; background: #334; flex: none; }
  .lock-tag b { color: #eafff0; font-weight: 650; }
  .lock-tag span { opacity: .75; }
  .card { position: fixed; left: 50%; bottom: 26px; width: min(500px, calc(100vw - 32px)); box-sizing: border-box;
    padding: 14px 16px 12px; border-radius: 18px; background: rgba(14, 16, 22, .86); backdrop-filter: blur(10px);
    color: #eceef4; font: 14px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif;
    box-shadow: 0 0 0 1px rgba(255, 255, 255, .08), 0 10px 40px rgba(0, 0, 0, .45);
    transform-origin: 50% 50%; pointer-events: auto; }
  .card.burst { animation: glow 1.4s ease-out; }
  @keyframes glow { 0% { box-shadow: 0 0 0 2px rgba(255, 220, 140, .9), 0 0 60px 24px rgba(255, 150, 60, .75); }
    100% { box-shadow: 0 0 0 1px rgba(255, 255, 255, .08), 0 10px 40px rgba(0, 0, 0, .45); } }
  .card .head { display: flex; align-items: center; gap: 10px; }
  .card .av { width: 38px; height: 38px; }
  .card .who { flex: 1; min-width: 0; }
  .card .who b { display: block; font-weight: 650; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .card .who span { opacity: .6; font-size: 12.5px; }
  .card .x { border: 0; background: rgba(255, 255, 255, .08); color: inherit; width: 28px; height: 28px; border-radius: 50%;
    cursor: pointer; font: 16px/1 system-ui; flex: none; }
  .card .x:hover { background: rgba(255, 255, 255, .16); }
  .card p { margin: 10px 0 8px; white-space: pre-wrap; overflow-wrap: anywhere; max-height: 22vh; overflow: auto; }
  .card .media { display: grid; gap: 4px; margin: 8px 0; border-radius: 12px; overflow: hidden; }
  .card .media.n2, .card .media.n3, .card .media.n4 { grid-template-columns: 1fr 1fr; }
  .card .media img { width: 100%; height: 120px; object-fit: cover; display: block; background: #222; }
  .card .media.n1 img { height: auto; max-height: 200px; }
  .card .link { display: flex; gap: 10px; align-items: center; margin: 8px 0; padding: 8px; border-radius: 12px;
    background: rgba(255, 255, 255, .06); font-size: 13px; }
  .card .link img { width: 56px; height: 56px; border-radius: 8px; object-fit: cover; }
  .card .note { font-size: 12px; opacity: .6; margin: 4px 0; }
  .card .hint { font-size: 11.5px; opacity: .55; margin-top: 6px; }
  .card kbd { font: inherit; padding: 0 4px; border: 1px solid rgba(255, 255, 255, .3); border-radius: 4px; }
  .card .demo { display: inline-block; font-size: 11px; padding: 1px 6px; border-radius: 6px; background: rgba(255, 207, 115, .18); color: ${AMBER}; margin-left: 6px; }
`;

function ago(ms) {
  const s = Math.max(0, (Date.now() - ms) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

export class Hud {
  constructor({ onClose }) {
    const style = document.createElement('style');
    style.textContent = css;
    document.head.append(style);
    this.canvas = el('canvas');
    this.canvas.id = 'hud';
    this.g = this.canvas.getContext('2d');
    this.tag = el('div', 'lock-tag');
    this.tagImg = el('img');
    this.tagImg.alt = '';
    this.tagText = el('div');
    this.tag.append(this.tagImg, this.tagText);
    document.body.append(this.canvas, this.tag);
    this.card = null;
    this.cardPost = null;
    this.onClose = onClose;
    this.mouse = { x: innerWidth / 2, y: innerHeight / 2 };
    this.v = new THREE.Vector3();
    this.status = '';
  }

  resize() {
    const r = devicePixelRatio || 1;
    this.canvas.width = Math.round(innerWidth * r);
    this.canvas.height = Math.round(innerHeight * r);
  }

  // Screen position (CSS px) of a world point, or null when behind the camera.
  project(p, camera) {
    const v = this.v.copy(p).project(camera);
    if (v.z > 1) return null;
    return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight, edge: Math.abs(v.x) > 1 || Math.abs(v.y) > 1 };
  }

  draw({ camera, player, traffic, combat, people, fly }) {
    const g = this.g, r = devicePixelRatio || 1;
    if (this.canvas.width !== Math.round(innerWidth * r)) this.resize();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (!fly) { this.tag.classList.remove('on'); return; }
    g.setTransform(r, 0, 0, r, 0, 0);
    g.lineWidth = 1.5;
    g.font = '12px ui-monospace, Consolas, monospace';
    g.shadowColor = 'rgba(0, 0, 0, .6)';
    g.shadowBlur = 3;
    const c = player.craft;

    // Nose marker: where the jet is pointing, far ahead.
    const nose = this.project(c.pos.clone().addScaledVector(c.fwd, 3000), camera);
    if (nose) {
      g.strokeStyle = DIM;
      g.beginPath();
      g.moveTo(nose.x - 14, nose.y); g.lineTo(nose.x - 5, nose.y); g.lineTo(nose.x, nose.y + 5); g.lineTo(nose.x + 5, nose.y); g.lineTo(nose.x + 14, nose.y);
      g.stroke();
    }

    // Brackets on every jet in view; the candidate's shrinks as the lock builds.
    let tagAt = null;
    const off = [];
    for (const j of traffic.jets) {
      const s = this.project(j.craft.pos, camera);
      if (!s || s.edge) { off.push(j); continue; }
      const d = j.craft.pos.distanceTo(camera.position);
      const isLock = j === combat.locked, isCand = j === combat.candidate;
      const size = isLock ? 22 : isCand ? 40 - 18 * Math.min(1, combat.lockT / 0.5) : Math.max(7, 14 - d / 800);
      g.strokeStyle = isLock ? AMBER : isCand ? GREEN : j.post.read ? 'rgba(160, 200, 255, .6)' : DIM;
      g.lineWidth = isLock ? 2 : 1.5;
      corners(g, s.x, s.y, size);
      if (isLock) {
        g.beginPath(); g.arc(s.x, s.y, 4, 0, Math.PI * 2); g.stroke();
        g.fillStyle = AMBER;
        g.fillText(`${(d / 1000).toFixed(1)} km`, s.x + size + 6, s.y + size);
        tagAt = { x: s.x, y: s.y - size - 10, j };
      } else if (d < 4000) {
        g.fillStyle = DIM;
        g.fillText(`${(d / 1000).toFixed(1)}`, s.x + size + 4, s.y + 4);
      }
    }
    this.lockTag(tagAt, people);
    this.offscreen(g, off, camera, combat);

    // Aim ring at the cursor.
    const m = this.mouse;
    g.strokeStyle = GREEN;
    g.lineWidth = 1.5;
    g.beginPath(); g.arc(m.x, m.y, 11, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.moveTo(m.x - 18, m.y); g.lineTo(m.x - 13, m.y); g.moveTo(m.x + 13, m.y); g.lineTo(m.x + 18, m.y);
    g.moveTo(m.x, m.y - 18); g.lineTo(m.x, m.y - 13); g.moveTo(m.x, m.y + 13); g.lineTo(m.x, m.y + 18); g.stroke();
    g.fillStyle = GREEN; g.fillRect(m.x - 1, m.y - 1, 2, 2);

    // Speed and altitude.
    g.fillStyle = GREEN;
    const W = innerWidth, H = innerHeight;
    g.font = '13px ui-monospace, Consolas, monospace';
    g.textAlign = 'right';
    g.fillText(`${Math.round(c.speed * 3.6)} km/h`, W / 2 - 150, H / 2);
    g.fillText(`THR ${Math.round(player.throttle * 100)}%`, W / 2 - 150, H / 2 + 18);
    g.textAlign = 'left';
    g.fillText(`${Math.round(c.pos.y)} m`, W / 2 + 150, H / 2);
    const heading = (Math.atan2(c.fwd.x, -c.fwd.z) * 180 / Math.PI + 360) % 360;
    g.textAlign = 'center';
    g.fillText(`${String(Math.round(heading)).padStart(3, '0')}°`, W / 2, 30);
    g.font = '12px system-ui, -apple-system, "Segoe UI", sans-serif';
    g.fillStyle = DIM;
    g.fillText(this.status, W / 2, H - 10 - (this.card ? 0 : 0));
    g.textAlign = 'left';
    this.radar(g, c, traffic, combat);
  }

  // Jets out of view: small arrows at the screen edge pointing the way to
  // the nearest few (and always to the locked one).
  offscreen(g, jets, camera, combat) {
    const inv = new THREE.Matrix4().copy(camera.matrixWorldInverse);
    const list = jets.map(j => ({ j, d: j.craft.pos.distanceTo(camera.position) })).sort((a, b) => a.d - b.d)
      .filter((x, i) => i < 3 || x.j === combat.locked);
    const cx = innerWidth / 2, cy = innerHeight / 2, rx = cx - 40, ry = cy - 40;
    for (const { j, d } of list) {
      const v = this.v.copy(j.craft.pos).applyMatrix4(inv);   // camera space: -z ahead
      let a = Math.atan2(-v.y, v.x);
      if (v.z > 0 && Math.abs(v.x) < 1e-3 && Math.abs(v.y) < 1e-3) a = Math.PI / 2;
      const cs = Math.cos(a), sn = Math.sin(a);
      const k = Math.min(rx / Math.max(Math.abs(cs), 1e-3), ry / Math.max(Math.abs(sn), 1e-3));
      const x = cx + cs * k, y = cy + sn * k;
      g.save();
      g.translate(x, y);
      g.rotate(a);
      g.fillStyle = j === combat.locked ? AMBER : j.post.read ? '#a0c8ff' : GREEN;
      g.globalAlpha = j === combat.locked ? 1 : 0.75;
      g.beginPath(); g.moveTo(9, 0); g.lineTo(-5, -6); g.lineTo(-2, 0); g.lineTo(-5, 6); g.fill();
      g.restore();
      g.fillStyle = DIM;
      g.textAlign = 'center';
      g.fillText(`${(d / 1000).toFixed(1)}`, x - cs * 18, y - sn * 18 + 4);
      g.textAlign = 'left';
    }
  }

  radar(g, c, traffic, combat) {
    const R = 62, x0 = R + 22, y0 = innerHeight - R - 22, range = 9000;
    g.fillStyle = 'rgba(8, 14, 10, .45)';
    g.strokeStyle = DIM;
    g.lineWidth = 1;
    g.beginPath(); g.arc(x0, y0, R, 0, Math.PI * 2); g.fill(); g.stroke();
    g.beginPath(); g.arc(x0, y0, R / 2, 0, Math.PI * 2); g.stroke();
    const a = Math.atan2(c.fwd.x, c.fwd.z);
    const cs = Math.cos(a), sn = Math.sin(a);
    for (const j of traffic.jets) {
      const dx = j.craft.pos.x - c.pos.x, dz = j.craft.pos.z - c.pos.z;
      // Rotate so the nose points up the radar (right is to the right).
      const rx = -(dx * cs - dz * sn), ry = -(dx * sn + dz * cs);
      const d = Math.hypot(rx, ry);
      if (d > range) continue;
      const px = x0 + rx / range * R, py = y0 + ry / range * R;
      g.fillStyle = j === combat.locked ? AMBER : j.post.read ? '#a0c8ff' : GREEN;
      g.fillRect(px - 2, py - 2, 4, 4);
    }
    g.fillStyle = GREEN;
    g.beginPath(); g.moveTo(x0, y0 - 5); g.lineTo(x0 - 4, y0 + 4); g.lineTo(x0 + 4, y0 + 4); g.fill();
  }

  lockTag(at, people) {
    if (!at) { this.tag.classList.remove('on'); this.tagFor = null; return; }
    const j = at.j;
    if (this.tagFor !== j) {
      this.tagFor = j;
      const [handle, name, avatar] = people[j.post.did] || [j.post.did, '', ''];
      this.tagImg.src = avatar || '';
      this.tagImg.style.display = avatar ? '' : 'none';
      this.tagText.replaceChildren(el('b', '', name || handle), document.createTextNode(' '), el('span', '', `@${handle} · ${ago(j.post.at)}`));
    }
    this.tag.classList.add('on');
    const w = this.tag.offsetWidth, h = this.tag.offsetHeight;
    const x = Math.min(Math.max(8, at.x - w / 2), innerWidth - w - 8), y = Math.max(8, at.y - h);
    this.tag.style.transform = `translate(${x}px, ${y}px)`;
  }

  // The post, bursting out of the hit at screen point `from`.
  showCard(post, people, from) {
    this.closeCard(true);
    const [handle, name, avatar] = people[post.did] || [post.did, '', ''];
    const card = el('div', 'card');
    const head = el('div', 'head');
    const av = el('img', 'av');
    av.alt = '';
    if (avatar) av.src = avatar; else av.style.display = 'none';
    const who = el('div', 'who');
    const nameEl = el('b', '', name || handle);
    if (post.demo) nameEl.append(el('span', 'demo', 'demo'));
    who.append(nameEl, el('span', '', `@${handle} · ${ago(post.at)}`));
    const x = el('button', 'x', '×');
    x.title = 'Close (C)';
    x.addEventListener('click', e => { e.stopPropagation(); this.closeCard(); });
    head.append(av, who, x);
    card.append(head);
    if (post.text) card.append(el('p', '', post.text));
    const m = post.media;
    if (m?.images?.length) {
      const box = el('div', `media n${m.images.length}`);
      for (const im of m.images) { const i = el('img'); i.src = im.src; i.alt = im.alt; i.loading = 'eager'; box.append(i); }
      card.append(box);
      if (m.video) card.append(el('div', 'note', 'video'));
    }
    if (m?.link) {
      const l = el('div', 'link');
      if (m.link.thumb) { const i = el('img'); i.src = m.link.thumb; i.alt = ''; l.append(i); }
      l.append(el('div', '', m.link.title));
      card.append(l);
    }
    if (m?.quote) card.append(el('div', 'note', 'quotes another post'));
    const hint = el('div', 'hint');
    hint.innerHTML = '<kbd>Enter</kbd> open the thread · <kbd>C</kbd> close · <kbd>Esc</kbd> back to the feed';
    if (post.demo) hint.textContent = 'A demo post: no thread to open. C to close, Esc back to the feed.';
    card.append(hint);
    document.body.append(card);
    // Bloom from the burst, then settle in place at the bottom.
    const r = card.getBoundingClientRect();
    const dx = from.x - (r.left + r.width / 2), dy = from.y - (r.top + r.height / 2);
    card.animate([
      { transform: `translate(calc(-50% + ${dx}px), ${dy}px) scale(0.04)`, opacity: 0.2, borderRadius: '50%' },
      { transform: `translate(calc(-50% + ${dx * 0.75}px), ${dy * 0.75}px) scale(0.5)`, opacity: 1, borderRadius: '40px', offset: 0.25 },
      { transform: 'translate(-50%, 0) scale(1.04)', offset: 0.8 },
      { transform: 'translate(-50%, 0) scale(1)', opacity: 1, borderRadius: '18px' },
    ], { duration: 650, easing: 'cubic-bezier(.2, .8, .3, 1)' });
    card.style.transform = 'translate(-50%, 0)';
    card.classList.add('burst');
    this.card = card;
    this.cardPost = post;
  }

  closeCard(quick = false) {
    const c = this.card;
    if (!c) return;
    this.card = null;
    this.cardPost = null;
    if (quick) { c.remove(); return; }
    c.animate([{ opacity: 1, transform: 'translate(-50%, 0) scale(1)' }, { opacity: 0, transform: 'translate(-50%, 20px) scale(0.96)' }], { duration: 220 }).onfinish = () => c.remove();
    this.onClose?.();
  }
}

function corners(g, x, y, s) {
  const k = s * 0.45;
  g.beginPath();
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    g.moveTo(x + sx * s, y + sy * (s - k));
    g.lineTo(x + sx * s, y + sy * s);
    g.lineTo(x + sx * (s - k), y + sy * s);
  }
  g.stroke();
}
