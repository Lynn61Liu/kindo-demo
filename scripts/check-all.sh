#!/bin/sh
set -eu

project_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
python="$project_root/backend/.venv/bin/python"
node_runner="$project_root/scripts/with-node"

section() {
  printf '\n==> %s\n' "$1"
}

run() {
  printf '+ '
  printf '%s ' "$@"
  printf '\n'
  "$@"
}

if [ ! -x "$python" ]; then
  echo "Missing backend virtualenv Python: $python" >&2
  exit 1
fi
if [ ! -x "$node_runner" ]; then
  echo "Missing project Node runner: $node_runner" >&2
  exit 1
fi

section "Backend tests (APP_ENV=test; guarded PostgreSQL test databases only)"
# The pytest fixtures enforce the database guard before migrations or cleanup.
# Test rows are cleared only in school_pay_demo_test; migration checks use the
# separate school_pay_demo_migration_test database.
run env APP_ENV=test "$python" -m pytest "$project_root/backend/tests" -q

section "Backend dependency consistency"
run "$python" -m pip check

section "Web tests"
(
  cd "$project_root/web"
  run "$node_runner" npm test
)

section "Web production build"
(
  cd "$project_root/web"
  run "$node_runner" npm run build
)

section "Web lint"
(
  cd "$project_root/web"
  run "$node_runner" npm run lint
)

section "Mobile Jest tests"
(
  cd "$project_root/mobile"
  run "$node_runner" npm run test:ci
)

section "Mobile TypeScript check"
(
  cd "$project_root/mobile"
  run "$node_runner" npm run typecheck
)

section "Mobile lint"
(
  cd "$project_root/mobile"
  run "$node_runner" npm run lint
)

section "Expo SDK dependency compatibility"
(
  cd "$project_root/mobile"
  run "$node_runner" npx expo install --check
)

section "Expo Doctor"
(
  cd "$project_root/mobile"
  run "$node_runner" npx expo-doctor
)

section "All quality checks passed"
