import { describe, expect, it } from 'vitest';
import * as G from '../src/core/geometry.js';
import { toSTL } from '../src/core/stl.js';
import { DEFAULTS, PRESETS, applyParams, paramsFromFile, presetParams } from '../src/core/params.js';
import { suggestPrint, supportAt } from '../src/core/print.js';
import { capClearance, inspectSTL } from './helpers.js';

const GOURD = PRESETS.findIndex((preset) => preset.id === 'gourd');

describe('body', () => {
  PRESETS.forEach((preset, index) => {
    it(`preset "${preset.id}" exports as a closed solid`, () => {
      const shape = G.derive(presetParams(index, DEFAULTS));
      const mesh = G.buildBody(shape, 180, 0.8);
      const info = inspectSTL(toSTL(mesh, 'body'));
      expect(info.sizeOk).toBe(true);
      expect(info.openEdges).toBe(0);
      expect(info.degenerate).toBe(0);
      expect(info.volume).toBeGreaterThan(0);
      let smallestRadius = Infinity;
      for (const radius of mesh.radii) if (radius < smallestRadius) smallestRadius = radius;
      expect(smallestRadius).toBeGreaterThan(1);   // the radius never collapses
    });
  });

  it('the default lantern stays within the tilt limit plus the ring headroom', () => {
    const shape = G.derive(DEFAULTS);
    const measures = G.measure(G.buildBody(shape, 192, 0.5, 6), false);
    expect(measures.overBody).toBeLessThanOrEqual(shape.maxTilt + 5.5);
  });

  it('the gourd uses round segments: its lobes pass through the points and bulge outwards', () => {
    const shape = G.derive(presetParams(GOURD, DEFAULTS));
    const sampleAt = (heightShare) => Math.round((shape.bodyBottom + heightShare * shape.bodyHeight) / shape.sampleStep);
    for (const [heightShare, radiusShare] of shape.points) {
      expect(shape.wantedRadii[sampleAt(heightShare)]).toBeCloseTo(radiusShare * shape.maxRadius, 0);
    }
    const [lobe, waist] = shape.points;
    const wanted = shape.wantedRadii;
    for (let sample = sampleAt(lobe[0]) + 1; sample < sampleAt(waist[0]); sample++) {
      expect(wanted[sample - 1] + wanted[sample + 1] - 2 * wanted[sample]).toBeLessThan(-1e-6);   // strictly concave: no flat or hollow stretch
    }
  });
});

describe('threads and caps', () => {
  const shape = G.derive({ ...DEFAULTS });

  for (const which of ['bottom', 'top']) {
    it(`${which} cap is a closed solid with the configured clearance`, () => {
      const cap = G.capSpec(shape, which);
      const info = inspectSTL(toSTL(G.buildCap(shape, cap, 180, 0.3, false), 'cap'));
      expect(info.openEdges).toBe(0);
      expect(info.degenerate).toBe(0);
      const fit = capClearance(G, shape, cap);
      expect(fit.minGap).toBeCloseTo(shape.clearance, 2);   // never rubs: the minimum gap is the configured one
      expect(fit.engagement).toBeGreaterThan(0.5);          // and the thread does engage
    });
  }

  it('a cap hole removes exactly its cylinder and never exceeds the maximum', () => {
    const solidCap = G.capSpec(shape, 'top');
    const holedShape = G.derive({ ...DEFAULTS, topHole: true, topHoleD: 500 });
    const holedCap = G.capSpec(holedShape, 'top');
    expect(holedCap.hole).toBeCloseTo(holedCap.holeMax, 6);
    const solidMesh = G.buildCap(shape, solidCap, 180, 0.3, false);
    const holedMesh = G.buildCap(holedShape, holedCap, 180, 0.3, false);
    const info = inspectSTL(toSTL(holedMesh, 'cap'));
    expect(info.openEdges).toBe(0);
    const expected = G.volume(solidMesh) - Math.PI * holedCap.hole ** 2 * holedCap.floor;
    expect(info.volume / expected).toBeCloseTo(1, 2);
  });

  it('a closed bottom disables the bottom thread', () => {
    const closed = G.derive({ ...DEFAULTS, base: 'closed' });
    expect(closed.bottomThread).toBe(false);
    expect(G.capSpec(closed, 'bottom')).toBeNull();
  });
});

describe('parameters', () => {
  it('loads a parameters file written by the original Spanish-language build', () => {
    const params = applyParams({ ...DEFAULTS }, { base: 'cerrada', profile: 'libre', curve: 'redonda', ribShape: 'cresta', quality: 'fina', pts: [[0.5, 0.9], [0.2, 0.8]] });
    expect(params.base).toBe('closed');
    expect(params.profile).toBe('free');
    expect(params.curve).toBe('round');
    expect(params.ribShape).toBe('crest');
    expect(params.quality).toBe('fine');
    expect(params.pts[0][0]).toBe(0.2);                    // points come back sorted by height
  });

  it('ignores unknown keys and wrong types', () => {
    const params = applyParams({ ...DEFAULTS }, { H: 'tall', bogus: 1, topThread: 'yes' });
    expect(params.H).toBe(DEFAULTS.H);
    expect(params.topThread).toBe(DEFAULTS.topThread);
    expect('bogus' in params).toBe(false);
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
  const back = gourd.pts.map(([heightShare, radiusShare]) => [heightShare, +(radiusShare * 0.7).toFixed(4)]);
  const radiusAt = (mesh, ring, segment) => mesh.radii[ring * mesh.segmentCount + segment];

  it('equal sides give exactly the same mesh as a symmetric profile', () => {
    const symmetric = G.buildBody(G.derive(gourd), 180, 0.8);
    const copied = G.buildBody(G.derive({ ...gourd, ptsL: gourd.pts.map((point) => [...point]) }), 180, 0.8);
    expect(Array.from(copied.positions)).toEqual(Array.from(symmetric.positions));
  });

  it('a different back exports as a closed solid with front and back apart', () => {
    const shape = G.derive({ ...gourd, ptsL: back });
    expect(shape.twoSides).toBe(true);
    const mesh = G.buildBody(shape, 180, 0.8);
    const info = inspectSTL(toSTL(mesh, 'body'));
    expect(info.openEdges).toBe(0);
    expect(info.degenerate).toBe(0);
    expect(info.volume).toBeGreaterThan(0);
    const lowerLobe = Math.round(((shape.bodyBottom + 0.2967 * shape.bodyHeight) / shape.height) * (mesh.ringCount - 1));
    const front = radiusAt(mesh, lowerLobe, 0), rear = radiusAt(mesh, lowerLobe, mesh.segmentCount / 2);
    expect(rear / front).toBeLessThan(0.85);
  });

  it('the mouths stay round, so caps and threads still fit', () => {
    const shape = G.derive({ ...DEFAULTS, profile: 'free', pts: [[0.5, 1]], ptsL: [[0.5, 0.6]] });
    const mesh = G.buildBody(shape, 180, 0.8);
    for (const ring of [0, mesh.ringCount - 1]) {
      const radii = Array.from({ length: mesh.segmentCount }, (_, segment) => radiusAt(mesh, ring, segment));
      expect(Math.max(...radii) - Math.min(...radii)).toBeLessThan(1e-3);
    }
  });

  it('the blend never tilts the wall past the limit plus the ring headroom', () => {
    const shape = G.derive({ ...DEFAULTS, profile: 'free', pts: [[0.3, 1], [0.7, 0.8]], ptsL: [[0.4, 0.55], [0.8, 0.9]] });
    const measures = G.measure(G.buildBody(shape, 192, 0.5, 6), false);
    expect(measures.overBody).toBeLessThanOrEqual(shape.maxTilt + 5.5);
  });

  it('loads and validates the left points like the right ones', () => {
    const params = applyParams({ ...DEFAULTS }, { profile: 'free', pts: [[0.5, 0.9]], ptsL: [[0.6, 0.7], ['x', 1]] });
    expect(params.ptsL).toEqual([[0.6, 0.7]]);
    expect(applyParams({ ...DEFAULTS }, { ptsL: [] }).ptsL).toBeNull();
  });

  it('drops the old left points when a file has no ptsL (made before two sides)', () => {
    const twoSided = () => ({ ...DEFAULTS, profile: 'free', pts: [[0.5, 0.9]], ptsL: [[0.6, 0.7]] });
    expect(applyParams(twoSided(), { profile: 'free', pts: [[0.4, 1]] }).ptsL).toBeNull();
    expect(applyParams(twoSided(), { H: 150 }).ptsL).toEqual([[0.6, 0.7]]);
  });
});
