// Draw order of the scene layers. Dust multiplies what is already in the
// framebuffer, so it must sit between the far-side and near-side stars.
// Three sorts transparent objects by renderOrder before depth.
//
// `beacons` is applied to a Group (`beacons.group.renderOrder` in
// src/main.ts), and three turns a Group's renderOrder into groupOrder, which
// sorts before any individual object's renderOrder. So the first five
// entries here are per-object renderOrders that only matter relative to each
// other inside groupOrder 0, and `beacons` is a groupOrder that outranks all
// of them regardless of its numeric value. This works only because
// `galaxy.group` and every other layer container are left at their default
// renderOrder of 0; wrapping a new layer in a Group with a nonzero
// renderOrder would jump the whole contract ahead of or behind beacons.
export const RENDER_ORDER = {
  background: 0,
  glow: 1,
  farStars: 2,
  dust: 3,
  nearStars: 4,
  beacons: 5,
} as const
