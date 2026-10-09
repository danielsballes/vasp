import { describe, expect, it } from 'vitest';
import * as G from '../src/core/geometry.js';
import { toSTL } from '../src/core/stl.js';
import { DEFAULTS, PRESETS, applyParams, paramsFromFile, presetParams } from '../src/core/params.js';
import { suggestPrint, supportAt } from '../src/core/print.js';
import { capClearance, inspectSTL } from './helpers.js';

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
});
