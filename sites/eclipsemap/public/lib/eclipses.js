// Real eclipse/transit/shadow-transit geometry, built on the Keplerian
// positions from orbits.js. Three physically distinct things this file
// detects, all with the same underlying "measure angles and shadow cones"
// math real eclipse prediction uses:
//
//  1. TRANSIT: a foreground body (a moon, or an inferior planet like Mercury/
//     Venus as seen from Earth) crosses in front of the Sun as seen from an
//     observer body. Depending on the foreground body's apparent size vs the
//     Sun's, this reads as total / annular / a plain small-dot "transit".
//     (A Jovian moon shadow-transit *is* a solar eclipse at Jupiter's cloud
//     tops — same geometry, different name by convention.)
//  2. SHADOW: a planet's umbra/penumbra falls on its own moon (the
//     Earth-Moon-style "lunar eclipse", generalized to every planet with a
//     moon).
//
// Model limits (stated plainly, not hidden): two-body Keplerian orbits, no
// perturbations, node/epoch phase approximated per data.js's comments. The
// geometry and eclipse *classification* math below is the real thing.

import { PLANETS, MOONS, planetByKey, moonsOf, AU_KM, SUN_RADIUS_KM, EPOCH } from "./data.js";
import { positionAt, daysSinceEpoch, vsub, vscale, vlen, vdot, angleBetween } from "./orbits.js";

const R2D = 180 / Math.PI;

export function planetHelioPosKm(planet, days) {
  const p = positionAt({ ...planet, a: planet.a * AU_KM }, days);
  return p;
}

export function moonPosKm(moon, planetPosKm, days) {
  const local = positionAt(moon, days);
  return { x: planetPosKm.x + local.x, y: planetPosKm.y + local.y, z: planetPosKm.z + local.z, local };
}

export function transitGeometry(observerPosKm, fgPosKm, fgRadiusKm) {
  const sunDir = vscale(observerPosKm, -1);
  const fgDir = vsub(fgPosKm, observerPosKm);
  const sep = angleBetween(sunDir, fgDir);
  const sunAng = Math.atan(SUN_RADIUS_KM / vlen(sunDir));
  const fgAng = Math.atan(fgRadiusKm / vlen(fgDir));
  return { sep, sunAng, fgAng };
}

export function classifyTransit(sep, sunAng, fgAng) {
  const diff = Math.abs(fgAng - sunAng);
  if (sep <= diff) return fgAng > sunAng ? "total" : fgAng < sunAng * 0.9 ? "transit" : "annular";
  if (sep < fgAng + sunAng) return "partial";
  return null;
}

export function shadowGeometry(planetPosKm, moonLocalKm, planetRadiusKm) {
  const axis = vscale(planetPosKm, 1 / vlen(planetPosKm));
  const d = vdot(moonLocalKm, axis);
  const perp = vsub(moonLocalKm, vscale(axis, d));
  const rho = vlen(perp);
  const D = vlen(planetPosKm);
  const tanU = (SUN_RADIUS_KM - planetRadiusKm) / D;
  const tanP = (SUN_RADIUS_KM + planetRadiusKm) / D;
  const rU = planetRadiusKm - d * tanU;
  const rP = planetRadiusKm + d * tanP;
  return { d, rho, rU, rP };
}

export function classifyShadow(rho, rU, rP, moonRadiusKm) {
  if (rU > 0 && rho + moonRadiusKm <= rU) return "total";
  if (rU > 0 && rho - moonRadiusKm < rU) return "partial";
  if (rho - moonRadiusKm < rP) return "penumbral";
  return null;
}

// Fast, small-orbit bodies (Phobos: ~30s transits every 7.66h) need a much
// finer scan step than their period alone suggests, or the search silently
// steps right over every real event. Size the step from the *event's own*
// expected duration (foreground angular diameter / its angular speed) instead
// of a fixed fraction of the orbital period, then cap total work with a cell
// budget — coarsening isn't an option (it means missing real events), so
// once the budget is hit we shrink the searched date range instead, and say
// so, rather than silently returning an incomplete-looking-complete list.
function searchPlan(periodDays, angDiamDeg, requestedRangeDays, budgetCells = 2000000) {
  const eventWidth = (angDiamDeg * periodDays) / 180;
  const coarseStep = Math.max(eventWidth / 8, periodDays / 5000);
  const neededCells = requestedRangeDays / coarseStep;
  if (neededCells <= budgetCells) {
    return { coarseStep, effectiveRangeDays: requestedRangeDays, truncated: false };
  }
  return { coarseStep, effectiveRangeDays: budgetCells * coarseStep, truncated: true };
}

// Generic episode finder: coarse-scan a scalar `metric(t)` (eclipse when
// <=0) for candidate windows, then refine each with finer stepping to locate
// the peak (deepest) moment and start/end crossings.
function findEpisodes(metricFn, startDays, endDays, coarseStep, refineSteps) {
  const flagged = [];
  let t = startDays;
  while (t < endDays) {
    const next = Math.min(t + coarseStep, endDays);
    const mid = (t + next) / 2;
    if (Math.min(metricFn(t), metricFn(mid), metricFn(next)) <= 0) flagged.push([t, next]);
    t = next;
  }
  const merged = [];
  for (const [a, b] of flagged) {
    if (merged.length && a <= merged[merged.length - 1][1] + coarseStep * 0.001) {
      merged[merged.length - 1][1] = b;
    } else merged.push([a, b]);
  }
  const episodes = [];
  for (const [a, b] of merged) {
    let best = null;
    let prevT = a, prevVal = metricFn(a);
    let startCross = null, endCross = null;
    for (let k = 1; k <= refineSteps; k++) {
      const tt = a + ((b - a) * k) / refineSteps;
      const val = metricFn(tt);
      if (best === null || val < best.val) best = { t: tt, val };
      if (prevVal > 0 && val <= 0 && startCross === null) {
        startCross = prevT + (tt - prevT) * (prevVal / (prevVal - val));
      }
      if (prevVal <= 0 && val > 0 && endCross === null) {
        endCross = prevT + (tt - prevT) * (prevVal / (prevVal - val));
      }
      prevT = tt;
      prevVal = val;
    }
    if (best && best.val <= 0) {
      episodes.push({ peakDays: best.t, startDays: startCross ?? a, endDays: endCross ?? b });
    }
  }
  return episodes;
}

// Find transit events of `moon` (crossing the Sun as seen from its parent
// planet) between two Date/ms timestamps.
export function findMoonTransits(moonKey, startMs, endMs) {
  const moon = MOONS.find((m) => m.key === moonKey);
  const planet = planetByKey(moon.parent);
  const startDays = daysSinceEpoch(startMs);
  const requestedRangeDays = daysSinceEpoch(endMs) - startDays;
  const angDiamDeg = 2 * Math.atan(moon.radius / moon.a) * R2D;
  const plan = searchPlan(moon.period, angDiamDeg, requestedRangeDays);
  const endDays = startDays + plan.effectiveRangeDays;

  function metric(days) {
    const pPos = planetHelioPosKm(planet, days);
    const mPos = moonPosKm(moon, pPos, days);
    const { sep, sunAng, fgAng } = transitGeometry(pPos, mPos, moon.radius);
    return sep - (sunAng + fgAng);
  }

  const episodes = findEpisodes(metric, startDays, endDays, plan.coarseStep, 60);
  const events = episodes.map((ep) => {
    const pPos = planetHelioPosKm(planet, ep.peakDays);
    const mPos = moonPosKm(moon, pPos, ep.peakDays);
    const { sep, sunAng, fgAng } = transitGeometry(pPos, mPos, moon.radius);
    return {
      kind: "transit",
      body: planet.name,
      cause: moon.name,
      classification: classifyTransit(sep, sunAng, fgAng),
      peakMs: ep.peakDays * 86400000 + EPOCH,
      durationHours: ((ep.endDays - ep.startDays) * 24) || null,
      sepArcmin: sep * R2D * 60,
      sunAngArcmin: sunAng * R2D * 60,
      fgAngArcmin: fgAng * R2D * 60,
    };
  }).filter((e) => e.classification);
  return { events, truncated: plan.truncated, searchedDays: plan.effectiveRangeDays };
}

// Find shadow (lunar-eclipse-style) events for `moon` cast by its parent.
export function findMoonShadows(moonKey, startMs, endMs) {
  const moon = MOONS.find((m) => m.key === moonKey);
  const planet = planetByKey(moon.parent);
  const startDays = daysSinceEpoch(startMs);
  const requestedRangeDays = daysSinceEpoch(endMs) - startDays;
  // Penumbra is wider than the moon's own disk, so shadow passages are at
  // least as long as a transit — the transit-derived step is a safe (if
  // slightly conservative) resolution here too.
  const angDiamDeg = 2 * Math.atan(moon.radius / moon.a) * R2D;
  const plan = searchPlan(moon.period, angDiamDeg, requestedRangeDays);
  const endDays = startDays + plan.effectiveRangeDays;

  function metric(days) {
    const pPos = planetHelioPosKm(planet, days);
    const mPos = moonPosKm(moon, pPos, days);
    const { rho, rU, rP } = shadowGeometry(pPos, mPos.local, planet.radius);
    return rho - moon.radius - rP;
  }

  const episodes = findEpisodes(metric, startDays, endDays, plan.coarseStep, 60);
  const events = episodes.map((ep) => {
    const pPos = planetHelioPosKm(planet, ep.peakDays);
    const mPos = moonPosKm(moon, pPos, ep.peakDays);
    const { rho, rU, rP, d } = shadowGeometry(pPos, mPos.local, planet.radius);
    return {
      kind: "shadow",
      body: moon.name,
      cause: planet.name,
      classification: classifyShadow(rho, rU, rP, moon.radius),
      peakMs: ep.peakDays * 86400000 + EPOCH,
      durationHours: ((ep.endDays - ep.startDays) * 24) || null,
      inShadowSince: d > 0,
    };
  }).filter((e) => e.classification);
  return { events, truncated: plan.truncated, searchedDays: plan.effectiveRangeDays };
}

// Mercury/Venus transiting the Sun as seen from Earth — same transit
// geometry, foreground body is a whole other planet instead of a moon.
export function findPlanetTransitsFromEarth(planetKey, startMs, endMs) {
  const fg = planetByKey(planetKey);
  const earth = planetByKey("earth");
  const startDays = daysSinceEpoch(startMs);
  const requestedRangeDays = daysSinceEpoch(endMs) - startDays;
  const conjunctionDistKm = Math.abs(1 - fg.a) * AU_KM;
  const angDiamDeg = 2 * Math.atan(fg.radius / conjunctionDistKm) * R2D;
  const plan = searchPlan(fg.period, angDiamDeg, requestedRangeDays);
  const endDays = startDays + plan.effectiveRangeDays;

  function metric(days) {
    const ePos = planetHelioPosKm(earth, days);
    const fPos = planetHelioPosKm(fg, days);
    const { sep, sunAng, fgAng } = transitGeometry(ePos, fPos, fg.radius);
    return sep - (sunAng + fgAng);
  }

  const episodes = findEpisodes(metric, startDays, endDays, plan.coarseStep, 80);
  const events = episodes.map((ep) => {
    const ePos = planetHelioPosKm(earth, ep.peakDays);
    const fPos = planetHelioPosKm(fg, ep.peakDays);
    const { sep, sunAng, fgAng } = transitGeometry(ePos, fPos, fg.radius);
    return {
      kind: "transit",
      body: "Earth",
      cause: fg.name,
      classification: classifyTransit(sep, sunAng, fgAng),
      peakMs: ep.peakDays * 86400000 + EPOCH,
      durationHours: ((ep.endDays - ep.startDays) * 24) || null,
      sepArcmin: sep * R2D * 60,
      sunAngArcmin: sunAng * R2D * 60,
      fgAngArcmin: fgAng * R2D * 60,
    };
  }).filter((e) => e.classification);
  return { events, truncated: plan.truncated, searchedDays: plan.effectiveRangeDays };
}
