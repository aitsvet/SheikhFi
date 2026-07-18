#!/usr/bin/env bash
# Full verification pipeline, everything in containers (no host toolchain):
# symbolic proofs → contract tests + coverage → webapp lint + build →
# containerised e2e. Restores whatever deployment was active before the e2e run.
set -euo pipefail
cd "$(dirname "$0")/.."

ACTIVE_CHAIN=$(python3 -c "import json; print(json.load(open('webapp/src/abi/deployment.json'))['chainId'])")

# Symbolic proofs first: they are the strongest check and the fastest (~4s).
# Halmos proves the Shari'ah invariants for every input, or prints a
# counterexample — see STANDARDS.md «Формальная верификация». Outputs are
# captured so gen-verification.mjs can emit the webapp Proofs page's data
# from the run that actually happened.
mkdir -p .verify
docker compose run --rm halmos | tee .verify/halmos.out

docker compose run --rm node 'npm ci --no-audit --no-fund && npx hardhat test' | tee .verify/hardhat.out

# STANDARDS.md must not drift from the code and the run above (PLAN v4 §5):
# symbols in the table exist, cited tests exist and passed, @custom:shariah
# tags resolve to real clauses. Red kills the pipeline.
docker compose run --rm node 'node scripts/check-traceability.mjs'
docker compose run --rm node 'npx hardhat coverage 2>&1 | tail -10'
docker compose run --rm node 'cd webapp && npm ci --no-audit --no-fund && npm run lint && npm run build'

docker compose --profile e2e up --abort-on-container-exit e2e
docker compose --profile e2e down --remove-orphans

docker compose run --rm node "node scripts/use-deployment.mjs $ACTIVE_CHAIN"

# The Proofs screen renders only what this emits — from the captures above.
node scripts/gen-verification.mjs

echo "verify: all green"
