import { cloneParams } from './params.js';

/* Library of saved designs: a list of { id, name, savedAt, params } kept most recent first.
   Pure functions that return new lists; the storage itself lives in composables/useDesigns.js. */

export const DESIGNS_KIND = 'torno-espiral-designs';
export const DESIGNS_VERSION = 1;
export const NAME_MAX = 60;

let counter = 0;
const newId = (now) => 'd' + now.toString(36) + (counter++).toString(36) + Math.floor(Math.random() * 1296).toString(36);

export const cleanName = (name) => String(name == null ? '' : name).replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
const sameName = (a, b) => a.toLocaleLowerCase() === b.toLocaleLowerCase();
const byRecent = (a, b) => b.savedAt - a.savedAt;

export function findByName(list, name) {
  const wanted = cleanName(name);
  return list.find((d) => sameName(d.name, wanted)) || null;
}

/* Saves `params` under `name`. A design with the same name (ignoring case) is replaced and keeps
   its id. Returns { list, design, replaced }, or null when the name is empty. */
export function upsertDesign(list, name, params, now = Date.now()) {
  const clean = cleanName(name);
  if (!clean) return null;
  const old = findByName(list, clean);
  const design = { id: old ? old.id : newId(now), name: clean, savedAt: now, params: cloneParams(params) };
  const rest = list.filter((d) => d !== old);
  return { list: [design, ...rest].sort(byRecent), design, replaced: !!old };
}

export const removeDesign = (list, id) => list.filter((d) => d.id !== id);

/* What gets written to storage and to a backup file. */
export function serializeLibrary(list) {
  return {
    app: 'Vasp',
    kind: DESIGNS_KIND,
    version: DESIGNS_VERSION,
    designs: list.map((d) => ({ id: d.id, name: d.name, savedAt: new Date(d.savedAt).toISOString(), params: d.params })),
  };
}

/* Reads back what serializeLibrary wrote, validating every entry. Returns null when `data` is not a
   design library at all, so the caller can tell a wrong file from an empty library. */
export function parseLibrary(data, now = Date.now()) {
  if (!data || typeof data !== 'object' || data.kind !== DESIGNS_KIND || !Array.isArray(data.designs)) return null;
  const list = [];
  const ids = new Set();
  for (const entry of data.designs) {
    if (!entry || typeof entry !== 'object' || !entry.params || typeof entry.params !== 'object') continue;
    const name = cleanName(entry.name);
    if (!name || findByName(list, name)) continue;
    const time = Date.parse(entry.savedAt);
    let id = typeof entry.id === 'string' && entry.id && !ids.has(entry.id) ? entry.id : newId(now);
    while (ids.has(id)) id = newId(now);
    ids.add(id);
    list.push({ id, name, savedAt: Number.isFinite(time) ? time : now, params: cloneParams(entry.params) });
  }
  return list.sort(byRecent);
}

/* Merges a restored library into the current one. Designs are matched by name; on a clash the most
   recently saved one wins. Returns { list, changed }, where `changed` counts added or updated designs. */
export function mergeLibraries(current, incoming) {
  let list = current.slice();
  let changed = 0;
  for (const design of incoming) {
    const old = findByName(list, design.name);
    if (old && old.savedAt >= design.savedAt) continue;
    const taken = list.some((d) => d !== old && d.id === design.id);
    const id = old ? old.id : taken ? newId(design.savedAt) : design.id;
    list = [...list.filter((d) => d !== old), { ...design, id }];
    changed++;
  }
  return { list: list.sort(byRecent), changed };
}
