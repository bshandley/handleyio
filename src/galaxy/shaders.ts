export const galaxyVertex = /* glsl */ `
uniform float uTime;
uniform float uSize;
attribute float aRadius;
attribute float aAngle;
attribute float aY;
attribute float aSize;
attribute vec3 aColor;
varying vec3 vColor;

void main() {
  // keep in sync with orbitalSpeed() in generate.ts (beacons orbit with it)
  float speed = 0.0875 / (0.3 + aRadius);
  float angle = aAngle + uTime * speed;
  vec3 pos = vec3(cos(angle) * aRadius, aY, sin(angle) * aRadius);
  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uSize * aSize / max(0.001, -mv.z);
  vColor = aColor;
}
`

export const galaxyFragment = /* glsl */ `
varying vec3 vColor;

void main() {
  float d = length(gl_PointCoord - 0.5);
  float alpha = smoothstep(0.5, 0.0, d);
  alpha *= alpha;
  gl_FragColor = vec4(vColor, alpha);
}
`
