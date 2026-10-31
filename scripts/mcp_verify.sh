#!/usr/bin/env bash
# MCP conversion verification + RQ1 instruments + phase timing, all repos.
# Run from ~/code:   bash api.support.cafe/mcp_verify.sh
# Idempotent — safe to re-run until everything passes.
# Outputs per repo: <repo>/verify_out/{timing.tsv,regen.log,clippy.txt,clippy.json,audit.json,loc.txt,versions.txt}
set -uo pipefail

REPOS=(api.support.cafe api.honey.id-backend auth.honey.id-backend nofilter.io-backend web3.trading-backend)
BASE="${1:-$HOME/code}"

command -v cargo >/dev/null || { echo "FATAL: cargo not found"; exit 1; }
if ! command -v endpoint-gen >/dev/null; then
  echo "FATAL: endpoint-gen not on PATH. Install with:"
  echo "  cargo install --git https://github.com/pathscale/EndpointGen.git"
  exit 1
fi
EG_VER=$(endpoint-gen --version 2>/dev/null || echo unknown)
echo "endpoint-gen: $EG_VER  (need >= 1.9.0)"
cargo audit --version >/dev/null 2>&1 || cargo install cargo-audit --locked

ts() { date -u +%s; }
iso() { date -u +%FT%TZ; }
overall_fail=0

for r in "${REPOS[@]}"; do
  d="$BASE/$r"
  [ -d "$d" ] || { echo "SKIP $r (not found)"; continue; }
  echo "=============== $r ==============="
  mkdir -p "$d/verify_out"
  T="$d/verify_out/timing.tsv"
  echo -e "phase\tstart_utc\tend_utc\tseconds\texit" > "$T"
  (
    cd "$d"
    { rustc --version; endpoint-gen --version 2>/dev/null; date -u; } > verify_out/versions.txt 2>&1

    # -- Phase: regenerate ------------------------------------------------
    s=$(ts); si=$(iso)
    if [ -x scripts/utils/regenerate_endpoints.sh ]; then
      bash scripts/utils/regenerate_endpoints.sh > verify_out/regen.log 2>&1; rc=$?
    else
      endpoint-gen --config-dir config/ > verify_out/regen.log 2>&1; rc=$?
    fi
    e=$(ts); echo -e "regenerate\t$si\t$(iso)\t$((e-s))\t$rc" >> "$T"
    [ $rc -ne 0 ] && echo "  !! regenerate FAILED (see verify_out/regen.log)"

    # -- Phase: clippy (human-readable + machine-readable) ----------------
    s=$(ts); si=$(iso)
    cargo clippy --all-targets --all-features --message-format=short \
      > verify_out/clippy.txt 2>&1; crc=$?
    e=$(ts); echo -e "clippy\t$si\t$(iso)\t$((e-s))\t$crc" >> "$T"
    if [ $crc -eq 0 ]; then
      echo "  clippy: PASS"
    else
      echo "  !! clippy FAILED — first errors:"
      grep -m5 "error" verify_out/clippy.txt | sed 's/^/     /'
    fi

    # -- Phase: RQ1 instruments (run regardless; JSON for analysis) -------
    s=$(ts); si=$(iso)
    cargo clippy --all-targets --all-features --message-format=json \
      > verify_out/clippy.json 2>/dev/null; jrc=$?
    cargo audit --json > verify_out/audit.json 2>/dev/null; arc=$?
    find src -name '*.rs' | xargs wc -l | tail -1 > verify_out/loc.txt
    e=$(ts); echo -e "rq1_instruments\t$si\t$(iso)\t$((e-s))\t$jrc/$arc" >> "$T"

    # -- Post-regen diff footprint (what the generator changed) -----------
    git diff --stat > verify_out/post_regen_diffstat.txt 2>/dev/null
    exit $crc
  )
  [ $? -ne 0 ] && overall_fail=1
done

echo "================================================="
if [ $overall_fail -eq 0 ]; then
  echo "ALL REPOS GREEN. Tell Claude (Cowork) the verify_out folders are ready."
else
  echo "SOME REPOS FAILED — fix and re-run this script until green."
fi
exit $overall_fail
