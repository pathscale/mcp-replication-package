# MCP Migration Study — Replication Package

Artifacts backing the RQ1/RQ2 measurements for the endpoint-libs 1.9 MCP
migration across six PathScale service backends. One archive, pinned to the
exact commit of every repo measured — see [MANIFEST.json](MANIFEST.json).

## Layout

```
MANIFEST.json            repo -> {branch, commit SHA, migration PR}
rq1/
  rq1_results.json       per-repo summary: clippy error/warning counts and
                         top lints, cargo-audit vulnerability counts and
                         advisory IDs, lines of Rust
  <repo>/timing.tsv      per-phase wall-clock timing (regenerate, clippy,
                         instruments) from mcp_verify.sh
  <repo>/loc.txt         Rust LOC at the pinned commit
  <repo>/versions.txt    toolchain versions (rustc, clippy, cargo-audit)
  api.support.cafe/clippy.json, audit.json
                         full machine-readable diagnostics — included for
                         the public showcase repo only (see Scrubbing)
rq2/
  server_stub.py         Auto-MCP-generated FastMCP server (26 tools) from
                         api.support.cafe's docs/openapi.yaml
  run.log                complete generator console output, including the
                         skipped Azure-OpenAI stage
  filtered_operations.log, merged_operations.log, .automcp_config.json
```

## Reproduction

The instrumentation scripts are committed in the
[api.support.cafe](https://github.com/pathscale/api.support.cafe) repo
(`mcp_verify.sh`, `rq1_scan.sh`). To reproduce:

1. Clone each repo at the SHA in `MANIFEST.json`.
2. Install `endpoint-gen` >= 1.9.0 and run `bash api.support.cafe/mcp_verify.sh`
   from the parent directory — regenerates every model, runs
   `cargo clippy --all-targets --all-features` and `cargo audit`, and writes
   `verify_out/` per repo. The committed `timing.tsv` files here are that run.
3. For RQ2: clone [Auto-MCP](https://github.com/Meriem-611/Auto-MCP) and run
   its generator on `api.support.cafe/docs/openapi.yaml`. Without Azure
   OpenAI credentials, bind `filter_risky_endpoints_llm(use_llm=False)` (the
   tool's own degraded path; no CLI flag exists) — `rq2/run.log` records the
   exact invocation, the skipped stage, and the zero-operations-removed
   outcome.

## Scrubbing policy

- Absolute local paths are normalized (`$CODE`, `$CARGO_HOME`, `$HOME`).
- `timing.tsv`, `loc.txt`, `versions.txt`: included as-is for all six repos.
- `clippy.json` / `audit.json`: full files only for repos explicitly cleared
  for verbatim publication (currently `api.support.cafe`); the remaining
  repos are represented by the summary statistics in `rq1_results.json`.
  Advisory IDs are listed for all repos — they derive from committed,
  public `Cargo.lock` files.
- The Auto-MCP `.env` output (an auth-token placeholder template) is
  excluded on principle.
