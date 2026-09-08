// hyperqualia ambient backdrop — hand-written GLSL, not decoration bolted on:
// a fullscreen fragment shader mixing fbm-noise biomechanical veins (Giger),
// an interlocking tile grid shaded with a different fake light direction per
// tile so no single light source ever reads consistently across it (Escher's
// impossible-object trick, applied to texture instead of geometry), and soft
// wisps that diffuse outward from center like a scent — flaring whenever the
// live slice actually catches an inducer, via hqGlPulse() below.
//
// It used to be mood only. It now also carries the four rotation planes that
// have no numeric readout anywhere in the SVG panels (xy, xz, yw, zw — xw and
// yz are the two you can already see and drag), via hqGlSetRotation() below:
// xy turns the Escher tiles' fake light directions, xz turns the grain of the
// vein noise field, yw offsets the tile grid, zw turns the wisp's warp. Same
// instantaneous angles the tesseract is actually spinning through — this is
// just somewhere for them to be seen, not a second source of truth. The exact
// slice + narrative in hyperqualia.js are still untouched by any of it.
// hqGlSetSlice/hqGlSetRotation/hqGlPulse are the only coupling points, and all
// are optional — if this file fails to get a WebGL context, hyperqualia.js's
// calls to them are no-ops and the page falls back to its plain CSS gradient
// background.

const canvas = document.getElementById("glBackdrop");
const gl = canvas && (canvas.getContext("webgl") || canvas.getContext("experimental-webgl"));

if (gl) {
  const VERT_SRC = `
    attribute vec2 aPos;
    varying vec2 vUv;
    void main() {
      vUv = aPos * 0.5 + 0.5;
      gl_Position = vec4(aPos, 0.0, 1.0);
    }
  `;

  const FRAG_SRC = `
    precision mediump float;
    varying vec2 vUv;
    uniform float uTime;
    uniform vec2 uResolution;
    uniform float uSliceW;
    uniform float uPulse;
    uniform float uRotXY;
    uniform float uRotXZ;
    uniform float uRotYW;
    uniform float uRotZW;

    vec2 rot2(vec2 p, float a) {
      float c = cos(a), s = sin(a);
      return vec2(p.x * c - p.y * s, p.x * s + p.y * c);
    }

    float hash(vec2 p) {
      p = fract(p * vec2(123.34, 456.21));
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
    }
    float noise(vec2 p) {
      vec2 i = floor(p), f = fract(p);
      float a = hash(i), b = hash(i + vec2(1.0, 0.0));
      float c = hash(i + vec2(0.0, 1.0)), d = hash(i + vec2(1.0, 1.0));
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
    }
    float fbm(vec2 p) {
      float v = 0.0, a = 0.5;
      for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.03; a *= 0.55; }
      return v;
    }
    // Escher's trick applied to shading rather than geometry: an interlocking
    // tile grid where alternating tiles fake a different light direction, so
    // the texture never resolves to one consistent light source. rotXY turns
    // both fake light directions together — the xy rotation plane, which has
    // no readout of its own anywhere on the page, made visible as a slow turn
    // of which way the light seems to come from.
    float escherTile(vec2 p, float rotXY) {
      vec2 g = fract(p) - 0.5;
      vec2 id = floor(p);
      float sel = step(0.5, mod(id.x + id.y, 2.0));
      vec2 dirA = rot2(vec2(0.7, 0.7), rotXY);
      vec2 dirB = rot2(vec2(-0.7, 0.4), rotXY);
      vec2 lightDir = mix(dirA, dirB, sel);
      return dot(normalize(g + 0.0001), lightDir);
    }

    void main() {
      vec2 uv = (vUv - 0.5) * vec2(uResolution.x / uResolution.y, 1.0);
      float t = uTime;

      vec3 base = mix(vec3(0.02, 0.01, 0.035), vec3(0.05, 0.035, 0.06), 0.5 + 0.5 * sin(t * 0.05));

      // yw (no readout of its own) offsets the tile grid itself.
      float esch = escherTile(uv * 5.0 + 0.15 * sin(t * 0.07) + uRotYW * 0.4, uRotXY);
      vec3 eschColor = mix(vec3(0.03, 0.02, 0.05), vec3(0.1, 0.08, 0.11), 0.5 + 0.5 * esch);

      // xz (no readout of its own) turns the grain of the vein noise field.
      float veinField = fbm(rot2(uv, uRotXZ) * 3.0 + vec2(0.0, t * 0.03));
      float vein = max(smoothstep(0.48, 0.5, veinField) - smoothstep(0.5, 0.56, veinField), 0.0);
      vec3 veinColor = mix(vec3(0.55, 0.05, 0.35), vec3(0.05, 0.4, 0.4), 0.5 + 0.5 * sin(veinField * 8.0 + t * 0.2));

      // zw (no readout of its own) turns the wisp's underlying warp field.
      vec2 uvZW = rot2(uv, uRotZW);
      vec2 warp = uv + 0.15 * vec2(fbm(uvZW * 1.5 - t * 0.02), fbm(uvZW * 1.5 + 7.0 + t * 0.02));
      float wisp = fbm(warp * 2.2 + t * 0.015);
      float dist = length(uv);
      float diffuse = smoothstep(0.9, 0.0, dist) * wisp;
      vec3 wispColor = vec3(1.0, 0.75, 0.9) * 0.4 + vec3(0.35, 0.85, 0.82) * 0.3;

      vec3 col = base + eschColor * 0.5;
      col += vein * veinColor * 0.9;
      col += diffuse * wispColor * (0.15 + 0.85 * uPulse);
      col = mix(col, col * vec3(1.08, 0.95, 1.05), clamp(abs(uSliceW) / 1.35, 0.0, 1.0));

      float vig = smoothstep(1.15, 0.25, dist);
      col *= vig;

      gl_FragColor = vec4(col, 1.0);
    }
  `;

  const compile = (type, src) => {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, src);
    gl.compileShader(shader);
    return shader;
  };

  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT_SRC));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG_SRC));
  gl.linkProgram(prog);

  if (gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    gl.useProgram(prog);

    const posBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
    // one oversized triangle covering the whole clip-space viewport — no
    // second triangle/seam needed for a fullscreen quad
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, "aPos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const uTime = gl.getUniformLocation(prog, "uTime");
    const uResolution = gl.getUniformLocation(prog, "uResolution");
    const uSliceW = gl.getUniformLocation(prog, "uSliceW");
    const uPulse = gl.getUniformLocation(prog, "uPulse");
    const uRotXY = gl.getUniformLocation(prog, "uRotXY");
    const uRotXZ = gl.getUniformLocation(prog, "uRotXZ");
    const uRotYW = gl.getUniformLocation(prog, "uRotYW");
    const uRotZW = gl.getUniformLocation(prog, "uRotZW");

    let sliceW = 0;
    let pulse = 0;
    let rotXY = 0, rotXZ = 0, rotYW = 0, rotZW = 0;
    let lastMs = null;

    // hyperqualia.js calls these every frame / on each inducer hit — the
    // only coupling between the exact tesseract math and this backdrop.
    window.hqGlSetSlice = (c) => { sliceW = c; };
    window.hqGlSetRotation = (angles) => {
      rotXY = angles.xy || 0;
      rotXZ = angles.xz || 0;
      rotYW = angles.yw || 0;
      rotZW = angles.zw || 0;
    };
    window.hqGlPulse = () => { pulse = 1; };

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
    }
    window.addEventListener("resize", resize);
    resize();

    function draw(nowMs) {
      requestAnimationFrame(draw);
      if (lastMs === null) lastMs = nowMs;
      const dt = (nowMs - lastMs) / 1000;
      lastMs = nowMs;
      pulse *= Math.exp(-dt * 1.4);

      gl.uniform1f(uTime, nowMs / 1000);
      gl.uniform2f(uResolution, canvas.width, canvas.height);
      gl.uniform1f(uSliceW, sliceW);
      gl.uniform1f(uPulse, pulse);
      gl.uniform1f(uRotXY, rotXY);
      gl.uniform1f(uRotXZ, rotXZ);
      gl.uniform1f(uRotYW, rotYW);
      gl.uniform1f(uRotZW, rotZW);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    requestAnimationFrame(draw);
  }
}
