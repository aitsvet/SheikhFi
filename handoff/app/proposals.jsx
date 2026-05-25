// Proposals screen — filterable list of proposal cards.
// Replaces the giant table from v1 with focused, dense cards.

const { useState: useStateProp, useMemo: useMemoProp } = React;

function ProposalCard({ p, id }) {
  const { getNickname, approvalShareFor, approveShareThreshold,
          identity, approveProposal } = useStore();
  const share = approvalShareFor(p);
  const voted = identity.addr
    && p.approvers.some(a => a.toLowerCase() === identity.addr.toLowerCase());
  const canVote = identity.role === ROLES.OWNER || identity.role === ROLES.INVESTOR;
  const settled = p.secured && p.revenuePaid >= p.revenueReceived && p.revenueReceived > 0n;

  return (
    <div className="proposal">
      <div>
        <h4>{p.description}</h4>
        <div className="meta">
          <span><strong>#{id}</strong></span>
          <span>by <strong>{getNickname(p.manager)}</strong></span>
          {settled       ? <Badge tone="ok">Settled</Badge>
           : p.secured   ? <Badge tone="ok">Secured</Badge>
                         : <Badge tone="warn">Pending</Badge>}
          {voted && !p.secured && <Badge tone="blue">You voted</Badge>}
        </div>
        <div className="progress-row">
          <Progress value={share} threshold={approveShareThreshold} />
          <span className="num" style={{ fontSize: 12, color: 'var(--ink-2)', minWidth: 50, textAlign: 'right' }}>
            {share.toFixed(1)}%
          </span>
        </div>
        <div className="meta" style={{ marginTop: 8 }}>
          <span>Approvers: <strong>{p.approvers.length}</strong></span>
          {p.revenueReceived > 0n && (
            <span>Revenue: <strong className="num">{formatEther(p.revenueReceived)} ETH</strong> received,
              {' '}<strong className="num">{formatEther(p.revenuePaid)} ETH</strong> paid</span>
          )}
        </div>
      </div>
      <div className="pside">
        <div className="amount">
          {formatEther(p.requiredFunds)}<span className="unit"> ETH</span>
        </div>
        <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>required</div>
        {canVote && !p.secured && !voted && (
          <Button variant="primary" size="sm"
            onClick={() => approveProposal(id, identity.addr)}>
            Approve
          </Button>
        )}
      </div>
    </div>
  );
}

function ProposalsScreen() {
  const { proposals, approvalShareFor } = useStore();
  const [filter, setFilter] = useStateProp('all'); // all | pending | secured | settled

  const tagged = useMemoProp(
    () => proposals.map((p, i) => ({ p, i, share: approvalShareFor(p) })),
    [proposals, approvalShareFor]
  );

  const filtered = tagged.filter(({ p }) => {
    if (filter === 'pending')  return !p.secured;
    if (filter === 'secured')  return p.secured && p.revenuePaid < p.revenueReceived || (p.secured && p.revenueReceived === 0n);
    if (filter === 'settled')  return p.secured && p.revenueReceived > 0n && p.revenuePaid >= p.revenueReceived;
    return true;
  });

  const counts = {
    all:      tagged.length,
    pending:  tagged.filter(({ p }) => !p.secured).length,
    secured:  tagged.filter(({ p }) => p.secured && (p.revenueReceived === 0n || p.revenuePaid < p.revenueReceived)).length,
    settled:  tagged.filter(({ p }) => p.secured && p.revenueReceived > 0n && p.revenuePaid >= p.revenueReceived).length,
  };

  const Tab = ({ id, label }) => (
    <button
      className="btn btn-sm"
      onClick={() => setFilter(id)}
      style={filter === id ? {
        background: 'var(--ink)', color: '#fff', borderColor: 'var(--ink)',
      } : {}}
    >
      {label} <span style={{ opacity: 0.6, marginLeft: 4 }}>{counts[id]}</span>
    </button>
  );

  return (
    <>
      <PageHead
        crumb="Activity"
        title="Proposals"
        lede="Every funded project is a real-asset operation. Partners approve; the threshold gates the spend."
        actions={<WithdrawPill />}
      />
      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        <Tab id="all"     label="All" />
        <Tab id="pending" label="Pending" />
        <Tab id="secured" label="Secured" />
        <Tab id="settled" label="Settled" />
      </div>

      {filtered.length === 0
        ? <Card><Empty>No proposals match this filter.</Empty></Card>
        : (
          <div className="stack">
            {filtered.map(({ p, i }) => <ProposalCard key={i} p={p} id={i} />)}
          </div>
        )
      }
    </>
  );
}

Object.assign(window, { ProposalsScreen, ProposalCard });
