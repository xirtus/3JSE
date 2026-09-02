// Curves + gradients sampled over normalized particle life (0..1). Piecewise-linear; the
// editor's VFX graph authors these.

export interface CurveKey {
  t: number; // 0..1
  v: number;
}
export interface GradientKey {
  t: number; // 0..1
  color: [number, number, number];
}

export function sampleCurve(keys: CurveKey[], t: number): number {
  if (keys.length === 0) return 1;
  if (t <= keys[0]!.t) return keys[0]!.v;
  if (t >= keys[keys.length - 1]!.t) return keys[keys.length - 1]!.v;
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i]!;
    const b = keys[i + 1]!;
    if (t >= a.t && t <= b.t) {
      const f = (t - a.t) / (b.t - a.t || 1);
      return a.v + (b.v - a.v) * f;
    }
  }
  return keys[keys.length - 1]!.v;
}

export function sampleGradient(keys: GradientKey[], t: number): [number, number, number] {
  if (keys.length === 0) return [1, 1, 1];
  if (t <= keys[0]!.t) return [...keys[0]!.color];
  if (t >= keys[keys.length - 1]!.t) return [...keys[keys.length - 1]!.color];
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i]!;
    const b = keys[i + 1]!;
    if (t >= a.t && t <= b.t) {
      const f = (t - a.t) / (b.t - a.t || 1);
      return [
        a.color[0] + (b.color[0] - a.color[0]) * f,
        a.color[1] + (b.color[1] - a.color[1]) * f,
        a.color[2] + (b.color[2] - a.color[2]) * f,
      ];
    }
  }
  return [...keys[keys.length - 1]!.color];
}
