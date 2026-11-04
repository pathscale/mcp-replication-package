#!/usr/bin/env bun
// Report a conversion from an existing local checkout and a recorded commit.
// Usage: bun scripts/describe-conversion.ts <checkout> <measured-commit>

const [repo, revision] = Bun.argv.slice(2);
if (!repo || !revision) {
  console.error("usage: describe-conversion.ts <checkout> <measured-commit>");
  process.exit(2);
}

const git = (...args: string[]): string => {
  const result = Bun.spawnSync([
    "git", "--no-optional-locks", "--no-lazy-fetch", "-C", repo, ...args,
  ], {
    stdout: "pipe",
    stderr: "pipe",
    timeout: 30_000,
    maxBuffer: 64 * 1024 * 1024,
    killSignal: "SIGKILL",
  });
  if (!result.success || result.exitCode !== 0 || result.signalCode
      || result.exitedDueToTimeout || result.exitedDueToMaxBuffer) {
    const reason = result.exitedDueToTimeout ? "30-second command timeout"
      : result.exitedDueToMaxBuffer ? "64-MiB command output limit"
      : result.signalCode ? `signal ${result.signalCode}`
      : `exit ${result.exitCode}`;
    throw new Error(`git ${args.join(" ")} failed (${reason}): ${result.stderr.toString().slice(0, 2000)}`);
  }
  return result.stdout.toString();
};

const pinned = git("rev-parse", "--verify", "--end-of-options", `${revision}^{commit}`).trim();
const parent = git("rev-parse", "--verify", `${pinned}^`).trim();
const files = git("ls-tree", "-r", "--name-only", parent).split("\n").filter(Boolean);
const show = (file: string) => git("show", `${parent}:${file}`);
const lines = (text: string) => text.split("\n").length - (text.endsWith("\n") ? 1 : 0);
const ron = files.filter((file) => file.startsWith("config/") && file.endsWith(".ron"));

let ronLines = 0;
let groups = 0;
let endpoints = 0;
for (const file of ron) {
  const text = show(file);
  ronLines += lines(text);
  groups += (text.match(/EndpointSchemaList/g) ?? []).length;
  endpoints += (text.match(/EndpointSchemaElement\(/g) ?? []).length;
}

let src = 0;
let gen = 0;
for (const file of files.filter((file) => file.startsWith("src/") && file.endsWith(".rs"))) {
  const count = lines(show(file));
  src += count;
  if (file.startsWith("src/codegen/")) gen += count;
}

const diff = git("diff", "--numstat", parent, pinned);
console.log(`measured commit ${pinned}; pre-conversion parent ${parent}`);
console.log(`corpus at parent: groups ${groups}, endpoints ${endpoints}, RON ${ronLines} lines in ${ron.length} files, generated ${gen}, src ${src} lines (${(src / 1000).toFixed(1)} kLOC), expansion ${(gen / ronLines).toFixed(1)}x`);
console.log(`conversion diff ${parent.slice(0, 7)}..${pinned.slice(0, 7)} (added, deleted, file):\n${diff}`);
