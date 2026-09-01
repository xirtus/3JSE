// Claude Code PostToolUse hook. Reads the tool-call JSON on stdin; when a Write/Edit
// touched an asset file (model/texture/audio/anim), prints the 3JSE provenance reminder
// so it lands in the transcript. Non-blocking: always exits 0.
import { readFileSync } from 'node:fs';

const ASSET_RE = /\.(glb|gltf|fbx|obj|png|jpe?g|webp|ktx2?|basis|hdr|exr|wav|mp3|ogg|flac|bin)$/i;
const IN_VENDORED = /(^|\/)(vendor\/upstream|node_modules)\//;

let payload = '';
try { payload = readFileSync(0, 'utf8'); } catch { /* no stdin */ }

let path = '';
try {
  const j = JSON.parse(payload || '{}');
  path = j?.tool_input?.file_path || j?.tool_input?.path || '';
} catch { /* not JSON */ }

if (path && ASSET_RE.test(path) && !IN_VENDORED.test(path)) {
  process.stdout.write(
    `3JSE: asset touched (${path}). Record source URL, creator, license, attribution, ` +
    `commercial-use status, and download date in packages/vendor/licenses.json before use. ` +
    `Verify units, orientation, format, textures, and rig/animations.\n`,
  );
}
process.exit(0);
