import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import es from '../src/i18n/locales/es.js';
import en from '../src/i18n/locales/en.js';
import { DEFAULTS, ENUMS, PRESETS, QUALITY } from '../src/core/params.js';
import { supportLevel } from '../src/core/print.js';
import { orcaLines, readme } from '../src/core/notes.js';
import * as G from '../src/core/geometry.js';

const LOCALES = { es, en };
const SRC = fileURLToPath(new URL('../src', import.meta.url));

/* { 'a.b': 'text', ... } */
function flatten(node, prefix = '', out = {}) {
  for (const [key, value] of Object.entries(node)) {
    if (value && typeof value === 'object') flatten(value, `${prefix}${key}.`, out);
    else out[prefix + key] = value;
  }
  return out;
}
const placeholders = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();

function sourceFiles(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) { if (entry.name !== 'locales') sourceFiles(path, out); }
    else if (/\.(js|vue)$/.test(entry.name)) out.push(path);
  }
  return out;
}

/* A stand-in for vue-i18n's `t`: enough to run the text builders of src/core without Vue. */
function translator(messages) {
  const flat = flatten(messages);
  const t = (key, named = {}) => {
    if (!(key in flat)) throw new Error(`missing message: ${key}`);
    return flat[key].replace(/\{(\w+)\}/g, (_, name) => {
      if (!(name in named)) throw new Error(`message ${key} needs {${name}}`);
      return String(named[name]);
    });
  };
  return { t, formatNumber: (value, digits = 0) => Number(value).toFixed(digits) };
}

const flat = Object.fromEntries(Object.entries(LOCALES).map(([code, messages]) => [code, flatten(messages)]));
const reference = flat.es;

describe('message files', () => {
  for (const [code, messages] of Object.entries(flat)) {
    it(`"${code}" has the same keys and placeholders as "es"`, () => {
      expect(Object.keys(messages).sort()).toEqual(Object.keys(reference).sort());
      for (const [key, text] of Object.entries(messages)) {
        expect(typeof text, key).toBe('string');
        expect(text.trim().length, key).toBeGreaterThan(0);
        expect(placeholders(text), key).toEqual(placeholders(reference[key]));
      }
    });

    it(`"${code}" keeps vue-i18n's special characters out of plain text`, () => {
      for (const [key, text] of Object.entries(messages)) {
        expect(text.replace(/\{\w+\}/g, ''), key).not.toMatch(/[{}@$|]/);
      }
    });
  }

  it('every message key used in the source exists', () => {
    const topLevel = new Set(Object.keys(es));
    const groups = new Set();
    for (const key of Object.keys(reference)) {
      const parts = key.split('.');
      for (let i = 1; i < parts.length; i++) groups.add(parts.slice(0, i).join('.') + '.');
    }
    const used = new Set();
    for (const file of sourceFiles(SRC)) {
      const code = readFileSync(file, 'utf8');
      /* keys passed straight to t() or setStatus(), including prefixes such as 'presets.' + id */
      for (const match of code.matchAll(/\b(?:t|setStatus)\(\s*'([\w.]+)'/g)) used.add(match[1]);
      /* keys kept in variables, tables or conditionals: any quoted dotted name under a message group */
      for (const match of code.matchAll(/'((?:[a-zA-Z]\w*\.)+\w+)'/g)) if (topLevel.has(match[1].split('.')[0])) used.add(match[1]);
    }
    expect(used.size).toBeGreaterThan(100);
    for (const key of used) {
      if (key.endsWith('.')) expect(groups.has(key), `message group ${key}`).toBe(true);
      else expect(key in reference, `message ${key}`).toBe(true);
    }
  });

  it('has a label for every preset, quality, option and support level', () => {
    for (const preset of PRESETS) expect(`presets.${preset.id}` in reference, preset.id).toBe(true);
    for (const id of Object.keys(QUALITY)) expect(`quality.${id}` in reference, id).toBe(true);
    for (const group of ['base', 'profile', 'curve', 'ribShape']) {
      for (const value of ENUMS[group]) expect(`options.${group}.${value}` in reference, `${group}.${value}`).toBe(true);
    }
    for (const pct of [60, 45, 20, 5, -5]) expect(`support.${supportLevel(pct).level}` in reference).toBe(true);
  });
});

describe('printing notes', () => {
  const variants = {
    'threaded lantern with cap holes': { ...DEFAULTS, topHole: true, botHole: true },
    'closed vase without threads': { ...DEFAULTS, base: 'closed', botThread: false, topThread: false },
  };
  for (const [code, messages] of Object.entries(LOCALES)) {
    for (const [name, params] of Object.entries(variants)) {
      it(`"${code}": ${name}`, () => {
        const shape = G.derive(params);
        const measures = G.measure(G.buildBody(shape, 96, 1), false);
        const caps = {};
        for (const which of ['bottom', 'top']) {
          const spec = G.capSpec(shape, which);
          if (spec) caps[which] = { spec };
        }
        const tr = translator(messages);
        const context = { params, shape, measures, caps };
        const lines = orcaLines(context, tr);
        expect(lines.length).toBeGreaterThanOrEqual(4);
        for (const [title, text] of lines) {
          expect(title).not.toMatch(/[{}]/);
          expect(text).not.toMatch(/[{}]|undefined|NaN/);
        }
        const text = readme(context, ['body.stl'], 'parameters.json', tr);
        expect(text).toContain('parameters.json');
        expect(text).not.toMatch(/[{}]|undefined|NaN/);
      });
    }
  }
});
