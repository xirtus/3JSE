export { SaveService, SAVE_RESOURCE } from "./SaveService.js";
export type { SaveSnapshot } from "./SaveService.js";
export { MemorySaveStorage, LocalStorageSaveStorage, defaultSaveStorage } from "./SaveStorage.js";
export type { SaveStorage } from "./SaveStorage.js";

// Registers Saveable against @3jse/runtime's ComponentRegistry as a side effect — same
// convention as every other @3jse/* package's builtin components.
import "./components.js";
