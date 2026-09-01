// docs/EDITOR.md's Sequencer curve editing needs real easings; @galacean/editor-ui's
// BezierCurveEditor authors them. This is the runtime evaluation half.

export type Easing = "linear" | "easeIn" | "easeOut" | "easeInOut" | "step";

export function ease(t: number, kind: Easing): number {
  const x = Math.max(0, Math.min(1, t));
  switch (kind) {
    case "linear":
      return x;
    case "easeIn":
      return x * x;
    case "easeOut":
      return 1 - (1 - x) * (1 - x);
    case "easeInOut":
      return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
    case "step":
      return x < 1 ? 0 : 1;
  }
}
