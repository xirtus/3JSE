/**
 * Local minimal declaration for troika-three-text (MIT, no bundled types,
 * no @types package exists). Covers the Text class's public surface used by
 * 3JSE; extend as adoption deepens. See docs/VENDOR_INTEGRATIONS.md.
 */
declare module "troika-three-text" {
  import { Color, Mesh, MeshStandardMaterial } from "three";

  export interface TextMaterial extends MeshStandardMaterial {
    uniformOpacity: number;
  }

  export class Text extends Mesh {
    text: string;
    fontSize: number;
    letterSpacing: number;
    lineHeight: number;
    maxWidth: number;
    textAlign: "left" | "right" | "center" | "justify";
    textIndent: number;
    whiteSpace: "normal" | "nowrap";
    overflowWrap: "normal" | "break-word";
    anchorX: number | "left" | "center" | "right";
    anchorY: number | "top" | "top-baseline" | "middle" | "bottom-baseline" | "bottom";
    color: string | number | Color;
    outlineWidth: number | string;
    outlineColor: string | number | Color;
    outlineBlur: number | string;
    outlineOpacity: number;
    strokeWidth: number | string;
    strokeColor: string | number | Color;
    strokeOpacity: number;
    fillOpacity: number;
    curveRadius: number;
    depthOffset: number;
    clipRect: [number, number, number, number] | null;
    orientation: string;
    glyphGeometryDetail: number;
    sdfGlyphSize: number | null;
    gpuAccelerateSDF: boolean;
    material: TextMaterial;
    getTextRenderInfo(): object;
    sync(callback?: () => void): void;
    dispose(): void;
  }

  export function createTextDerivedMaterial(baseMaterial: MeshStandardMaterial): TextMaterial;
  export function preloadFont(
    options: { font?: string | null; characters?: string | string[]; sdfGlyphSize?: number },
    callback?: (result: { glyphs: object; atlasTexture: object; timing: object }) => void,
  ): void;
}
