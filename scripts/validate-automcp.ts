#!/usr/bin/env bun
// validate-automcp.ts: check the paper's RQ2 claims against AutoMCP's generated server stub,
// then write a JSON manifest that keeps the evidence once the stub itself is deleted.
// Usage: bun validate-automcp.ts <server_stub.py> <openapi.yaml> <ron-config-dir> <out-manifest.json>
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const [stubPath, oasPath, ronDir, outPath] = process.argv.slice(2);
if (!outPath) { console.error("usage: validate-automcp.ts <stub.py> <openapi.yaml> <ron-dir> <out.json>"); process.exit(2); }

const stub = await Bun.file(stubPath).text();
const oas = Bun.YAML.parse(await Bun.file(oasPath).text()) as any;
const sha256 = new Bun.CryptoHasher("sha256").update(stub).digest("hex");

// --- AutoMCP tools: decorator name, the def's parameters, docstring, HTTP call ---
const pyStr = String.raw`(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)')`;
const toolRe = new RegExp(String.raw`@mcp\.tool\(name=${pyStr}, description=${pyStr}\)\s*\n\s*def (\w+)\(([^)]*)\):\s*\n\s*'''([\s\S]*?)'''([\s\S]*?)(?=\n    @mcp\.tool|$)`, "g");
const unesc = (s: string) => s.replace(/\\n/g, "\n").replace(/\\(["'\\])/g, "$1");
type Tool = { name: string; description: string; docstring: string; params: { name: string; annotation: string }[]; method: string; url: string; body: string };
const tools: Tool[] = [];
for (const m of stub.matchAll(toolRe)) {
  const body = m[8];
  const params = m[6].split(",").map((p) => p.trim()).filter(Boolean).map((p) => {
    const [n, rest] = p.split(":").map((x) => x.trim());
    return { name: n, annotation: (rest ?? "").split("=")[0].trim() };
  });
  tools.push({
    name: unesc(m[1] ?? m[2]), description: unesc(m[3] ?? m[4]), docstring: m[7].trim(), params,
    method: body.match(/requests\.(\w+)\(/)?.[1] ?? "", url: body.match(/api_url = f"\{base_url\}([^"]*)"/)?.[1] ?? "", body,
  });
}

// --- OpenAPI operations ---
type Op = { id: string; method: string; path: string; description: string; code: number };
const ops: Op[] = [];
for (const [path, item] of Object.entries<any>(oas.paths ?? {}))
  for (const [method, op] of Object.entries<any>(item))
    ops.push({ id: op.operationId, method, path, description: String(op.description ?? "").trim(), code: op["x-endpoint-code"] });

// --- RON endpoint descriptions by code ---
const ron = new Map<number, { name: string; description: string; file: string }>();
const walk = (d: string): string[] => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : p.endsWith(".ron") ? [p] : []; });
for (const f of walk(ronDir)) {
  const t = await Bun.file(f).text();
  for (const m of t.matchAll(/name:\s*"(\w+)",\s*code:\s*(\d+),\s*description:\s*"((?:[^"\\]|\\.)*)"/g))
    ron.set(Number(m[2]), { name: m[1], description: m[3].replace(/\\"/g, '"'), file: f.slice(ronDir.length + 1) });
}

// --- checks ---
const results: { id: string; claim: string; pass: boolean; detail: string }[] = [];
const check = (id: string, claim: string, pass: boolean, detail: string) => results.push({ id, claim, pass, detail });
const toolNames = new Set(tools.map((t) => t.name)), opIds = new Set(ops.map((o) => o.id));
check("C1", "AutoMCP generated 26 tools", tools.length === 26, `tools parsed: ${tools.length}; @mcp.tool occurrences: ${(stub.match(/@mcp\.tool\(/g) ?? []).length}`);
check("C2", "All 26 OpenAPI operations became tools (none removed)", ops.length === 26 && [...opIds].every((i) => toolNames.has(i)) && toolNames.size === opIds.size,
  `operations: ${ops.length}; missing tools: ${[...opIds].filter((i) => !toolNames.has(i)).join(",") || "none"}; extra tools: ${[...toolNames].filter((i) => !opIds.has(i)).join(",") || "none"}`);
const docMismatch = tools.filter((t) => t.docstring !== ops.find((o) => o.id === t.name)?.description).map((t) => t.name);
const ronMismatch = ops.filter((o) => ron.get(o.code)?.description !== o.description).map((o) => `${o.id}(${o.code})`);
check("C3", "Each RON endpoint description reached its AutoMCP tool unchanged, via the OpenAPI document",
  docMismatch.length === 0 && ronMismatch.length === 0, `tool docstring != OpenAPI description: ${docMismatch.join(",") || "none"}; OpenAPI != RON: ${ronMismatch.join(",") || "none"}`);
const typed = tools.flatMap((t) => t.params.filter((p) => !/^(Optional\[dict\]|dict)$/.test(p.annotation)).map((p) => `${t.name}.${p.name}:${p.annotation || "(none)"}`));
check("C4", "Every stub parameter is an untyped dictionary", typed.length === 0, `params: ${tools.reduce((n, t) => n + t.params.length, 0)}; not dict: ${typed.join(",") || "none"}`);
const patterns = new Set<string>(); JSON.stringify(oas, (k, v) => { if (k === "pattern") patterns.add(v); return v; });
check("C5", "The identifier pattern appears nowhere in the stub", [...patterns].every((p) => !stub.includes(p)) && !/\bpattern\b/i.test(stub),
  `OpenAPI patterns: ${[...patterns].join(" ")}; found in stub: ${[...patterns].filter((p) => stub.includes(p)).join(" ") || "none"}`);
// endpoint-gen projects a RON enum as a schema with oneOf: [{const, title}, ...]
const enums = Object.entries<any>(oas.components?.schemas ?? {}).filter(([, s]) => Array.isArray(s.oneOf) && s.oneOf.every((v: any) => "const" in v))
  .map(([name, s]) => ({ name, variants: s.oneOf.map((v: any) => String(v.title)) }));
const enumTyping = /\boneOf\b|\bconst\b|\benum\b|Literal\[|IntEnum/.test(stub);
// Code only: function bodies and parameter annotations. Descriptions are prose and reported separately.
const code = tools.map((t) => t.body + " " + t.params.map((p) => p.annotation).join(" ")).join("\n");
const named = enums.filter((e) => new RegExp(`\\b${e.name}\\b`).test(code) || e.variants.some((v: string) => new RegExp(`\\b${v}\\b`).test(code))).map((e) => e.name);
const variantsAsText = enums.flatMap((e) => e.variants.filter((v: string) => new RegExp(`\\b${v}\\b`).test(stub)).map((v: string) => `${e.name}.${v}`));
check("C6", "Enumerations are lost as constraints; they survive only as prose", !enumTyping && named.length === 0,
  `OpenAPI enum schemas: ${enums.map((e) => `${e.name}(${e.variants.length})`).join(" ")}; enum typing in stub: ${enumTyping}; enum names or variants in generated code: ${named.join(",") || "none"}; variant words in description prose only: ${variantsAsText.join(",") || "none"}`);
const nonHttp = tools.filter((t) => !t.method || !t.url.startsWith("/")).map((t) => t.name);
const pathMismatch = tools.filter((t) => { const o = ops.find((x) => x.id === t.name); return !o || o.path !== t.url || o.method !== t.method; }).map((t) => t.name);
check("C7", "The stub assumes plain HTTP with path-shaped URLs", nonHttp.length === 0 && /import requests/.test(stub) && tools.every((t) => !/websocket|wss:/i.test(t.body)),
  `tools without requests.<method>(base_url + path): ${nonHttp.join(",") || "none"}; method/path differing from OpenAPI: ${pathMismatch.join(",") || "none"}; websocket in generated code (descriptions excluded): ${tools.some((t) => /websocket|wss:/i.test(t.body))}`);

const manifest = {
  source: { file: "rq2/server_stub.py", sha256, bytes: stub.length, generator: "AutoMCP (Mastouri et al.), mcp_generator.py", header: stub.split("\n")[0] },
  openapi: { operations: ops.length, sharedSchemas: Object.keys(oas.components?.schemas ?? {}).length },
  checks: results,
  tools: tools.map((t) => ({ name: t.name, http: `${t.method.toUpperCase()} ${t.url}`, params: t.params, description: t.description, docstring: t.docstring })),
};
await Bun.write(outPath, JSON.stringify(manifest, null, 2) + "\n");
for (const r of results) console.log(`${r.pass ? "PASS" : "FAIL"} ${r.id} ${r.claim}\n     ${r.detail}`);
console.log(`sha256 ${sha256}  shared schemas ${manifest.openapi.sharedSchemas}  manifest -> ${outPath}`);
process.exit(results.every((r) => r.pass) ? 0 : 1);
