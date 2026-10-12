import { describe, expect, it } from 'vitest';
import * as G from '../src/core/geometry.js';
import { toSTL } from '../src/core/stl.js';
import { DEFAULTS, PRESETS, applyParams, paramsFromFile, presetParams, seedPoints } from '../src/core/params.js';
import { suggestPrint, supportAt } from '../src/core/print.js';
import { capClearance, distanceToBody, inspectSTL } from './helpers.js';

const GOURD = PRESETS.findIndex((p) => p.id === 'gourd');

describe('body', () => {
  PRESETS.forEach((preset, i) => {
    it(`preset "${preset.id}" exports as a closed solid`, () => {
      const q = G.derive(presetParams(i, DEFAULTS));
      const g = G.buildBody(q, 180, 0.8);
      const info = inspectSTL(toSTL(g, 'body'));
      expect(info.sizeOk).toBe(true);
      expect(info.openEdges).toBe(0);
      expect(info.degenerate).toBe(0);
      expect(info.volume).toBeGreaterThan(0);
      let rMin = Infinity;
      for (const r of g.rr) if (r < rMin) rMin = r;
      expect(rMin).toBeGreaterThan(1);                    // the radius never collapses
    });
  });

  it('the default lantern stays within the tilt limit plus the ring headroom', () => {
    const q = G.derive(DEFAULTS);
    const m = G.measure(G.buildBody(q, 192, 0.5, 6), false);
    expect(m.overBody).toBeLessThanOrEqual(q.limit + 5.5);
  });

  it('the gourd uses round segments: its lobes pass through the points and bulge outwards', () => {
    const q = G.derive(presetParams(GOURD, DEFAULTS));
    const at = (u) => Math.round((q.zb + u * q.hb) / q.dz);
    for (const [u, r] of q.pts) expect(q.want[at(u)]).toBeCloseTo(r * q.Rmax, 0);
    const [lobe, waist] = q.pts;
    for (let i = at(lobe[0]) + 1; i < at(waist[0]); i++) {
      expect(q.want[i - 1] + q.want[i + 1] - 2 * q.want[i]).toBeLessThan(-1e-6);   // strictly concave: no flat or hollow stretch
    }
  });
});

describe('threads and caps', () => {
  const q = G.derive({ ...DEFAULTS });

  for (const which of ['bottom', 'top']) {
    it(`${which} cap is a closed solid with the configured clearance`, () => {
      const cap = G.capSpec(q, which);
      const g = G.buildCap(q, cap, 180, 0.3, false);
      const info = inspectSTL(toSTL(g, 'cap'));
      expect(info.openEdges).toBe(0);
      expect(info.degenerate).toBe(0);
      const fit = capClearance(G, q, cap);
      expect(fit.min).toBeCloseTo(q.c, 2);                 // never rubs: the minimum gap is the configured one
      expect(fit.engage).toBeGreaterThan(0.5);             // and the thread does engage
    });
  }

  it('a cap hole removes exactly its cylinder and never exceeds the maximum', () => {
    const solid = G.capSpec(q, 'top');
    const qh = G.derive({ ...DEFAULTS, topHole: true, topHoleD: 500 });
    const holed = G.capSpec(qh, 'top');
    expect(holed.hole).toBeCloseTo(holed.holeMax, 6);
    const g0 = G.buildCap(q, solid, 180, 0.3, false), g1 = G.buildCap(qh, holed, 180, 0.3, false);
    const info = inspectSTL(toSTL(g1, 'cap'));
    expect(info.openEdges).toBe(0);
    const expected = G.volume(g0) - Math.PI * holed.hole ** 2 * holed.floor;
    expect(info.volume / expected).toBeCloseTo(1, 2);
  });

  it('a closed bottom disables the bottom thread', () => {
    const qc = G.derive({ ...DEFAULTS, base: 'closed' });
    expect(qc.thB).toBe(false);
    expect(G.capSpec(qc, 'bottom')).toBeNull();
  });
});

describe('parameters', () => {
  it('loads a parameters file written by the original Spanish-language build', () => {
    const p = applyParams({ ...DEFAULTS }, { base: 'cerrada', profile: 'libre', curve: 'redonda', ribShape: 'cresta', quality: 'fina', pts: [[0.5, 0.9], [0.2, 0.8]] });
    expect(p.base).toBe('closed');
    expect(p.profile).toBe('free');
    expect(p.curve).toBe('round');
    expect(p.ribShape).toBe('crest');
    expect(p.quality).toBe('fine');
    expect(p.pts[0][0]).toBe(0.2);                         // points come back sorted by height
  });

  it('ignores unknown keys and wrong types', () => {
    const p = applyParams({ ...DEFAULTS }, { H: 'tall', bogus: 1, topThread: 'yes' });
    expect(p.H).toBe(DEFAULTS.H);
    expect(p.topThread).toBe(DEFAULTS.topThread);
    expect('bogus' in p).toBe(false);
  });
});

describe('layer support', () => {
  it('at 45° with a 0.20 layer and a 0.42 line, just over half a line is supported', () => {
    expect(supportAt(45, 0.2, 0.42)).toBeCloseTo(0.524, 2);
  });
  it('the suggestion for 68° on a 0.4 nozzle leaves at least half a line supported', () => {
    const fit = suggestPrint(68, 0.4);
    expect(fit.ok).toBe(true);
    expect(supportAt(68, fit.lh, fit.lw)).toBeGreaterThanOrEqual(0.5);
  });
});

describe('parameters file', () => {
  it('reads the params of an exported file, or a bare parameter set', () => {
    expect(paramsFromFile({ app: 'Vasp', version: 1, params: { H: 150 } })).toEqual({ H: 150 });
    expect(paramsFromFile({ H: 150 })).toEqual({ H: 150 });
  });
  it('rejects a designs backup and anything that is not an object', () => {
    expect(paramsFromFile({ kind: 'vasp-designs', designs: [] })).toBeNull();
    expect(paramsFromFile([1, 2])).toBeNull();
    expect(paramsFromFile(null)).toBeNull();
  });
  it('rejects an object with no known parameter', () => {
    expect(paramsFromFile({})).toBeNull();
    expect(paramsFromFile({ foo: 1 })).toBeNull();
    expect(paramsFromFile({ params: { foo: 1 } })).toBeNull();
  });
});

describe('two-sided profile', () => {
  const gourd = presetParams(GOURD, DEFAULTS);
  // the back (left half) keeps the gourd's heights but only reaches 70 % of the front's bulge
  const back = gourd.pts.map(([u, r]) => [u, +(r * 0.7).toFixed(4)]);
  const radiusAt = (g, j, i) => g.rr[j * g.nT + i];

  it('equal sides give exactly the same mesh as a symmetric profile', () => {
    const a = G.buildBody(G.derive(gourd), 180, 0.8);
    const b = G.buildBody(G.derive({ ...gourd, ptsL: gourd.pts.map((p) => [...p]) }), 180, 0.8);
    expect(Array.from(b.pos)).toEqual(Array.from(a.pos));
  });

  it('a different back exports as a closed solid with front and back apart', () => {
    const q = G.derive({ ...gourd, ptsL: back });
    expect(q.asym).toBe(true);
    const g = G.buildBody(q, 180, 0.8);
    const info = inspectSTL(toSTL(g, 'body'));
    expect(info.openEdges).toBe(0);
    expect(info.degenerate).toBe(0);
    expect(info.volume).toBeGreaterThan(0);
    const j = Math.round((q.zb + 0.2967 * q.hb) / q.H * (g.nZ - 1));   // the lower lobe
    const front = radiusAt(g, j, 0), rear = radiusAt(g, j, g.nT / 2);
    expect(rear / front).toBeLessThan(0.85);
  });

  it('the mouths stay round, so caps and threads still fit', () => {
    const q = G.derive({ ...DEFAULTS, profile: 'free', pts: [[0.5, 1]], ptsL: [[0.5, 0.6]] });
    const g = G.buildBody(q, 180, 0.8);
    for (const j of [0, g.nZ - 1]) {
      let lo = Infinity, hi = -Infinity;
      for (let i = 0; i < g.nT; i++) { const r = radiusAt(g, j, i); lo = Math.min(lo, r); hi = Math.max(hi, r); }
      expect(hi - lo).toBeLessThan(1e-3);
    }
  });

  it('the blend never tilts the wall past the limit plus the ring headroom', () => {
    const q = G.derive({ ...DEFAULTS, profile: 'free', pts: [[0.3, 1], [0.7, 0.8]], ptsL: [[0.4, 0.55], [0.8, 0.9]] });
    const m = G.measure(G.buildBody(q, 192, 0.5, 6), false);
    expect(m.overBody).toBeLessThanOrEqual(q.limit + 5.5);
  });

  it('loads and validates the left points like the right ones', () => {
    const p = applyParams({ ...DEFAULTS }, { profile: 'free', pts: [[0.5, 0.9]], ptsL: [[0.6, 0.7], ['x', 1]] });
    expect(p.ptsL).toEqual([[0.6, 0.7]]);
    expect(applyParams({ ...DEFAULTS }, { ptsL: [] }).ptsL).toBeNull();
  });

  it('drops the old left points when a file has no ptsL (made before two sides)', () => {
    const open = () => ({ ...DEFAULTS, profile: 'free', pts: [[0.5, 0.9]], ptsL: [[0.6, 0.7]] });
    expect(applyParams(open(), { profile: 'free', pts: [[0.4, 1]] }).ptsL).toBeNull();
    expect(applyParams(open(), { H: 150 }).ptsL).toEqual([[0.6, 0.7]]);
  });
});

describe('transition into the mouth', () => {
  /* the gourd with a straight neck and smooth segments: its shoulder meets the neck in a short turn */
  const necked = { ...presetParams(GOURD, DEFAULTS), topL: 30, shoulder: 80, curve: 'smooth' };
  const tiltAt = (shape, height) => (Math.atan(Math.abs(shape.slope[Math.round(height / shape.dz)])) * 180) / Math.PI;

  it('0 leaves the part as it was', () => {
    const before = G.buildBody(G.derive(necked), 180, 0.8);
    const withZero = G.buildBody(G.derive({ ...necked, neckBlend: 0 }), 180, 0.8);
    expect(Array.from(withZero.pos)).toEqual(Array.from(before.pos));
  });

  it('reaches the neck upright through a flare, and leaves the body further down as it was', () => {
    const plain = G.derive(necked), blended = G.derive({ ...necked, neckBlend: 40 });
    const neckStart = blended.zt;
    expect(tiltAt(plain, neckStart - 5)).toBeGreaterThan(10);   // without it the wall still leans 5 mm under the neck
    expect(tiltAt(blended, neckStart - 1)).toBeLessThan(5);
    for (let height = neckStart - 18; height < neckStart - 1; height += 1) {
      expect(tiltAt(blended, height + 1)).toBeLessThanOrEqual(tiltAt(blended, height) + 0.5);   // the tilt only eases off
    }
    /* below the flare and the rounding of its corner the body is untouched */
    const untouchedUpTo = Math.round((neckStart - 40 - 35) / blended.dz);
    for (let sample = 0; sample <= untouchedUpTo; sample++) expect(blended.base[sample]).toBeCloseTo(plain.base[sample], 9);
    expect(blended.base[Math.round(neckStart / blended.dz)]).toBeCloseTo(blended.Rt, 9);
  });

  it('stays within the tilt limit and exports as a closed solid', () => {
    const shape = G.derive({ ...necked, shoulder: 45, neckBlend: 60 });
    for (const slope of shape.slope) expect(Math.abs(slope)).toBeLessThanOrEqual(shape.tanS + 1e-9);
    const info = inspectSTL(toSTL(G.buildBody(shape, 180, 0.8), 'body'));
    expect(info.openEdges).toBe(0);
    expect(info.volume).toBeGreaterThan(0);
  });

  it('counts as part of the requested profile, so the editor and the shoulder hint do not report it as a trim', () => {
    const trimmed = (shape) => Math.max(...shape.want.map((radius, sample) => radius - shape.base[sample]));
    const plain = G.derive(necked), blended = G.derive({ ...necked, neckBlend: 40 });
    expect(trimmed(blended)).toBeLessThan(trimmed(plain) + 0.2);
    /* the rounded corner joins the body without a step, so the requested tilt does not jump */
    expect(blended.wantDeg).toBeLessThanOrEqual(plain.wantDeg + 1);
  });

  it('is limited to 80 mm and to 60 % of the body, and tells the panel that limit', () => {
    expect(G.derive({ ...necked, neckBlend: 999 }).neckBlend).toBe(80);
    const short = G.derive({ ...necked, H: 60, neckBlend: 80 });
    expect(short.neckBlendMax).toBeCloseTo(0.6 * short.hb, 9);
    expect(short.neckBlend).toBe(short.neckBlendMax);
  });
});

describe('uneven mouth', () => {
  const heightAt = (mesh, ring, segment) => mesh.pos[(ring * mesh.nT + segment) * 3 + 2];
  // the classic lantern drawn with the free profile, so the mouth can drop
  const free = { ...DEFAULTS, profile: 'free', pts: seedPoints(DEFAULTS) };

  it('no drop keeps the flat mouth and the same mesh', () => {
    const before = G.buildBody(G.derive(free), 180, 0.8);
    const withZero = G.buildBody(G.derive({ ...free, mouthDrop: 0 }), 180, 0.8);
    expect(Array.from(withZero.pos)).toEqual(Array.from(before.pos));
    expect(G.derive(free).uneven).toBe(false);
  });

  it('only the free profile can drop the mouth', () => {
    expect(G.derive({ ...DEFAULTS, mouthDrop: 30 }).uneven).toBe(false);
    expect(G.derive({ ...free, mouthDrop: 30 }).uneven).toBe(true);
  });

  it('lowers the rim on one side only, and leaves the part below the highest point as it was', () => {
    const even = G.buildBody(G.derive({ ...free, topThread: false }), 180, 0.8);   // an uneven mouth has no thread
    for (const [mouthDrop, lowSide, highSide] of [[20, 'back', 'front'], [-20, 'front', 'back']]) {
      const shape = G.derive({ ...free, mouthDrop });
      const mesh = G.buildBody(shape, 180, 0.8);
      const rimRing = mesh.nZ - 1, segmentOf = { front: 0, back: mesh.nT / 2 };
      expect(heightAt(mesh, rimRing, segmentOf[highSide])).toBeCloseTo(shape.H, 4);
      expect(heightAt(mesh, rimRing, segmentOf[lowSide])).toBeCloseTo(shape.H - 20, 4);
      expect(shape.dropFrom).toBeCloseTo(shape.zb + 0.9 * shape.hb, 6);   // the highest seeded point
      const valuesBelow = 3 * mesh.nT * Math.floor((shape.dropFrom / shape.H) * (mesh.nZ - 1));
      expect(Array.from(mesh.pos.slice(0, valuesBelow))).toEqual(Array.from(even.pos.slice(0, valuesBelow)));
    }
  });

  it('undropZ undoes dropZ', () => {
    const shape = G.derive({ ...free, mouthDrop: -40 });
    for (const height of [5, 60, 150, shape.H]) {
      for (const angle of [0, 1, Math.PI]) expect(G.undropZ(shape, G.dropZ(shape, height, angle), angle)).toBeCloseTo(height, 6);
    }
  });

  it('drops the top thread, which needs a flat mouth', () => {
    expect(G.derive(free).thT).toBe(true);
    const shape = G.derive({ ...free, mouthDrop: 20 });
    expect(shape.thT).toBe(false);
    expect(G.capSpec(shape, 'top')).toBeNull();
    expect(G.capSpec(shape, 'bottom')).not.toBeNull();
  });

  it('exports the body as a closed shell, with an open or a closed base', () => {
    for (const params of [{ ...free, mouthDrop: 25 }, { ...presetParams(GOURD, DEFAULTS), mouthDrop: -25 }]) {
      const shape = G.derive(params);
      expect(shape.uneven).toBe(true);
      const info = inspectSTL(toSTL(G.buildShell(shape, 180, 0.8), 'body'));
      expect(info.openEdges).toBe(0);
      expect(info.volume).toBeGreaterThan(0);
      /* far less than the solid: it is only the wall (and the floor, when closed) */
      expect(info.volume).toBeLessThan(0.25 * G.volume(G.buildBody(shape, 180, 0.8)));
    }
  });

  it('the shell wall is two lines thick along its normal, over rings, ribs, twist and the drop', () => {
    const designs = [
      { ...free, mouthDrop: 25 },
      { ...free, mouthDrop: -20, ribShape: 'crest', ribRelief: 3, ribs: 12, twist: 40 },
      { ...presetParams(GOURD, DEFAULTS), mouthDrop: -25 },   // 58 sharp grooves, a narrow mouth
    ];
    for (const params of designs) {
      const shape = G.derive(params);
      const shell = G.buildShell(shape, 180, 0.8), outerRings = G.buildBody(shape, 180, 0.8).nZ;
      let thinnest = Infinity;
      for (let ring = outerRings; ring < shell.nZ; ring += 7) {
        for (let segment = 0; segment < shell.nT; segment += 13) {
          const k = (ring * shell.nT + segment) * 3, inner = [shell.pos[k], shell.pos[k + 1], shell.pos[k + 2]];
          const angle = Math.atan2(inner[1], inner[0]);
          const outerRadius = G.bodyR(shape, G.bodyRow(shape, G.undropZ(shape, inner[2], angle)), angle);
          /* where the wall is nearly flat the inset stops at four walls on purpose */
          if (outerRadius - Math.hypot(inner[0], inner[1]) > 3.99 * shape.shellWall) continue;
          thinnest = Math.min(thinnest, distanceToBody(G, shape, inner));
        }
      }
      expect(thinnest).toBeGreaterThan(0.95 * shape.shellWall);
    }
  });

  it('the support map measures the tilt of the dropped surface, not of the rows before the drop', () => {
    const shape = G.derive({ ...free, mouthDrop: 25 });
    const mesh = G.buildBody(shape, 360, 0.25), angles = G.measure(mesh, true).ang;
    /* the tilt of the surface as printed, from its normal worked out on r(θ, z) with the drop */
    const point = (height, angle) => {
      const radius = G.bodyR(shape, G.bodyRow(shape, height), angle);
      return [radius * Math.cos(angle), radius * Math.sin(angle), G.dropZ(shape, height, angle)];
    };
    let worst = 0;
    for (let ring = 1; ring < mesh.nZ - 1; ring += 4) {
      const height = mesh.zs[ring];
      if (height < shape.dropFrom + 2) continue;   // only where the drop tilts the rows
      for (let segment = 0; segment < mesh.nT; segment += 9) {
        const angle = (2 * Math.PI * segment) / mesh.nT + mesh.tws[ring], step = 1e-4;
        const [after, before, above, below] = [point(height, angle + step), point(height, angle - step), point(height + step, angle), point(height - step, angle)];
        const along = after.map((value, axis) => value - before[axis]), up = above.map((value, axis) => value - below[axis]);
        const normal = [along[1] * up[2] - along[2] * up[1], along[2] * up[0] - along[0] * up[2], along[0] * up[1] - along[1] * up[0]];
        const tilt = Math.atan(Math.abs(normal[2]) / Math.hypot(normal[0], normal[1]));
        worst = Math.max(worst, Math.abs(tilt - angles[ring * mesh.nT + segment]));
      }
    }
    expect((worst * 180) / Math.PI).toBeLessThan(0.5);   // the rows before the drop are 1° off here
  });

  it('tells when the body is too narrow for the whole shell wall', () => {
    expect(G.derive({ ...free, mouthDrop: 25 }).shellThin).toBe(false);
    const narrow = G.derive({ ...free, mouthDrop: 20, nozzle: 0.8, lw: 0.82, lh: 0.4, topD: 6, ribRelief: -3 });
    expect(narrow.shellThin).toBe(true);
    expect(narrow.shellWallMin).toBeLessThan(narrow.shellWall);
    /* the shell is no thicker than that anywhere: its inner surface stops 0.5 mm from the axis */
    const shell = G.buildShell(narrow, 180, 0.8), outerRings = G.buildBody(narrow, 180, 0.8).nZ;
    let thinnest = Infinity;
    for (let ring = outerRings; ring < shell.nZ; ring++) {
      for (let segment = 0; segment < shell.nT; segment++) {
        const k = (ring * shell.nT + segment) * 3, inner = [shell.pos[k], shell.pos[k + 1], shell.pos[k + 2]];
        if (Math.hypot(inner[0], inner[1]) > 0.5 + 1e-3) continue;
        const angle = Math.atan2(inner[1], inner[0]);
        thinnest = Math.min(thinnest, G.bodyR(narrow, G.bodyRow(narrow, G.undropZ(narrow, inner[2], angle)), angle) - 0.5);
      }
    }
    expect(thinnest).toBeGreaterThan(narrow.shellWallMin - 0.05);
  });

  it('loads mouthDrop from a file and limits it to the body', () => {
    expect(applyParams({ ...DEFAULTS }, { mouthDrop: -25 }).mouthDrop).toBe(-25);
    const shape = G.derive({ ...free, mouthDrop: 999 });
    expect(shape.drop).toBe(shape.dropMax);
    expect(shape.dropMax).toBeCloseTo(shape.H - shape.dropFrom - 3, 6);   // down to 3 mm above the highest point
  });
});

describe('smoothing the free profile', () => {
  /* how far each point sits from the line between its neighbours */
  const roughness = (points, baseRadius, mouthRadius) => points.reduce((sum, [height, radius], index) => {
    const [belowHeight, belowRadius] = index > 0 ? points[index - 1] : [0, baseRadius];
    const [aboveHeight, aboveRadius] = index < points.length - 1 ? points[index + 1] : [1, mouthRadius];
    const onLine = belowRadius + ((aboveRadius - belowRadius) * (height - belowHeight)) / (aboveHeight - belowHeight);
    return sum + (radius - onLine) ** 2;
  }, 0);
  const widestRadius = (points) => Math.max(...points.map(([, radius]) => radius));
  const zigzag = [[0.15, 1], [0.3, 0.4], [0.45, 1], [0.6, 0.35], [0.75, 0.95], [0.9, 0.3]];

  it('each pass leaves the profile smoother, with the same heights and the same widest radius', () => {
    let points = zigzag, previous = roughness(points, 0.5, 0.5);
    for (let click = 0; click < 5; click++) {
      points = G.smoothPoints(points, 0.5, 0.5);
      const current = roughness(points, 0.5, 0.5);
      expect(current).toBeLessThan(previous);
      previous = current;
      expect(points.map(([height]) => height)).toEqual(zigzag.map(([height]) => height));
      for (const [, radius] of points) {
        expect(radius).toBeGreaterThanOrEqual(0.06);
        expect(radius).toBeLessThanOrEqual(1);
      }
      expect(widestRadius(points)).toBeGreaterThan(0.95);   // the curve keeps its widest radius; a point may sit just off it
    }
  });

  it('fills the waist of the gourd a little more with every click', () => {
    const gourd = presetParams(GOURD, DEFAULTS), shape = G.derive(gourd);
    let points = gourd.pts, waist = points[1][1];
    for (let click = 0; click < 4; click++) {
      points = G.smoothPoints(points, shape.Rb / shape.Rmax, shape.Rt / shape.Rmax);
      expect(points[1][1]).toBeGreaterThan(waist);
      waist = points[1][1];
      expect(widestRadius(points)).toBeGreaterThan(0.95);   // the curve keeps its widest radius; a point may sit just off it
    }
  });

  it('leaves a near-straight profile alone when an end is already the widest', () => {
    /* base 0.094, mouth 0.796: the mouth is the widest, so there is no bulge to keep */
    const [[, radius]] = G.smoothPoints([[0.0366, 0.1214]], 0.094, 0.796);
    expect(Math.abs(radius - 0.1214)).toBeLessThan(0.02);   // it used to jump to 0.46
  });

  it('barely changes a profile that is already smooth', () => {
    const points = seedPoints(DEFAULTS), shape = G.derive({ ...DEFAULTS, profile: 'free', pts: points });
    const smoothed = G.smoothPoints(points, shape.Rb / shape.Rmax, shape.Rt / shape.Rmax);
    smoothed.forEach(([, radius], index) => expect(Math.abs(radius - points[index][1])).toBeLessThan(0.06));
  });
});

describe('plain bands without rings or ribs', () => {
  /* how much the radius changes around the part at one height: 0 where the wall is plain */
  const reliefAround = (shape, height) => {
    const row = G.bodyRow(shape, height);
    const radii = Array.from({ length: 720 }, (_, step) => G.bodyR(shape, row, (step * Math.PI) / 360));
    return Math.max(...radii) - Math.min(...radii);
  };
  const ringReliefAt = (shape, height) => G.bodyRow(shape, height).add;
  const gourd = presetParams(GOURD, DEFAULTS);

  it('no band leaves the part as it was', () => {
    const before = G.buildBody(G.derive(DEFAULTS), 180, 0.8);
    const withZero = G.buildBody(G.derive({ ...DEFAULTS, patternStart: 0, patternStop: 0 }), 180, 0.8);
    expect(Array.from(withZero.pos)).toEqual(Array.from(before.pos));
  });

  it('the ribs of the gourd start above the base band and keep their relief higher up', () => {
    const shape = G.derive({ ...gourd, patternStart: 8 });
    expect(reliefAround(G.derive(gourd), 2)).toBeGreaterThan(0.2);   // without the band they reach the floor
    expect(reliefAround(shape, 2)).toBeLessThan(1e-9);
    expect(reliefAround(shape, 8)).toBeLessThan(1e-9);
    expect(reliefAround(shape, shape.H / 2)).toBeGreaterThan(1);
  });

  it('the ribs of the gourd stop below the mouth band and keep their relief lower down', () => {
    const shape = G.derive({ ...gourd, patternStop: 8 });
    expect(reliefAround(G.derive(gourd), shape.H - 2)).toBeGreaterThan(0.2);   // without the band they reach the rim
    expect(reliefAround(shape, shape.H - 2)).toBeLessThan(1e-9);
    expect(reliefAround(shape, shape.H - 8)).toBeLessThan(1e-9);
    expect(reliefAround(shape, shape.H / 2)).toBeGreaterThan(1);
  });

  it('the rings are spread above the base band, and the lantern stays a closed solid within the tilt limit', () => {
    const shape = G.derive({ ...DEFAULTS, patternStart: 40 });
    expect(shape.ringsBottomZ).toBe(40);
    for (let height = shape.zb; height < shape.ringsBottomZ; height += 0.25) {   // below zb the threaded neck has its own groove
      expect(ringReliefAt(shape, height)).toBe(0);
      expect(reliefAround(shape, height)).toBeLessThan(1e-9);
    }
    const ringSpacing = (shape.ringsTopZ - shape.ringsBottomZ) / shape.rings;
    expect(Math.abs(ringReliefAt(shape, shape.ringsBottomZ + ringSpacing / 2))).toBeGreaterThan(0.1);   // the lowest ring
    expect(inspectSTL(toSTL(G.buildBody(shape, 180, 0.8), 'body')).openEdges).toBe(0);
    expect(G.measure(G.buildBody(shape, 192, 0.5, 6), false).overBody).toBeLessThanOrEqual(shape.limit + 5.5);
  });

  it('the rings are spread below the mouth band, and the lantern stays a closed solid within the tilt limit', () => {
    const shape = G.derive({ ...DEFAULTS, patternStop: 40 });
    for (let height = shape.ribsTopZ; height < shape.zt; height += 0.25) {   // above zt the threaded neck has its own groove
      expect(ringReliefAt(shape, height)).toBe(0);
      expect(reliefAround(shape, height)).toBeLessThan(1e-9);
    }
    const ringSpacing = (shape.ringsTopZ - shape.ringsBottomZ) / shape.rings;
    expect(Math.abs(ringReliefAt(shape, shape.ringsTopZ - ringSpacing / 2))).toBeGreaterThan(0.1);   // the highest ring
    expect(inspectSTL(toSTL(G.buildBody(shape, 180, 0.8), 'body')).openEdges).toBe(0);
    expect(G.measure(G.buildBody(shape, 192, 0.5, 6), false).overBody).toBeLessThanOrEqual(shape.limit + 5.5);
  });

  it('the rib fades stay within the tilt limit: they grow longer where the wall is already tilted', () => {
    /* the twisted vase has steep walls and deep ribs; a 10 mm band at each end */
    const twisted = { ...presetParams(PRESETS.findIndex((preset) => preset.id === 'twisted'), DEFAULTS), patternStart: 10, patternStop: 10 };
    const shape = G.derive(twisted);
    expect(G.measure(G.buildBody(shape, 360, 0.25), false).overBody).toBeLessThanOrEqual(shape.limit + 5.5);
    /* without the easing the fades keep their short length and the base fade overshoots */
    const eased = G.derive({ ...twisted, protect: false });
    expect(eased.ribFadeBottom).toBeLessThan(shape.ribFadeBottom);
    expect(G.measure(G.buildBody(eased, 360, 0.25), false).overBody).toBeGreaterThan(eased.limit + 5.5);
    /* a gentle wall keeps them short */
    const classic = G.derive({ ...DEFAULTS, patternStart: 10, patternStop: 10 });
    expect(classic.ribFadeTop).toBe(3);
    expect(classic.ribFadeBottom).toBe(3);
  });

  it('both bands together leave room for the pattern', () => {
    const shape = G.derive({ ...DEFAULTS, patternStart: 500, patternStop: 30 });
    expect(shape.plainBottom).toBeLessThanOrEqual(shape.ringsTopZ - 5);
    const info = inspectSTL(toSTL(G.buildBody(shape, 180, 0.8), 'body'));
    expect(info.openEdges).toBe(0);
    expect(info.degenerate).toBe(0);
  });
});
