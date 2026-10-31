# AutoMCP server stub: where it is, how it was checked, and its removal

`rq2/server_stub.py` is the server that AutoMCP generated from
api.support.cafe's OpenAPI document. It is Python because AutoMCP is a Python
tool. It is research data. Nothing in this package runs it. It stays only until
the RQ2 claims are checked, and the next version of this package deletes it.
Use the hashes below to recover it.

## Where the file is

| Repository | Commit | Path |
|---|---|---|
| pathscale/mcp-replication-package | `82ac7fbcd777299b710c1c7393b05c2fd790b06c` (added), still present at `696ff06bf8970f24802627f0b86390ff88976df4` | `rq2/server_stub.py` |
| pathscale/api.support.cafe | `eb9808846a4df1bdbee5a852b3fe590f6a22b329` (pull request 3, merged 2026-07-25) | `rq2_out/server_stub.py` |
| pathscale/api.support.cafe | `64e925dafeed6c385df7b189cd6706e187847420` (squashed root of `master`), still present at `e48a32c1036b454de5d5cb3d165b616fd959a82b` | `rq2_out/server_stub.py` |

All copies are byte-identical. SHA-256:
`ae70c892ffce4fc75110af5c2810c997af2d14e80a60be3a2c3e882f74a0da52` (61,186 bytes).

To recover it after removal:

```sh
git show 82ac7fbcd777299b710c1c7393b05c2fd790b06c:rq2/server_stub.py > server_stub.py
shasum -a 256 server_stub.py
```

## What was checked

`scripts/validate-automcp.ts` reads the stub, the OpenAPI document, and the RON
endpoint definitions at api.support.cafe commit
`88ef163086843b22ef7124e7063317f94102ff8c`, the measured state in
`MANIFEST.json`. It checks each RQ2 claim in the paper and writes
`rq2/automcp_tools.json`. That file records every tool's name, HTTP method and
path, parameters, description and docstring, plus the result of each check. It
keeps the evidence after the stub is gone.

Result on 2026-11-01: all seven checks pass.

| Check | Claim |
|---|---|
| C1 | AutoMCP generated 26 tools. |
| C2 | All 26 OpenAPI operations became tools; none was removed. |
| C3 | Each RON endpoint description reached its tool unchanged, through the OpenAPI document. |
| C4 | Every stub parameter is an untyped dictionary (20 parameters). |
| C5 | The identifier pattern `^[0-9A-Za-z]+$` appears nowhere in the stub. |
| C6 | The three enumerations (`LogLevel`, `UserRole`, `AppMemberRole`) are not types or constraints in the generated code. Some variant names appear only in description prose. |
| C7 | Every tool sends plain HTTP to a path-shaped URL that matches its OpenAPI operation. No generated code refers to WebSocket. |

To rerun:

```sh
git -C api.support.cafe fetch origin refs/pull/3/head
mkdir -p in && git -C api.support.cafe archive 88ef163 config docs/openapi.yaml | tar -x -C in/
bun scripts/validate-automcp.ts rq2/server_stub.py in/docs/openapi.yaml in/config rq2/automcp_tools.json
```

## Removal plan

1. This version adds the validator, `rq2/automcp_tools.json` and this file,
   and keeps the stub.
2. The next version deletes `rq2/server_stub.py` from this repository's
   `master`. `rq2/automcp_tools.json`, the SHA-256 above and the recovery
   command take its place.
3. api.support.cafe deletes `rq2_out/` from its `master`. That directory
   duplicates `rq2/` here and is not service code.
