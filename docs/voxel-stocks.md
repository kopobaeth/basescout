# Stocks: dystopian voxel objects

The gallery now uses 13 authored 3D miniatures instead of rectangular ticker cards.
Company captions, the Index, search, reports, drag, pinch and keyboard navigation
retain the existing catalog and address mappings. These are editorial metaphors,
not representations of actual company facilities.

## Art direction

Two Codex image-generation concept artworks establish the direction: an ivory
consumer-technology terminal/device island and an automated logistics depot.
The image briefs specify fine cubic construction, broken concrete foundations,
industrial metal, cold cyan rim light, amber practical lamps, contact shadows,
and a beautiful dystopian atmosphere. No text, logos or UI in either concept.
The images are visual references; the gallery models are actual geometry authored
in `src/features/stocks/voxel/models.ts`, not image planes.

## Rendering

- Reuses pinned Three.js r128. One WebGL renderer serves only visible objects
  with viewport/scissor rendering and lazy, material-batched instanced meshes.
- MeshStandardMaterial, physically correct lights, inverse-square point lights,
  ACES tone mapping, sRGB output and soft shadow maps. These are real-time PBR
  scenes, not the path-traced output of the concept images.
- Mouse hover changes object rotation; reduced motion disables that rotation.
- DPR is capped at 1.75 (1.25 for coarse pointers). Scene resources are cached
  only when first viewed. Identical stationary frames are not redrawn.
- Hidden tabs pause rendering; resize, theme changes and context restoration
  invalidate the view. Unmount disposes geometry, materials, shadow maps,
  observers/listeners and the renderer.
- Without WebGL, a static software projection consumes the exact same voxel
  geometry, with face shading and soft ground shadows. Reports and exploration
  continue to work. This path does not claim live 3D interaction or PBR parity.
- The existing authored ThreeUI background is preserved and mounted only when
  WebGL is available, at a subdued host opacity behind the new objects.

## Checks

`npm run build`, `npm test`, `node --import tsx tests/voxel-models.test.ts` and
`node --import tsx tests/structure-flow-source.test.ts`.
Browser verification must distinguish live WebGL from the software path using
the `data-voxel-renderer` status on the stage. Do not report a software screenshot
as confirmation of WebGL lighting, shadows, hover rotation or context recovery.
