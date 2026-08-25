uniform vec3 uLight;
uniform float uSteps;
uniform int uRender;
varying vec3 vPos;

// Cheap conservative reject first: if the ray misses the smooth bounding shell it cannot hit the
// displaced surface either, and that prunes almost every ground pixel before the march runs.
// Standard and POM do not change the object's silhouette, so for them the shell IS the surface.
bool blocked(vec3 ro, vec3 rd){
  float t0, t1;
  if (!shellRange(ro, rd, uExtent, t0, t1) || t1 <= max(t0, 0.0)) return false;
  if (uRender < 2) return true;
  float t;
  return shellMarch(ro, rd, uSteps * 0.5, t);
}

void main(){
  vec3 Ld = normalize(uLight);
  // Treat the light as a small disc instead of a point: ring of 8 offset rays, averaged. The
  // penumbra widens with distance from the contact point for free, which a single ray cannot do.
  vec3 up = abs(Ld.y) > 0.99 ? vec3(1.0,0.0,0.0) : vec3(0.0,1.0,0.0);
  vec3 T = normalize(cross(Ld, up)), B = cross(Ld, T);
  float lit = 0.0;
  for (int i = 0; i < 8; i++){
    float a = float(i) * 0.7853981;
    // 0.03 rad: a wider disc washes brick-scale notches out of the shadow edge entirely.
    if (!blocked(vPos, normalize(Ld + (T*cos(a) + B*sin(a)) * 0.03))) lit += 0.125;
  }

  float fade = 1.0 - smoothstep(2.0, 5.5, length(vPos.xz));   // dissolve into the background
  gl_FragColor = vec4(vec3(0.052,0.058,0.072) * mix(0.3, 1.0, lit), fade);

  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
