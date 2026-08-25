// Shared by the object and the ground: everything that knows what shape we are rendering.
// The ground needs it so its cast shadow can march the real displaced surface instead of the
// smooth bounding shell.
precision highp float;

uniform sampler2D uHeight;
uniform vec2 uRepeat;
uniform float uDepth, uWorldPerUv, uExtent;
uniform int uShape;    // 0 sphere (L2), 1 cube (L-infinity), 2 cylinder (L2 in xz, L-inf in y)

const float PI = 3.14159265;

// Matches THREE.SphereGeometry's uv mapping, so every mode lines up.
vec2 sphereUv(vec3 d){
  float u = atan(d.z, -d.x) / (2.0*PI);
  return vec2(u - floor(u), 1.0 - acos(clamp(d.y,-1.0,1.0))/PI);
}

// Matches THREE.BoxGeometry's per-face uv layout, derived from its buildPlane() axis dirs.
vec2 boxUv(vec3 p){
  vec3 a = abs(p);
  float s = 0.5 / uExtent;
  if (a.x >= a.y && a.x >= a.z) return vec2(0.5 - sign(p.x)*p.z*s, 0.5 + p.y*s);
  if (a.y >= a.z)               return vec2(0.5 + p.x*s, 0.5 - sign(p.y)*p.z*s);
  return vec2(0.5 + sign(p.z)*p.x*s, 0.5 + p.y*s);
}

// Matches THREE.CylinderGeometry: side wraps by angle, caps are a disc projection.
// abs(y) > radius picks the cap, which is exactly where the norm below switches too.
vec2 cylUv(vec3 p){
  if (abs(p.y) > length(p.xz)){
    float s = sign(p.y);
    return vec2((p.x/uExtent + 1.0)*0.5, (p.z/uExtent*s + 1.0)*0.5);
  }
  float u = atan(p.x, p.z) / (2.0*PI);
  return vec2(u - floor(u), (p.y + uExtent) / (2.0*uExtent));
}

// The shell is "everything within uExtent of the origin under this norm". The raymarch never
// needs to know which shape it is on; the norm IS the shape.
float shapeNorm(vec3 p){
  if (uShape == 1) return max(max(abs(p.x), abs(p.y)), abs(p.z));
  if (uShape == 2) return max(length(p.xz), abs(p.y));
  return length(p);
}
vec2 shellUv(vec3 p){
  if (uShape == 1) return boxUv(p);
  if (uShape == 2) return cylUv(p);
  return sphereUv(normalize(p));
}

// Entry/exit of the shell at extent e: quadratic for the sphere, slab test for the box, and
// for the cylinder a quadratic in xz clipped by the y slab.
bool shellRange(vec3 ro, vec3 rd, float e, out float t0, out float t1){
  if (uShape == 0){
    float b = dot(ro,rd), c = dot(ro,ro) - e*e;
    float disc = b*b - c;
    if (disc <= 0.0) return false;
    float sq = sqrt(disc);
    t0 = -b - sq; t1 = -b + sq;
    return true;
  }
  if (uShape == 1){
    vec3 inv = 1.0 / rd;
    vec3 lo = min((-vec3(e) - ro) * inv, (vec3(e) - ro) * inv);
    vec3 hi = max((-vec3(e) - ro) * inv, (vec3(e) - ro) * inv);
    t0 = max(max(lo.x, lo.y), lo.z);
    t1 = min(min(hi.x, hi.y), hi.z);
    return t1 > t0;
  }
  float yA = (-e - ro.y) / rd.y, yB = (e - ro.y) / rd.y;   // inf when rd.y == 0, which min/max eats
  float ylo = min(yA, yB), yhi = max(yA, yB);
  float a = dot(rd.xz, rd.xz);
  if (a < 1e-8){                                            // ray parallel to the axis
    if (dot(ro.xz, ro.xz) > e*e) return false;
    t0 = ylo; t1 = yhi;
    return t1 > t0;
  }
  float b = dot(ro.xz, rd.xz), c = dot(ro.xz, ro.xz) - e*e;
  float disc = b*b - a*c;
  if (disc <= 0.0) return false;
  float sq = sqrt(disc);
  t0 = max((-b - sq)/a, ylo);
  t1 = min((-b + sq)/a, yhi);
  return t1 > t0;
}

// Tangent frame on the face the point belongs to, matching each uv mapping's +u / +v.
mat3 boxFrame(vec3 p){
  vec3 a = abs(p);
  if (a.x >= a.y && a.x >= a.z){ float s = sign(p.x); return mat3(vec3(0,0,-s), vec3(0,1,0), vec3(s,0,0)); }
  if (a.y >= a.z)              { float s = sign(p.y); return mat3(vec3(1,0,0), vec3(0,0,-s), vec3(0,s,0)); }
  float s = sign(p.z);           return mat3(vec3(s,0,0), vec3(0,1,0), vec3(0,0,s));
}
mat3 cylFrame(vec3 p){
  if (abs(p.y) > length(p.xz)){                             // cap: flat disc, u along +x
    vec3 N = vec3(0.0, sign(p.y), 0.0), T = vec3(1.0, 0.0, 0.0);
    return mat3(T, cross(N, T), N);                         // ponytail: green channel flips on
  }                                                         // the lower cap. Nobody looks there.
  vec3 N = normalize(vec3(p.x, 0.0, p.z));
  return mat3(vec3(N.z, 0.0, -N.x), vec3(0.0, 1.0, 0.0), N);
}
mat3 shellFrame(vec3 p){
  if (uShape == 1) return boxFrame(p);
  if (uShape == 2) return cylFrame(p);
  vec3 d = normalize(p);
  float th = acos(clamp(d.y,-1.0,1.0)), ph = atan(d.z,-d.x);
  return mat3(vec3(sin(ph), 0.0, cos(ph)),                       // +u
              vec3(cos(ph)*cos(th), sin(th), -sin(ph)*cos(th)),  // +v
              d);
}

// March the shell looking for the displaced surface. This is SPOM's inner loop, and it is also
// what the ground casts shadows against - same surface, so the shadow carries the real relief.
bool shellMarch(vec3 ro, vec3 rd, float steps, out float tHit){
  float rin = uExtent - uDepth * uWorldPerUv;
  float t, tEnd;
  if (!shellRange(ro, rd, uExtent, t, tEnd)) return false;
  t = max(t, 0.0);
  if (tEnd <= t) return false;
  float i0, i1;                                   // solid core: nothing to march past its entry
  if (shellRange(ro, rd, rin, i0, i1) && i0 > t) tEnd = min(tEnd, i0);
  float dt = (tEnd - t) / steps;
  float prevT = t;
  for (int i = 0; i < 256; i++){
    if (float(i) >= steps) break;
    vec3 p = ro + rd*t;
    float h = texture2D(uHeight, shellUv(p)*uRepeat).r;
    if (shapeNorm(p) <= mix(rin, uExtent, h)){
      for (int j = 0; j < 6; j++){                // bisect the crossing
        float m = (prevT + t) * 0.5;
        vec3 pm = ro + rd*m;
        float hm = texture2D(uHeight, shellUv(pm)*uRepeat).r;
        if (shapeNorm(pm) <= mix(rin,uExtent,hm)) t = m; else prevT = m;
      }
      tHit = t;
      return true;
    }
    prevT = t; t += dt;
  }
  return false;
}
