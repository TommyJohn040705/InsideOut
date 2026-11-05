#!/usr/bin/env bash
# Builds an emulator-connected copy of the app and runs the two-user sync UI test.
set -euo pipefail
cd "$(dirname "$0")/.."
VITE_FIREBASE_API_KEY=demo-key VITE_FIREBASE_PROJECT_ID=demo-insideout VITE_FIREBASE_EMULATOR_HOST=127.0.0.1 \
  npx vite build --outDir dist-emulator --emptyOutDir >/dev/null
npx vite preview --outDir dist-emulator --port 4300 --strictPort >/tmp/insideout-preview.log 2>&1 &
PREVIEW=$!
trap 'kill $PREVIEW 2>/dev/null || true' EXIT
sleep 2
npx -y firebase-tools@15.35.0 emulators:exec --only auth,firestore --project demo-insideout "python3 e2e/sync_ui.py http://localhost:4300"
