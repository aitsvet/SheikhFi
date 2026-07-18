#!/usr/bin/env bash
# SMTChecker (solc CHC engine) over the real contract — the free baseline of
# PLAN v4 §3. Where CHC answers "proved" it is UNBOUNDED (stronger than
# Halmos' loop-unrolled proof); where it answers "unknown/warning", Halmos
# carries the property. Both results are reported honestly, never merged.
#
# The static solc binary ships no Horn solver, so we pair it with Eldarica
# (JVM) — the same cached-artifact pattern as cryptosarf's `make spec`:
# both artifacts download once into ~/.cache and run in a JRE container.
# SheikhFi.sol is a single file with no imports, so plain solc CLI suffices.
# Slow (~minutes) and deliberately NOT part of the main build; output goes to
# .verify/smtchecker.out.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p .verify "$HOME/.cache/smtcheck"

SOLC_URL="https://github.com/ethereum/solidity/releases/download/v0.8.30/solc-static-linux"
ELD_URL="https://github.com/uuverifiers/eldarica/releases/download/v2.1/eldarica-bin-2.1.zip"

docker run --rm \
    -v "$PWD/contracts:/src:ro" \
    -v "$HOME/.cache/smtcheck:/cache" \
    -v "$PWD/.verify:/out" \
    eclipse-temurin:21-jre bash -c "
set -e
command -v unzip >/dev/null || { apt-get update -qq && apt-get install -y -qq unzip curl >/dev/null; }
[ -f /cache/solc ] || { curl -sL -o /cache/solc '$SOLC_URL' && chmod +x /cache/solc; }
[ -d /cache/eldarica ] || { curl -sL -o /tmp/eld.zip '$ELD_URL' && unzip -q /tmp/eld.zip -d /cache/; }
export PATH=/cache/eldarica:\$PATH
/cache/solc --version
/cache/solc \
    --model-checker-engine chc \
    --model-checker-solvers eld \
    --model-checker-targets assert,overflow \
    --model-checker-timeout 15000 \
    --model-checker-show-unproved \
    /src/SheikhFi.sol 2>&1 | tee /out/smtchecker.out
"
echo "smtcheck: done — full output in .verify/smtchecker.out"
