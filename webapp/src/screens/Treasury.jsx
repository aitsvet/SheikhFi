import { useState } from 'react';
import { Badge, Card, CardHead, Empty, Field, Input, Kpi, Select, TxStatus,
         formatEther, parseEther } from '../ui';
import { Button } from '../ui';
import { ROLES, useStore } from '../state';
import { PageHead, WithdrawPill } from './PageHead';
import { activeNetwork } from '../deployments';

function DistributePanel() {
  const { proposals, distributeRevenue, writeOffProposal, hasEconomyV2, tx, busy } = useStore();
  const [sel, setSel] = useState('');
  const [selOff, setSelOff] = useState('');
  // profit is only recognised once the capital is home — or written off
  const capitalHome = (p) => p.principalReturned === undefined
    || p.principalReturned >= p.requiredFunds || p.writtenOff === true;
  const eligible = proposals
    .map((p, i) => ({ ...p, _id: i }))
    .filter(p => p.revenueReceived > p.revenuePaid && capitalHome(p));
  const writeOffable = proposals
    .map((p, i) => ({ ...p, _id: i }))
    .filter(p => p.secured && p.writtenOff !== true
      && (p.principalReturned ?? 0n) < p.requiredFunds);

  const doDistribute = async () => {
    await distributeRevenue(Number(sel));
    setSel('');
  };
  const doWriteOff = async () => {
    await writeOffProposal(Number(selOff));
    setSelOff('');
  };

  return (
    <Card>
      <CardHead title="Distribute revenue" sub="Council action" />
      <div className="card-body">
        <div className="field-row">
          <Field label="Proposal">
            <Select value={sel} onChange={e => setSel(e.target.value)}
              disabled={!eligible.length || busy} style={{ width: 320 }}>
              <option value="" disabled>
                {eligible.length ? 'Select proposal with unsettled revenue' : 'No unsettled revenue'}
              </option>
              {eligible.map(p => (
                <option key={p._id} value={p._id}>
                  #{p._id} — {p.description} · {formatEther(p.revenueReceived - p.revenuePaid)} ETH pending
                </option>
              ))}
            </Select>
          </Field>
          <Button variant="primary" onClick={doDistribute} disabled={sel === '' || busy}>
            Distribute profits
          </Button>
        </div>
        {hasEconomyV2 && (
          <div className="field-row" style={{ marginTop: 12 }}>
            <Field label="Write off a failed project (final)">
              <Select value={selOff} onChange={e => setSelOff(e.target.value)}
                disabled={!writeOffable.length || busy} style={{ width: 320 }}>
                <option value="" disabled>
                  {writeOffable.length ? 'Select project with capital outstanding' : 'No capital outstanding'}
                </option>
                {writeOffable.map(p => (
                  <option key={p._id} value={p._id}>
                    #{p._id} — {p.description} · {formatEther(p.requiredFunds - (p.principalReturned ?? 0n))} ETH lost
                  </option>
                ))}
              </Select>
            </Field>
            <Button onClick={doWriteOff} disabled={selOff === '' || busy}>
              Write off
            </Button>
          </div>
        )}
        <TxStatus msg={tx.msg} tone={tx.tone} />
      </div>
    </Card>
  );
}

function SlashPanel() {
  const { proposals, managers, slashCollateral, getNickname, tx, busy } = useStore();
  const [sel, setSel] = useState('');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  // slashable: secured, not written off, capital outstanding, manager has collateral
  const slashable = proposals
    .map((p, i) => ({ ...p, _id: i }))
    .filter(p => p.secured && p.writtenOff !== true
      && (p.principalReturned ?? 0n) < p.requiredFunds
      && (managers.find(m => m.addr.toLowerCase() === p.manager.toLowerCase())?.collateral ?? 0n) > 0n);

  const doSlash = async () => {
    const p = slashable.find(x => String(x._id) === String(sel));
    if (!p) return;
    await slashCollateral(p.manager, p._id, parseEther(amount), reason);
    setSel(''); setAmount(''); setReason('');
  };

  return (
    <Card>
      <CardHead title="Board verdict — slash collateral"
        sub="Only for misconduct, negligence or breach — never for a commercial loss" />
      <div className="card-body stack">
        <Field label="Proposal">
          <Select value={sel} onChange={e => setSel(e.target.value)}
            disabled={!slashable.length || busy} style={{ width: '100%' }}>
            <option value="" disabled>
              {slashable.length ? 'Select project with collateralised manager' : 'Nothing slashable'}
            </option>
            {slashable.map(p => (
              <option key={p._id} value={p._id}>
                #{p._id} — {p.description} · {getNickname(p.manager)}
              </option>
            ))}
          </Select>
        </Field>
        <div className="field-row">
          <Field label="Amount (ETH)">
            <Input type="number" placeholder="0.0"
              value={amount} onChange={e => setAmount(e.target.value)} disabled={busy} />
          </Field>
          <Field label="Grounds (recorded on-chain)" style={{ flex: 1 }}>
            <Input style={{ width: '100%' }} type="text" placeholder="e.g. breach of reporting duty"
              value={reason} onChange={e => setReason(e.target.value)} disabled={busy} />
          </Field>
          <Button onClick={doSlash} disabled={busy || sel === '' || !amount || !reason}>
            Slash
          </Button>
        </div>
        <TxStatus msg={tx.msg} tone={tx.tone} />
      </div>
    </Card>
  );
}

export default function TreasuryScreen() {
  const { totalFunds, freeFunds, totalRevenue, proposals, identity, isBoard, hasV3,
          approveShareThreshold, getNickname, deployment } = useStore();
  const net = activeNetwork;
  const securedValue = proposals
    .filter(p => p.secured)
    .reduce((s, p) => s + p.requiredFunds, 0n);
  const settledRevenue = proposals.reduce((s, p) => s + (p.revenuePaid ?? 0n), 0n);

  return (
    <>
      <PageHead
        crumb={`Activity · ${net.name}`}
        title="Treasury"
        lede="State of the common fund: capital pooled, deployed, returned, settled."
        actions={<WithdrawPill />}
      />

      <div className="kpis">
        <Kpi label="Total funds"     value={formatEther(totalFunds)}      unit="ETH" />
        <Kpi label="Deployed"        value={formatEther(securedValue)}    unit="ETH" hint="In secured proposals" />
        <Kpi label="Free funds"      value={formatEther(freeFunds)}       unit="ETH" hint="Available to deploy" />
        <Kpi label="Revenue settled" value={formatEther(settledRevenue)}  unit="ETH" hint={`of ${formatEther(totalRevenue)} received`} />
      </div>

      <div className="grid-2">
        <Card>
          <CardHead title="Contract" sub={net.name} />
          <div className="card-body">
            <table className="table" style={{ fontSize: 13 }}>
              <tbody>
                <tr><th style={{ width: 160 }}>Address</th>
                  <td>
                    {net.explorer
                      ? <a className="mono" href={`${net.explorer}/address/${deployment.contractAddress}`}
                           target="_blank" rel="noopener noreferrer">
                          {deployment.contractAddress}
                        </a>
                      : <span className="mono">{deployment.contractAddress}</span>}
                  </td></tr>
                <tr><th>Owner</th><td>{getNickname(deployment.owner)}</td></tr>
                <tr><th>Approval threshold</th><td className="num">{Number(approveShareThreshold).toFixed(1)}%</td></tr>
                <tr><th>You are</th><td>
                  {identity.role === ROLES.OWNER    && <Badge tone="blue">Council (owner)</Badge>}
                  {identity.role === ROLES.MANAGER  && <Badge tone="blue">Operator (manager)</Badge>}
                  {identity.role === ROLES.INVESTOR && <Badge tone="pink">Partner (investor)</Badge>}
                  {identity.role === ROLES.NONE     && <Badge>Guest</Badge>}
                </td></tr>
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <CardHead title="Revenue history" sub="By proposal" />
          <div className="card-body">
            <table className="table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Project</th>
                  <th className="right">Principal home</th>
                  <th className="right">Received</th>
                  <th className="right">Paid</th>
                </tr>
              </thead>
              <tbody>
                {proposals.map((p, i) => (p.revenueReceived > 0n || (p.principalReturned ?? 0n) > 0n) && (
                  <tr key={i}>
                    <td className="num">{i}</td>
                    <td>{p.description}{p.writtenOff === true ? ' · written off' : ''}</td>
                    <td className="right num">
                      {p.principalReturned === undefined
                        ? '—'
                        : `${formatEther(p.principalReturned)} / ${formatEther(p.requiredFunds)}`}
                    </td>
                    <td className="right num">{formatEther(p.revenueReceived)}</td>
                    <td className="right num">{formatEther(p.revenuePaid)}</td>
                  </tr>
                ))}
                {proposals.every(p => p.revenueReceived === 0n && (p.principalReturned ?? 0n) === 0n) && (
                  <tr><td colSpan="5" style={{ padding: 20 }}><Empty>No revenue yet.</Empty></td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {hasV3 && isBoard && (
        <div style={{ marginTop: 16 }}>
          <SlashPanel />
        </div>
      )}

      {identity.role === ROLES.OWNER && (
        <div style={{ marginTop: 16 }}>
          <DistributePanel />
        </div>
      )}
    </>
  );
}
