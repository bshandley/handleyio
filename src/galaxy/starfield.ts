import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Points,
  PointsMaterial,
} from 'three'

export function createStarfield(count = 2500, rand: () => number = Math.random): Points {
  const positions = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    // random point on a far sphere, radius 40-60
    const u = rand() * 2 - 1
    const phi = rand() * Math.PI * 2
    const s = Math.sqrt(1 - u * u)
    const r = 40 + rand() * 20
    positions[i * 3] = s * Math.cos(phi) * r
    positions[i * 3 + 1] = u * r
    positions[i * 3 + 2] = s * Math.sin(phi) * r
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(positions, 3))
  const material = new PointsMaterial({
    size: 1.2,
    sizeAttenuation: false,
    color: 0xbfd0ee,
    transparent: true,
    opacity: 0.7,
    depthWrite: false,
    blending: AdditiveBlending,
  })
  return new Points(geometry, material)
}
