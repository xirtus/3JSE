#!/usr/bin/env bash
set -euo pipefail
if [ -f package.json ]; then
  npm run typecheck --if-present
  npm test --if-present
  npm run build --if-present
fi
node scripts/verify-harness.mjs 2>/dev/null || true
