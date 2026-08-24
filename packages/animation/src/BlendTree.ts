export interface BlendTreeEntry {
  clip: string;
  /** The parameter value at which this clip has full weight (1.0). */
  threshold: number;
}

export interface ClipWeight {
  clip: string;
  weight: number;
}

/**
 * A 1D blend tree — docs/ANIMATION.md's "1D (e.g. walk↔run by speed)" blend space. Pure math,
 * no Three.js dependency: given entries sorted by threshold and a parameter value, returns the
 * (at most two) clips whose weights should be non-zero, always summing to 1.0 — below the
 * lowest threshold or above the highest, the nearest single clip gets full weight rather than
 * extrapolating past the authored range.
 */
export function evaluate1DBlendWeights(entries: BlendTreeEntry[], parameter: number): ClipWeight[] {
  if (entries.length === 0) return [];
  const sorted = [...entries].sort((a, b) => a.threshold - b.threshold);
  if (sorted.length === 1) return [{ clip: sorted[0]!.clip, weight: 1 }];

  if (parameter <= sorted[0]!.threshold) return [{ clip: sorted[0]!.clip, weight: 1 }];
  const last = sorted[sorted.length - 1]!;
  if (parameter >= last.threshold) return [{ clip: last.clip, weight: 1 }];

  for (let i = 0; i < sorted.length - 1; i++) {
    const lower = sorted[i]!;
    const upper = sorted[i + 1]!;
    if (parameter >= lower.threshold && parameter <= upper.threshold) {
      const span = upper.threshold - lower.threshold;
      const t = span === 0 ? 0 : (parameter - lower.threshold) / span;
      return [
        { clip: lower.clip, weight: 1 - t },
        { clip: upper.clip, weight: t },
      ];
    }
  }
  // Unreachable given the bounds checks above, but keeps the function total.
  return [{ clip: last.clip, weight: 1 }];
}
