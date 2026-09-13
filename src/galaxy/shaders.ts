// Shared GLSL chunks. orbitChunk mirrors orbitalSpeed() in generate.ts
// (beacons orbit with it on the CPU); keep the constants in sync.
export const orbitChunk = /* glsl */ `
uniform float uTime;
uniform float uOrbit;

vec3 orbitPosition(float radius, float angle0, float y) {
  float speed = 0.0875 / (0.3 + radius);
  float angle = angle0 + uTime * speed * uOrbit;
  return vec3(cos(angle) * radius, y, sin(angle) * radius);
}
`

// Point-sprite star profile. p is gl_PointCoord - 0.5. A tight core plus a
// faint wide halo, killed at the sprite edge so large points never show a
// square border under additive blending.
export const starProfileChunk = /* glsl */ `
float starCore(vec2 p) {
  float d2 = dot(p, p);
  float edge = 1.0 - smoothstep(0.4, 0.5, sqrt(d2));
  return (exp(-d2 * 60.0) + 0.10 * exp(-d2 * 8.0)) * edge;
}

float starSpikes(vec2 p) {
  float reach = max(0.0, 1.0 - length(p) * 2.0);
  return 0.35 * reach * reach * (exp(-abs(p.y) * 90.0) + exp(-abs(p.x) * 90.0));
}
`

// Spiked stars get a 2.5x sprite so the cross has room; the fragment shader
// scales the core back down. The constant appears in both shaders below.
export const galaxyVertex =
  orbitChunk +
  /* glsl */ `
uniform float uSize;
attribute float aRadius;
attribute float aAngle;
attribute float aY;
attribute float aSize;
attribute float aSpike;
attribute vec3 aColor;
varying vec3 vColor;
varying float vSpike;

void main() {
  vec4 mv = modelViewMatrix * vec4(orbitPosition(aRadius, aAngle, aY), 1.0);
  gl_Position = projectionMatrix * mv;
  float px = uSize * aSize / max(0.001, -mv.z);
  gl_PointSize = aSpike > 0.5 ? px * 2.5 : px;
  vColor = aColor;
  vSpike = aSpike;
}
`

export const galaxyFragment =
  starProfileChunk +
  /* glsl */ `
uniform float uIntensity;
varying vec3 vColor;
varying float vSpike;

void main() {
  vec2 p = gl_PointCoord - 0.5;
  float alpha = vSpike > 0.5 ? starCore(p * 2.5) + starSpikes(p) : starCore(p);
  gl_FragColor = vec4(vColor * uIntensity, alpha);
}
`
