import { describe, expect, it } from 'vitest';
import * as G from '../src/core/geometry.js';
import { toSTL } from '../src/core/stl.js';
import { DEFAULTS, PRESETS, applyParams, presetParams } from '../src/core/params.js';
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

  it('the gourd uses round segments: its lower lobe is a sphere', () => {
    const q = G.derive(presetParams(GOURD, DEFAULTS));
    const zc = q.zb + 0.2967 * q.hb;                       // centre of the lower lobe
    for (const dz of [10, 20, 30]) {
      const r = q.want[Math.round((zc + dz) / q.dz)];
      expect(Math.hypot(r, dz)).toBeCloseTo(q.Rmax, 0);
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
