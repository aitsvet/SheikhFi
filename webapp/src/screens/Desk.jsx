import { useState } from 'react';
import {
  Avatar, Badge, Button, Card, CardHead, Empty, Field, Input, Kpi,
  Progress, SectionRule, Select, TxStatus,
  formatEther, parseEther, shortAddr,
} from '../ui';
import { ROLES, isOpenProposal, useStore } from '../state';
import { PageHead, WithdrawPill } from './PageHead';
import { ProposalCard } from './Proposals';
import deploymentJson from '../abi/deployment.json';
import { networkFor } from '../networks';

function CouncilDesk() {
  const { addInvestor, addManager, investors, managers,
          totalFunds, freeFunds, tx, busy } = useStore();
  const [invAddr, setInvAddr] = useState('');
  const [invNick, setInvNick] = useState('');
  const [invRate, setInvRate] = useState('');
  const [mgrAddr, setMgrAddr] = useState('');
  const [mgrNick, setMgrNick] = useState('');
  const [mgrRate, setMgrRate] = useState('');

  const doAddInvestor = async () => {
    await addInvestor(invAddr, invNick, invRate);
    setInvAddr(''); setInvNick(''); setInvRate('');
  };
  const doAddManager = async () => {
    await addManager(mgrAddr, mgrNick, mgrRate);
    setMgrAddr(''); setMgrNick(''); setMgrRate('');
  };

  return (
    <>
      <PageHead
        crumb="Workspace"
        title="Council desk"
        lede="Onboard partners and operators. Set their profit-share rates. Distribute revenue from the Treasury screen once it lands."
        actions={<WithdrawPill />}
      />
      <div className="kpis">
        <Kpi label="Partners"  value={investors.length} hint="Musharaka" />
        <Kpi label="Operators" value={managers.length}  hint="Mudaraba" />
        <Kpi label="Total funds" value={formatEther(totalFunds)} unit="ETH" hint="Pooled by partners" />
        <Kpi label="Free funds"  value={formatEther(freeFunds)}  unit="ETH" hint="Available to deploy" />
      </div>

      <div className="grid-2">
        <Card>
          <CardHead title="Onboard partner" sub="Musharaka — capital provider" />
          <div className="card-body stack">
            <Field label="Address">
              <Input style={{ width: '100%' }} type="text" placeholder="0x…"
                value={invAddr} onChange={e => setInvAddr(e.target.value)} disabled={busy} />
            </Field>
            <div className="field-row">
              <Field label="Nickname">
                <Input style={{ width: 200 }} type="text"
                  value={invNick} onChange={e => setInvNick(e.target.value)} disabled={busy} />
              </Field>
              <Field label="Profit rate %">
                <Input style={{ width: 120 }} type="number"
                  value={invRate} onChange={e => setInvRate(e.target.value)} disabled={busy} />
              </Field>
              <Button variant="primary" onClick={doAddInvestor}
                disabled={busy || !invAddr || !invNick || !invRate}>
                Add partner
              </Button>
            </div>
          </div>
        </Card>

        <Card>
          <CardHead title="Onboard operator" sub="Mudaraba — project manager" />
          <div className="card-body stack">
            <Field label="Address">
              <Input style={{ width: '100%' }} type="text" placeholder="0x…"
                value={mgrAddr} onChange={e => setMgrAddr(e.target.value)} disabled={busy} />
            </Field>
            <div className="field-row">
              <Field label="Nickname">
                <Input style={{ width: 200 }} type="text"
                  value={mgrNick} onChange={e => setMgrNick(e.target.value)} disabled={busy} />
              </Field>
              <Field label="Profit rate %">
                <Input style={{ width: 120 }} type="number"
                  value={mgrRate} onChange={e => setMgrRate(e.target.value)} disabled={busy} />
              </Field>
              <Button variant="primary" onClick={doAddManager}
                disabled={busy || !mgrAddr || !mgrNick || !mgrRate}>
                Add operator
              </Button>
            </div>
          </div>
        </Card>
      </div>
      <TxStatus msg={tx.msg} tone={tx.tone} />
    </>
  );
}

function OperatorDesk() {
  const { identity, proposals, managers, submitProposal, receiveRevenue,
          returnPrincipal, hasEconomyV2, tx, busy } = useStore();
  const [desc, setDesc] = useState('');
  const [funds, setFunds] = useState('');
  const [payment, setPayment] = useState('');
  const [selectedProposal, setSelectedProposal] = useState('');
  const [principal, setPrincipal] = useState('');
  const [principalProposal, setPrincipalProposal] = useState('');

  const mine = proposals
    .map((p, i) => ({ ...p, _id: i }))
    .filter(p => p.manager.toLowerCase() === identity.addr.toLowerCase());
  const mySecured = mine.filter(p => p.secured && p.writtenOff !== true);
  // secured projects whose capital is not fully home yet
  const myOwing = mySecured.filter(p =>
    (p.principalReturned ?? 0n) < p.requiredFunds);

  const totalRequired = mine.reduce((s, p) => s + p.requiredFunds, 0n);
  const totalReceived = mine.reduce((s, p) => s + (p.revenueReceived ?? 0n), 0n);
  const myRate = managers.find(m =>
    m.addr.toLowerCase() === identity.addr.toLowerCase())?.profitRate ?? 0n;

  const doSubmit = async () => {
    await submitProposal(desc, parseEther(funds));
    setDesc(''); setFunds('');
  };
  const doReceive = async () => {
    await receiveRevenue(Number(selectedProposal), parseEther(payment));
    setPayment(''); setSelectedProposal('');
  };
  const doReturnPrincipal = async () => {
    await returnPrincipal(Number(principalProposal), parseEther(principal));
    setPrincipal(''); setPrincipalProposal('');
  };

  return (
    <>
      <PageHead
        crumb="Workspace"
        title="Operator desk"
        lede={`Welcome, ${identity.who}. Propose real-asset projects to the partnership; deliver revenue once they're secured.`}
        actions={<WithdrawPill />}
      />
      <div className="kpis">
        <Kpi label="My projects" value={mine.length} hint={`${mySecured.length} secured`} />
        <Kpi label="Capital secured" value={formatEther(totalRequired)} unit="ETH" />
        <Kpi label="Revenue delivered" value={formatEther(totalReceived)} unit="ETH" />
        <Kpi label="My profit rate" value={Number(myRate)} unit="%" hint="Per contract" />
      </div>

      <div className="grid-2">
        <Card>
          <CardHead title="Propose a project" sub="Real-asset financing" />
          <div className="card-body stack">
            <Field label="Project description">
              <Input style={{ width: '100%' }} type="text"
                placeholder="e.g. Solar microgrid — Tashkent suburb"
                value={desc} onChange={e => setDesc(e.target.value)} disabled={busy} />
            </Field>
            <div className="field-row">
              <Field label="Funds required (ETH)">
                <Input type="number" placeholder="0.0"
                  value={funds} onChange={e => setFunds(e.target.value)} disabled={busy} />
              </Field>
              <Button variant="primary" onClick={doSubmit} disabled={busy || !desc || !funds}>
                Submit proposal
              </Button>
            </div>
          </div>
        </Card>

        <Card>
          <CardHead title="Deliver revenue" sub="From a secured project" />
          <div className="card-body stack">
            <Field label="Proposal">
              <Select style={{ width: '100%' }} value={selectedProposal}
                onChange={e => setSelectedProposal(e.target.value)}
                disabled={!mySecured.length || busy}>
                <option value="" disabled>
                  {mySecured.length ? 'Select secured proposal' : 'No secured proposals yet'}
                </option>
                {mySecured.map(p => (
                  <option key={p._id} value={p._id}>#{p._id} — {p.description}</option>
                ))}
              </Select>
            </Field>
            <div className="field-row">
              <Field label="Revenue (ETH)">
                <Input type="number" placeholder="0.0"
                  value={payment} onChange={e => setPayment(e.target.value)} disabled={busy} />
              </Field>
              <Button variant="primary" onClick={doReceive}
                disabled={busy || !payment || selectedProposal === ''}>
                Receive payment
              </Button>
            </div>
          </div>
        </Card>
      </div>

      {hasEconomyV2 && (
        <Card style={{ marginTop: 16 }}>
          <CardHead title="Return principal"
            sub="Capital goes home fee-free — profit is only recognised after it" />
          <div className="card-body stack">
            <Field label="Proposal">
              <Select style={{ width: '100%' }} value={principalProposal}
                onChange={e => setPrincipalProposal(e.target.value)}
                disabled={!myOwing.length || busy}>
                <option value="" disabled>
                  {myOwing.length ? 'Select project with capital outstanding' : 'No capital outstanding'}
                </option>
                {myOwing.map(p => (
                  <option key={p._id} value={p._id}>
                    #{p._id} — {p.description} · {formatEther(p.requiredFunds - (p.principalReturned ?? 0n))} ETH outstanding
                  </option>
                ))}
              </Select>
            </Field>
            <div className="field-row">
              <Field label="Amount (ETH)">
                <Input type="number" placeholder="0.0"
                  value={principal} onChange={e => setPrincipal(e.target.value)} disabled={busy} />
              </Field>
              <Button variant="primary" onClick={doReturnPrincipal}
                disabled={busy || !principal || principalProposal === ''}>
                Return principal
              </Button>
            </div>
          </div>
        </Card>
      )}

      <SectionRule title="My projects" />
      {mine.length === 0
        ? <Card><Empty>You haven't submitted any proposals yet.</Empty></Card>
        : (
          <div className="stack">
            {mine.map(p => <ProposalCard key={p._id} p={p} id={p._id} />)}
          </div>
        )
      }
      <TxStatus msg={tx.msg} tone={tx.tone} />
    </>
  );
}

function PartnerDesk() {
  const { identity, investors, totalFunds, freeFunds, depositFunds, exitFunds,
          hasEconomyV2, withdrawable, pending, proposals, tx, busy } = useStore();
  const me = investors.find(i => i.addr.toLowerCase() === identity.addr.toLowerCase());
  const myFunds = me?.fundsInvested ?? 0n;
  const exitMax = myFunds < freeFunds ? myFunds : freeFunds;
  const sharePct = totalFunds > 0n
    ? Number((myFunds * 1000n) / totalFunds) / 10
    : 0;
  const myVotedCount = proposals.filter(p =>
    (p.approvers || []).some(a => a.toLowerCase() === identity.addr.toLowerCase())).length;

  const [amount, setAmount] = useState('');
  const [exitAmount, setExitAmount] = useState('');
  const doDeposit = async () => {
    await depositFunds(parseEther(amount));
    setAmount('');
  };
  const doExit = async () => {
    await exitFunds(parseEther(exitAmount));
    setExitAmount('');
  };

  const pendingProps = proposals
    .map((p, i) => ({ ...p, _id: i }))
    .filter(isOpenProposal);

  return (
    <>
      <PageHead
        crumb="Workspace"
        title="Partner desk"
        lede={`Welcome, ${identity.who}. Your capital shares in the pool's profits and losses, in proportion to your stake.`}
        actions={<WithdrawPill />}
      />
      <div className="kpis">
        <Kpi label="My capital"      value={formatEther(myFunds)} unit="ETH" />
        <Kpi label="My share"        value={sharePct.toFixed(1)}  unit="%" hint="of total funds" />
        <Kpi label="Withdrawable"    value={formatEther(withdrawable)} unit="ETH" hint={pending > 0n ? `+${formatEther(pending)} pending` : ''} />
        <Kpi label="Votes cast"      value={myVotedCount} hint="On open proposals" />
      </div>

      <div className="grid-2">
        <Card>
          <CardHead title="Deposit into the fund" sub="Musharaka contribution" />
          <div className="card-body stack">
            <Field label="Amount (ETH)">
              <Input type="number" placeholder="0.0"
                value={amount} onChange={e => setAmount(e.target.value)} disabled={busy} />
            </Field>
            <div>
              <Button variant="primary" onClick={doDeposit} disabled={busy || !amount}>
                Deposit
              </Button>
            </div>
            <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>
              Profit and loss are shared in proportion to your share of total funds.
              Every funded project must pass the approval threshold.
            </div>
            {hasEconomyV2 && (
              <>
                <Field label={`Exit (ETH) — up to ${formatEther(exitMax)} liquid`}>
                  <Input type="number" placeholder="0.0"
                    value={exitAmount} onChange={e => setExitAmount(e.target.value)} disabled={busy} />
                </Field>
                <div>
                  <Button onClick={doExit} disabled={busy || !exitAmount || exitMax === 0n}>
                    Exit stake
                  </Button>
                </div>
                <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>
                  Exits draw on free funds only — capital deployed in live projects
                  stays until returned or written off.
                </div>
              </>
            )}
          </div>
        </Card>

        <Card>
          <CardHead title="My position" sub="Share of the partnership" />
          <div className="card-body">
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
              <Avatar name={identity.who} size={44} />
              <div>
                <div className="serif" style={{ fontSize: 22, fontWeight: 500 }}>{identity.who}</div>
                <div className="mono" style={{ fontSize: 11, color: 'var(--ink-3)' }}>{shortAddr(identity.addr)}</div>
              </div>
            </div>
            <div className="progress-row" style={{ marginBottom: 8 }}>
              <Progress value={sharePct} />
              <span className="num" style={{ fontSize: 12, color: 'var(--ink-2)', minWidth: 50, textAlign: 'right' }}>
                {sharePct.toFixed(1)}%
              </span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>
              Your weight on every proposal vote.
            </div>
          </div>
        </Card>
      </div>

      <SectionRule title="Proposals awaiting your vote" />
      {pendingProps.length === 0
        ? <Card><Empty>No open proposals — every project has been secured.</Empty></Card>
        : (
          <div className="stack">
            {pendingProps.map(p => <ProposalCard key={p._id} p={p} id={p._id} />)}
          </div>
        )
      }
      <TxStatus msg={tx.msg} tone={tx.tone} />
    </>
  );
}

function GuestDesk() {
  const { connect } = useStore();
  const net = networkFor(deploymentJson);
  return (
    <>
      <PageHead
        crumb="Workspace"
        title="Guest view"
        lede="Connect a wallet to participate. You can still browse proposals, treasury, and members from the sidebar."
      />
      <Card className="card-pad">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <div className="serif" style={{ fontSize: 20, fontWeight: 500, marginBottom: 4 }}>
              Connect MetaMask
            </div>
            <div style={{ fontSize: 13, color: 'var(--ink-2)' }}>
              On {net.name}. Once connected, your role is derived from the contract.
            </div>
          </div>
          <Button variant="primary" onClick={connect}>Connect wallet</Button>
        </div>
      </Card>
    </>
  );
}

export default function Desk() {
  const { identity } = useStore();
  if (identity.role === ROLES.OWNER)    return <CouncilDesk />;
  if (identity.role === ROLES.MANAGER)  return <OperatorDesk />;
  if (identity.role === ROLES.INVESTOR) return <PartnerDesk />;
  return <GuestDesk />;
}
