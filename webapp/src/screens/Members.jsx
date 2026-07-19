import { useState } from 'react';
import { Avatar, Badge, Button, Card, CardHead, Empty, Field, Input, formatEther, shortAddr } from '../ui';
import { useStore, ROLES } from '../state';
import { PageHead, WithdrawPill } from './PageHead';

/// v6 — board elected by the partners (AAOIFI GS 19 ¶12): the owner
/// nominates with a credentials hash, partners approve stake-weighted,
/// the elected candidate accepts the seat. Read-only for guests.
function BoardGovernance() {
  const { hasV6, boardGov, boardAddr, identity, totalFunds,
          approveShareThreshold, nominateBoard, approveBoard,
          acceptBoardSeat, busy } = useStore();
  const [cand, setCand] = useState('');
  const [cv, setCv] = useState('');
  if (!hasV6) return null;
  const isOwner = identity.role === ROLES.OWNER;
  const canVote = identity.role === ROLES.OWNER || identity.role === ROLES.INVESTOR;
  const meIsPending = identity.addr
    && boardGov.pendingSeat?.toLowerCase() === identity.addr.toLowerCase();
  const pct = (w) => totalFunds > 0n ? Number((w * 1000n) / totalFunds) / 10 : 0;
  return (
    <Card style={{ marginTop: 18 }}>
      <CardHead
        title="Sharia board — elected by the partners"
        sub={`Current board ${shortAddr(boardAddr)} · GS 19 ¶12: the owner nominates, the partners approve (threshold ${approveShareThreshold}%), the elected candidate accepts the seat`}
      />
      <div className="card-body stack">
        {boardGov.nominations.length === 0 && (
          <div style={{ fontSize: 13, color: 'var(--ink-3)' }}>No nominations yet.</div>
        )}
        {boardGov.nominations.map(n => (
          <div key={n.id} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <span className="mono">{shortAddr(n.candidate)}</span>
            <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>cv: {n.cvHash || '—'}</span>
            {n.cancelled ? <Badge>Cancelled</Badge>
              : n.elected ? <Badge tone="ok">Elected{meIsPending && boardGov.pendingSeat === n.candidate ? ' — you' : ''}</Badge>
              : Date.now() > n.deadline * 1000 ? <Badge>Expired</Badge>
              : <>
                  <Badge tone="blue">{pct(n.approvalWeight).toFixed(1)}% of {approveShareThreshold}%</Badge>
                  {canVote && (
                    <Button size="sm" disabled={busy} onClick={() => approveBoard(n.id)}>Approve</Button>
                  )}
                </>}
          </div>
        ))}
        {meIsPending && (
          <div>
            <Button variant="primary" disabled={busy} onClick={acceptBoardSeat}>
              Accept board seat
            </Button>
          </div>
        )}
        {isOwner && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <Field label="Candidate address" style={{ minWidth: 280 }}>
              <Input value={cand} onChange={e => setCand(e.target.value)} placeholder="0x…" disabled={busy} />
            </Field>
            <Field label="Credentials (IPFS CID)" style={{ minWidth: 200 }}>
              <Input value={cv} onChange={e => setCv(e.target.value)} placeholder="cv hash" disabled={busy} />
            </Field>
            <Button disabled={busy || !cand} onClick={() => { nominateBoard(cand, cv); setCand(''); setCv(''); }}>
              Nominate
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}

function MemberRow({ m, kind }) {
  return (
    <tr>
      <td>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Avatar name={m.nickname || m.addr} size={26} />
          <div>
            <div style={{ fontWeight: 600 }}>{m.nickname || shortAddr(m.addr)}</div>
            <div className="mono" style={{ fontSize: 11, color: 'var(--ink-3)' }}>{shortAddr(m.addr)}</div>
          </div>
        </div>
      </td>
      <td className="right num">
        {formatEther(kind === 'partner' ? m.fundsInvested : m.fundsSecured)}
        <span style={{ color: 'var(--ink-3)' }}> ETH</span>
      </td>
      <td className="right num">
        {formatEther(m.profit ?? 0n)}<span style={{ color: 'var(--ink-3)' }}> ETH</span>
      </td>
      <td className="right num">{Number(m.profitRate ?? 0).toFixed(0)}%</td>
    </tr>
  );
}

export default function MembersScreen() {
  const { investors, managers } = useStore();
  return (
    <>
      <PageHead
        crumb="Activity"
        title="Members"
        lede="Partners pool capital (Musharaka). Operators run real projects against it (Mudaraba)."
        actions={<WithdrawPill />}
      />

      <div className="grid-2">
        <Card>
          <CardHead
            title="Partners"
            sub="Musharaka · capital providers"
            actions={<Badge tone="pink">{investors.length}</Badge>}
          />
          {investors.length === 0
            ? <div className="card-body"><Empty>No partners yet.</Empty></div>
            : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th className="right">Invested</th>
                    <th className="right">Profit</th>
                    <th className="right">Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {investors.map((m, i) => <MemberRow key={i} m={m} kind="partner" />)}
                </tbody>
              </table>
            )
          }
        </Card>

        <Card>
          <CardHead
            title="Operators"
            sub="Mudaraba · project managers"
            actions={<Badge tone="blue">{managers.length}</Badge>}
          />
          {managers.length === 0
            ? <div className="card-body"><Empty>No operators yet.</Empty></div>
            : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th className="right">Secured</th>
                    <th className="right">Profit</th>
                    <th className="right">Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {managers.map((m, i) => <MemberRow key={i} m={m} kind="operator" />)}
                </tbody>
              </table>
            )
          }
        </Card>
      </div>

      <BoardGovernance />
    </>
  );
}
