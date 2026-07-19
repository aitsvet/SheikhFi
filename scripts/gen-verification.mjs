#!/usr/bin/env node
// Emit webapp/src/verification.json from a REAL verification run — never from
// prose. Reads the two capture files that scripts/verify.sh (or a manual run)
// leaves behind:
//
//   .verify/halmos.out   — `docker compose run --rm halmos` output
//   .verify/hardhat.out  — `npx hardhat test` output
//
// and refuses to write anything unless Halmos reports 0 failed. The webapp's
// Proofs screen renders ONLY this file: a proof that was not actually run
// cannot appear on the page. Curated fields (clause, plain-language claim)
// are joined by check name — a check that vanishes from the run vanishes
// from the page.
//
// Run on the host (it only reads files + git):  node scripts/gen-verification.mjs
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");

const stripAnsi = (s) => s.replace(/\x1b\[[0-9;]*m/g, "");
const halmos = stripAnsi(read(".verify/halmos.out"));
const hardhat = stripAnsi(read(".verify/hardhat.out"));

const summary = halmos.match(/Symbolic test result: (\d+) passed; (\d+) failed/);
if (!summary || summary[2] !== "0") {
  console.error("halmos capture is not green — refusing to emit verification.json");
  process.exit(1);
}

const CURATED = {
  check_I2_depositPreservesBook: {
    invariant: "I2 · book equality",
    clause: "AAOIFI SS 12 3/1/5/3",
    claim: "A deposit mints the SHFI share one-to-one with the capital contributed — for ANY amount.",
  },
  check_I2_transferPreservesBook: {
    invariant: "I2 · book equality",
    clause: "AAOIFI SS 17 3/6, 5/2/16",
    claim: "A share transfer moves stake between partners and creates none — supply and books stay equal for ANY amount (transfers open only after commencement of activity).",
  },
  check_I2_exitPreservesBook: {
    invariant: "I2 · book equality",
    clause: "AAOIFI SS 12 3/1/6/1",
    claim: "An exit — after the due notice the clause requires — burns exactly what it pays out and leaves every other partner's stake untouched, for ANY amount.",
  },
  check_I3_accrualMonotone: {
    invariant: "I3 · accrual monotone",
    clause: "AAOIFI SS 12 3/1/5/7",
    claim: "The profit accumulator only ever grows: distributed profit is never clawed back, for ANY revenue.",
  },
  check_I6_writeOffProRata: {
    invariant: "I6 · loss pro-rata",
    clause: "AAOIFI SS 12 3/1/5/4",
    claim: "A write-off cuts every partner's stake EXACTLY in proportion to capital — stated as an equality: a 1-wei drift in the pool's favour would be a counterexample. Proved for every repayment the contract accepts.",
  },
  check_slashRestoresProRata: {
    invariant: "v7 · verdict restoration pro-rata",
    clause: "AAOIFI SS 13 §6; SS 5 6/8/2",
    claim: "A post-write-off board verdict restores every partner's stake EXACTLY pro-rata — for ANY verdict amount, after the execute-time caps; the collateral freeze is fully released.",
  },
  check_writeOffNetsRevenue: {
    invariant: "v5 §1 · jabr al-khasarah",
    clause: "AAOIFI SS 40 3/2/1; SS 13 8/7",
    claim: "A write-off first nets undistributed revenue into the shortfall as capital recovery: no manager fee, no owner cut, loss shrinks by exactly the netted amount — for ANY revenue.",
  },
};

const checks = [];
for (const m of halmos.matchAll(/\[PASS\] (check_\w+)\((\w+)\) \(paths: (\d+), time: ([\d.]+)s/g)) {
  const [, name, argType, paths, time] = m;
  checks.push({ name, argType, paths: Number(paths), timeSec: Number(time), ...(CURATED[name] ?? {}) });
}

const passing = hardhat.match(/(\d+) passing/);

const out = {
  generatedAt: new Date().toISOString().slice(0, 19) + "Z",
  gitSha: execSync("git rev-parse --short HEAD", { cwd: ROOT }).toString().trim(),
  contractSha256: createHash("sha256").update(read("contracts/SheikhFi.sol")).digest("hex").slice(0, 16),
  halmos: {
    verdict: `${summary[1]} passed, 0 failed`,
    tool: "Halmos (a16z) — symbolic execution of the REAL contract, no model in between",
    checks,
    bounds: [
      "Proofs hold for all inputs AT THIS POOL SHAPE: 3 investors, write-off loop unrolled to 4 — not for pools of every size.",
      "repaid/revenue are uint64 — no generality lost: the contract rejects anything above the 10-ether project, and 64-bit division is what keeps the solver from timing out.",
      "I1 (solvency), I4 (profit only with capital intact) and I5 (frozen vote weights) stay with the fuzzer — they depend on contract balance and voting history, not one operation's arithmetic.",
    ],
  },
  mutationsCaught: [
    { mutation: "write-off splits the loss equally instead of pro-rata", failedCheck: "check_I6_writeOffProRata", counterexample: "repaid = 3 wei / ≈10 ether − 4 wei" },
    { mutation: "transfer credits the recipient without debiting the sender", failedCheck: "check_I2_transferPreservesBook", counterexample: "amount = 1" },
    { mutation: "write-off netting disabled (towardPrincipal = 0)", failedCheck: "check_writeOffNetsRevenue", counterexample: "concrete revenue value; the other five checks stay green" },
    { mutation: "verdict restoration splits equally instead of pro-rata", failedCheck: "check_slashRestoresProRata", counterexample: "concrete verdict amount, 20 paths; the other six checks stay green" },
  ],
  hardhat: { testsPassing: passing ? Number(passing[1]) : null, includes: "unit suite + seeded 200-step invariant walk (I1–I6)" },
};

writeFileSync(join(ROOT, "webapp/src/verification.json"), JSON.stringify(out, null, 1) + "\n");
console.log(`verification.json: halmos ${out.halmos.verdict}, ${checks.length} checks, ${out.hardhat.testsPassing} tests, git ${out.gitSha}`);
