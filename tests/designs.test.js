import { describe, expect, it } from 'vitest';
import { DEFAULTS } from '../src/core/params.js';
import { NAME_MAX, mergeLibraries, parseLibrary, removeDesign, serializeLibrary, upsertDesign } from '../src/core/designs.js';

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
    expect(second.list.map((d) => d.name)).toEqual(['Planter', 'Hall lantern']);
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
    const a = upsertDesign([], 'A', DEFAULTS, T0);
    const b = upsertDesign(a.list, 'B', DEFAULTS, T0 + HOUR);
    expect(removeDesign(b.list, a.design.id).map((d) => d.name)).toEqual(['B']);
  });

  it('survives a round trip through JSON', () => {
    const a = upsertDesign([], 'A', { ...DEFAULTS, base: 'closed', H: 120 }, T0);
    const b = upsertDesign(a.list, 'B', { ...DEFAULTS, profile: 'free', pts: [[0.5, 0.8]] }, T0 + HOUR);
    const back = parseLibrary(JSON.parse(JSON.stringify(serializeLibrary(b.list))));
    expect(back).toEqual(b.list);
  });

  it('tells a wrong file from an empty library and skips broken entries', () => {
    expect(parseLibrary(null)).toBeNull();
    expect(parseLibrary({ app: 'Torno Espiral', version: 1, params: DEFAULTS })).toBeNull();
    expect(parseLibrary({ ...serializeLibrary([]) })).toEqual([]);
    const data = serializeLibrary(upsertDesign([], 'Good', DEFAULTS, T0).list);
    data.designs.push({ name: 'No parameters' }, null, { name: '', params: DEFAULTS }, { name: 'good', params: DEFAULTS });
    data.designs.push({ name: 'Odd values', savedAt: 'yesterday', params: { H: 'tall', base: 'cerrada' } });
    const list = parseLibrary(data, T0 + HOUR);
    expect(list.map((d) => d.name)).toEqual(['Odd values', 'Good']);
    expect(list[0].params.H).toBe(DEFAULTS.H);              // wrong types fall back to the defaults
    expect(list[0].params.base).toBe('closed');             // values from the original build still load
    expect(new Set(list.map((d) => d.id)).size).toBe(2);
  });

  it('restoring a backup adds new designs and only replaces older ones', () => {
    const current = upsertDesign(upsertDesign([], 'Kept', { ...DEFAULTS, H: 100 }, T0 + 2 * HOUR).list, 'Stale', { ...DEFAULTS, H: 100 }, T0).list;
    const backup = upsertDesign(upsertDesign(upsertDesign([], 'Kept', { ...DEFAULTS, H: 200 }, T0).list, 'Stale', { ...DEFAULTS, H: 200 }, T0 + HOUR).list, 'New', DEFAULTS, T0).list;
    const { list, changed } = mergeLibraries(current, backup);
    expect(changed).toBe(2);
    const byName = Object.fromEntries(list.map((d) => [d.name, d]));
    expect(byName.Kept.params.H).toBe(100);                 // the copy in the browser is newer
    expect(byName.Stale.params.H).toBe(200);                // the copy in the backup is newer
    expect(byName.Stale.id).toBe(current.find((d) => d.name === 'Stale').id);
    expect(Object.keys(byName).sort()).toEqual(['Kept', 'New', 'Stale']);
    expect(mergeLibraries(list, backup).changed).toBe(0);   // restoring twice changes nothing
  });
});
