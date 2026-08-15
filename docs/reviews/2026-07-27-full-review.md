# mcp-replication-package Review: full

**Date:** 2026-07-27
**Scope:** the whole repository (`README.md`, `MANIFEST.json`, `AGENTS.md`, `CLAUDE.md`, `.claude/`, `rq1/**`, `rq2/**`, plus git history). Read-only cross-checks against sibling working copies under `/Users/revenge/code` and against the public GitHub API, used only to verify claims this package makes.
**Commit:** `696ff06`
**Reviewer slice:** full (sole reviewer for this repo)

## What this package is

A research replication package for a study of the `endpoint-libs` 1.9 MCP migration across six
PathScale service backends. Two research questions:

- **RQ1** (`rq1/`): static-analysis and size measurements per repo. Clippy error/warning counts and
  top lints, `cargo audit` vulnerability counts and advisory IDs, Rust LOC, and per-phase wall-clock
  timing, produced by `mcp_verify.sh` in the `api.support.cafe` repo.
- **RQ2** (`rq2/`): output of the third-party [Auto-MCP](https://github.com/Meriem-611/Auto-MCP)
  generator run against `api.support.cafe`'s OpenAPI spec, producing a 26-tool FastMCP server stub
  plus the generator's own logs.

**Audience:** paper reviewers and third parties trying to re-run the measurements. **Publication
intent: it is already published.** `https://api.github.com/repos/pathscale/mcp-replication-package`
returns HTTP 200 with `"private": false`. Everything below should be read as "this is live", not
"this is a draft".

## Summary

- **Data hygiene is genuinely good and I want to say so first.** I verified the scrubbing claim
  mechanically: the committed `rq1/api.support.cafe/clippy.json` is byte-for-byte equal to the local
  `verify_out/clippy.json` after `$CARGO_HOME`/`$CODE`/`$HOME` substitution, so the normalization was
  lossless and nothing else was silently edited. No `/Users/`, `/home/`, email addresses, IPs,
  hostnames, API keys or tokens anywhere in the worktree or in any of the four commits. No `.github/`
  directory exists, so the hardcoded-deploy-token class of mistake found elsewhere in this family is
  **absent** here. `server_stub.py` reads every credential from the environment.
- **The reproducibility story, on the other hand, does not hold up.** Five of the six measured repos
  are private (HTTP 404 to anonymous GitHub API), so `README.md:36` step 1 is impossible for a third
  party for 5/6 of the dataset. The one public repo's pinned commit is not reachable by a plain
  clone, and the RQ2 input file has been deleted from its default branch.
- **The headline RQ1 number is wrong.** `cargo clippy --all-targets` compiles the same sources as
  both `lib` and `bin`, emitting every warning twice. Every count in `rq1/rq1_results.json` is
  inflated, and inflated *unevenly* across repos (1.00x to 2.00x), so the cross-repo comparison the
  paper rests on cannot be repaired by dividing by two.
- **The LOC denominator is contaminated.** It counts `src/codegen/`, which is 7.2% to 41.8% of
  "Rust LOC" depending on the repo. In a study about a code-generation migration, normalizing
  defects per KLOC against a denominator that is one third machine-generated is a methodology
  problem a reviewer will find immediately.
- **No LICENSE.** A public replication package with no license is all-rights-reserved by default,
  which means readers legally cannot reuse the data. It also redistributes `rq2/server_stub.py`,
  which is Auto-MCP generator template output, and Auto-MCP itself has no license.
- **The numbers that are shipped are honest.** I re-derived every value in `rq1_results.json` from
  the raw `clippy.json`/`audit.json` in the sibling working copies: clippy errors/warnings, top
  lints, audit vulnerability counts, advisory IDs, warning kinds and LOC all match exactly for all
  six repos. The aggregation is faithful. The problem is that a reader cannot check that, because
  the raw inputs for 5/6 repos are not in the package and no aggregation script is either.
- **Top three things to do:** (1) vendor everything a reader needs, meaning the instrumentation
  scripts, `docs/openapi.yaml`, and the raw per-repo `clippy.json`/`audit.json`, or state plainly
  that 5/6 of RQ1 is not externally reproducible; (2) recount clippy warnings by deduplicating on
  `(code, file, line, column)` and republish `rq1_results.json`; (3) add a LICENSE and a
  `SHA256SUMS` manifest.

## Findings

### [SEV-1] Five of six measured repositories are not publicly accessible

- **ID:** `mcp-repl-full-01`
- **Severity:** Critical
- **Category:** Docs (reproducibility)
- **Confidence:** High
- **Location:** `README.md:36` (step 1), `MANIFEST.json:6-43`
- **What:** `README.md` step 1 instructs the reader to "Clone each repo at the SHA in
  `MANIFEST.json`". Querying the GitHub API anonymously, `pathscale/api.support.cafe` returns 200
  but `api.honey.id-backend`, `auth.honey.id-backend`, `nofilter.io-backend`, `pays.online-backend`
  and `web3.trading-backend` all return 404. The six `pr` URLs in `MANIFEST.json` will likewise 404
  for everyone outside the org. The README hints at this obliquely at line 20 ("the public showcase
  repo") and line 53 ("repos explicitly cleared for verbatim publication") but never states that
  five of the six inputs cannot be obtained at all.
- **Why it matters:** RQ1 reports six data points; exactly one of them (`api.support.cafe`, 7,278
  LOC, five distinct clippy warnings) is reproducible by a third party. The other five, including
  `web3.trading-backend` at 55,338 LOC which dominates every aggregate, are unverifiable. This is
  the first thing an artifact-evaluation reviewer checks, and finding it undisclosed reads much
  worse than finding it disclosed.
- **Fix:** Two options, and they are a research decision rather than a mechanical one. Either
  (a) make the five repos public at the pinned SHAs, or (b) state the limitation explicitly in the
  README and compensate by shipping the full raw `clippy.json`/`audit.json` for all six repos (see
  `mcp-repl-full-05`) so the reported numbers can at least be recomputed from committed evidence
  even though the sources cannot be re-scanned.
- **Effort:** M for (b), organizational for (a).
- **Blast radius:** README, MANIFEST, and the paper's threats-to-validity section.

### [SEV-2] Clippy warning counts are double-counted, unevenly across repos

- **ID:** `mcp-repl-full-02`
- **Severity:** Critical
- **Category:** Correctness
- **Confidence:** High (directly verified against raw JSON for all six repos)
- **Location:** `rq1/rq1_results.json` (every `clippy.warnings` and `clippy.top_lints` value);
  root cause is `cargo clippy --all-targets --all-features` at `api.support.cafe/mcp_verify.sh:48`
  and `:60`
- **What:** `--all-targets` builds the same source files once as the `lib` target and again as the
  `bin` target, so clippy emits each diagnostic twice at an identical `(file, line, column)`. The
  scan counts emitted diagnostics rather than distinct sites. Deduplicating on
  `(code, file_name, line_start, column_start)`:

  | repo | reported | distinct | inflation | targets seen in clippy.json |
  |---|---|---|---|---|
  | api.support.cafe | 10 | 5 | 2.00x | lib, bin |
  | api.honey.id-backend | 52 | 26 | 2.00x | lib, bin |
  | auth.honey.id-backend | 1 | 1 | 1.00x | lib, bin |
  | nofilter.io-backend | 0 | 0 | n/a | bin only |
  | pays.online-backend | 825 | 444 | 1.86x | lib, bin, `run-dev` bin, `utils` test |
  | web3.trading-backend | 60 | 30 | 2.00x | lib, bin, proc-macro |

  For `api.support.cafe` the ten "warnings" are five distinct sites, each appearing exactly twice:
  `collapsible_if` at `src/handlers/app/list_messages.rs:49:9`, `useless_conversion` at
  `src/handlers/admin/set_role.rs:29:52`, `needless_question_mark` at `src/service/app/member.rs:116:9`,
  `for_kv_map` at `src/service/bot/router.rs:220:30`, `clone_on_copy` at `src/service/bot/router.rs:238:28`.
- **Why it matters:** Every RQ1 warning figure in the paper is roughly 2x too high, and because the
  inflation factor varies with each repo's target layout (1.00x, 1.86x, 2.00x) the *ratios* between
  repos are also wrong. "pays.online has 825 warnings, auth.honey has 1" is really "444 versus 1".
  This cannot be fixed by a global divide-by-two, and a reviewer who spot-checks the one public
  repo will find five real warnings where the table says ten.
- **Fix:** Mechanical. Deduplicate before counting, for example
  `key = (msg.code.code, spans[0].file_name, spans[0].line_start, spans[0].column_start)`, take
  `len(set(keys))`, and recompute `top_lints` from the deduplicated set. Alternatively drop
  `--all-targets`, but that changes what is measured, so deduplication is the safer fix. Regenerate
  `rq1/rq1_results.json` and any table derived from it.
- **Effort:** S to fix the counter, M once the paper tables are updated.
- **Blast radius:** `rq1/rq1_results.json`, every RQ1 table and claim in the paper.

### [SEV-3] The RQ2 input spec is not in the package and has been deleted upstream

- **ID:** `mcp-repl-full-03`
- **Severity:** Critical
- **Category:** Docs (reproducibility)
- **Confidence:** High
- **Location:** `README.md:24`, `README.md:41-43`, `rq2/.automcp_config.json:2`
- **What:** RQ2's entire input is `api.support.cafe/docs/openapi.yaml`. That file is not in this
  package. On the public repo it returns HTTP 404 at `ref=main` and the current `docs/` listing on
  `main` contains no `openapi.yaml` (only per-API `*_mcp_tools.json` files); the local working copy
  has no `openapi.yaml` either. It survives only at `ref=88ef163`, which is itself hard to reach
  (see `mcp-repl-full-04`).
- **Why it matters:** RQ2 is entirely unreproducible as written. A reader following step 3 has
  nothing to feed the generator. The `server_stub.py` in this package cannot be regenerated, so the
  "26 tools" claim, the "0 operations filtered" result, and the merge result are all
  unfalsifiable. This is a one-file fix that costs nothing, which makes leaving it out the worst
  kind of gap.
- **Fix:** Vendor the exact `openapi.yaml` used, into `rq2/inputs/openapi.yaml`, with its SHA-256
  recorded. It is the input to the experiment; a replication package that omits its own input is
  not a replication package.
- **Effort:** S.
- **Blast radius:** `rq2/`, README step 3.

### [SEV-4] Pinned commit is unreachable by a normal clone; the referenced branch no longer exists

- **ID:** `mcp-repl-full-04`
- **Severity:** High
- **Category:** Docs (reproducibility)
- **Confidence:** High
- **Location:** `MANIFEST.json:8` (`"branch": "mcp-support"`), `MANIFEST.json:45-46`,
  `README.md:32-34`
- **What:** Three compounding problems for the one repo a reader can actually access:
  1. `MANIFEST.json` names branch `mcp-support`, but `api.support.cafe` now has exactly one branch,
     `main`. The branch was deleted after PR 3 merged.
  2. The pinned SHA `88ef163` is **diverged** from `main` (`compare/main...88ef163` reports
     `status: diverged, ahead_by: 5, behind_by: 19`). It is not an ancestor of any branch ref, so
     `git clone` followed by `git checkout 88ef163` fails. Reaching it requires
     `git fetch origin pull/3/head`, which the README does not mention.
  3. The instrumentation scripts are not in this package at all. `MANIFEST.json:45-46` and
     `README.md:32-34` point at `mcp_verify.sh` and `rq1_scan.sh` "committed in api.support.cafe
     (mcp-support branch)", a branch that no longer exists. The scripts do currently exist on
     `main` and are byte-identical to the versions at `88ef163` (I diffed both), so nothing has
     drifted yet, but the package has no defence against it drifting tomorrow.
- **Why it matters:** The reproduction recipe fails at step 1 even for the repo that is public. And
  because the scripts live in another repo on a moving branch, the package's methodology can change
  out from under it without any commit here.
- **Fix:** Vendor `mcp_verify.sh` and `rq1_scan.sh` into `scripts/` in this package (they are MIT
  licensed in `api.support.cafe`, so this is clean). Record full 40-character SHAs in
  `MANIFEST.json`, drop the `branch` field or mark it historical, and add the
  `git fetch origin pull/3/head && git checkout 88ef163` recipe to the README.
- **Effort:** S.
- **Blast radius:** `MANIFEST.json`, `README.md`, a new `scripts/` directory.

### [SEV-5] Raw data withheld for 5/6 repos, and no aggregation script is shipped

- **ID:** `mcp-repl-full-05`
- **Severity:** High
- **Category:** Docs (provenance)
- **Confidence:** High
- **Location:** `rq1/rq1_results.json`, `README.md:19-21`, `README.md:51-56`
- **What:** `clippy.json` and `audit.json` are included only for `api.support.cafe`. For the other
  five repos the package ships only the summary in `rq1_results.json`. There is also no script
  anywhere that turns raw `clippy.json`/`audit.json` into `rq1_results.json`; that aggregation step
  exists only as prose in `README.md:12-15`. So for 5/6 of the dataset the reader has a number with
  no input and no code that produced it.
  For the record, I re-derived all of it from the sibling working copies and **every value is
  correct**: clippy errors/warnings and `top_lints` match the raw JSON for all six repos, and audit
  `vulnerability_count`, `advisory_ids` and `warning_counts_by_kind` match exactly for all six. The
  data is trustworthy; it is just not verifiable from what is published.
- **Why it matters:** "Trust our summary" is precisely what a replication package exists to avoid.
  Combined with `mcp-repl-full-01`, a reviewer has no path to confirm 5/6 of RQ1 by any means.
  It also blocks the fix for `mcp-repl-full-02`: without raw JSON, nobody outside the org can
  recount the deduplicated warnings.
- **Fix:** Ship the aggregation script (this is the highest-value single addition). Then either
  include all six `clippy.json`/`audit.json`, or, if the concern is leaking source paths from
  private repos, ship a reduced per-repo record that keeps `(lint code, file, line, column)` tuples
  with file paths hashed. That preserves deduplicability and per-lint counts while revealing no
  source structure.
- **Effort:** M.
- **Blast radius:** `rq1/`, README scrubbing policy section.

### [SEV-6] Toolchain is not pinned, and the README describes a versions.txt that was never generated

- **ID:** `mcp-repl-full-06`
- **Severity:** High
- **Category:** Docs (reproducibility)
- **Confidence:** High
- **Location:** `README.md:18`, `rq1/*/versions.txt`, `MANIFEST.json:44-48`
- **What:** Four separate pinning failures:
  1. `README.md:18` says `versions.txt` holds "toolchain versions (rustc, clippy, cargo-audit)".
     Every committed `versions.txt` actually contains only `rustc`, `endpoint-gen`, and a date. The
     README is describing `rq1_scan.sh:22`'s output format, but the committed files came from
     `mcp_verify.sh:34`, which records a different set. Neither clippy's version nor cargo-audit's
     version is recorded anywhere.
  2. The RustSec advisory database is time-varying, so audit results are meaningless without the DB
     commit. That commit does exist, but only inside `api.support.cafe/audit.json`
     (`database.last-commit: b5fc89b8be99e96f79194d8a6f11e9b4143b99f0`, `last-updated:
     2026-07-17`). For the five repos whose `audit.json` is withheld, the DB state is unrecorded,
     so their vulnerability counts can never be reproduced.
  3. `endpoint-gen 1.9.0` is recorded, but `mcp_verify.sh:14` installs it via
     `cargo install --git https://github.com/pathscale/EndpointGen.git` with no tag or rev. There
     is no documented way to obtain exactly 1.9.0.
  4. `rustc 1.97.0 ... (Homebrew)` is a distro build and there is no `rust-toolchain.toml`. Clippy
     lint sets change between rustc releases, so warning counts are rustc-version-sensitive.
- **Why it matters:** Even a reader with full access to all six repos cannot reconstruct the
  environment. Point 2 in particular means the audit half of RQ1 is not reproducible at all for
  five repos, independent of every other issue.
- **Fix:** Promote the advisory-DB commit into `MANIFEST.json` as a first-class pin. Record
  `cargo clippy --version` and `cargo audit --version`. Pin `endpoint-gen` by git rev in both the
  manifest and the install instruction. Ship a `rust-toolchain.toml`. Fix `README.md:18` to
  describe what the files actually contain.
- **Effort:** S for the doc and manifest work, M if `versions.txt` is regenerated by a re-run.
- **Blast radius:** `README.md`, `MANIFEST.json`, `rq1/*/versions.txt`.

### [SEV-7] LOC denominator includes generated code, by a share that varies 6x across repos

- **ID:** `mcp-repl-full-07`
- **Severity:** High
- **Category:** Correctness
- **Confidence:** High
- **Location:** `rq1/*/loc.txt`, `rq1/rq1_results.json` (`loc` fields), `README.md:17`;
  root cause `api.support.cafe/mcp_verify.sh:63`,
  `find src -name '*.rs' | xargs wc -l | tail -1`
- **What:** The LOC figure is raw physical lines over all of `src/`, which includes
  `src/codegen/model.rs`, the `endpoint-gen` output. Measured against the sibling working copies:

  | repo | reported LOC | codegen LOC | generated share |
  |---|---|---|---|
  | api.support.cafe | 7,278 | 2,235 | 30.7% |
  | api.honey.id-backend | 9,194 | 2,982 | 32.4% |
  | auth.honey.id-backend | 11,468 | 4,112 | 35.9% |
  | nofilter.io-backend | 18,047 | 7,537 | 41.8% |
  | pays.online-backend | 14,626 | 4,637 | 31.7% |
  | web3.trading-backend | 55,338 | 4,005 | 7.2% |

  It also counts blank and comment lines, since it is `wc -l` rather than a LOC tool.
- **Why it matters:** `README.md:17` calls this "Rust LOC" and `rq1_scan.sh:31` states the intent as
  "LOC context so rates can be normalized". Normalizing defect counts by a denominator that is
  between 7% and 42% machine-generated makes the normalized rates incomparable across repos, and it
  is doubly awkward in a study *about* a code-generation migration: the generated code is the
  independent variable, not the baseline. `nofilter.io-backend` gets a 42%-inflated denominator
  while `web3.trading-backend` gets 7%, so per-KLOC rates are distorted in opposite directions.
- **Fix:** Report generated and hand-written LOC as two separate columns, excluding `src/codegen/`
  from the hand-written figure, and normalize against hand-written LOC. Use `tokei` or `cloc` so
  blanks and comments are excluded and the tool is nameable in the methodology section.
- **Effort:** S to recompute, M to update the paper.
- **Blast radius:** `rq1/*/loc.txt`, `rq1/rq1_results.json`, any per-KLOC claim.

### [SEV-8] No LICENSE on a public repo, and third-party generator output is redistributed unlicensed

- **ID:** `mcp-repl-full-08`
- **Severity:** High
- **Category:** Maintainability (legal)
- **Confidence:** High
- **Location:** repository root (no `LICENSE` file); `rq2/server_stub.py` (1,123 lines)
- **What:** Two related problems.
  1. This repo is public and the GitHub API reports `license: None`. With no license, default
     copyright applies and readers have no right to reuse, redistribute, or build on the data. Note
     that the sibling `api.support.cafe` does ship an MIT `LICENSE`, so this is an omission rather
     than a policy.
  2. `rq2/server_stub.py` is Auto-MCP output. Its first line is
     `# This file is auto-generated by mcp_generator.py.` and the bulk of the file is the
     generator's own template code, the same ~40-line auth/request/error block repeated verbatim
     for all 26 tools. `Meriem-611/Auto-MCP` reports `license: None` on the GitHub API and its
     checkout contains no LICENSE file. Redistributing a third party's template code with no
     license grant is a real risk for a package attached to a paper.
- **Why it matters:** Artifact evaluation committees check for a license. And an upstream author
  with no license retains all rights over the template text embedded in `server_stub.py`.
- **Fix:** Add a `LICENSE` (MIT or CC-BY-4.0 for the data, matching `api.support.cafe`). For
  `server_stub.py`, either obtain permission from the Auto-MCP author, or replace the verbatim file
  with a structural summary plus a script that regenerates it from the vendored `openapi.yaml`.
  Regardless, add a header noting the file's provenance and its upstream license status.
- **Effort:** S for the LICENSE, M for the Auto-MCP question, which needs a human decision.
- **Blast radius:** repo root, `rq2/`.

### [SEV-9] timing.tsv does not measure what the README says it measures

- **ID:** `mcp-repl-full-09`
- **Severity:** Medium
- **Category:** Correctness
- **Confidence:** High
- **Location:** `rq1/*/timing.tsv`, `README.md:15-16`; root cause
  `api.support.cafe/mcp_verify.sh:21` (`ts() { date -u +%s; }`), `:4`, `:37-64`
- **What:** `README.md:15-16` presents these as "per-phase wall-clock timing (regenerate, clippy,
  instruments)". Four problems make the numbers unusable as a performance result:
  1. **Resolution is one second.** `ts()` is `date -u +%s`. Values range from 0 to 17 seconds, so
     quantization error is up to ~12% on the smaller ones.
  2. **n = 1, no variance, no cold/warm distinction.** `mcp_verify.sh:4` states the script is
     "Idempotent, safe to re-run until everything passes" and line 77 tells the operator to
     "fix and re-run this script until green", so the committed run is by construction a warm-cache
     re-run. A full clippy of `web3.trading-backend` (55k LOC, 570 dependencies) in 16 seconds is a
     cache hit, not a build.
  3. **The `regenerate` phase is 0 seconds in all six repos, and it is a no-op.** The local
     `api.support.cafe/verify_out/post_regen_diffstat.txt` is 0 bytes and `regen.log` says only
     "Regenerated src/codegen/model.rs", meaning regeneration produced no diff because the pinned
     commits already had the migration applied. A uniform 0 is not a measurement.
  4. **Clippy runs twice.** `mcp_verify.sh:48` runs it with `--message-format=short` and `:60` runs
     it again with `--message-format=json`. So the `clippy` phase (7 to 17s) and the
     `rq1_instruments` phase (2 to 3s) are the same work measured cold-ish then fully cached, which
     is why the second is always much smaller. Neither is a clean measurement of anything.
- **Why it matters:** If any timing number reaches the paper as a cost-of-migration claim it will
  not survive review, and "regeneration takes 0 seconds" invites exactly the wrong conclusion.
- **Fix:** Either drop timing from the paper's claims and relabel `timing.tsv` in the README as a
  provenance log of the verification run rather than a measurement, which is the honest and cheap
  option, or redo it properly: `cargo clean` between runs, `hyperfine` or at least nanosecond
  timestamps, 5+ repetitions, report median and spread, and separate the two clippy invocations.
- **Effort:** S for relabelling, L for a real measurement.
- **Blast radius:** `README.md:15-16`, `rq1/*/timing.tsv`, any timing claim in the paper.

### [SEV-10] Published server stub defaults to the production host with destructive tools enabled

- **ID:** `mcp-repl-full-10`
- **Severity:** Medium
- **Category:** Security
- **Confidence:** High
- **Location:** `rq2/server_stub.py:20` and 23 further `base_url` sites; `rq2/run.log:1`;
  `rq2/.automcp_config.json:8-11`
- **What:** Every tool in the stub does
  `base_url = os.getenv("BASE_URL", "https://api.support.cafe")`, defaulting to the live production
  host. The generator's risky-operation filter was deliberately switched off, both structurally
  (`--include destructive --include deprecated`, recorded at `run.log:1` and
  `.automcp_config.json:8-11`) and semantically (`use_llm=False`), so all 26 operations were kept
  and `filtered_operations.log:6` records "Operations filtered: 0". The kept set includes
  `adminApi_delete_app` ("Delete an app, its memberships, and stop its Telegram bot"),
  `adminApi_set_role`, `appAdminApi_edit_app`, and `appAdminApi_list_apps`, whose own tool
  description at `server_stub.py:321` says the response "includes each app's Telegram bot token,
  treat it as a secret".
- **Why it matters:** This is a runnable file in a public repo. Anyone who `pip install`s the deps,
  sets `HONEYIDAUTH_TOKEN`, and points an LLM at it gets an agent that can delete production apps
  and read Telegram bot tokens, against the real host, by default, with no confirmation step. The
  disabled filter is a legitimate research choice (the study is measuring the unfiltered generator)
  but nothing in the package warns a reader of the consequence. Severity is Medium rather than High
  because it still requires a valid production token that the package does not supply.
- **Fix:** Do not edit the generated file, since its verbatim state is the research artifact.
  Instead add `rq2/README.md` stating that the stub is captured generator output, is not intended
  to be executed, and that the risky-endpoint filter was intentionally disabled for the experiment.
  If it must remain runnable, ship a wrapper that requires `BASE_URL` to be set explicitly with no
  production default.
- **Effort:** S.
- **Blast radius:** `rq2/`.

### [SEV-11] No integrity mechanism: no checksums, no file manifest

- **ID:** `mcp-repl-full-11`
- **Severity:** Medium
- **Category:** Maintainability (provenance)
- **Confidence:** High
- **Location:** `MANIFEST.json` (pins repo SHAs only), repository root
- **What:** `MANIFEST.json` pins the *source* repos but records nothing about the package's own 32
  files: no SHA-256 sums, no sizes, no file inventory, no statement of which files came from which
  script run. A reader cannot tell whether `clippy.json` was edited after generation, and neither
  can a future maintainer. The scrubbing step (`README.md:50`) makes this sharper than usual,
  because the committed artifacts are by design *not* byte-identical to what the tools emitted, so
  "does this match the tool output" has no answer without a recorded transformation. I could only
  verify the scrubbing because the unscrubbed originals happen to still exist in a local working
  copy; that is luck, not provenance.
- **Why it matters:** Provenance is the whole point of a replication package. Also relevant for
  archival: if this is deposited to Zenodo or figshare, the checksum manifest is what lets someone
  detect a corrupted or partial download.
- **Fix:** Add a `SHA256SUMS` at the root (`shasum -a 256` over every tracked file), and extend
  `MANIFEST.json` with a `files` map recording, per artifact, the producing script and phase, the
  raw digest before scrubbing, and the digest after. Note that the sibling `gomods` directory on
  this machine already does exactly this with a `SHA256SUMS.txt`, so the pattern is established.
- **Effort:** S.
- **Blast radius:** repo root, `MANIFEST.json`.

### [SEV-12] vulnerability_count and advisory_ids count different things, undocumented

- **ID:** `mcp-repl-full-12`
- **Severity:** Medium
- **Category:** Docs
- **Confidence:** High
- **Location:** `rq1/rq1_results.json:14-21` and the equivalent block in all six repo entries;
  `README.md:12-14`
- **What:** Four of the six entries report `"vulnerability_count": 6` alongside exactly four
  `advisory_ids`, and `web3.trading-backend` reports 13 with 10 IDs. This reads like a data error.
  It is not: `vulnerability_count` is cargo-audit's count of vulnerable *package instances*, while
  `advisory_ids` is the deduplicated set of advisories. I confirmed this from the raw
  `audit.json`, where `vulnerabilities.list` has 6 entries with IDs
  `[0204, 0195, 0194, 0195, 0194, 0185]`, i.e. four unique advisories with two appearing twice.
  Nothing in the README or the JSON says so.
- **Why it matters:** Every reader who checks the arithmetic will conclude the data is broken and
  will stop trusting the rest of the file. It is a five-minute fix that prevents a reviewer from
  writing "the numbers do not add up".
- **Fix:** Rename the fields to `vulnerable_package_instances` and `unique_advisory_ids`, or add
  both counts explicitly, and document the distinction in `README.md:12-14`.
- **Effort:** S.
- **Blast radius:** `rq1/rq1_results.json`, README.

### [SEV-13] README claims run.log records the invocation; it does not, and the wrapper is not shipped

- **ID:** `mcp-repl-full-13`
- **Severity:** Medium
- **Category:** Docs
- **Confidence:** High
- **Location:** `README.md:44-46`, `rq2/run.log:1`
- **What:** The README says "`rq2/run.log` records the exact invocation, the skipped stage, and the
  zero-operations-removed outcome". The skipped stage and the outcome are indeed recorded. The
  invocation is not: there is no command line anywhere in the 41-line file. Worse,
  `run.log:1` is prefixed `[wrapper]`, a prefix that appears nowhere else in the log and that
  Auto-MCP does not emit, indicating a custom wrapper script was used to bind
  `filter_risky_endpoints_llm(use_llm=False)` (the README itself says "no CLI flag exists" for
  this). That wrapper is not in the package. Separately, `MANIFEST.json:47` pins the generator only
  as a repo URL with no rev; Auto-MCP has no tags and its last push was 2026-04-15, so there is no
  version identifier of any kind for the tool that produced RQ2.
- **Why it matters:** RQ2's central methodological choice, running the generator with its LLM
  filter disabled, is implemented by code that is not published. A reader cannot reproduce the run
  even given the spec, and cannot check that the wrapper did only what the README claims.
- **Fix:** Ship the wrapper in `rq2/`, record the literal command line at the top of `run.log` or in
  a sibling `invocation.txt`, and pin Auto-MCP by commit SHA in `MANIFEST.json`.
- **Effort:** S.
- **Blast radius:** `rq2/`, `MANIFEST.json`, README step 3.

### [SEV-14] Two overlapping instrumentation scripts; the manifest credits the wrong one

- **ID:** `mcp-repl-full-14`
- **Severity:** Low
- **Category:** Docs
- **Confidence:** High
- **Location:** `MANIFEST.json:45-46`; `api.support.cafe/mcp_verify.sh`, `api.support.cafe/rq1_scan.sh`
- **What:** `MANIFEST.json` lists both `mcp_verify.sh` and `rq1_scan.sh` as instrumentation. They
  are near-duplicates: both run `cargo clippy --all-targets --all-features --message-format=json`,
  `cargo audit --json`, and the same `find src -name '*.rs' | xargs wc -l | tail -1`, but write to
  different directories (`verify_out/` versus `rq1_out/`) and record different `versions.txt`
  contents. The committed artifacts came from `mcp_verify.sh`: their `versions.txt` has the
  rustc/endpoint-gen/date shape of `mcp_verify.sh:34`, not the rustc/clippy/audit/date shape of
  `rq1_scan.sh:22`. I confirmed byte-equality between the committed `timing.tsv`, `versions.txt`
  and `audit.json` and the local `verify_out/` copies. So `rq1_scan.sh` contributed nothing and its
  presence in the manifest is misleading, and it is also the source of the incorrect `versions.txt`
  description at `README.md:18` (see `mcp-repl-full-06`).
- **Why it matters:** A reader who runs `rq1_scan.sh` gets outputs in a different place with a
  different `versions.txt` and no `timing.tsv`, and will not be able to match them to the package.
- **Fix:** Drop `rq1_scan.sh` from `MANIFEST.json.instrumentation`, or mark it superseded. When
  vendoring per `mcp-repl-full-04`, vendor only `mcp_verify.sh`.
- **Effort:** S.
- **Blast radius:** `MANIFEST.json`, README.

### [SEV-15] Agent guardrail config was copied from a service repo and never adapted

- **ID:** `mcp-repl-full-15`
- **Severity:** Low
- **Category:** AI-smell
- **Confidence:** High
- **Location:** `.claude/settings.json:4-12`, `.claude/hooks/ask-before-risky-commands.sh:2`,
  `:32`, `:76-77`; `CLAUDE.md:12`, `AGENTS.md:70-78`
- **What:** The guardrail files were lifted wholesale from `api.support.cafe` without editing for
  this repo, which contains only text and data:
  - `.claude/settings.json:4-9` pre-allows `bun run build`, `bun run test`, `bun run typecheck`,
    `bun run lint` and `bun install`. There is no `package.json`, no JavaScript, and no build of
    any kind in this repository.
  - The hook's header comment (`:2`) describes it as a gate for a "pathscale backend service", and
    `:76-77` gate `regenerate_endpoints` and reference WorkTable data migrations. Neither exists
    here.
  - `CLAUDE.md:12` and `AGENTS.md:71-78` state as an invariant that the hook's `RISKY_WORDS` and
    `permissions.ask` must be kept in sync. They are already out of sync: `RISKY_WORDS` at
    `hooks/ask-before-risky-commands.sh:32` includes `terragrunt` and `fly`, neither of which
    appears in `permissions.ask`.
- **Why it matters:** Low impact, since the hook is the stronger of the two layers and no security
  hole results. It matters as a signal: a stated invariant that is violated in its own repository
  teaches every future agent that the invariants here are decorative. The `bun` allowlist is also a
  small live risk, pre-approving package installs in a repo that should never install anything.
- **Fix:** Strip the `bun` entries from `permissions.ask`'s sibling `allow` list, remove the
  `regenerate_endpoints` and WorkTable clauses from the hook, retitle the header comment, and add
  `terragrunt` and `fly` to `permissions.ask` (or drop them from `RISKY_WORDS`).
- **Effort:** S.
- **Blast radius:** `.claude/` only.

## What is clean, stated explicitly

These were checked and found good. Recording them so nobody re-does the work.

- **No secrets anywhere.** Grepped the worktree and the full `git log -p --all` for API keys,
  tokens, passwords, bearer values, private keys, and the usual prefixes (`sk-`, `ghp_`, `gho_`,
  `github_pat_`, `AKIA`, `xox[baprs]-`, `eyJ`). Every hit is either an env-var read
  (`os.getenv('HONEYIDAUTH_TOKEN')`, 26 occurrences in `server_stub.py`) or prose. Nothing
  hardcoded.
- **The deploy-token class of mistake flagged in the sibling review is absent.** This repo has no
  `.github/` directory and no CI workflows at all, so there is nothing to leak a token from.
- **No absolute paths, usernames, machine names, hostnames, emails, or IPs** in any tracked file or
  in git history. The only email in history is the commit author `no-reply@pathscale.com`, which is
  already a no-reply address.
- **Scrubbing verified byte-exact.** Applying `s#$CARGO_HOME#$CARGO_HOME#`, `s#$HOME/code#$CODE#`
  and `s#$HOME#$HOME#` to the local `api.support.cafe/verify_out/clippy.json` yields a file
  identical to the committed `rq1/api.support.cafe/clippy.json` (345,999 bytes, `diff` clean). The
  normalization removed paths and nothing else. `timing.tsv`, `versions.txt` and `audit.json` are
  byte-identical to the local originals.
- **Every reported number is faithful to its raw data.** Verified for all six repos, not just the
  public one: clippy error and warning counts, `top_lints`, audit `vulnerability_count`,
  deduplicated `advisory_ids`, `warning_counts_by_kind`, and `loc`. The aggregation into
  `rq1_results.json` introduced no transcription errors. (The double-counting in
  `mcp-repl-full-02` is upstream of the aggregation, in the scan itself.)
- **The "26 tools" claim checks out.** `grep -c '@mcp.tool' rq2/server_stub.py` returns 26,
  matching `README.md:24`, `run.log:22` and `filtered_operations.log:5`.
- **The excluded `.env` really is a placeholder.** `README.md:57-58` says it was excluded on
  principle. The local `api.support.cafe/rq2_out/.env` is two lines, a comment and
  `HONEYIDAUTH_TOKEN=` with an empty value. No secret was withheld, and none was leaked.
- **No stray artifacts.** No zips, no editor droppings, no `.DS_Store`, no `node_modules`. 944K
  total, 404K of which is `.git`. Every file ever added in the four commits is still present, so
  nothing sensitive was committed and later deleted.
- **No dependency on `aisec` or `gomods`.** Asked explicitly, answered explicitly: this package
  does **not** depend on either. Neither directory is referenced anywhere in this repo, and
  grepping both for `mcp-replication`, `rq1_results` and `server_stub` returns nothing. They are a
  separate line of work (`aisec` is MCP-gateway security material with its own
  `replication_package/`; `gomods` is a Go module zip cache). I read them read-only, changed
  nothing, and reviewed nothing in them.

## Cross-cutting recommendations

1. **Make the package self-contained.** Right now it is a set of pointers, and three of the
   pointers are already broken (`mcp-support` branch deleted, `docs/openapi.yaml` deleted from
   `main`, `88ef163` unreachable by clone). Vendor `mcp_verify.sh`, the RQ2 wrapper, and
   `rq2/inputs/openapi.yaml` into this repo. Nothing that the experiment consumed should live only
   in a repo that can move. What breaks: nothing; it is additive, and the scripts are MIT.
2. **Fix the clippy count and republish `rq1_results.json`.** Deduplicate on
   `(code, file, line, column)`, which changes the headline numbers from 10/52/1/0/825/60 to
   5/26/1/0/444/30. Ship the counting script alongside so the transformation is auditable. Do this
   before the numbers appear anywhere citable. What breaks: every RQ1 table in the paper.
3. **Decide and state the access story.** Five of six repos are private, which is a legitimate
   position, but the README must say so in its own words rather than letting a reviewer discover it
   via a 404. Pair the disclosure with enough committed raw data that the reported numbers stay
   checkable even without source access, using hashed file paths if source structure is the
   concern. What breaks: nothing technical; it needs a call on how much to disclose.
4. **Separate provenance logs from measurements.** `timing.tsv` is a useful record of *what ran
   when*, and a bad performance measurement. Relabel it as the former in the README and remove any
   timing claim from the paper, or invest in doing it properly with `cargo clean`, repetitions and
   variance. The current framing is the worst option because it invites a claim the data cannot
   support. What breaks: any cost-of-migration claim already drafted.
5. **Add the archival basics: LICENSE, SHA256SUMS, CITATION.cff.** Ten minutes of work that
   determines whether an artifact-evaluation committee can accept the package at all. Resolve the
   Auto-MCP licensing question at the same time, since `server_stub.py` is the one file whose
   redistribution is not clearly yours to grant. What breaks: nothing; the Auto-MCP question may
   need an email to the upstream author.
6. **Write the missing `rq1/README.md` and `rq2/README.md`.** A data dictionary for `timing.tsv`
   (including that the `exit` column's `0/1` is `clippy_exit/audit_exit`, evidenced by
   `pays.online-backend` being the sole `0/0` and the sole repo with zero vulnerabilities), the
   field semantics for `rq1_results.json`, and a note on `server_stub.py`'s status as
   non-executable captured output. What breaks: nothing.

## What I did not cover

- **I did not re-run the pipeline.** No `cargo clippy`, no `cargo audit`, no `endpoint-gen`, no
  Auto-MCP. Everything is verified against artifacts already on disk. A re-run today would produce
  different audit results anyway, since the advisory DB has moved since 2026-07-17.
- **I did not review the six service repos.** I read `api.support.cafe/mcp_verify.sh` and
  `rq1_scan.sh` because the README makes them part of this package's reproduction path, and I read
  raw `verify_out/*.json` in the sibling checkouts to verify this package's numbers. I reviewed no
  application source and made no judgement about those repos' quality.
- **I did not audit `rq2/server_stub.py` line by line.** It is 1,123 lines of generated output and
  its verbatim state is the artifact; reviewing its code quality would be reviewing Auto-MCP, not
  this package. I checked it for secrets, hosts, and the tool count only.
- **I could not confirm whether the five private repos are private by policy or by accident.** All
  five return 404 to anonymous requests, which is indistinguishable from renamed or deleted. A
  human with org access should confirm.
- **I did not assess statistical validity of the study design** (six repos, no control group, no
  before/after comparison of the same repo). That is a paper-level question, not an artifact-level
  one, though a reviewer will likely raise it.
- **I did not check whether the `top_lints` truncation is documented.** `pays.online-backend` and
  `web3.trading-backend` show exactly ten entries summing to less than their totals, so the map is
  clearly a top-10 cut, but I did not trace the cutoff rule. Worth confirming when the aggregation
  script is written.

## Quick-start for the follow-up agent

Read in this order:

1. `README.md` (59 lines): the reproduction recipe and the scrubbing policy, which are the two
   things most of the findings are about.
2. `MANIFEST.json` (49 lines): what is pinned and, more importantly, what is not.
3. `rq1/rq1_results.json`: the headline numbers. Finding 02 says every `warnings` value here is
   wrong.
4. `/Users/revenge/code/api.support.cafe/mcp_verify.sh` (79 lines, not in this repo): the actual
   instrumentation. Lines 34, 48, 60 and 63 are the root cause of findings 02, 06, 07 and 09.
5. `rq2/run.log` (41 lines): the RQ2 methodology in full, including the disabled filter.

Verification commands, all read-only:

```bash
# Confirm the clippy double-count (needs the sibling checkouts present)
python3 - <<'EOF'
import json, os
for r in ["api.support.cafe","api.honey.id-backend","auth.honey.id-backend",
          "nofilter.io-backend","pays.online-backend","web3.trading-backend"]:
    p=f"/Users/revenge/code/{r}/verify_out/clippy.json"
    if not os.path.exists(p): continue
    rows=[]
    for line in open(p):
        try: d=json.loads(line)
        except Exception: continue
        if d.get('reason')!='compiler-message': continue
        m=d['message']
        if m.get('level')!='warning': continue
        s=(m.get('spans') or [{}])[0]
        rows.append(((m.get('code') or {}).get('code'), s.get('file_name'),
                     s.get('line_start'), s.get('column_start')))
    print(f"{r:26} emitted={len(rows):5} distinct={len(set(rows)):5}")
EOF

# Confirm the scrubbing was lossless
sed -e "s#$HOME/.cargo#\$CARGO_HOME#g" -e "s#$HOME/code#\$CODE#g" -e "s#$HOME#\$HOME#g" \
  /Users/revenge/code/api.support.cafe/verify_out/clippy.json \
  | diff - /Users/revenge/code/mcp-replication-package/rq1/api.support.cafe/clippy.json && echo CLEAN

# Confirm repo visibility (findings 01, 04, 08)
for r in pathscale/api.support.cafe pathscale/web3.trading-backend Meriem-611/Auto-MCP; do
  curl -sS -o /dev/null -w "$r %{http_code}\n" "https://api.github.com/repos/$r"
done
curl -sS "https://api.github.com/repos/pathscale/api.support.cafe/compare/main...88ef163" \
  | python3 -c "import sys,json;d=json.load(sys.stdin);print(d['status'],d['ahead_by'],d['behind_by'])"
```

Surprises about the layout:

- `git` protocol is blocked in this sandbox but `curl` to `api.github.com` works. Use the API, not
  `git ls-remote`, to check anything remote.
- `rq2/.automcp_config.json` is a dotfile. `ls` without `-a` and some archive tools will miss it.
  Worth renaming when the package is next revised.
- The committed artifacts are a *subset* of what `mcp_verify.sh` produces. `regen.log`,
  `clippy.txt` and `post_regen_diffstat.txt` exist in the local `verify_out/` directories but were
  not included, and the README does not say they were dropped. `post_regen_diffstat.txt` is the
  interesting one: it is empty, which is the evidence that the `regenerate` phase was a no-op.
- `AGENTS.md` is the working agreement and `CLAUDE.md` merely imports it. Do not add rules to
  `CLAUDE.md`.
- Everything here is data. There is nothing to build, nothing to lint, and no test suite, so the
  usual "run the tests" verification loop does not apply. Verification means re-deriving numbers
  from the raw JSON, as above.
