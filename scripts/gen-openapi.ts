#!/usr/bin/env bun
// gen-openapi.ts: build the OpenAPI 3.1 projection of api.support.cafe that the
// paper's RQ2 run fed to AutoMCP. It reads the MCP tool schemas endpoint-gen
// writes to docs/*_mcp_tools.json and the role lists in the RON definitions.
// Bun port of the July gen_openapi.py; same inputs, same document.
// Usage: bun gen-openapi.ts <api.support.cafe checkout> <out.yaml>
import { readdirSync, statSync } from "node:fs";
import { basename, join } from "node:path";

const [repo, out] = process.argv.slice(2);
if (!repo || !out) { console.error("usage: gen-openapi.ts <api.support.cafe checkout> <out.yaml>"); process.exit(2); }

const camelToSnake = (s: string) => s.replace(/(?<!^)(?=[A-Z])/g, "_").toLowerCase();
const walk = (d: string): string[] =>
  readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });

// Roles and opcode per (service, snake_case endpoint name), from the RON.
const rolesByKey = new Map<string, { roles: string[]; code: number }>();
for (const ron of walk(join(repo, "config/schema_lists")).filter((f) => f.endsWith(".ron"))) {
  const text = await Bun.file(ron).text();
  const svc = text.match(/service_name:\s*"([^"]+)"/)?.[1];
  if (!svc) continue;
  for (const m of text.matchAll(/name:\s*"([A-Za-z0-9]+)",\s*code:\s*(\d+)[\s\S]*?roles:\s*\[([^\]]*)\]/g)) {
    const roles = [...m[3].matchAll(/UserRole::(\w+)/g)].map((r) => r[1]);
    rolesByKey.set(`${svc}/${camelToSnake(m[1])}`, { roles, code: Number(m[2]) });
  }
}

// Move each schema's $defs into components/schemas and rewrite the refs.
const components: Record<string, unknown> = {};
const hoist = (schema: any): any => {
  if (schema === null || typeof schema !== "object" || Array.isArray(schema)) return schema;
  const defs = schema.$defs ?? {};
  delete schema.$defs;
  for (const [name, def] of Object.entries(defs)) {
    const h = hoist(def);
    if (name in components && JSON.stringify(components[name]) !== JSON.stringify(h)) throw new Error(`conflicting $defs for ${name}`);
    components[name] = h;
  }
  const rewrite = (node: any) => {
    if (Array.isArray(node)) node.forEach(rewrite);
    else if (node && typeof node === "object") {
      if (typeof node.$ref === "string" && node.$ref.startsWith("#/$defs/")) node.$ref = node.$ref.replace("#/$defs/", "#/components/schemas/");
      Object.values(node).forEach(rewrite);
    }
  };
  rewrite(schema);
  return schema;
};

const paths: Record<string, unknown> = {};
let ops = 0;
const toolFiles = readdirSync(join(repo, "docs")).filter((f) => f.endsWith("_mcp_tools.json")).sort();
for (const tf of toolFiles) {
  const svc = basename(tf).replace("_mcp_tools.json", "");
  for (const tool of (await Bun.file(join(repo, "docs", tf)).json()).tools) {
    const name: string = tool.name;
    const meta = rolesByKey.get(`${svc}/${name}`);
    const op: Record<string, unknown> = {
      operationId: `${svc}_${name}`,
      summary: name.replaceAll("_", " "),
      description: tool.description ?? "",
      tags: [svc],
      "x-endpoint-code": tool.code ?? meta?.code ?? null,
      "x-frontend-facing": tool.frontendFacing ?? true,
      "x-roles": meta?.roles ?? [],
      responses: {
        "200": { description: "Successful response", content: { "application/json": { schema: hoist(tool.outputSchema ?? { type: "object" }) } } },
        "400": { $ref: "#/components/responses/Error" },
      },
    };
    const ins = tool.inputSchema;
    if (ins && ins.properties && Object.keys(ins.properties).length > 0) {
      op.requestBody = { required: true, content: { "application/json": { schema: hoist(ins) } } };
    }
    if (meta?.roles.length && !(meta.roles.length === 1 && meta.roles[0] === "Public")) op.security = [{ honeyIdAuth: [] }];
    paths[`/${svc}/${name}`] = { post: op };
    ops++;
  }
}

const spec = {
  openapi: "3.1.0",
  info: {
    title: "api.support.cafe",
    version: "1.0.0",
    description:
      "REST projection of the api.support.cafe endpoint surface. Generated from the declarative RON endpoint definitions " +
      "(endpoint-libs / endpoint-gen); the production transport is WebSocket (legacy framing and MCP JSON-RPC 2.0). " +
      "Vendor extensions x-endpoint-code and x-roles preserve opcode and RBAC metadata.",
    contact: { name: "PathScale", url: "https://github.com/pathscale/api.support.cafe" },
  },
  servers: [{ url: "https://api.support.cafe" }],
  paths,
  components: {
    schemas: components,
    responses: {
      Error: {
        description: "Error response",
        content: { "application/json": { schema: {
          type: "object",
          properties: { code: { type: "integer" }, message: { type: "string" } },
          required: ["code", "message"],
          additionalProperties: false,
        } } },
      },
    },
    securitySchemes: {
      honeyIdAuth: { type: "http", scheme: "bearer", description: "honey.id token; role checked against x-roles" },
    },
  },
};

await Bun.write(out, Bun.YAML.stringify(spec, null, 2) + "\n");
console.log(`wrote ${out}: ${ops} operations, ${Object.keys(components).length} shared schemas`);
const missing = [...rolesByKey.keys()].filter((k) => !(`/${k}` in paths));
console.log("RON endpoints without a tools.json match:", missing.length ? missing.join(", ") : "none");
