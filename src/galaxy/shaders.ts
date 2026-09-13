import { ORBIT } from './orbit'

// Shared GLSL chunk. Mirrors src/galaxy/orbit.ts (beacons orbit with it on
// the CPU); keep the math and constants identical. Every instance rides a
// tilted ellipse: semi-major axis a, phase, eccentricity, plus a per-instance
// tilt offset (dust lanes sit on the concave side of the star ridge).
export const orbitChunk = /* glsl */ `
uniform float uTime;
uniform float uOrbit;
uniform float uSpin;
uniform float uWobble;
uniform float uPattern;
uniform float uArmPower;
uniform float uArmShift;

float orbitOmega(float a) {
  return 0.0875 / (0.3 + a);
}

float orbitTilt(float a, float offset) {
  return uSpin * a + uWobble * sin(a * 3.1) + uPattern * uTime + offset;
}

vec3 orbitPosition(float a, float phase0, float y, float ecc, float tiltOffset) {
  float phi = phase0 + orbitOmega(a) * uTime * uOrbit;
  float th = orbitTilt(a, tiltOffset);
  vec2 l = vec2(a * cos(phi), a * (1.0 - ecc) * sin(phi));
  float c = cos(th);
  float s = sin(th);
  return vec3(c * l.x - s * l.y, y, s * l.x + c * l.y);
}

// Direction of motion in world space (unnormalised), for aligning sprites.
vec3 orbitTangent(float a, float phase0, float ecc, float tiltOffset) {
  float phi = phase0 + orbitOmega(a) * uTime * uOrbit;
  float th = orbitTilt(a, tiltOffset);
  vec2 d = vec2(-a * sin(phi), a * (1.0 - ecc) * cos(phi));
  float c = cos(th);
  float s = sin(th);
  return vec3(c * d.x - s * d.y, 0.0, s * d.x + c * d.y);
}

// 1 on the arm ridge (ellipse major axis), 0 between arms. Circular
// instances (bulge, e = 0) have no ridge and return 0.
float orbitArmness(vec3 world, float a, float ecc, float tiltOffset) {
  if (ecc < 0.001) return 0.0;
  float psi = atan(world.z, world.x);
  float w = 0.5 + 0.5 * cos(2.0 * (psi - orbitTilt(a, tiltOffset) - uArmShift));
  return pow(max(w, 0.0), uArmPower);
}
`

/** Uniforms the orbit chunk needs; every orbiting material spreads these in. */
export function orbitUniforms() {
  return {
    uTime: { value: 0 },
    uOrbit: { value: 1 },
    uSpin: { value: ORBIT.spin },
    uWobble: { value: ORBIT.wobble },
    uPattern: { value: ORBIT.pattern },
    uArmPower: { value: ARM_POWER },
    uArmShift: { value: ARM_SHIFT },
  }
}

/** Sharpness of the armness peak; higher confines light to a narrower ridge. */
export const ARM_POWER = 3.0
/** Angular offset of the armness peak from the ellipse major axis (radians). */
export const ARM_SHIFT = 0.0

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
uniform float uArmLum;
uniform float uArmBlue;
uniform float uTwinkle;
attribute float aRadius;
attribute float aAngle;
attribute float aY;
attribute float aSize;
attribute float aSpike;
attribute float aEcc;
attribute float aLum;
attribute vec3 aColor;
varying vec3 vColor;
varying float vSpike;
varying float vLum;

void main() {
  vec3 world = orbitPosition(aRadius, aAngle, aY, aEcc, 0.0);
  vec4 mv = modelViewMatrix * vec4(world, 1.0);
  gl_Position = projectionMatrix * mv;
  float px = uSize * aSize / max(0.001, -mv.z);
  gl_PointSize = aSpike > 0.5 ? px * 2.5 : px;
  // young population: brighter and bluer while inside an arm
  float arm = orbitArmness(world, aRadius, aEcc, 0.0);
  float lum = aLum * (1.0 + uArmLum * arm);
  // giants only: slow per-star flicker keyed off the phase attribute
  if (aSpike > 0.5) {
    lum *= 1.0 + uTwinkle * sin(uTime * (0.7 + fract(aAngle * 7.31) * 1.3) + aAngle * 13.0);
  }
  vLum = lum;
  vec3 young = vec3(aColor.r * 0.85, aColor.g * 0.95, min(1.0, aColor.b + 0.15));
  vColor = mix(aColor, young, uArmBlue * arm);
  vSpike = aSpike;
}
`

export const galaxyFragment =
  starProfileChunk +
  /* glsl */ `
uniform float uIntensity;
varying vec3 vColor;
varying float vSpike;
varying float vLum;

void main() {
  vec2 p = gl_PointCoord - 0.5;
  float alpha = vSpike > 0.5 ? starCore(p * 2.5) + starSpikes(p) : starCore(p);
  gl_FragColor = vec4(vColor * uIntensity * vLum, alpha);
}
`
