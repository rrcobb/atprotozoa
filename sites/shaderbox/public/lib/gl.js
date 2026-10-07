// Tiny WebGL1 fragment-shader runner with Shadertoy-style uniforms.
const VERT = `attribute vec2 a; void main(){ gl_Position = vec4(a, 0.0, 1.0); }`;
const HEAD = `#extension GL_OES_standard_derivatives : enable
precision highp float;
uniform vec3 iResolution; uniform float iTime; uniform vec4 iMouse;
`;
const TAIL = `
void main() { vec4 c = vec4(0.0); mainImage(c, gl_FragCoord.xy); gl_FragColor = vec4(c.rgb, 1.0); }`;

export function makeRunner(canvas, opts = {}) {
  const gl = canvas.getContext("webgl", { preserveDrawingBuffer: !!opts.preserve, antialias: false });
  if (!gl) return null;
  gl.getExtension("OES_standard_derivatives");
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const vs = gl.createShader(gl.VERTEX_SHADER);
  gl.shaderSource(vs, VERT); gl.compileShader(vs);
  let prog = null, U = {};

  // Returns "" on success, else the compiler log (line numbers shifted to the user's code).
  function setCode(code) {
    const fs = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fs, HEAD + code + TAIL);
    gl.compileShader(fs);
    if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
      const headLines = HEAD.split("\n").length - 1;
      const log = (gl.getShaderInfoLog(fs) || "compile error").replace(/ERROR: (\d+):(\d+):/g,
        (m, a, b) => `line ${Math.max(1, +b - headLines)}:`);
      gl.deleteShader(fs);
      return log;
    }
    const p = gl.createProgram();
    gl.attachShader(p, vs); gl.attachShader(p, fs);
    gl.bindAttribLocation(p, 0, "a");
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) return gl.getProgramInfoLog(p) || "link error";
    if (prog) gl.deleteProgram(prog);
    prog = p;
    U = { res: gl.getUniformLocation(p, "iResolution"), t: gl.getUniformLocation(p, "iTime"), m: gl.getUniformLocation(p, "iMouse") };
    return "";
  }

  function draw(time, mouse) {
    if (!prog) return;
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(prog);
    gl.enableVertexAttribArray(0);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.uniform3f(U.res, canvas.width, canvas.height, 1);
    gl.uniform1f(U.t, time);
    gl.uniform4f(U.m, mouse[0], mouse[1], mouse[2], 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  return { gl, setCode, draw };
}
