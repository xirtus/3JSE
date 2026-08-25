uniform sampler2D uBase, uNorm, uRough, uAO;
uniform float uSteps;
uniform int uRender;   // 0 standard, 1 POM, 2 SPOM, 3 displaced (geometry-side)
uniform int uView;     // 0 shaded, 1 normal map, 2 wireframe
uniform int uShadow;
uniform vec3 uLight;

varying vec2 vUv;
varying vec3 vWorldPos;
varying vec3 vNormal;

// ponytail: texture2D inside a loop = implicit LOD in non-uniform flow. Safe here only because
// uHeight carries no mipmaps, so level 0 is the only level there is.
float depthAt(vec2 uv){ return 1.0 - texture2D(uHeight, uv).r; }

// Tangent frame from screen-space derivatives (Schuler) - no tangent attribute needed.
mat3 cotangentFrame(vec3 N, vec3 p, vec2 uv){
  vec3 dp1 = dFdx(p), dp2 = dFdy(p);
  vec2 duv1 = dFdx(uv), duv2 = dFdy(uv);
  vec3 dp2perp = cross(dp2, N), dp1perp = cross(N, dp1);
  vec3 T = dp2perp*duv1.x + dp1perp*duv2.x;
  vec3 B = dp2perp*duv1.y + dp1perp*duv2.y;
  float inv = inversesqrt(max(dot(T,T), dot(B,B)));
  return mat3(T*inv, B*inv, N);
}

vec3 shade(vec3 P, vec3 N, vec3 albedo, float rough, float ao, float lit){
  vec3 V = normalize(cameraPosition - P);
  vec3 Ld = normalize(uLight);
  vec3 H = normalize(Ld + V);
  float ndl = max(dot(N,Ld), 0.0);
  float diff = ndl * lit;
  // Gate specular on N.L as well. A half-vector can still line up with the normal of a surface
  // that cannot see the light at all, which paints highlights across an entirely unlit face.
  float spec = pow(max(dot(N,H),0.0), mix(256.0,8.0,rough)) * (1.0-rough) * 0.5 * lit * ndl;
  vec3 amb = vec3(0.10,0.12,0.17) * ao;
  return albedo * (amb + diff) + spec;
}

// Parallax occlusion mapping: march the view ray through uv-space depth layers, then lerp the
// last two to land between them instead of on a step.
vec2 pom(vec2 uv, vec3 Vt){
  float n = mix(uSteps*1.5, uSteps, abs(Vt.z));
  float dLayer = 1.0 / n;
  vec2 dUv = Vt.xy / max(Vt.z, 0.05) * uDepth * dLayer;
  float layer = 0.0;
  float d = depthAt(uv);
  for (int i = 0; i < 192; i++){
    if (float(i) >= n || layer >= d) break;
    uv -= dUv; layer += dLayer;
    d = depthAt(uv);
  }
  vec2 prev = uv + dUv;
  float after  = d - layer;
  float before = depthAt(prev) - (layer - dLayer);
  return mix(uv, prev, after / min(after - before, -1e-4));  // denominator is always <= 0
}

// Self-shadowing: walk toward the light from the hit point, climbing from h0 to the top of the
// layer. Anything poking above that ray occludes. Keeps the worst penetration, not a yes/no,
// so the shadow edge is soft; the (1 - i/n) term fades distant occluders.
float heightShadow(vec2 uv, vec3 Lt, float h0){
  // Ramp across the terminator instead of switching at exactly 0, which pops a whole face
  // between lit and unlit as the light swings past grazing.
  float horizon = smoothstep(0.0, 0.25, Lt.z);
  if (horizon <= 0.0) return 0.0;
  float n = max(uSteps * 0.5, 4.0);
  // The (1-h0) is the ray's actual slope: a point near the top of the layer only has to climb
  // the little that is left, so it travels proportionally less sideways. Most implementations
  // drop this term and march the full width regardless, which over-shadows brick tops.
  vec2 dUv = Lt.xy / Lt.z * uDepth * (1.0 - h0) / n;
  float dH = (1.0 - h0) / n;
  float s = 0.0;
  for (int i = 1; i <= 96; i++){
    if (float(i) > n) break;
    uv += dUv;
    float rayH = h0 + dH * float(i);
    s = max(s, (texture2D(uHeight, uv).r - rayH) * (1.0 - float(i)/n));
  }
  return horizon * clamp(1.0 - s * 6.0, 0.0, 1.0);
}

// Same idea for SPOM, but the march is a world-space ray through the shell.
float shellShadow(vec3 P, vec3 Ld, float rin, vec3 Ng){
  float climb = dot(Ng, Ld);            // light below this surface's horizon, same as heightShadow;
  float horizon = smoothstep(0.0, 0.25, climb);   // without it a back-facing hit reports itself lit
  if (horizon <= 0.0) return 0.0;
  float n = max(uSteps * 0.5, 4.0);
  // Distance needed to escape the shell ALONG Ld, not straight up. Only counting the vertical
  // gap collapses the march to nothing at grazing light, exactly when the ray has the furthest
  // to travel sideways and the most chance of being blocked.
  float dt = (uExtent - shapeNorm(P)) / max(climb, 0.15) * 1.5 / n;
  float s = 0.0;
  for (int i = 1; i <= 96; i++){
    if (float(i) > n) break;
    vec3 p = P + Ld * (dt * float(i));
    float r = shapeNorm(p);
    if (r > uExtent) break;                               // left the shell, nothing left to hit
    float h = texture2D(uHeight, shellUv(p)*uRepeat).r;
    s = max(s, (mix(rin,uExtent,h) - r) * (1.0 - float(i)/n));
  }
  return horizon * clamp(1.0 - s / (uExtent - rin) * 6.0, 0.0, 1.0); // same hardness as heightShadow
}

void main(){
  if (uView == 2){ gl_FragColor = vec4(0.42,0.60,0.85,1.0); return; }  // wireframe lines

  float rin = uExtent - uDepth * uWorldPerUv;      // uv-space depth -> inner shell extent
  vec2 uv = vUv * uRepeat;
  vec3 P = vWorldPos;
  mat3 tbn;

  if (uRender == 2){                               // SPOM: raymarch the shell
    vec3 ro = cameraPosition;                      // mesh is untransformed => object space == world
    vec3 rd = normalize(vWorldPos - ro);
    float t;
    if (!shellMarch(ro, rd, uSteps, t)) discard;   // crossed the whole shell -> silhouette
    P = ro + rd*t;
    // Shade a box off the face this fragment belongs to, not off the hit point's dominant axis.
    // Marching inward shrinks the axis you entered on, so anywhere within a shell depth of an
    // edge the dominant axis flips mid-march and hands the hit a neighbouring face's basis - a
    // normal 90 degrees out, which lights patches of an unlit face as if they faced the camera.
    // vNormal is exact and constant per box face. Displaced never had this because it shades
    // from vNormal already. Curved surfaces have no faces to flip between, so they keep P.
    tbn = uShape == 1 ? boxFrame(vNormal) : shellFrame(P);
    // ponytail: analytic uv wraps at the seam, so a 1px mip line can show there. textureGrad if
    // it bothers you. On the cube the L-infinity shell mitres at each edge, so a hit just past
    // one takes the neighbouring face's tangent basis and its brick side walls shade as though
    // they faced the camera. Rejecting foreign-face hits fixes the lighting but deletes a whole
    // face at grazing angles - the handoff is load-bearing. Real fix is height-gradient normals.
    uv = shellUv(P) * uRepeat;

  } else {
    tbn = cotangentFrame(normalize(vNormal), vWorldPos, uv);
    if (uRender == 1){                             // POM: offset uv, silhouette stays the base mesh
      uv = pom(uv, normalize(normalize(cameraPosition - vWorldPos) * tbn));
    }
  }

  if (uView == 1){
    // Normal map at whatever uv this rendering mode resolved to.
    // pow() cancels the sRGB encode below so the file's literal pixels reach the screen.
    gl_FragColor = vec4(pow(texture2D(uNorm, uv).rgb, vec3(2.2)), 1.0);
  } else {
    float lit = 1.0;
    if (uShadow == 1){
      if (uRender == 2) lit = shellShadow(P, normalize(uLight), rin, tbn[2]);
      else              lit = heightShadow(uv, normalize(normalize(uLight) * tbn),
                                           texture2D(uHeight, uv).r);
    }
    vec3 N = normalize(tbn * (texture2D(uNorm,uv).rgb*2.0 - 1.0));
    gl_FragColor = vec4(shade(P, N, pow(texture2D(uBase,uv).rgb, vec3(2.2)),
                              texture2D(uRough,uv).r, texture2D(uAO,uv).r, lit), 1.0);
  }

  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
