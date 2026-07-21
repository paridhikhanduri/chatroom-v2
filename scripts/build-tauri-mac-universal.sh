#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

npm run build:server-binary
cd src-tauri
cargo tauri build --target universal-apple-darwin --bundles app
