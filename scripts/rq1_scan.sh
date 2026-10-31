#!/usr/bin/env bash
# RQ1 instrument run — clippy + cargo-audit over all endpoint-libs repos.
# Run from ~/code on your Mac (normal terminal, not inside any container):
#   bash api.support.cafe/rq1_scan.sh
# Outputs land in <repo>/rq1_out/ which Claude can read via the connected folders.
set -uo pipefail

REPOS=(api.support.cafe web3.trading-backend nofilter.io-backend auth.honey.id-backend api.honey.id-backend)
BASE="${1:-$HOME/code}"

command -v cargo >/dev/null || { echo "cargo not found"; exit 1; }
cargo audit --version >/dev/null 2>&1 || cargo install cargo-audit --locked

for r in "${REPOS[@]}"; do
  d="$BASE/$r"
  [ -d "$d" ] || { echo "SKIP $r (not found)"; continue; }
  echo "=== $r ==="
  mkdir -p "$d/rq1_out"
  (
    cd "$d"
    # toolchain + versions for the paper's methodology section
    { rustc --version; cargo clippy --version; cargo audit --version; date -u; } \
      > rq1_out/versions.txt 2>&1
    # clippy: machine-readable diagnostics (warnings = smells/bug patterns)
    cargo clippy --all-targets --all-features --message-format=json \
      > rq1_out/clippy.json 2> rq1_out/clippy.stderr
    echo "clippy exit: $?" >> rq1_out/versions.txt
    # cargo-audit: known vulnerabilities in the dependency tree
    cargo audit --json > rq1_out/audit.json 2> rq1_out/audit.stderr
    echo "audit exit: $?" >> rq1_out/versions.txt
    # LOC context so rates can be normalized
    find src -name '*.rs' | xargs wc -l | tail -1 > rq1_out/loc.txt
  )
  echo "    done -> $d/rq1_out/"
done
echo "All done. Tell Claude the rq1_out folders are ready."
