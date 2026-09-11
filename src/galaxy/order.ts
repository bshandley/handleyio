// Draw order of the scene layers. Dust multiplies what is already in the
// framebuffer, so it must sit between the far-side and near-side stars.
// Three sorts transparent objects by renderOrder before depth.
export const RENDER_ORDER = {
  background: 0,
  glow: 1,
  farStars: 2,
  dust: 3,
  nearStars: 4,
  beacons: 5,
} as const
