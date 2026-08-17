# Upgrade & improvement plan

Status as of 2026-08-17: fork of dvx/lofi (upstream dormant since Dec 2024, fork is at upstream HEAD).
Auth already migrated to our own Spotify app (PKCE, loopback redirect).

## Track A — Modernize the stack

### A1. Dependency jump (mechanical)

One commit per bump so regressions bisect cleanly.

| Package | From | To | Notes |
|---|---|---|---|
| electron | 24.8.5 | ^43 (43.4.0) | Chromium 150, Node 24 embedded. Supported majors: 41–43. |
| electron-builder | 23 | ^26 | |
| typescript | 4.1 | ^5.9 | TS 7 (native) exists but ts-loader compat unproven; revisit later. |
| react / react-dom | 17 | ^19 | `ReactDOM.render` → `createRoot` in renderer.tsx; `@types/react` 19. |
| styled-components | 5 | ^6 | v6 is maintenance-mode; long-term we drift toward Mantine (A3). |
| @typescript-eslint | 5 | ^8 | keep eslint 8.57 — eslint 9 forces flat config and airbnb has no support |

Commit order (bisectable, never broken in between):
1. TypeScript 5.9 (pure tooling)
2. Electron 43 + electron-builder 26 + build-script fix, as ONE commit
3. React 19 (createRoot, @types 19, react-hook-form latest 7.x)
4. styled-components 6

Also:
- Fix `build` script: `node-gyp rebuild --target=4.0.1` targets Electron 4 headers
  (works only because the modules are N-API). Use `@electron/rebuild` or target the
  real Electron version.
- Read the cumulative breaking-changes page (electronjs.org/docs/latest/breaking-changes)
  for majors 25–43 before the Electron commit; the jump is 19 majors.
- styled-components 6 removed automatic prop filtering: rename custom props to
  transient (`$isPlaying`) and drop `@types/styled-components` (v6 ships its own).
- Post-Electron-bump manual test focus: `black-magic` pokes NSWindow internals —
  verify window drag, always-on-top, transparency, plus auth and visualizers.
- Verify: native modules (`black-magic`, `volume`) rebuild, app launches, auth works,
  visualizers render, window drag works.

Deliberately NOT bumped (working, no payoff): zod 3, electron-store 8 (v10 is
ESM-only; webpack can bundle it, but no feature we need), Mantine 6, lodash, dayjs.

### A2. Renderer/main security split

Today: `nodeIntegration: true, contextIsolation: false` (src/main/main.ts:107) and the
OAuth HTTP server runs inside the renderer (auth.ts is imported by React components).

- Move auth (PKCE, token refresh, loopback server) into the main process.
- Add a preload script exposing a typed bridge via `contextBridge`:
  auth (login/logout/onTokenChanged) + the existing ipcRenderer messages
  (~6 renderer files use ipcRenderer today).
- Flip to `contextIsolation: true, nodeIntegration: false`, but `sandbox: false`:
  the renderer's visualizer loads `volume.node` (src/visualizations/visualization.ts)
  and a sandboxed preload cannot require native modules. The preload requires the
  native and exposes audio data on the bridge; streaming frames over IPC isn't worth it.
- Spotify Web API calls stay in the renderer as plain fetch; token arrives over the bridge.

This is the change that makes every future Electron upgrade boring.

### A3. One styling system (deferred)

styled-components + Mantine/emotion coexist. Consolidate opportunistically when
touching files for features; no big-bang migration.

## Track B — Features / UX (after A)

Ordered by value per effort:

1. Idle state: replace the bare blinking logo with "Nothing playing — press play in
   Spotify" + last-played track, so it never reads as a hang.
2. Tray / menu-bar presence: current track + play/pause/skip without the floating window.
3. Free-account polish: hide playback controls instead of 403ing.
4. Auto-launch at login toggle.
5. macOS Now Playing / media-key integration.

## Track C — Ship it (k33bs fork, keeps the lofi name)

1. CI refresh: release.yml uses checkout@v2 / Node 16 / third-party builder action →
   actions@v4, Node 24 (matches Electron 43's embedded Node), drop `pip install
   packaging`, plain `yarn dist -p always`. Rides on A1.
2. First release: tag v3.0.0, GitHub Releases for macOS/Windows/Linux.
   macOS signing: "Developer ID Application: Valid LLC (5U4SMC4P84)" exists in the
   local Keychain — sign + notarize local builds with it (hardenedRuntime, audio-input
   entitlement for the volume daemon). Apple-side TODO: app-specific password (or App
   Store Connect API key) for notarytool. CI signing would need the cert exported to
   repo secrets — local-only signing is fine to start.
3. Auto-update (electron-updater) — only if people beyond us install it; needs signing
   to be worth it.

## Order

A1 → A2 → C1 → B1–B2 → C2, rest of B by appetite.
