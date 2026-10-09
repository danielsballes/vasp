# Vasp (Vue 3 + Vite + Bootstrap)

Parametric generator of single-wall lanterns, vases and planters for spiral vase mode printing, with
optional threads, matching smooth caps and STL export. It is the same application as the original
Claude artifact, rewritten as a Vite project.

Conventions: code, comments, identifiers and tests are in English. Everything the user sees (labels,
hints, messages, exported file names and the exported notes) lives in the message files under
`src/i18n/locales/` and is available in Spanish and English.

## Requirements

- Node.js 20 or newer
- pnpm

## Usage

```bash
pnpm install     # install dependencies
pnpm dev         # dev server with hot reload
pnpm test        # unit tests (Vitest)
pnpm lint        # ESLint: JavaScript, Vue components and CSS
pnpm build       # build into dist/
pnpm preview     # serve the built dist/ folder
```

## Layout

```
src/
  core/            Pure logic, no Vue and no browser APIs (testable with Node)
    geometry.js    Surface r(θ, z): profile, rings, ribs, threads, caps and meshes
    stl.js         Binary STL writer
    zip.js         Dependency-free ZIP writer
    print.js       Qidi Q2 nozzles and the layer-support calculation
    params.js      Defaults, presets and parameter validation
    designs.js     Library of saved designs: save, delete, serialise, merge a backup
    notes.js       Suggested Orca Slicer settings and the exported notes file
    format.js      Number and date formatting
  i18n/
    index.js       vue-i18n setup, language list, current language, t / nf / df helpers
    locales/       One message file per language (es.js, en.js)
  composables/
    useModel.js    Shared state: parameters, view options and the computed model
    useDesigns.js  Saved designs kept in local storage, backup and restore
    useExport.js   ZIP export and download
    useStatus.js   Status line shown in the header
  viewer/
    viewer.js      three.js 3D viewer with custom orbit controls
  components/      UI components
  assets/theme.css Ad Astra theme on top of Bootstrap's variables
tests/             Unit tests: geometry, saved designs and message files
```

## How it works

- **Geometry:** the whole model is a function of radius over angle and height. The preview mesh, the
  STL mesh and the wall-tilt measurement all come from it. Every body layer has a single closed
  contour, which is what spiral vase mode requires.
- **State:** `useModel()` exposes a reactive parameters object. The model is recomputed at most once
  per frame, even if a slider fires many changes.
- **Viewer:** drag orbits; the right or middle button, or Shift / Ctrl / Cmd + drag, pans; the wheel
  zooms. On touch screens one finger orbits and two fingers pan and pinch-zoom. With the canvas
  focused, the arrow keys orbit, Shift + arrows pan, `+` and `-` zoom and Home resets. A double
  click or the reset button also brings the starting view back.
- **Bootstrap:** only the compiled CSS is used, without Bootstrap's JavaScript. Vue drives the panel
  accordion. Colours and fonts are overridden through CSS variables in `src/assets/theme.css`, with
  light and dark themes following the system.
- **Download:** in development or on your own server the ZIP downloads directly. Inside a Claude
  artifact the page uses the viewer's save function instead.
- **Languages:** [vue-i18n](https://vue-i18n.intlify.dev/) in Composition API mode. Components call
  `useI18n()`; code outside components imports `t`, `nf` (numbers) and `df` (dates) from
  `src/i18n/index.js`. The first visit uses the browser language when the app speaks it and Spanish
  otherwise; the choice made in the header selector is remembered. `src/core` never imports
  vue-i18n: functions that produce text receive the translator as an argument.
- **Persistence:** everything is kept in the browser's local storage (not session storage, which is
  discarded when the tab closes), under three keys:
  - `vasp-v1`: the working state (parameters, view options, name of the design being
    edited), written on every change so the page reopens as it was left.
  - `vasp-designs-v1`: the designs saved by name in the "My designs" section.
  - `vasp-locale`: the interface language.

  Local storage belongs to one browser on one machine and is wiped when the site data is cleared.
  "Back up" downloads every saved design as one JSON file and "Restore" merges such a file back,
  which is also the way to move designs to another browser or computer.
- **Compatibility:** parameter files exported by the original artifact (`parametros.json`) still
  load; its Spanish option values are mapped to the English ones in `params.js`.

## Adding a language

1. Copy `src/i18n/locales/en.js` to a new file (for example `pt.js`) and translate the texts. Keep
   the keys and the `{placeholders}`; do not use `{ } @ $ |` as plain text, vue-i18n reserves them.
2. Import it in `src/i18n/index.js` and add it to `LOCALES` and to `messages`.
3. Add it to `LOCALES` in `tests/i18n.test.js` and run `pnpm test`: the tests fail if a key or a
   placeholder is missing.

## What the tests cover

- The body of every preset exports as a closed solid.
- Caps are closed solids and their clearance against the neck thread matches the configured value.
- A cap hole removes exactly its cylinder.
- Parameter loading validates types and accepts files from the original build.
- The layer-support calculation and the layer/line suggestion return the expected values.
- Saved designs: saving copies the parameters, a repeated name replaces the design, a backup
  survives a round trip, broken entries are skipped and restoring only replaces older designs.
- Message files: every language has the same keys and placeholders, no reserved characters, and
  every key used in the source exists.

They do not cover the UI and are no substitute for a test print.
