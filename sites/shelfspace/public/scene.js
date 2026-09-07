// scene.js — the 3D library. Freestanding bookcases in parallel rows (real
// library stacks, not a single infinite wall), each shelf greedily packed
// with book meshes sized/colored/labeled from the CSV row they came from.
//
// No OrbitControls addon: a small hand-rolled spherical orbit + WASD walk is
// enough for "mouse drag to orbit, scroll to approach, walk between aisles"
// and keeps the only import this site needs to "three" itself.
//
// One shared BoxGeometry(1,1,1) is scaled per book (mesh.scale) rather than
// building unique geometry per book — cheap even at a few hundred books.
// Face order on an unsegmented THREE.BoxGeometry is [+x,-x,+y,-y,+z,-z]; a
// book's local axes are x = spine thickness (shelf direction), y = height,
// z = depth (front-to-back). That makes +z the spine (thin rectangle, the
// face you see on the shelf) and +x the front cover (tall rectangle, what
// you see once it's pulled out and turned to face you) — matching a real
// book's proportions without any per-book custom geometry.

import * as THREE from "three";
import { hashString, hashColor, formatKind } from "./util.js";

const CASE_WIDTH = 2.7;
const CASE_DEPTH = 0.46;
const SHELF_COUNT = 5;
const SHELF_H = 0.34;
const CASE_HEIGHT = SHELF_COUNT * SHELF_H + 0.16;
const SHELF_INNER_W = CASE_WIDTH - 0.14;
const AISLE = 2.4;
const BOOK_GAP = 0.006;

const WOOD_DARK = "#5b3f2a";
const WOOD_MID = "#7a5535";
const PAGE_COLOR = "#e9e0c8";

function bookDims(book) {
  const h1 = hashString(book.title + "|h");
  const h2 = hashString(book.authors + "|w");
  const h3 = hashString(book.title + book.isbn + "|d");
  const kind = formatKind(book.format);
  if (kind === "audio") {
    // A CD-style audiobook case: squat and wide rather than tall and narrow
    // — the same footprint on the shelf, but it reads as a different object
    // at a glance, not just a book with a label.
    const height = 0.135 + (h1 % 100) / 100 * 0.02; // 0.135 - 0.155
    const width = 0.15 + (h2 % 100) / 100 * 0.04; // 0.15 - 0.19
    const depth = 0.155 + (h3 % 100) / 100 * 0.015;
    return { height, width, depth };
  }
  const height = 0.205 + (h1 % 100) / 100 * 0.055; // 0.205 - 0.26
  const width = 0.095 + (h2 % 100) / 100 * 0.055; // 0.095 - 0.15
  const depth = 0.145 + (h3 % 100) / 100 * 0.02; // 0.145 - 0.165
  return { height, width, depth };
}

function wrapText(ctx, text, maxWidth) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = "";
  for (const w of words) {
    const test = cur ? cur + " " + w : w;
    if (ctx.measureText(test).width > maxWidth && cur) {
      lines.push(cur);
      cur = w;
    } else {
      cur = test;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

function readableInk(bgColor) {
  const m = /hsl\(\s*[\d.]+\s*,\s*[\d.]+%\s*,\s*([\d.]+)%\s*\)/.exec(bgColor);
  const light = m ? parseFloat(m[1]) : 50;
  return light > 55 ? "#241a10" : "#f4ecd8";
}

// The spine texture: what a book shows standing on the shelf. Always drawn
// from the CSV row's own title/author — a fetched cover only ever supplies
// a background tint (its dominant color), never text, so a book with no
// cover looks exactly as trustworthy as one with a cover.
function spineTexture(book, bg) {
  const w = 96, h = 420;
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  // a soft vertical shade for a cloth-binding feel
  const grad = ctx.createLinearGradient(0, 0, w, 0);
  grad.addColorStop(0, "rgba(0,0,0,0.18)");
  grad.addColorStop(0.15, "rgba(255,255,255,0.10)");
  grad.addColorStop(0.85, "rgba(0,0,0,0.05)");
  grad.addColorStop(1, "rgba(0,0,0,0.22)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  const ink = readableInk(bg);
  ctx.strokeStyle = ink;
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(10, 22); ctx.lineTo(w - 10, 22); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(10, h - 22); ctx.lineTo(w - 10, h - 22); ctx.stroke();
  ctx.globalAlpha = 1;

  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.rotate(Math.PI / 2);
  ctx.fillStyle = ink;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "700 30px Georgia, 'Times New Roman', serif";
  const titleLines = wrapText(ctx, book.title, h - 70).slice(0, 3);
  const authorLine = book.authors;
  const totalH = titleLines.length * 34;
  titleLines.forEach((line, i) => {
    ctx.fillText(line, 0, -totalH / 2 + i * 34 + 17 - 26);
  });
  ctx.font = "italic 20px Georgia, 'Times New Roman', serif";
  ctx.globalAlpha = 0.85;
  ctx.fillText(authorLine, 0, totalH / 2 + 8);
  ctx.globalAlpha = 1;
  ctx.restore();

  if (book.stars) {
    ctx.font = "16px sans-serif";
    ctx.fillStyle = ink;
    ctx.textAlign = "center";
    ctx.fillText("★".repeat(Math.round(book.stars)), w / 2, h - 8);
  }

  if (formatKind(book.format) === "audio") {
    ctx.font = "700 13px sans-serif";
    ctx.fillStyle = ink;
    ctx.textAlign = "center";
    ctx.globalAlpha = 0.75;
    ctx.fillText("A U D I O B O O K", w / 2, 14);
    ctx.globalAlpha = 1;
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

// The cover face: a real Open Library cover image when one loaded, otherwise
// a "tasteful procedural edition" — a flat tint plus the CSV's own title and
// author, never an invented title or borrowed artwork. Split into a plain
// canvas builder (also used for the 2D detail-panel <img>, via
// proceduralCoverDataUrl below) and a THREE.CanvasTexture wrapper.
function procCoverCanvas(book, bg) {
  const w = 320, h = 480;
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  const ink = readableInk(bg);
  ctx.strokeStyle = ink;
  ctx.globalAlpha = 0.7;
  ctx.lineWidth = 3;
  ctx.strokeRect(16, 16, w - 32, h - 32);
  ctx.lineWidth = 1;
  ctx.strokeRect(24, 24, w - 48, h - 48);
  ctx.globalAlpha = 1;

  // a quiet, deterministic decorative motif so procedural covers aren't
  // all identical rectangles — a few rings sized off the title hash.
  const seed = hashString(book.title + book.authors);
  ctx.globalAlpha = 0.16;
  ctx.strokeStyle = ink;
  for (let i = 0; i < 3; i++) {
    const r = 30 + ((seed >>> (i * 5)) % 90);
    ctx.beginPath();
    ctx.arc(w / 2, h * 0.32, r, 0, Math.PI * 2);
    ctx.lineWidth = 6;
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  ctx.fillStyle = ink;
  ctx.textAlign = "center";
  ctx.font = "700 30px Georgia, 'Times New Roman', serif";
  const lines = wrapText(ctx, book.title, w - 70).slice(0, 5);
  let y = h * 0.58 - (lines.length - 1) * 18;
  for (const line of lines) {
    ctx.fillText(line, w / 2, y);
    y += 36;
  }
  ctx.font = "italic 22px Georgia, 'Times New Roman', serif";
  ctx.globalAlpha = 0.85;
  ctx.fillText(book.authors, w / 2, y + 20);
  ctx.globalAlpha = 1;

  return c;
}

function procCoverTexture(book, bg) {
  const tex = new THREE.CanvasTexture(procCoverCanvas(book, bg));
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Used by app.js for the 2D detail-panel <img> when a book has no fetched
// cover — the exact same procedural art the 3D cover face shows.
export function proceduralCoverDataUrl(book) {
  const bg = book._coverColor || hashColor(book.title + book.authors);
  return procCoverCanvas(book, bg).toDataURL("image/png");
}

export function initScene(canvas) {
  // preserveDrawingBuffer: the share button grabs a screenshot straight off
  // this canvas (the actual rendered room, not a generated graphic) — off by
  // default in three.js for performance, needed here for that to work.
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#241b13");
  scene.fog = new THREE.Fog("#241b13", 9, 26);

  const camera = new THREE.PerspectiveCamera(58, 1, 0.05, 100);

  scene.add(new THREE.HemisphereLight("#fbe7c6", "#2a1d12", 0.65));
  const lamp1 = new THREE.PointLight("#ffcf9b", 8, 16, 2);
  lamp1.position.set(0, 3.2, 2);
  scene.add(lamp1);
  const lamp2 = new THREE.PointLight("#ffdca8", 5, 18, 2);
  lamp2.position.set(0, 3, -6);
  scene.add(lamp2);

  const floorMat = new THREE.MeshStandardMaterial({ color: "#4a3320", roughness: 0.95 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), floorMat);
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

  const rugMat = new THREE.MeshStandardMaterial({ color: "#7a2f2f", roughness: 1 });
  const rug = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 5), rugMat);
  rug.rotation.x = -Math.PI / 2;
  rug.position.set(0, 0.005, 3.5);
  scene.add(rug);

  const geo = new THREE.BoxGeometry(1, 1, 1);
  const edgeMat = new THREE.MeshStandardMaterial({ color: PAGE_COLOR, roughness: 0.85 });
  const backMat = new THREE.MeshStandardMaterial({ color: "#3a2a1c", roughness: 0.9 });

  const bookGroup = new THREE.Group();
  scene.add(bookGroup);
  const caseGroup = new THREE.Group();
  scene.add(caseGroup);

  const entries = new Map(); // id -> { mesh, book, home: {pos,quat}, state, materials }
  const hitMeshes = [];

  function buildCase(x, z, facingPositiveZ) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    if (!facingPositiveZ) group.rotation.y = Math.PI;

    const frameMat = new THREE.MeshStandardMaterial({ color: WOOD_DARK, roughness: 0.75 });
    const side = new THREE.Mesh(new THREE.BoxGeometry(0.06, CASE_HEIGHT, CASE_DEPTH), frameMat);
    side.position.set(-CASE_WIDTH / 2, CASE_HEIGHT / 2, 0);
    group.add(side);
    const side2 = side.clone();
    side2.position.x = CASE_WIDTH / 2;
    group.add(side2);
    const top = new THREE.Mesh(new THREE.BoxGeometry(CASE_WIDTH, 0.06, CASE_DEPTH), frameMat);
    top.position.set(0, CASE_HEIGHT, 0);
    group.add(top);
    const bottom = top.clone();
    bottom.position.y = 0.03;
    group.add(bottom);
    const back = new THREE.Mesh(
      new THREE.BoxGeometry(CASE_WIDTH, CASE_HEIGHT, 0.03),
      new THREE.MeshStandardMaterial({ color: WOOD_MID, roughness: 0.9 }),
    );
    back.position.set(0, CASE_HEIGHT / 2, -CASE_DEPTH / 2 + 0.015);
    group.add(back);

    for (let i = 1; i < SHELF_COUNT; i++) {
      const shelf = new THREE.Mesh(new THREE.BoxGeometry(SHELF_INNER_W, 0.03, CASE_DEPTH - 0.03), frameMat);
      shelf.position.set(0, i * SHELF_H, 0);
      group.add(shelf);
    }
    caseGroup.add(group);
    return group;
  }

  // Returns { x, z, facing } for the k-th bookcase, arranged in parallel
  // rows facing +z with a walkable aisle between each row.
  function caseSlot(k, casesPerRow) {
    const row = Math.floor(k / casesPerRow);
    const col = k % casesPerRow;
    const rowWidth = casesPerRow * CASE_WIDTH;
    const x = -rowWidth / 2 + CASE_WIDTH / 2 + col * CASE_WIDTH;
    const z = -6 - row * (CASE_DEPTH + AISLE);
    return { x, z };
  }

  let sortedBooks = [];
  let matchSet = null; // Set of ids currently matching a filter, or null = show all
  const rowLights = []; // one warm point light per aisle, so deep rows aren't left in the fog

  function clearBooks() {
    for (const { mesh } of entries.values()) {
      bookGroup.remove(mesh);
      mesh.material.forEach((m) => {
        if (m.map) m.map.dispose();
      });
    }
    entries.clear();
    hitMeshes.length = 0;
    for (const child of [...caseGroup.children]) caseGroup.remove(child);
    for (const light of rowLights) scene.remove(light);
    rowLights.length = 0;
  }

  // Lays out every book in `books` order into cases/shelves, greedily
  // packing each shelf until the next book's spine width would overflow it.
  // opts.leanFeatured (set by app.js when arrange === "rating"): 5-star books
  // get pulled proud of the shelf line and canted outward, the way a
  // bookseller angles a staff pick — a permanent resting pose for this
  // arrangement, not a temporary animation like the pull-out interaction.
  function setBooks(books, opts = {}) {
    clearBooks();
    sortedBooks = books;
    if (!books.length) return { caseCount: 0, roomDepth: 12 };

    // Rough capacity estimate to size the room, refined by the real greedy
    // pack below (which is what actually places books).
    const avgSpine = 0.12;
    const perShelf = Math.max(4, Math.floor(SHELF_INNER_W / avgSpine));
    const perCase = perShelf * SHELF_COUNT;
    const estCases = Math.max(1, Math.ceil(books.length / perCase));
    const casesPerRow = Math.min(estCases, Math.max(3, Math.round(Math.sqrt(estCases * 1.6))));

    let caseIdx = -1, shelfIdx = SHELF_COUNT, cursorX = 0;
    let currentCase = null;

    for (const book of books) {
      const dims = bookDims(book);
      if (shelfIdx >= SHELF_COUNT || cursorX + dims.width > SHELF_INNER_W) {
        shelfIdx++;
        if (shelfIdx >= SHELF_COUNT || !currentCase) {
          caseIdx++;
          const slot = caseSlot(caseIdx, casesPerRow);
          currentCase = buildCase(slot.x, slot.z, true);
          shelfIdx = 0;
        }
        cursorX = -SHELF_INNER_W / 2;
      }

      const bg = book._coverColor || hashColor(book.title + book.authors);
      const kind = formatKind(book.format);
      // Audio gets a glossy plastic case instead of a cloth spine; ebooks
      // render as an ordinary book (an earlier translucent "digital ghost"
      // treatment for ebooks was cut — dave.9000ish.uk found it produced odd
      // visual artifacts on the shelf).
      const spineTraits = kind === "audio"
        ? { roughness: 0.15, metalness: 0.15 }
        : { roughness: 0.7 };
      const coverTraits = kind === "audio"
        ? { roughness: 0.2, metalness: 0.15 }
        : { roughness: 0.6 };
      const spineMat = new THREE.MeshStandardMaterial({ map: spineTexture(book, bg), ...spineTraits });
      const coverMat = new THREE.MeshStandardMaterial({
        map: book._coverImage
          ? (() => {
              const t = new THREE.Texture(book._coverImage);
              t.colorSpace = THREE.SRGBColorSpace;
              t.needsUpdate = true;
              return t;
            })()
          : procCoverTexture(book, bg),
        ...coverTraits,
      });
      const materials = [coverMat, backMat, edgeMat, edgeMat, spineMat, backMat];

      const mesh = new THREE.Mesh(geo, materials);
      mesh.scale.set(dims.width, dims.height, dims.depth);
      const y = shelfIdx * SHELF_H + dims.height / 2 + 0.02;
      const localPos = new THREE.Vector3(cursorX + dims.width / 2, y, CASE_DEPTH / 2 - dims.depth / 2 - 0.01);
      currentCase.updateMatrixWorld();
      const worldPos = localPos.clone().applyMatrix4(currentCase.matrixWorld);
      let worldQuat = currentCase.quaternion.clone();

      const featured = opts.leanFeatured && book.stars >= 5;
      if (featured) {
        const dir = new THREE.Vector3(0, 0, 1).applyQuaternion(worldQuat);
        worldPos.addScaledVector(dir, dims.depth * 1.7);
        const cant = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.36);
        worldQuat = worldQuat.clone().multiply(cant);
        coverMat.emissive.setRGB(0.22, 0.14, 0.03);
        coverMat.emissiveIntensity = 0.9;
      }

      mesh.position.copy(worldPos);
      mesh.quaternion.copy(worldQuat);
      mesh.userData.id = book.id;
      bookGroup.add(mesh);
      hitMeshes.push(mesh);

      entries.set(book.id, {
        mesh,
        book,
        materials,
        home: { pos: worldPos.clone(), quat: worldQuat.clone() },
        state: "shelved", // shelved | pulling | pulled | returning
        dims,
        featured,
      });

      cursorX += dims.width + BOOK_GAP;
    }

    const rows = Math.ceil((caseIdx + 1) / casesPerRow);
    for (let r = 0; r < rows; r++) {
      const light = new THREE.PointLight("#ffcf9b", 4.5, 9, 2);
      light.position.set(0, 2.4, -6 - r * (CASE_DEPTH + AISLE) + AISLE / 2);
      scene.add(light);
      rowLights.push(light);
    }
    const roomDepth = 6 + rows * (CASE_DEPTH + AISLE) + 4;
    rug.position.z = 3.2;
    return { caseCount: caseIdx + 1, roomDepth, rows, casesPerRow };
  }

  // Swaps in a real cover texture (and re-tinted spine) once one finishes
  // fetching — books render immediately with procedural art and upgrade in
  // place, they never wait on the network to appear on the shelf.
  function applyCover(id, img, dominantColor) {
    const entry = entries.get(id);
    if (!entry) return;
    entry.book._coverImage = img;
    entry.book._coverColor = dominantColor || entry.book._coverColor;
    const bg = entry.book._coverColor || hashColor(entry.book.title + entry.book.authors);

    const oldSpine = entry.materials[4].map;
    entry.materials[4].map = spineTexture(entry.book, bg);
    entry.materials[4].needsUpdate = true;
    if (oldSpine) oldSpine.dispose();

    const oldCover = entry.materials[0].map;
    const t = new THREE.Texture(img);
    t.colorSpace = THREE.SRGBColorSpace;
    t.needsUpdate = true;
    entry.materials[0].map = t;
    entry.materials[0].needsUpdate = true;
    if (oldCover) oldCover.dispose();
  }

  function applyFilter(predicate) {
    matchSet = predicate ? new Set(sortedBooks.filter(predicate).map((b) => b.id)) : null;
    for (const entry of entries.values()) {
      const match = !matchSet || matchSet.has(entry.book.id);
      // Only touch the cover (0) and spine (4) materials — those are unique
      // per book. Materials 1/2/3/5 (back cover, page edges) are shared
      // instances reused across every book to save texture memory, so
      // tinting them here would dim every book on the shelf at once.
      entry.materials[0].color.setScalar(match ? 1 : 0.3);
      entry.materials[4].color.setScalar(match ? 1 : 0.3);
      // An active search makes its matches actually glow (a warm emissive
      // rim), not just leaves non-matches dimmer — the room should read as
      // "these books are lit up," not "the rest went dark." Falls back to
      // each book's own resting emissive (lit for a leaned-out 5-star book,
      // dark otherwise) once the search clears, rather than flattening
      // everything to black.
      const glow = matchSet && match;
      // Resting emissive: a leaned-out 5-star cover stays warm amber,
      // everything else stays dark — a search match overrides that with the
      // same warm "found it" glow.
      const restCover = entry.featured ? 0.22 : 0;
      const restCoverG = entry.featured ? 0.14 : 0;
      const restCoverB = entry.featured ? 0.03 : 0;
      entry.materials[0].emissive.setRGB(glow ? 0.28 : restCover, glow ? 0.18 : restCoverG, glow ? 0.04 : restCoverB);
      entry.materials[4].emissive.setRGB(glow ? 0.28 : 0, glow ? 0.18 : 0, glow ? 0.04 : 0);
    }
  }

  // ---- selection / pull-out ------------------------------------------
  let selectedId = null;
  const pullTmp = new THREE.Vector3();
  const pullQuat = new THREE.Quaternion();
  // -90°, not +90°: the cover lives on local +x, the pull direction is
  // local +z, and turning +x onto +z (toward the reader) takes a -90°
  // yaw. +90° was turning the cover onto -z instead — facing back into
  // the case, which read as the book coming out backwards.
  const rot90 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI / 2);

  function pulledPose(entry) {
    const dir = new THREE.Vector3(0, 0, 1).applyQuaternion(entry.home.quat);
    pullTmp.copy(entry.home.pos).addScaledVector(dir, 0.55);
    pullTmp.y = entry.home.pos.y + 0.05;
    pullQuat.copy(entry.home.quat).multiply(rot90);
    return { pos: pullTmp.clone(), quat: pullQuat.clone() };
  }

  function selectBook(id) {
    if (selectedId && selectedId !== id) {
      const prev = entries.get(selectedId);
      if (prev) prev.state = "returning";
    }
    selectedId = id;
    const entry = entries.get(id);
    if (entry) entry.state = "pulling";
    return entry ? entry.book : null;
  }

  function clearSelection() {
    if (selectedId) {
      const prev = entries.get(selectedId);
      if (prev) prev.state = "returning";
    }
    selectedId = null;
  }

  // ---- picking ----------------------------------------------------------
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  function pick(clientX, clientY, rect) {
    ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObjects(hitMeshes, false);
    if (!hits.length) return null;
    if (matchSet && !matchSet.has(hits[0].object.userData.id)) return null;
    return hits[0].object.userData.id;
  }

  // ---- camera: spherical orbit around a movable target -------------------
  const target = new THREE.Vector3(0, 1.3, 2);
  let radius = 6.5, theta = 0.15, phi = 1.15;
  const MIN_R = 1.2, MAX_R = 16;
  // A "glide" goal for search-triggered camera moves (focusOn/roomOverview):
  // eased toward each frame in frame() below. Manual input (orbit/zoom/walk)
  // cancels it immediately so a drag always wins over an in-flight glide.
  let camGoal = null; // { pos: Vector3, radius: number } | null

  function updateCamera() {
    const sinPhi = Math.sin(phi);
    camera.position.set(
      target.x + radius * sinPhi * Math.sin(theta),
      target.y + radius * Math.cos(phi),
      target.z + radius * sinPhi * Math.cos(theta),
    );
    camera.lookAt(target);
  }
  updateCamera();

  function orbit(dTheta, dPhi) {
    camGoal = null;
    theta -= dTheta;
    phi = THREE.MathUtils.clamp(phi - dPhi, 0.25, Math.PI - 0.15);
    updateCamera();
  }
  function zoom(delta) {
    camGoal = null;
    radius = THREE.MathUtils.clamp(radius * (1 + delta), MIN_R, MAX_R);
    updateCamera();
  }
  function walk(dx, dz) {
    // Move along the camera's own forward/right on the floor plane, not
    // world axes, so WASD always means "toward what I'm looking at."
    camGoal = null;
    const forward = new THREE.Vector3(Math.sin(theta), 0, Math.cos(theta)).multiplyScalar(-1);
    const right = new THREE.Vector3(forward.z, 0, -forward.x);
    target.addScaledVector(forward, dz).addScaledVector(right, dx);
    updateCamera();
  }
  function focusOn(id, opts = {}) {
    const entry = entries.get(id);
    if (!entry) return;
    const pos = entry.home.pos.clone();
    pos.y = 1.3;
    camGoal = { pos, radius: opts.zoom ? THREE.MathUtils.clamp(radius, MIN_R, 4.5) : radius };
  }
  function roomOverview(roomDepth) {
    theta = 0.15;
    phi = 1.15;
    camGoal = { pos: new THREE.Vector3(0, 1.3, 2), radius: Math.min(MAX_R, 5 + roomDepth * 0.28) };
  }

  function resize(w, h) {
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
  }

  function frame() {
    for (const entry of entries.values()) {
      if (entry.state === "pulling") {
        // Slide straight out first, spine-on (the home orientation, still
        // thin sideways), and only start turning to face the reader once
        // there's real clearance — turning in place swept the wide cover
        // face through whatever book is still shelved right beside it,
        // reading as an overlap glitch on every pull.
        const pose = pulledPose(entry);
        const totalDist = entry.home.pos.distanceTo(pose.pos);
        entry.mesh.position.lerp(pose.pos, 0.18);
        const traveled = entry.mesh.position.distanceTo(entry.home.pos);
        if (totalDist === 0 || traveled / totalDist > 0.35) {
          entry.mesh.quaternion.slerp(pose.quat, 0.22);
        }
        if (
          entry.mesh.position.distanceTo(pose.pos) < 0.005 &&
          Math.abs(entry.mesh.quaternion.dot(pose.quat)) > 0.9995
        ) {
          entry.state = "pulled";
        }
      } else if (entry.state === "returning") {
        // Mirror image: turn back to spine-on before sliding back onto the
        // shelf, so the return trip doesn't clip the neighbor either.
        entry.mesh.quaternion.slerp(entry.home.quat, 0.22);
        if (Math.abs(entry.mesh.quaternion.dot(entry.home.quat)) > 0.98) {
          entry.mesh.position.lerp(entry.home.pos, 0.22);
        }
        if (
          entry.mesh.position.distanceTo(entry.home.pos) < 0.004 &&
          Math.abs(entry.mesh.quaternion.dot(entry.home.quat)) > 0.9995
        ) {
          entry.state = "shelved";
        }
      }
    }

    if (camGoal) {
      target.lerp(camGoal.pos, 0.06);
      radius += (camGoal.radius - radius) * 0.06;
      updateCamera();
      if (target.distanceTo(camGoal.pos) < 0.02 && Math.abs(radius - camGoal.radius) < 0.02) camGoal = null;
    }

    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  return {
    resize,
    setBooks,
    applyCover,
    applyFilter,
    pick,
    selectBook,
    clearSelection,
    orbit,
    zoom,
    walk,
    focusOn,
    roomOverview,
    canvas,
    renderer,
  };
}
