#!/bin/sh
# Read-only checks for the local Kindo demo. This script never changes services,
# databases, dependencies, or project files.
set -u

project_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd) || exit 1
failures=0

ok() {
  printf '  OK   %s\n' "$1"
}

fail() {
  printf '  FAIL %s\n' "$1" >&2
  failures=$((failures + 1))
}

printf 'Kindo demo preflight (read-only)\n'

# Docker CLI, Compose plugin, daemon, and the existing project's PostgreSQL.
if ! command -v docker >/dev/null 2>&1; then
  fail 'Docker CLI is missing. Install or enable Docker Desktop/Engine, then rerun this check.'
elif ! docker compose version >/dev/null 2>&1; then
  fail 'Docker Compose is unavailable. Enable the Compose v2 plugin, then rerun this check.'
elif ! docker info >/dev/null 2>&1; then
  fail 'Docker engine is not reachable. Start Docker Desktop/Engine, then rerun this check.'
else
  ok 'Docker and Docker Compose are available.'
  compose_file="$project_root/compose.yaml"
  if [ ! -f "$compose_file" ]; then
    fail 'compose.yaml is missing from the project root.'
  else
    postgres_id=$(docker compose -f "$compose_file" -p kindo-demo ps -q postgres 2>/dev/null)
    if [ -z "$postgres_id" ]; then
      fail 'PostgreSQL container for project kindo-demo is not present. Start the existing database with: docker compose up -d --wait postgres'
    else
      postgres_health=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}no-healthcheck{{end}}' "$postgres_id" 2>/dev/null)
      if [ "$postgres_health" = healthy ]; then
        ok 'PostgreSQL container is healthy.'
      elif [ "$postgres_health" = starting ]; then
        fail 'PostgreSQL is still starting. Wait for it to become healthy, then rerun this check.'
      else
        fail "PostgreSQL health is '$postgres_health'. Inspect it with: docker compose ps postgres"
      fi
    fi
  fi
fi

# Backend virtualenv and exact pinned packages from requirements.lock.
backend_python="$project_root/backend/.venv/bin/python"
backend_lock="$project_root/backend/requirements.lock"
if [ ! -x "$backend_python" ]; then
  fail 'Backend virtual environment is missing. Create it with: python3 -m venv backend/.venv'
elif [ ! -f "$backend_lock" ]; then
  fail 'backend/requirements.lock is missing.'
else
  if "$backend_python" - "$backend_lock" <<'PY'
import json
import re
import subprocess
import sys

lock_path = sys.argv[1]
expected = {}
for raw in open(lock_path, encoding="utf-8"):
    line = raw.strip()
    if not line or line.startswith("#"):
        continue
    match = re.fullmatch(r"([A-Za-z0-9_.-]+)==([^;\s]+)", line)
    if not match:
        print("Lock file contains a non-exact or unsupported pin.")
        sys.exit(2)
    expected[re.sub(r"[-_.]+", "-", match.group(1)).lower()] = match.group(2)

try:
    result = subprocess.run(
        [sys.executable, "-m", "pip", "list", "--format=json"],
        check=True,
        capture_output=True,
        text=True,
    )
    installed = {
        re.sub(r"[-_.]+", "-", item["name"]).lower(): item["version"]
        for item in json.loads(result.stdout)
    }
except (subprocess.CalledProcessError, json.JSONDecodeError, KeyError, TypeError):
    print("Could not read installed backend package versions.")
    sys.exit(2)

problems = [
    f"{name}=={version} (installed {installed.get(name, 'missing')})"
    for name, version in expected.items()
    if installed.get(name) != version
]
if problems:
    print("Backend packages do not match requirements.lock: " + ", ".join(problems))
    sys.exit(1)
PY
  then
    if "$backend_python" -m pip check >/dev/null 2>&1; then
      ok 'Backend virtual environment matches requirements.lock and dependencies are consistent.'
    else
      fail 'Backend dependency metadata is inconsistent. Review the backend virtual environment against backend/requirements.lock.'
    fi
  else
    fail 'Backend virtual environment does not match backend/requirements.lock. Install the locked dependencies into backend/.venv, then rerun this check.'
  fi
fi

# Project-pinned Node and installed web/mobile packages plus the scripts needed
# to run and verify each client. Inspect package.json only; do not invoke scripts.
project_node="$project_root/scripts/with-node"
if [ ! -x "$project_node" ] || ! "$project_node" node --version >/dev/null 2>&1; then
  fail 'Project-pinned Node.js is unavailable. Run: python3 scripts/setup-node.py'
else
  ok "Project-pinned Node.js is available ($("$project_node" node --version))."
  for client in web mobile; do
    package_json="$project_root/$client/package.json"
    if [ ! -f "$package_json" ]; then
      fail "$client/package.json is missing."
      continue
    fi
    if [ ! -d "$project_root/$client/node_modules" ]; then
      fail "$client dependencies are not installed. Run: (cd $client && ../scripts/with-node npm ci)"
      continue
    fi
    if [ "$client" = web ]; then
      required_scripts='dev build test lint'
    else
      required_scripts='ios start test:ci typecheck lint'
    fi
    if "$project_node" node - "$package_json" $required_scripts <<'NODE'
const fs = require('node:fs');
const pkg = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const required = process.argv.slice(3);
const missing = required.filter((name) => typeof pkg.scripts?.[name] !== 'string');
if (missing.length) {
  process.stderr.write(`missing scripts: ${missing.join(', ')}\n`);
  process.exit(1);
}
NODE
    then
      ok "$client dependencies are installed and required package scripts are present."
    else
      fail "$client/package.json is missing one or more required scripts ($required_scripts)."
    fi
  done
fi

# A usable Xcode toolchain and at least one bootable iOS simulator device.
if ! command -v xcode-select >/dev/null 2>&1 || ! command -v xcrun >/dev/null 2>&1; then
  fail 'Xcode command-line tools are unavailable. Install Xcode and its command-line tools to run the parent app in iOS Simulator.'
elif ! xcode-select -p >/dev/null 2>&1 || ! xcrun simctl list devices available >/dev/null 2>&1; then
  fail 'Xcode/iOS Simulator tooling is not configured. Select a full Xcode installation and install an iOS Simulator runtime.'
else
  available_simulators=$(xcrun simctl list devices available 2>/dev/null)
  if printf '%s\n' "$available_simulators" | grep -q 'iPhone'; then
    ok 'Xcode and at least one available iPhone simulator are present.'
  else
    fail 'No available iPhone simulator was found. In Xcode, install an iOS Simulator runtime and device, then rerun this check.'
  fi
fi

if [ "$failures" -eq 0 ]; then
  printf '\nPreflight passed. All required local demo prerequisites are ready.\n'
  exit 0
fi

printf '\nPreflight found %s blocker(s). Resolve the messages above before the demo.\n' "$failures" >&2
exit 1
