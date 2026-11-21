# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A Home Assistant Lovelace custom card (TypeScript, Lit, three.js r186) that renders a live 3D model of a home and binds model objects to HA entities. It is a fork of floor3dpro-card (itself a fork of floor3d-card). One bundle, `dist/floor3dx-card.js`, registers two cards: `floor3dx-card` and `floor3dx-rooms-card`. Both are distributed through HACS.

## Commands

```bash
npm ci
npm run build       # eslint src/*.ts, then esbuild bundle -> dist/floor3dx-card.js, then copy the Draco/Basis decoders into dist/
npm run bundle      # bundle + decoders, no lint
npm start           # watch mode, unminified
npm run typecheck   # tsc --noEmit
npm test            # unit tests: bundles test/unit/*.test.ts with esbuild into dev/out/unit/ and runs `node --test`
```

To run a single unit test file, run `npm test` once, then run its bundled output, e.g. `node --test dev/out/unit/config.test.mjs`. You can also filter by test name with `--test-name-pattern`. Unit tests cover logic that needs neither a DOM nor a renderer (config normalisation, entity_template rewriting, merge-static, rooms scanning, references, palettes, render-mode).

**Browser harness** (`dev/harness/`, Python + Playwright, headless Chromium with SwiftShader): this harness runs the *built* `dist/floor3dx-card.js`, so run `npm run build` or `npm run bundle` first.

```bash
pip install playwright && playwright install chromium
python3 dev/harness/test_rooms.py        # each test_*.py is standalone, prints PASS/FAIL lines, exits non-zero on failure
```

`run.py` serves the repo root on 127.0.0.1:8765 and loads `dev/harness/index.html`, a fake HA DOM with a fake `hass` object. Its query parameters (`model`, `skill`, `merge`, `fakegl`, …) are listed in that file. `?fakegl=1` swaps WebGL for a counting stub, which gives fast draw-call, texture and leak checks without pixels. `render_views.py` and `compare_views.py` do pixel diffs between builds against private models in `dev/private/` (not committed). Read `dev/harness/README.md` before adding a harness test.

CI (`.github/workflows/build.yml`) runs `npm run build` and `npm test`. It also fails if the bundle contains `<floor3dpro-`. Pushing a `v*` tag publishes a release with the card and decoder files.

## Fork identity: source says `floor3dpro-*`, bundle says `floor3dx-*`

The source deliberately keeps upstream element names (`@customElement('floor3dpro-card')`, `floor3dpro-card-editor`, `floor3dpro-button`, event names in `src/const.ts`, etc.), so that upstream changes merge easily. `fork-identity.mjs` rewrites these names to `floor3dx-*` in the bundle output at build time, and it also substitutes `__FLOOR3DX_BUILD__` with a UTC build timestamp. The regex only renames real element references (markup, quoted strings, CSS selectors), not prose. When you add a new `floor3dpro-<tag>` element, add it to `TAGS` in `fork-identity.mjs`. Code under `src/rooms/` is fork-only and uses `floor3dx-*` names directly, except `EMBEDDED_TAG`, which follows the rename.

`build.mjs` also does two other things:
- It stubs several `@material/mwc-*` modules, because HA already defines those elements and a second `customElements.define` would throw.
- It embeds the Draco wrapper and wasm through the virtual imports `embedded:draco-wrapper` and `embedded:draco-wasm` (typed in `src/embedded.d.ts`). This guarantees the decoder matches the bundled three.js even when the decoder files next to the card are stale.

## Architecture

- **`src/floor3dpro-card.ts`** (~5.5k lines) is the main card (`Floor3dCard`). It handles model loading and caching, scene setup, entity bindings by `type3d` (light, hide, color, door, rotate, text, image, shade, camera, gesture, …), the levels and zoom menus, the editor preview link, and the render loop. The engine design comes from upstream and is documented in `ENGINE.md`. Key ideas:
  - All rendering goes through `_requestRender(reason)`. Never call `render()` directly. The scheduler coalesces requests into one rAF.
  - The explicit readiness flags (`_engineAwake`, `_modelready`, `_compiling`) gate work.
  - A shared per-URL asset cache gives every card instance its own clone. Doors and pivots mutate geometry, so shared geometry must be cloned before it is modified. This was the origin of the door/window displacement bug fix.
  - Optional "pro skills" (`pro_skill`, `pro_log`) are implemented in `helpers.ts`.
- **Feature modules** are kept out of the main file to reduce upstream merge conflicts. Each one is opt-in from config: `look.ts` / `look-palettes.ts` (themed look, edge lines), `daylight.ts` (sun and weather), `transparency.ts`, `room-light.ts` (shader patch that keeps lamps in their room), `post.ts` (AO, bokeh, SMAA), `projection.ts` (two-point and orthographic), `image-frame.ts` (`type3d: image`, GIF and video), `merge-static.ts`, `render-mode.ts` (light units and colour management), `model-loader.ts` (compressed glTF: Draco, Meshopt, KTX2, WebP), `entity-template.ts` (safe `[[[ ]]]` JS templates, where `$entity` is a variable and is never pasted into the code).
- **Config**: `src/config.ts` defines `normalizeConfig()` (accepts short forms like booleans and object_id strings, used by the card and the editor) and `cleanConfig()` (what the editor writes back to YAML: long forms only, defaults dropped). `src/types.ts` holds `Floor3dCardConfig`. Any configuration written for floor3d-card or floor3dpro-card must keep rendering the same. Every new option is off unless configured.
- **Editors**: `editor.ts` is the main editor and is built on HA's `ha-form`, its selectors, and `ha-sortable`. The form schema lives in `editor-schema.ts`. If HA's components are unavailable, `editor.ts` falls back to `editor-classic.ts` (the 2.1 editor). The editor and the live preview card communicate through `window` CustomEvents (`EDITOR_EVENT` / `PREVIEW_EVENT` in `const.ts`): object names, the current view, tap-to-pick, and highlight.
- **Rooms Card** (`src/rooms/`) is a plain `HTMLElement`, not Lit. It embeds one or more `floor3dpro-card` elements (`models:` gives house, garage, …) and overlays a room layer: room detection from floor meshes (`rooms.ts`), pins, tinting, and a panel of control tiles (`tiles.ts`). Themes come from `themes.ts`. `rooms-editor.ts` is the card's editor. `scan.ts` and `references.ts` find floor3d cards on the dashboard and resolve `[[entity:…]]` reference tokens. The card's own events are `floor3dx-rooms-editor`, `floor3dx-rooms-preview`, and `floor3dx-rooms-select`.
- `elements/` holds thin mwc wrappers registered under the card's own tag names.
- `tools/` holds standalone Node scripts with their own `package.json`, for compressing models and textures and for removing objects.

## Conventions

- `dist/` is committed. Every change commit includes the rebuilt `dist/floor3dx-card.js`. Rebuild before committing.
- A version release bumps `package.json` and `CARD_VERSION` in `src/const.ts`, moves the `CHANGELOG.md` "Unreleased" entries under the new version, and updates the README section for the feature. Commit subjects follow the pattern `X.Y.Z: <short description>`. CHANGELOG entries name the harness test and how many checks it runs, e.g. `Harness: test_projection.py (14)`.
- `npm run lint` covers only `src/*.ts`. It does not cover `src/rooms/`. Prettier config is in `.prettierrc.js`.
- `tsconfig.json` runs with `strictNullChecks: false` and `noImplicitAny: false`. `tsconfig` (no extension) is a JSON schema file, not a config.
- `docs/floor3dpro-card-README.md` is the upstream reference and is kept unmodified.
