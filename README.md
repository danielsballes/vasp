# Vasp

Parametric designer of vases, lanterns and planters for 3D printing. It runs entirely in the
browser: no account, no backend. It exports the body and its threaded caps as STL, with suggested
Orca Slicer settings.

A body prints either in spiral vase mode or with normal walls, depending on the design (see
[Geometry](#how-it-works)).

**Live:** https://danielsballes.github.io/vasp/

Built with Vue 3, Vite, three.js and Bootstrap's CSS.

## Requirements

- Node.js 22 (see `.nvmrc`)
- pnpm

## Commands

```bash
pnpm install     # install dependencies
pnpm dev         # dev server with hot reload
pnpm test        # unit tests (Vitest)
pnpm lint        # ESLint: JavaScript, Vue and CSS
pnpm build       # build into dist/
pnpm preview     # serve dist/
```

## Layout

```
src/
  core/            Pure logic: no Vue, no DOM, testable in Node
    geometry.js    Surface r(θ, z): profile, rings, ribs, threads, caps, shell and meshes
    stl.js         Binary STL writer
    zip.js         Dependency-free ZIP writer
    print.js       Nozzle data and the layer-support calculation
    params.js      Defaults, presets and parameter validation
    designs.js     Saved designs: save, delete, serialise, merge a backup
    notes.js       Suggested Orca Slicer settings and the exported notes
    format.js      Number and date formatting
  i18n/
    index.js       vue-i18n setup, language list, t / formatNumber / formatDate
    locales/       One message file per language (es.js, en.js)
  composables/
    useModel.js    Shared state: parameters, view options, computed model
    useDesigns.js  Saved designs in local storage, backup and restore
    useExport.js   ZIP export and download
    useStatus.js   Status line in the header
  viewer/
    viewer.js      three.js viewer with custom orbit controls
  components/      UI components
  assets/theme.css Theme tokens on top of Bootstrap's variables
tests/             Unit tests: geometry, saved designs, message files
```

## How it works

- **Geometry:** the model is one function, radius over angle and height. The preview, the STL and
  the support map all come from it. The body comes out in one of two forms:
  - **Solid, for spiral vase mode:** every layer is one closed contour.
  - **Shell, for normal walls:** with an uneven mouth (free profile only, drag one side's mouth
    handle down) the rim drops on that side and the top layers become open arcs. The body is
    exported as a wall two lines thick along its normal, the top thread is turned off and the Orca
    notes switch to normal-wall settings. The panel warns when the body is too narrow for the
    whole wall.
- **State:** `useModel()` exposes a reactive parameters object. The model is recomputed at most once
  per frame.
- **Viewer:** drag to orbit; right or middle button, or Shift / Ctrl / Cmd + drag, to pan; wheel to
  zoom. On touch screens, one finger orbits and two fingers pan and pinch-zoom. With the canvas
  focused: arrows orbit, Shift + arrows pan, `+` / `-` zoom, Home resets. Double click or the reset
  button also restores the view.
- **Styling:** Bootstrap's compiled CSS only, no Bootstrap JavaScript. Colours and fonts are CSS
  variables in `src/assets/theme.css`, with light and dark themes that follow the system.
- **Languages:** [vue-i18n](https://vue-i18n.intlify.dev/) in Composition API mode. Components call
  `useI18n()`; other code imports `t`, `formatNumber` and `formatDate` from `src/i18n/index.js`.
  `src/core` never imports vue-i18n: functions that produce text receive the translator as an
  argument. The first visit uses the browser language if supported, Spanish otherwise.
- **Persistence:** local storage, under three keys:
  - `vasp-v1`: working state, written on every change.
  - `vasp-designs-v1`: designs saved in "My designs".
  - `vasp-locale`: interface language.

  Local storage is per browser and is lost when site data is cleared. "Back up" downloads all saved
  designs as one JSON file; "Restore" merges it back, also into another browser.
- **Compatibility:** parameter files from earlier versions (`parametros.json`) still load;
  `params.js` maps their Spanish option values to the current ones.

## Adding a language

1. Copy `src/i18n/locales/en.js` (for example to `pt.js`) and translate it. Keep the keys and
   `{placeholders}`; never use `{ } @ $ |` in text, vue-i18n reserves them.
2. Import it in `src/i18n/index.js` and add it to `LOCALES` and `messages`.
3. Add it to `LOCALES` in `tests/i18n.test.js` and run `pnpm test`. The tests fail on any missing
   key or placeholder.

## Tests

- Every preset body exports as a closed solid.
- An uneven mouth exports as a closed shell whose wall keeps its thickness along the normal, and
  the support map measures the tilt of the dropped surface.
- Caps are closed solids, and their clearance against the neck thread matches the setting.
- A cap hole removes exactly its cylinder.
- Parameter loading validates types and accepts files from earlier versions.
- Layer support and the layer/line suggestion return the expected values.
- Saved designs: saving copies the parameters, a repeated name replaces the design, a backup
  survives a round trip, broken entries are skipped, restore only replaces older designs.
- Message files: same keys and placeholders in every language, no reserved characters, every key
  used in the source exists.

The UI is not covered. Tests do not replace a test print.

## License

See [LICENSE](LICENSE).
