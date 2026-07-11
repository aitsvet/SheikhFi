#!/usr/bin/env bash
# Full verification pipeline, everything in containers (no host toolchain):
# contract tests + coverage → webapp lint + build → containerised e2e.
# Restores whatever deployment was active before the e2e run.
set -euo pipefail
cd "$(dirname "$0")/.."

ACTIVE_CHAIN=$(python3 -c "import json; print(json.load(open('webapp/src/abi/deployment.json'))['chainId'])")

docker compose run --rm node 'npm ci --no-audit --no-fund && npx hardhat test'
docker compose run --rm node 'npx hardhat coverage 2>&1 | tail -10'
docker compose run --rm node 'cd webapp && npm ci --no-audit --no-fund && npm run lint && npm run build'

docker compose --profile e2e up --abort-on-container-exit e2e
docker compose --profile e2e down --remove-orphans

docker compose run --rm node "node scripts/use-deployment.mjs $ACTIVE_CHAIN"
echo "verify: all green"
