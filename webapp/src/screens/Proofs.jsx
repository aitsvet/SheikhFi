import { useState } from 'react';
import { Card, CardHead, Badge, Button, SectionRule } from '../ui';
import { PageHead } from './PageHead';
import V from '../verification.json';

/* The Proofs screen renders ONLY webapp/src/verification.json, which
   scripts/gen-verification.mjs emits from captured Halmos + hardhat runs and
   refuses to write unless Halmos was green. A proof that was not actually
   run cannot appear here. */

export default function ProofsScreen() {
  const [showMutations, setShowMutations] = useState(false);
  return (
    <>
      <PageHead
        crumb="Assurance"
        title="Proofs — formal verification"
        lede={`Symbolic proofs of the Shari'ah-load-bearing invariants, executed against the REAL contract by Halmos — no hand-written model in between. Parsed from the captured run: git ${V.gitSha}, contract sha256 ${V.contractSha256}, generated ${V.generatedAt}. Nothing on this page is hand-typed.`}
      />

      <div className="kpis" style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>
        <Card style={{ flex: 1, minWidth: 220 }}>
          <CardHead title={`Halmos: ${V.halmos.verdict}`} sub="proved for ALL inputs (at the stated pool shape) — or a concrete counterexample" />
        </Card>
        <Card style={{ flex: 1, minWidth: 220 }}>
          <CardHead title={`${V.hardhat.testsPassing} tests passing`} sub={V.hardhat.includes} />
        </Card>
        <Card style={{ flex: 1, minWidth: 220 }}>
          <CardHead title={`${V.mutationsCaught.length} mutations on record`} sub="each planted fault turns a specific proof red — the green is earned" />
        </Card>
      </div>

      <SectionRule title="What is proved" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(340px,1fr))', gap: 14 }}>
        {V.halmos.checks.map(c => (
          <Card key={c.name}>
            <CardHead
              title={c.invariant ?? c.name}
              sub={c.clause}
              actions={<Badge tone="ok">proved · {c.paths} paths · {c.timeSec}s</Badge>}
            />
            <p style={{ margin: '6px 0 4px' }}>{c.claim}</p>
            <div className="muted" style={{ fontFamily: 'monospace', fontSize: 12 }}>{c.name}({c.argType})</div>
          </Card>
        ))}
      </div>

      <SectionRule title="Honest bounds — what the proofs do NOT cover" />
      <Card>
        <ul style={{ margin: '4px 0', paddingLeft: 20, lineHeight: 1.6 }}>
          {V.halmos.bounds.map((b, i) => <li key={i}>{b}</li>)}
        </ul>
      </Card>

      <SectionRule title="Why trust a green check" />
      <Card>
        <CardHead
          title="The proofs are mutation-tested"
          sub="An all-green first run means nothing until the check is shown to discriminate. These faults were planted in the contract and each one produced a counterexample."
          actions={<Button size="sm" onClick={() => setShowMutations(!showMutations)}>{showMutations ? 'hide' : 'show'}</Button>}
        />
        {showMutations && (
          <table className="table" style={{ width: '100%' }}>
            <thead><tr><th style={{ textAlign: 'left' }}>Planted fault</th><th style={{ textAlign: 'left' }}>Caught by</th><th style={{ textAlign: 'left' }}>Counterexample</th></tr></thead>
            <tbody>
              {V.mutationsCaught.map((m, i) => (
                <tr key={i}>
                  <td>{m.mutation}</td>
                  <td><Badge tone="warn">{m.failedCheck}</Badge></td>
                  <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{m.counterexample}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <SectionRule title="Provenance" />
      <Card>
        <p style={{ margin: '4px 0', lineHeight: 1.6 }}>
          {V.halmos.tool}. The traceability from each mechanism to the AAOIFI clause it
          discharges — with verbatim quotes — lives in <code>STANDARDS.md</code>; the proofs
          above are the machine-checked end of that table. Proofs were run against the
          contract source at git <code>{V.gitSha}</code> — a deployment created before that
          commit predates them.
        </p>
      </Card>
    </>
  );
}
