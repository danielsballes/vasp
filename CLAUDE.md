# Vasp — guide for agents

Vasp (by Ad Astra) is a free, browser-only parametric designer of single-wall parts (vases,
lanterns, planters) for 3D printing in spiral vase mode. Users shape a part with presets, sliders
and a free profile, see layer by layer where the wall loses support, and export the STL files
(body + threaded caps) with suggested Orca Slicer settings. It is free, with no account and no
backend.

- Live: https://danielsballes.github.io/vasp/
- Repo: github.com/danielsballes/vasp (the local folder is still named `torno-espiral-vue`).
- **Read `README.md` first**: it explains the layout, the geometry model, state, i18n,
  persistence and what the tests cover. This file only adds what the README does not say.

## Commands

```bash
pnpm install
pnpm dev            # http://localhost:5173 (pass --port to change it)
pnpm lint           # ESLint for JS, Vue and CSS
pnpm test           # Vitest (Node, no browser)
pnpm build          # dist/, relative base ('./') so it can be served from any folder
pnpm preview        # serve dist/ — use this to check a build, the dev watcher can go stale
```

Run `pnpm lint` and `pnpm test` before every commit. Both must pass.

## Rules that are easy to break

- **Language split:** code, comments, identifiers, commits and PRs are in English. Everything
  the user sees lives in `src/i18n/locales/{es,en}.js`; add every new key to **both** files
  (`tests/i18n.test.js` fails otherwise). Never put `{ } @ $ |` in message text.
- **`src/core` is pure:** no Vue, no DOM, no vue-i18n. Functions that need text receive the
  translator as an argument. Keep new logic there when it can be tested in Node.
- **Spiral vase mode invariants** (`src/core/geometry.js`):
  - every body layer must stay one closed contour;
  - the wall tilt is limited by `shoulder`;
  - threaded necks must stay round, which is why ribs fade near them.

  The preview, the export and the support map all come from the same `r(θ, z)`, so a geometry
  change shows up everywhere. The tests check that every preset exports as a closed solid.
- **Support levels** (`src/core/print.js`): the share of each layer resting on the previous
  one. ≥50 % ample, 40–50 % enough, 15–40 % tight, <15 % scarce, ≤0 none. Don't confuse this %
  with the wall angle in degrees in any UI text.
- **Storage keys keep their old names** (`torno-espiral-vue-*`) and the design backup `kind` is
  `torno-espiral-designs`. This is on purpose, so saved designs keep loading after the rename to
  Vasp. Don't rename them.
- **Theme** (`src/assets/theme.css`): every colour is a token, with light and dark values.
  - Light: cream `--aa-bg #F3ECDF`, coffee ink `--aa-ink #2E1F15`, gold `--aa-accent #C9962E`.
  - Fonts: Archivo (wordmark "VASP": 800, `font-stretch:125%`, uppercase) and JetBrains Mono for
    numbers.
  - Contrast: the bright gold fails on cream, so focus rings, checked boxes, slider thumbs and
    other indicators use `--aa-accent-ui` (#8A6216, ≥3:1). Text needs 4.5:1. Check contrast
    when you add colours; Copilot reviews flag it.
- **Logo:** a line-art wasp whose abdomen has three stripes. It is inline in
  `src/components/AppHeader.vue` and in `public/favicon.svg`; keep both in sync.

## Git and releases

- Base branch `main`. Branch per change (`feat/…`, `fix/…`, `refactor/…`, `ci/…`), PR into
  `main`, assigned to `danielsballes`.
- Conventional commits in English. **No `Co-Authored-By` lines in commits**; PR descriptions end
  with the Claude Code line. Never amend or force-push a pushed branch; add a new commit.
- The owner's `/git-flux` skill runs this whole flow and waits for confirmation before opening a
  PR.
- `.github/workflows/verify-and-release.yml`: lint + test + build on every PR and push.
  - On `main`, semantic-release creates the `vX.Y.Z` tag and the GitHub release from the commit
    types (`fix` patch, `feat` minor, `!` major) and attaches `vasp-X.Y.Z.zip`.
  - `next` makes prereleases.
  - Releases and the current version: https://github.com/danielsballes/vasp/releases.
- `.github/workflows/deploy-pages.yml` publishes to GitHub Pages only after "Verify and Release"
  passed on a push to `main`.

## Screenshots and demo states (for the marketing videos)

- Headless Chrome via `puppeteer-core`. The Chrome binary is `npx hyperframes browser path`.
- Settings used for the app captures: 1920×1080, `deviceScaleFactor: 2`, `prefers-color-scheme:
  light`.
- Language: set `localStorage['torno-espiral-vue-locale'] = 'es' | 'en'` before load.
- Driving the UI from a script:
  - presets: click the `.presets button` whose text matches;
  - view modes: click the `label` "Body/Cuerpo", "Exploded/Despiece", "Assembled/Armado";
  - sliders: `#p-<param>` (`#p-H`, `#p-D`, `#p-ribs`, `#p-rings`…); set `value` with the native
    setter and dispatch `input`;
  - support map: `#support-map`;
  - export button: `#btn-export`.
- Wait ~1.5 s after a change before a screenshot (WebGL re-render).
- The marketing video projects (HyperFrames) live in `videos/`, which is git-ignored. Video
  production is handled in a separate session; this repo only provides the app.

## Environment notes (owner's Windows machine)

- Git Bash and PowerShell are both available. pnpm 12, Node 22 in CI (`.nvmrc`).
- FFmpeg (winget, Gyan) and Python 3.12 (with `faster-whisper`, `kokoro-onnx`) are installed, but
  the new PATH may not reach an already-open shell.
- A stale dev server may already be listening on port 5199. Don't trust it after switching
  branches; use `pnpm preview` on a free port to check a build.
