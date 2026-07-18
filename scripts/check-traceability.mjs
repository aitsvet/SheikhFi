#!/usr/bin/env node
// Machine-check of STANDARDS.md (PLAN v4 §5): the traceability table and the
// contract's @custom:shariah tags must not drift from the code and the test
// run. Red (exit 1) when:
//   1. a table row cites a `symbol` absent from contracts/SheikhFi.sol;
//   2. a table row cites a «test name» that no test/ file defines;
//   3. a table row cites a Halmos `check_*` that the captured run did not pass;
//   4. a @custom:shariah tag names a clause with no row/quote in STANDARDS.md;
//   5. the captured hardhat run is missing or not green.
//
// Inputs are the same captures verify.sh already makes (.verify/halmos.out,
// .verify/hardhat.out) — the check judges the run that actually happened.
// Run:  node scripts/check-traceability.mjs   (wired into scripts/verify.sh)
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const stripAnsi = (s) => s.replace(/\x1b\[[0-9;]*m/g, "");

const standards = read("STANDARDS.md");
const contract = read("contracts/SheikhFi.sol");
const testSrc = readdirSync(join(ROOT, "test"), { recursive: true })
  .filter((f) => String(f).endsWith(".js") || String(f).endsWith(".sol"))
  .map((f) => read(join("test", String(f))))
  .join("\n");

let hardhat, halmos;
try {
  hardhat = stripAnsi(read(".verify/hardhat.out"));
  halmos = stripAnsi(read(".verify/halmos.out"));
} catch {
  console.error("trace: missing .verify/ captures — run the test steps of scripts/verify.sh first");
  process.exit(1);
}

const errors = [];

// 5. the captured run must be green
if (!/\d+ passing/.test(hardhat) || /\d+ failing/.test(hardhat)) {
  errors.push("captured hardhat run is not green (.verify/hardhat.out)");
}
const halmosPassed = new Set([...halmos.matchAll(/\[PASS\] (check_\w+)/g)].map((m) => m[1]));

// The trace table: | § | Требование | Пункты AAOIFI | Реализация | Тесты |
const rows = [...standards.matchAll(/^\| (\d+) \| ([^|]+) \| ([^|]+) \| ([^|]+) \| ([^|]+) \|$/gm)];
if (rows.length < 10) errors.push(`trace table parse found only ${rows.length} rows`);

for (const [, n, , , impl, tests] of rows) {
  // 1. every `symbol` must exist in the contract
  for (const [, sym] of impl.matchAll(/`([A-Za-z_][A-Za-z0-9_]*)`/g)) {
    if (!contract.includes(sym)) errors.push(`row ${n}: symbol \`${sym}\` not in SheikhFi.sol`);
  }
  // 2. every «test name» must exist in test sources
  for (const [, name] of tests.matchAll(/«([^»]+)»/g)) {
    const probe = name.replace(/…$/, "");
    if (!testSrc.includes(probe)) errors.push(`row ${n}: test «${name}» not found in test/`);
  }
  // 3. every cited Halmos check must have passed in the captured run
  for (const [, check] of tests.matchAll(/\b(check_\w+)\b/g)) {
    if (!halmosPassed.has(check)) errors.push(`row ${n}: Halmos ${check} did not pass in .verify/halmos.out`);
  }
}

// 4. every @custom:shariah tag's clause must appear in STANDARDS.md.
// STANDARDS cites clauses as «AAOIFI SS 12, п. 3/1/5/9», "SS 17 3/6, 5/2/16"
// (multi-clause cells) or «SS 13, разд. 6» — build a normalized clause set:
// after each "SS <n>", collect the slash-paths (and "разд. <n>" sections)
// within the same citation window.
const known = new Set();
for (const m of standards.matchAll(/SS\s*(\d+)/g)) {
  const win = standards.slice(m.index, m.index + 90);
  for (const t of win.matchAll(/(?:п\.\s*)?(\d+(?:\/\d+)+)|разд\.\s*(\d+)/g)) {
    known.add(`SS ${m[1]} ${t[1] ?? t[2]}`);
  }
}
for (const [, clause] of contract.matchAll(/@custom:shariah\s+AAOIFI\s+(.+)/g)) {
  const c = clause.trim();
  if (!known.has(c)) errors.push(`tag @custom:shariah "${c}" has no matching clause in STANDARDS.md`);
}

const tags = [...contract.matchAll(/@custom:shariah/g)].length;
if (errors.length) {
  console.error(`trace: RED — ${errors.length} drift(s):`);
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}
console.log(`trace: OK — ${rows.length} rows, ${tags} @custom:shariah tags, ` +
  `${halmosPassed.size} halmos checks, hardhat green`);
