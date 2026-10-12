import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as G from '../src/core/geometry.js';
import { toSTL } from '../src/core/stl.js';
import { DEFAULTS, cloneParams } from '../src/core/params.js';
import { NAME_MAX, mergeLibraries, parseLibrary, removeDesign, serializeLibrary, upsertDesign } from '../src/core/designs.js';
import { stlFingerprint } from './helpers.js';

const T0 = Date.UTC(2026, 0, 1);
const HOUR = 3600e3;

describe('saved designs', () => {
  it('saves a copy of the parameters, most recent first', () => {
    const params = { ...DEFAULTS, H: 150, profile: 'free', pts: [[0.3, 0.9], [0.7, 0.5]] };
    const first = upsertDesign([], '  Hall   lantern ', params, T0);
    expect(first.replaced).toBe(false);
    expect(first.design.name).toBe('Hall lantern');
    expect(first.design.params.H).toBe(150);
    params.pts[0][1] = 0.1;                                 // later edits must not reach the saved copy
    expect(first.design.params.pts[0][1]).toBe(0.9);

    const second = upsertDesign(first.list, 'Planter', { ...DEFAULTS, H: 90 }, T0 + HOUR);
    expect(second.list.map((design) => design.name)).toEqual(['Planter', 'Hall lantern']);
  });

  it('saving under an existing name replaces that design and keeps its id', () => {
    const first = upsertDesign([], 'Lantern', { ...DEFAULTS, H: 150 }, T0);
    const again = upsertDesign(first.list, 'LANTERN', { ...DEFAULTS, H: 180 }, T0 + HOUR);
    expect(again.replaced).toBe(true);
    expect(again.list).toHaveLength(1);
    expect(again.design.id).toBe(first.design.id);
    expect(again.list[0].params.H).toBe(180);
    expect(first.list[0].params.H).toBe(150);               // the previous list is left untouched
  });

  it('rejects an empty name and trims long ones', () => {
    expect(upsertDesign([], '   ', DEFAULTS, T0)).toBeNull();
    expect(upsertDesign([], 'x'.repeat(200), DEFAULTS, T0).design.name).toHaveLength(NAME_MAX);
  });

  it('removes a design by id', () => {
    const first = upsertDesign([], 'A', DEFAULTS, T0);
    const second = upsertDesign(first.list, 'B', DEFAULTS, T0 + HOUR);
    expect(removeDesign(second.list, first.design.id).map((design) => design.name)).toEqual(['B']);
  });

  it('survives a round trip through JSON', () => {
    const first = upsertDesign([], 'A', { ...DEFAULTS, base: 'closed', H: 120 }, T0);
    const second = upsertDesign(first.list, 'B', { ...DEFAULTS, profile: 'free', pts: [[0.5, 0.8]] }, T0 + HOUR);
    const back = parseLibrary(JSON.parse(JSON.stringify(serializeLibrary(second.list))));
    expect(back).toEqual(second.list);
  });

  it('tells a wrong file from an empty library and skips broken entries', () => {
    expect(parseLibrary(null)).toBeNull();
    expect(parseLibrary({ app: 'Vasp', version: 1, params: DEFAULTS })).toBeNull();
    expect(parseLibrary({ ...serializeLibrary([]) })).toEqual([]);
    const data = serializeLibrary(upsertDesign([], 'Good', DEFAULTS, T0).list);
    data.designs.push({ name: 'No parameters' }, null, { name: '', params: DEFAULTS }, { name: 'good', params: DEFAULTS });
    data.designs.push({ name: 'Odd values', savedAt: 'yesterday', params: { H: 'tall', base: 'cerrada' } });
    const list = parseLibrary(data, T0 + HOUR);
    expect(list.map((design) => design.name)).toEqual(['Odd values', 'Good']);
    expect(list[0].params.H).toBe(DEFAULTS.H);              // wrong types fall back to the defaults
    expect(list[0].params.base).toBe('closed');             // values from the original build still load
    expect(new Set(list.map((design) => design.id)).size).toBe(2);
  });

  it('restoring a backup adds new designs and only replaces older ones', () => {
    const current = upsertDesign(upsertDesign([], 'Kept', { ...DEFAULTS, H: 100 }, T0 + 2 * HOUR).list, 'Stale', { ...DEFAULTS, H: 100 }, T0).list;
    const backup = upsertDesign(upsertDesign(upsertDesign([], 'Kept', { ...DEFAULTS, H: 200 }, T0).list, 'Stale', { ...DEFAULTS, H: 200 }, T0 + HOUR).list, 'New', DEFAULTS, T0).list;
    const { list, changed } = mergeLibraries(current, backup);
    expect(changed).toBe(2);
    const byName = Object.fromEntries(list.map((design) => [design.name, design]));
    expect(byName.Kept.params.H).toBe(100);                 // the copy in the browser is newer
    expect(byName.Stale.params.H).toBe(200);                // the copy in the backup is newer
    expect(byName.Stale.id).toBe(current.find((design) => design.name === 'Stale').id);
    expect(Object.keys(byName).sort()).toEqual(['Kept', 'New', 'Stale']);
    expect(mergeLibraries(list, backup).changed).toBe(0);   // restoring twice changes nothing
  });
});

/* `fixtures/saved-designs.json` is a design library saved in the current format, together with the
   loaded parameters and a fingerprint of every part each design exported, both worked out with the
   code before the readable-names refactor. Loading it now must give the same parameters and the
   same parts, so renaming code never breaks a design someone already saved. */
describe('designs saved before the renames', () => {
  const fixture = JSON.parse(readFileSync(new URL('./fixtures/saved-designs.json', import.meta.url), 'utf8'));
  const designs = parseLibrary(fixture.library);

  it('all load, with the same parameters', () => {
    expect(designs.map((design) => design.name)).toEqual(Object.keys(fixture.expected));
    for (const design of designs) {
      const loaded = cloneParams(design.params), expected = fixture.expected[design.name].params;
      for (const [key, value] of Object.entries(loaded)) {
        /* a parameter added after the fixture was made comes in at its default */
        expect(value, `${design.name}, ${key}`).toEqual(key in expected ? expected[key] : DEFAULTS[key]);
      }
      for (const key of Object.keys(expected)) expect(loaded, `${design.name}, ${key}`).toHaveProperty(key);
    }
  });

  it('export the same body and caps', () => {
    for (const design of designs) {
      const shape = G.derive(cloneParams(design.params));
      const parts = { body: stlFingerprint(toSTL(G.buildBody(shape, 180, 0.8), 'body')) };
      for (const which of ['bottom', 'top']) {
        const cap = G.capSpec(shape, which);
        if (cap) parts[which] = stlFingerprint(toSTL(G.buildCap(shape, cap, 180, 0.25, false), which + ' cap'));
      }
      const expected = fixture.expected[design.name].parts;
      expect(Object.keys(parts), design.name).toEqual(Object.keys(expected));
      for (const [part, fingerprint] of Object.entries(parts)) {
        const label = `${design.name}, ${part}`;
        expect(fingerprint.triangles, label).toBe(expected[part].triangles);
        /* equal up to a millionth of the value: only last-bit rounding may differ */
        const same = (value, wanted, what) => expect(Math.abs(value - wanted), `${label}, ${what}`).toBeLessThanOrEqual(1e-6 * Math.max(1, Math.abs(wanted)));
        same(fingerprint.volume, expected[part].volume, 'volume');
        same(fingerprint.area, expected[part].area, 'area');
        for (const key of ['sums', 'squares', 'weighted', 'low', 'high']) {
          fingerprint[key].forEach((value, axis) => same(value, expected[part][key][axis], `${key}[${axis}]`));
        }
      }
    }
  });
});
