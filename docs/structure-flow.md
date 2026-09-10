# ThreeUI Structure Flow

Source revision: `40eb5bac81e3`. The five supplied files are preserved verbatim
under `vendor/threeui-40eb5bac81e3`, with their supplied SHA-256 hashes in its manifest.
The live renderer and runtime type bridge are byte-for-byte copies. Three.js is
pinned to r128 through the `three128` npm alias.

The requested Stocks gallery dark background uses `StructureFlowCollection` with
`variant="structure-flow"`, speed 1, point size 0.080, opacity 0.40, and mask 0.20–0.50.
The layer fills the viewport behind the gallery, is hidden from assistive technology,
and cannot intercept pointer input. Light mode unmounts it; System follows the OS.

## Host adaptations

The source family entry point imports 12 other variants whose renderers were not
included in the supplied bundle. The local entry point exposes only the requested
variant and retains lazy loading. It does not approximate missing scenes.
Only the relevant shared CSS is used; the background is transparent so the existing
Stocks backdrop remains visible.

The React lifecycle resumes after tab visibility changes, pauses when offscreen,
renders a static frame for reduced motion, and recreates the renderer after WebGL
context restoration. If WebGL is unavailable, the existing gallery remains usable.
Cleanup cancels frames, disconnects observers, removes listeners and disposes the
authored geometry, material and renderer. Geometry, camera, color and per-frame
rotation increments are unchanged.

## Validation

- `npm run build`
- `npm test`
- `node --import tsx tests/structure-flow-source.test.ts`
- Browser: dark/light toggles, animation, pointer drag and zoom, Index/report flow,
  responsive size, visibility, reduced motion and context restoration.
