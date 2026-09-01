// @3jse/templates — docs/TEMPLATES.md starter projects, each built only on the public
// Entity/Component/System API (docs/ROADMAP.md Phase 2 exit criterion).
export {
  buildThirdPersonTemplate,
  type ThirdPersonTemplate,
  type ThirdPersonOptions,
} from "./thirdPerson.js";
export { buildTopDownTemplate } from "./topDown.js";
export { buildFirstPersonTemplate } from "./firstPerson.js";

/** The genre starters `@3jse/project` / an editor "New Project" flow can enumerate. */
export const TEMPLATE_CATALOG = [
  { id: "third-person", label: "Third Person", build: "buildThirdPersonTemplate" },
  { id: "top-down", label: "Top-Down", build: "buildTopDownTemplate" },
  { id: "first-person", label: "First Person", build: "buildFirstPersonTemplate" },
] as const;
