// Role-aware desk — each identity's primary workspace.
// Council (owner)  → admin actions: onboard members, distribute (link to treasury)
// Operator (manager) → submit proposal, deliver revenue, see "my projects"
// Partner (investor) → deposit, see "my position"
// Guest → empty state with a Connect call-to-action

const { useState: useStateDesk } = React;

// --------- Council ------------------------------------------------------

function CouncilDesk() {
  const { addInvestor, addManager, investors, managers } = useStore();
  const [invAddr, setInvAddr] = useStateDesk('');
  const [invNick, setInvNick] = useStateDesk('');
  const [invRate, setInvRate] = useStateDesk('');
  const [mgrAddr, setMgrAddr] = useStateDesk('');
  const [mgrNick, setMgrNick] = useStateDesk('');
  const [mgrRate, setMgrRate] = useStateDesk('');
  const [tx, setTx] = useStateDesk({ msg: '', tone: '' });

  const doAddInvestor = () => {
    addInvestor(invAddr, invNick, invRate);
    setTx({ msg: `Partner ${invNick} added.`, tone: 'ok' });
    setInvAddr(''); setInvNick(''); setInvRate('');
  };
  const doAddManager = () => {
    addManager(mgrAddr, mgrNick, mgrRate);
    setTx({ msg: `Operator ${mgrNick} added.`, tone: 'ok' });
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
        <Kpi label="Default partner rate"  value={investors[0]?.profitRate ?? 35} unit="%" />
        <Kpi label="Default operator rate" value={managers[0]?.profitRate  ?? 50} unit="%" />
      </div>

      <div className="grid-2">
        <Card>
          <CardHead title="Onboard partner" sub="Musharaka — capital provider" />
          <div className="card-body stack">
            <Field label="Address">
              <Input style={{ width: '100%' }} type="text" placeholder="0x…"
                value={invAddr} onChange={e => setInvAddr(e.target.value)} />
            </Field>
            <div className="field-row">
              <Field label="Nickname">
                <Input style={{ width: 200 }} type="text"
                  value={invNick} onChange={e => setInvNick(e.target.value)} />
              </Field>
              <Field label="Profit rate %">
                <Input style={{ width: 120 }} type="number"
                  value={invRate} onChange={e => setInvRate(e.target.value)} />
              </Field>
              <Button variant="primary" onClick={doAddInvestor}
                disabled={!invAddr || !invNick || !invRate}>
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
                value={mgrAddr} onChange={e => setMgrAddr(e.target.value)} />
            </Field>
            <div className="field-row">
              <Field label="Nickname">
                <Input style={{ width: 200 }} type="text"
                  value={mgrNick} onChange={e => setMgrNick(e.target.value)} />
              </Field>
              <Field label="Profit rate %">
                <Input style={{ width: 120 }} type="number"
                  value={mgrRate} onChange={e => setMgrRate(e.target.value)} />
              </Field>
              <Button variant="primary" onClick={doAddManager}
                disabled={!mgrAddr || !mgrNick || !mgrRate}>
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

// --------- Operator -----------------------------------------------------

function OperatorDesk() {
  const { identity, proposals, submitProposal, receiveRevenue, getNickname } = useStore();
  const [desc, setDesc] = useStateDesk('');
  const [funds, setFunds] = useStateDesk('');
  const [payment, setPayment] = useStateDesk('');
  const [selectedProposal, setSelectedProposal] = useStateDesk('');
  const [tx, setTx] = useStateDesk({ msg: '', tone: '' });

  const mine = proposals
    .map((p, i) => ({ ...p, _id: i }))
    .filter(p => p.manager.toLowerCase() === identity.addr.toLowerCase());
  const mySecured = mine.filter(p => p.secured);

  const totalRequired = mine.reduce((s, p) => s + p.requiredFunds, 0n);
  const totalReceived = mine.reduce((s, p) => s + p.revenueReceived, 0n);

  const doSubmit = () => {
    submitProposal(identity.addr, desc, parseEther(funds));
    setTx({ msg: 'Proposal submitted — awaiting partner approvals.', tone: 'ok' });
    setDesc(''); setFunds('');
  };
  const doReceive = () => {
    receiveRevenue(Number(selectedProposal), parseEther(payment));
    setTx({ msg: 'Revenue delivered to contract.', tone: 'ok' });
    setPayment(''); setSelectedProposal('');
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
        <Kpi label="My profit rate" value={50} unit="%" hint="Per contract" />
      </div>

      <div className="grid-2">
        <Card>
          <CardHead title="Propose a project" sub="Real-asset financing" />
          <div className="card-body stack">
            <Field label="Project description">
              <Input style={{ width: '100%' }} type="text"
                placeholder="e.g. Solar microgrid — Tashkent suburb"
                value={desc} onChange={e => setDesc(e.target.value)} />
            </Field>
            <div className="field-row">
              <Field label="Funds required (ETH)">
                <Input type="number" placeholder="0.0"
                  value={funds} onChange={e => setFunds(e.target.value)} />
              </Field>
              <Button variant="primary" onClick={doSubmit} disabled={!desc || !funds}>
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
                disabled={!mySecured.length}>
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
                  value={payment} onChange={e => setPayment(e.target.value)} />
              </Field>
              <Button variant="primary" onClick={doReceive}
                disabled={!payment || selectedProposal === ''}>
                Receive payment
              </Button>
            </div>
          </div>
        </Card>
      </div>

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

// --------- Partner ------------------------------------------------------

function PartnerDesk() {
  const { identity, investors, totalFunds, depositFunds, withdrawable, pending,
          proposals, approveProposal, approvalShareFor, approveShareThreshold } = useStore();
  const me = investors.find(i => i.addr.toLowerCase() === identity.addr.toLowerCase());
  const myFunds = me?.fundsInvested ?? 0n;
  const sharePct = totalFunds > 0n
    ? Number((myFunds * 1000n) / totalFunds) / 10
    : 0;
  const myVotedCount = proposals.filter(p =>
    p.approvers.some(a => a.toLowerCase() === identity.addr.toLowerCase())).length;

  const [amount, setAmount] = useStateDesk('');
  const [tx, setTx] = useStateDesk({ msg: '', tone: '' });
  const doDeposit = () => {
    depositFunds(identity.addr, parseEther(amount));
    setTx({ msg: `Deposited ${amount} ETH into the fund.`, tone: 'ok' });
    setAmount('');
  };

  const pendingProps = proposals
    .map((p, i) => ({ ...p, _id: i }))
    .filter(p => !p.secured);

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
                value={amount} onChange={e => setAmount(e.target.value)} />
            </Field>
            <div>
              <Button variant="primary" onClick={doDeposit} disabled={!amount}>
                Deposit
              </Button>
            </div>
            <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>
              Profit and loss are shared in proportion to your share of total funds.
              Every funded project must pass the approval threshold.
            </div>
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

// --------- Guest --------------------------------------------------------

function GuestDesk() {
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
              On Polygon Amoy. Once connected, your role is derived from the contract.
            </div>
          </div>
          <Button variant="primary">Connect wallet</Button>
        </div>
      </Card>
    </>
  );
}

// --------- Dispatcher ---------------------------------------------------

function Desk() {
  const { identity } = useStore();
  if (identity.role === ROLES.OWNER)    return <CouncilDesk />;
  if (identity.role === ROLES.MANAGER)  return <OperatorDesk />;
  if (identity.role === ROLES.INVESTOR) return <PartnerDesk />;
  return <GuestDesk />;
}

Object.assign(window, { Desk, CouncilDesk, OperatorDesk, PartnerDesk, GuestDesk });
