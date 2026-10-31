# MCP Migration Study — Replication Package

This repository is a frozen research artifact for the paper *No Hand-Written Schemas:
Generating MCP Servers from Typed Endpoint Definitions* (C. Bergström, arXiv preprint).
It holds the data and scripts behind the paper's measurements and nothing else. It is not
maintained software, nothing here runs in production, and it changes only when
the paper does.

It covers the RQ1 audit and the RQ2 comparison with AutoMCP across five
PathScale service backends after the endpoint-libs 1.9 MCP migration.
[MANIFEST.json](MANIFEST.json) pins the exact commit measured in each service,
and each of those commits carries the tag `mcp-study-2026-07` in its repository.

## Layout

```
MANIFEST.json            service -> {branch, full commit SHA, tag, migration PR}
scripts/
  mcp_verify.sh          the July measurement run: regenerate, Clippy,
                         cargo-audit, LOC and timing for every service
  rq1_scan.sh            the earlier RQ1-only run
  analyze-rq1.ts         the paper's RQ1 counts from one verify_out/ folder
  gen-openapi.ts         regenerates rq2/openapi.yaml from api.support.cafe
  validate-automcp.ts    checks the RQ2 claims against the AutoMCP output
rq1/
  rq1_results.json       per-service summary of the July run: raw Clippy
                         message counts and top lints, cargo-audit counts and
                         advisory IDs, lines of Rust
  <service>/timing.tsv   per-phase wall-clock timing from mcp_verify.sh
  <service>/loc.txt      lines of Rust under src/ at the pinned commit
  <service>/versions.txt toolchain versions (rustc, endpoint-gen)
  api.support.cafe/clippy.json, audit.json
                         full machine-readable output, published for the
                         public service only (see Scrubbing policy)
rq2/
  openapi.yaml           the OpenAPI document AutoMCP read
  automcp_tools.json     every tool AutoMCP generated (name, HTTP route,
                         parameters, description) and the RQ2 check results
  AUTOMCP-STUB.md        the commits that hold the deleted generated stub,
                         its SHA-256, how it was checked, and how to recover it
  run.log                AutoMCP console output, including the skipped
                         Azure OpenAI stage
  filtered_operations.log, merged_operations.log, .automcp_config.json
```

## Reproduction

The scripts need Bun, a Rust toolchain, `endpoint-gen` 1.9.0 or later and
`cargo-audit`.

1. Clone each service and check out its tag `mcp-study-2026-07`, side by side
   in one folder.
2. From that folder, run `bash mcp_verify.sh` with the copy in `scripts/`.
   It regenerates each service's interface code, runs
   `cargo clippy --all-targets --all-features` and `cargo audit`, and writes
   `verify_out/` in each service. The `timing.tsv` files here come from the
   run on 19 July 2026.
3. Run `bun scripts/analyze-rq1.ts <service>/verify_out` for each service.
   A finding is a Clippy warning or error whose primary span lies in
   `src/`, counted once per lint, file and line. Findings under
   `src/codegen` count as generated. These are the counts in the paper.
   `rq1_results.json` instead counts every Clippy message, so a diagnostic
   reported for both the library and its tests appears there twice.
   `bun scripts/analyze-rq1.ts rq1/api.support.cafe` reproduces the
   published row for api.support.cafe from the files in this package.
4. For RQ2, `bun scripts/gen-openapi.ts <api.support.cafe> rq2/openapi.yaml`
   regenerates the OpenAPI document from the service's RON definitions and
   generated MCP tool schemas. Then run
   [AutoMCP](https://github.com/Meriem-611/Auto-MCP) on it. Without Azure
   OpenAI credentials, bind `filter_risky_endpoints_llm(use_llm=False)`, the
   tool's own path without the language model; no command-line flag exists.
   `rq2/run.log` records the exact invocation, the skipped stage and that no
   operation was removed. `rq2/AUTOMCP-STUB.md` describes the checks on the
   output.

Clippy and cargo-audit results depend on the toolchain and on the advisory
database. The July run used rustc 1.97.0 and the advisory database as of
17 July 2026. Each pinned commit includes its `Cargo.lock`, so a rerun at the
tag builds and audits the same dependency tree.

## Scrubbing policy

- Absolute local paths are normalized (`$CODE`, `$CARGO_HOME`, `$HOME`).
- `timing.tsv`, `loc.txt`, `versions.txt`: included as-is for all five repos.
- `clippy.json` / `audit.json`: full files only for repos explicitly cleared
  for verbatim publication (currently `api.support.cafe`); the remaining
  repos are represented by the summary statistics in `rq1_results.json`.
  Advisory IDs are listed for all repos. They come from the `Cargo.lock`
  committed at each pinned commit and name public advisories, not anything
  in the services' own code.
- The Auto-MCP `.env` output (an auth-token placeholder template) is
  excluded on principle.
