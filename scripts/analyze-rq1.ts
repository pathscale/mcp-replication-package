#!/usr/bin/env bun
// analyze-rq1.ts: RQ1 counts from one service's verify_out/ (written by mcp_verify.sh).
// A finding is a Clippy warning or error whose primary span is in first-party src/,
// counted once per (lint, file, line). Findings under src/codegen are generated.
// Bun port of the July analyze_rq1.py; same rules.
// Usage: bun analyze-rq1.ts <service>/verify_out [...]
export async function analyze(dir: string) {
  const loc = parseInt((await Bun.file(`${dir}/loc.txt`).text()).trim().split(/\s+/)[0]);
  const seen = new Set<string>();
  const lints = new Map<string, number>();
  let gen = 0;
  for (const line of (await Bun.file(`${dir}/clippy.json`).text()).split("\n")) {
    let m: any;
    try { m = JSON.parse(line); } catch { continue; }
    if (m.reason !== "compiler-message") continue;
    const msg = m.message ?? {};
    if (!["warning", "error"].includes(msg.level)) continue;
    const code = msg.code?.code ?? "";
    const spans = msg.spans ?? [];
    const prim = spans.find((s: any) => s.is_primary) ?? spans[0];
    const file = prim?.file_name ?? "";
    if (!file.startsWith("src/")) continue;
    const key = `${code}|${file}|${prim?.line_start ?? 0}`;
    if (seen.has(key)) continue;
    seen.add(key);
    lints.set(code, (lints.get(code) ?? 0) + 1);
    if (file.startsWith("src/codegen")) gen++;
  }
  const audit = await Bun.file(`${dir}/audit.json`).json();
  const top = [...lints].sort((a, b) => b[1] - a[1]).slice(0, 5);
  return {
    loc, findings: seen.size, gen, hand: seen.size - gen,
    rate: Number((seen.size / (loc / 1000)).toFixed(2)),
    vulnerabilities: audit.vulnerabilities?.count ?? 0,
    top,
  };
}

if (import.meta.main) {
  const dirs = process.argv.slice(2);
  if (!dirs.length) { console.error("usage: analyze-rq1.ts <service>/verify_out [...]"); process.exit(2); }
  for (const d of dirs) {
    const r = await analyze(d);
    console.log(`${d}: kLOC ${(r.loc / 1000).toFixed(1)}, findings ${r.findings}, gen ${r.gen}, hand ${r.hand}, rate ${r.rate}, vulnerabilities ${r.vulnerabilities} | ${r.top.map(([k, v]) => `${k} ${v}`).join(", ")}`);
  }
}
