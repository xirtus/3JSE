uniform sampler2D uHeight;
uniform vec2 uRepeat;
uniform float uDepth, uWorldPerUv;
uniform int uDisplace;

varying vec2 vUv;
varying vec3 vWorldPos;
varying vec3 vNormal;

const float PI = 3.14159265;

void main(){
  vUv = uv;
  vec3 pos = position;

  // Real displacement. Same surface SPOM raymarches, so the two modes should agree.
  // ponytail: shading still uses the smooth sphere normal + normal map, which already
  // encodes the fine slopes. Displacement here buys the silhouette and true parallax.
  // Sink along the welded direction rather than the face normal. Both faces meeting at a cube
  // edge share one direction there, so the edge stays closed instead of splitting open; the
  // 1/cos term keeps the depth measured perpendicular to the face. On a sphere normalize(pos)
  // IS the normal and the whole thing collapses to a plain radial offset.
  // ponytail: the sideways component of this shears the face and tears small gaps at high
  // Depth. Tried a pinned border skirt and welded normals instead - both looked worse.
  if (uDisplace == 1){
    float h = texture2D(uHeight, uv * uRepeat).r;
    vec3 dir = normalize(position);
    pos -= dir * ((1.0 - h) * uDepth * uWorldPerUv) / max(dot(dir, normal), 0.5);
  }

  vec4 wp = modelMatrix * vec4(pos, 1.0);
  vWorldPos = wp.xyz;
  vNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
