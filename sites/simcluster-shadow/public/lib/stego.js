// stego.js — LSB (least-significant-bit) steganography: hide an encrypted
// cipher blob inside a PNG's pixel data, invisibly to the eye, recoverably by
// anyone who knows to look (and has the passphrase — this only hides the
// bytes, crypto.js is what actually protects them). Runs entirely on
// <canvas> ImageData, no library.
//
// Layout written into the low bit of each R/G/B channel (skip alpha — some
// pipelines premultiply it, which would corrupt the payload), MSB-first
// within each byte: a 4-byte big-endian length prefix, then that many
// payload bytes. PNG is required — any lossy re-encode (JPEG, WebP-lossy,
// a platform's "optimize this image" pass) rounds pixel values and destroys
// single-bit changes.

function capacityBytes(width, height) {
  // 3 usable bits/pixel (R,G,B), 8 bits/byte.
  return Math.floor((width * height * 3) / 8);
}

function bytesToBits(bytes) {
  const bits = new Uint8Array(bytes.length * 8);
  for (let i = 0; i < bytes.length; i++) {
    for (let b = 0; b < 8; b++) {
      bits[i * 8 + b] = (bytes[i] >> (7 - b)) & 1;
    }
  }
  return bits;
}

function bitsToBytes(bits) {
  const out = new Uint8Array(bits.length / 8);
  for (let i = 0; i < out.length; i++) {
    let v = 0;
    for (let b = 0; b < 8; b++) v = (v << 1) | bits[i * 8 + b];
    out[i] = v;
  }
  return out;
}

// Embed `payload` (Uint8Array) into a canvas's pixel data in place. Throws if
// the canvas isn't large enough. Returns the same canvas for chaining.
export function embedInCanvas(canvas, payload) {
  const width = canvas.width;
  const height = canvas.height;
  if (payload.length > 0xffffffff) throw new Error("payload too large");
  const header = new Uint8Array(4);
  new DataView(header.buffer).setUint32(0, payload.length, false);
  const full = new Uint8Array(header.length + payload.length);
  full.set(header, 0);
  full.set(payload, header.length);

  const needed = full.length;
  if (needed > capacityBytes(width, height)) {
    throw new Error(
      `image too small to hide ${payload.length} bytes — needs at least ` +
        `${Math.ceil(Math.sqrt((needed * 8) / 3))}x${Math.ceil(Math.sqrt((needed * 8) / 3))}px`,
    );
  }

  const ctx = canvas.getContext("2d");
  const img = ctx.getImageData(0, 0, width, height);
  const bits = bytesToBits(full);
  let bi = 0;
  for (let p = 0; p < img.data.length && bi < bits.length; p += 4) {
    for (let ch = 0; ch < 3 && bi < bits.length; ch++) {
      img.data[p + ch] = (img.data[p + ch] & 0xfe) | bits[bi++];
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

// Recover the payload previously embedded by embedInCanvas. Throws if the
// image carries no valid Shadow Simcluster header (garbage length, or fewer
// bits than the header claims — i.e. this probably isn't one of our images).
export function extractFromCanvas(canvas) {
  const width = canvas.width;
  const height = canvas.height;
  const ctx = canvas.getContext("2d");
  const img = ctx.getImageData(0, 0, width, height);

  const totalBits = capacityBytes(width, height) * 8;
  const headerBits = new Uint8Array(32);
  let bi = 0;
  for (let p = 0; p < img.data.length && bi < 32; p += 4) {
    for (let ch = 0; ch < 3 && bi < 32; ch++) {
      headerBits[bi++] = img.data[p + ch] & 1;
    }
  }
  const lenBytes = bitsToBytes(headerBits);
  const len = new DataView(lenBytes.buffer).getUint32(0, false);
  if (len <= 0 || (len + 4) * 8 > totalBits) {
    throw new Error("no hidden cipher found in this image");
  }

  const payloadBits = new Uint8Array(len * 8);
  let pi = 0;
  bi = 0;
  const skip = 32; // header bits already consumed
  for (let p = 0; p < img.data.length && pi < payloadBits.length; p += 4) {
    for (let ch = 0; ch < 3 && pi < payloadBits.length; ch++) {
      if (bi++ < skip) continue;
      payloadBits[pi++] = img.data[p + ch] & 1;
    }
  }
  return bitsToBytes(payloadBits);
}

// Build a cover-image canvas sized to comfortably fit `payloadLen` bytes,
// filled with a procedurally-generated "shadow static" pattern — nobody
// needs to supply their own source image. Deterministic per call (fresh
// randomness each time) so no two covers look identical.
export function makeCoverCanvas(payloadLen) {
  const needed = payloadLen + 4;
  const minPixels = Math.ceil((needed * 8) / 3);
  const side = Math.max(320, Math.ceil(Math.sqrt(minPixels * 1.15)));

  const canvas = document.createElement("canvas");
  canvas.width = side;
  canvas.height = side;
  const ctx = canvas.getContext("2d");

  const grad = ctx.createRadialGradient(
    side * 0.3,
    side * 0.3,
    0,
    side * 0.5,
    side * 0.5,
    side * 0.75,
  );
  grad.addColorStop(0, "#2a1d3d");
  grad.addColorStop(0.5, "#161022");
  grad.addColorStop(1, "#08060d");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, side, side);

  // Static/noise speckle — visually reads as "shadow transmission", and its
  // pixel-level entropy makes the embedded LSBs unremarkable statistically.
  const img = ctx.getImageData(0, 0, side, side);
  for (let p = 0; p < img.data.length; p += 4) {
    if (Math.random() < 0.35) {
      const n = (Math.random() - 0.5) * 40;
      img.data[p] = clamp255(img.data[p] + n);
      img.data[p + 1] = clamp255(img.data[p + 1] + n);
      img.data[p + 2] = clamp255(img.data[p + 2] + n);
    }
  }
  ctx.putImageData(img, 0, 0);

  ctx.strokeStyle = "rgba(180,140,255,0.25)";
  ctx.lineWidth = 1;
  for (let i = 0; i < 6; i++) {
    ctx.beginPath();
    ctx.moveTo(0, (side / 6) * i + Math.random() * 20);
    ctx.lineTo(side, (side / 6) * i + Math.random() * 20);
    ctx.stroke();
  }

  return canvas;
}

function clamp255(v) {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

// Load an image File/Blob into a canvas at its natural pixel size.
export function loadImageToCanvas(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext("2d").drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      resolve(canvas);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("couldn't load that image"));
    };
    img.src = url;
  });
}

export function canvasToPngBlob(canvas) {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}
