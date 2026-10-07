// Built-in shaders. Shadertoy-style: mainImage(out vec4 fragColor, in vec2 fragCoord)
// with uniforms iTime, iResolution (vec3), iMouse (vec4, xy in pixels).
export const SHADERS = [
{ id: "plasma", name: "plasma", note: "sine-wave interference, slow and warm", code: `
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 p = (fragCoord - 0.5 * iResolution.xy) / iResolution.y * 4.0;
  float t = iTime * 0.6;
  float v = sin(p.x + t) + sin((p.y + t) * 0.7) + sin((p.x + p.y + t) * 0.5);
  v += sin(length(p + vec2(sin(t * 0.5) * 2.0, cos(t * 0.3) * 2.0)) * 1.5);
  vec3 col = 0.5 + 0.5 * cos(vec3(0.0, 2.1, 4.2) + v * 1.2 + t * 0.3);
  fragColor = vec4(col, 1.0);
}` },
{ id: "tunnel", name: "tunnel", note: "fly down a checkered wormhole", code: `
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 p = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
  if (iMouse.z > 0.0) p -= (iMouse.xy - 0.5 * iResolution.xy) / iResolution.y * 0.3;
  float a = atan(p.y, p.x);
  float r = length(p);
  vec2 uv = vec2(a / 3.14159 * 4.0, 0.25 / r + iTime * 0.8);
  float chk = mod(floor(uv.x) + floor(uv.y), 2.0);
  vec3 col = mix(vec3(0.05, 0.1, 0.35), vec3(0.2, 0.9, 0.85), chk);
  col *= smoothstep(0.0, 0.35, r);
  col += 0.08 / (r + 0.05) * vec3(1.0, 0.5, 0.9) * 0.3;
  fragColor = vec4(col, 1.0);
}` },
{ id: "voronoi", name: "cells", note: "drifting voronoi with glowing edges", code: `
vec2 hash2(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return fract(sin(p) * 43758.5453);
}
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = fragCoord / iResolution.y * 6.0;
  vec2 ip = floor(uv), fp = fract(uv);
  float d1 = 8.0, d2 = 8.0; vec2 id = vec2(0.0);
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 g = vec2(float(i), float(j));
    vec2 o = hash2(ip + g);
    o = 0.5 + 0.5 * sin(iTime * 0.8 + 6.2831 * o);
    float d = length(g + o - fp);
    if (d < d1) { d2 = d1; d1 = d; id = ip + g; } else if (d < d2) { d2 = d; }
  }
  vec3 base = 0.5 + 0.5 * cos(6.2831 * (hash2(id).x + vec3(0.0, 0.33, 0.67)));
  float edge = 1.0 - smoothstep(0.0, 0.08, d2 - d1);
  vec3 col = base * (0.35 + 0.65 * (1.0 - d1)) + edge * 0.9;
  fragColor = vec4(col, 1.0);
}` },
{ id: "julia", name: "julia", note: "a breathing julia set; mouse steers c", code: `
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 z = (fragCoord - 0.5 * iResolution.xy) / iResolution.y * 3.0;
  vec2 c = 0.7885 * vec2(cos(iTime * 0.3), sin(iTime * 0.3));
  if (iMouse.z > 0.0) c = (iMouse.xy / iResolution.xy - 0.5) * 2.4;
  float n = 0.0;
  for (int i = 0; i < 96; i++) {
    z = vec2(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y) + c;
    if (dot(z, z) > 16.0) break;
    n += 1.0;
  }
  float s = n - log2(log2(dot(z, z))) + 4.0;
  vec3 col = n >= 95.0 ? vec3(0.0) : 0.5 + 0.5 * cos(vec3(3.0, 3.6, 4.2) + s * 0.18);
  fragColor = vec4(col, 1.0);
}` },
{ id: "clouds", name: "clouds", note: "domain-warped fbm smoke", code: `
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.02 + 7.3; a *= 0.5; }
  return v;
}
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 p = fragCoord / iResolution.y * 3.0;
  float t = iTime * 0.15;
  vec2 q = vec2(fbm(p + t), fbm(p + vec2(5.2, 1.3) - t));
  float f = fbm(p + 4.0 * q);
  vec3 col = mix(vec3(0.05, 0.05, 0.2), vec3(0.95, 0.55, 0.45), f * f * 2.0);
  col = mix(col, vec3(0.2, 0.8, 0.9), clamp(length(q) - 0.4, 0.0, 1.0));
  fragColor = vec4(col, 1.0);
}` },
{ id: "kaleido", name: "kaleidoscope", note: "mirrored folds of moving light", code: `
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 p = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
  float a = atan(p.y, p.x), r = length(p);
  float seg = 3.14159 / 6.0;
  a = abs(mod(a + iTime * 0.1, 2.0 * seg) - seg);
  p = r * vec2(cos(a), sin(a));
  vec3 col = vec3(0.0);
  for (float i = 1.0; i < 5.0; i++) {
    p = abs(p) / dot(p, p) - 0.6 + 0.05 * sin(iTime * 0.4 + i);
    col += 0.5 + 0.5 * cos(vec3(0.0, 2.0, 4.0) + length(p) * 2.0 + i);
  }
  col /= 4.0;
  fragColor = vec4(col * (1.0 - smoothstep(0.3, 0.9, r)) + 0.02, 1.0);
}` },
{ id: "ripples", name: "ripples", note: "rain on water; click to drop one", code: `
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 p = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
  float h = 0.0;
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    vec2 c = vec2(sin(fi * 12.9 + 1.0), cos(fi * 7.3 + 2.0)) * 0.45;
    float ph = fract(iTime * 0.25 + fi / 6.0);
    float d = length(p - c);
    h += sin(d * 40.0 - ph * 20.0) * exp(-d * 5.0) * (1.0 - ph);
  }
  if (iMouse.z > 0.0) {
    vec2 m = (iMouse.xy - 0.5 * iResolution.xy) / iResolution.y;
    float d = length(p - m);
    h += sin(d * 40.0 - iTime * 8.0) * exp(-d * 4.0);
  }
  vec3 n = normalize(vec3(dFdx(h), dFdy(h), 0.02));
  float spec = pow(max(dot(n, normalize(vec3(-0.4, 0.6, 0.7))), 0.0), 20.0);
  vec3 col = mix(vec3(0.02, 0.12, 0.25), vec3(0.1, 0.5, 0.7), 0.5 + 0.5 * h) + spec;
  fragColor = vec4(col, 1.0);
}` },
{ id: "orb", name: "raymarched orb", note: "a lumpy glass-ish sphere, raymarched", code: `
float map(vec3 p) {
  float d = length(p) - 1.0;
  d += 0.12 * sin(p.x * 4.0 + iTime) * sin(p.y * 4.0 + iTime * 1.3) * sin(p.z * 4.0 - iTime);
  return d;
}
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
  float ang = iTime * 0.3;
  if (iMouse.z > 0.0) ang = (iMouse.x / iResolution.x) * 6.2831;
  vec3 ro = vec3(3.0 * sin(ang), 0.6, 3.0 * cos(ang));
  vec3 fw = normalize(-ro), rt = normalize(cross(vec3(0, 1, 0), fw)), up = cross(fw, rt);
  vec3 rd = normalize(fw * 1.6 + rt * uv.x + up * uv.y);
  float t = 0.0; bool hit = false;
  for (int i = 0; i < 80; i++) {
    float d = map(ro + rd * t);
    if (d < 0.001) { hit = true; break; }
    t += d;
    if (t > 8.0) break;
  }
  vec3 col = mix(vec3(0.02, 0.02, 0.08), vec3(0.15, 0.05, 0.25), uv.y + 0.5);
  if (hit) {
    vec3 p = ro + rd * t; vec2 e = vec2(0.002, 0.0);
    vec3 n = normalize(vec3(map(p + e.xyy) - map(p - e.xyy), map(p + e.yxy) - map(p - e.yxy), map(p + e.yyx) - map(p - e.yyx)));
    float fres = pow(1.0 - max(dot(n, -rd), 0.0), 3.0);
    float dif = max(dot(n, normalize(vec3(0.5, 0.8, 0.4))), 0.0);
    col = vec3(0.9, 0.35, 0.6) * (0.15 + dif) + fres * vec3(0.3, 0.9, 1.0);
  }
  fragColor = vec4(col, 1.0);
}` },
];
