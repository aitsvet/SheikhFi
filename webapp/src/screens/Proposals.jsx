import { useMemo, useState } from 'react';
import { Badge, Button, Card, Empty, Progress, formatEther } from '../ui';
import { ROLES, isOpenProposal, useStore } from '../state';
import { PageHead, WithdrawPill } from './PageHead';

export function ProposalCard({ p, id }) {
  const { getNickname, approvalShareFor, approveShareThreshold,
          identity, approveProposal, cancelProposal,
          certifyProposal, releaseTranche, isBoard, busy } = useStore();
  const share = approvalShareFor(p);
  const voted = identity.addr
    && (p.approvers || []).some(a => a.toLowerCase() === identity.addr.toLowerCase());
  const canVote = identity.role === ROLES.OWNER || identity.role === ROLES.INVESTOR;
  const settled = p.secured && p.revenuePaid >= p.revenueReceived && p.revenueReceived > 0n;
  // v2/v3 lifecycle fields — undefined on the older deployed ABIs
  const cancelled = p.cancelled === true;
  const uncertified = p.certified === false && !cancelled && !p.secured;
  const expired = !p.secured && !cancelled && p.deadline !== undefined
    && Number(p.deadline) * 1000 < Date.now();
  const open = !p.secured && !cancelled && !expired && !uncertified;
  const canCancel = !p.secured && !cancelled
    && (identity.role === ROLES.OWNER
        || p.manager.toLowerCase() === identity.addr.toLowerCase());
  const tranched = p.tranches !== undefined && Number(p.tranches) > 1;
  const canRelease = isBoard && p.secured && p.writtenOff !== true
    && tranched && Number(p.tranchesReleased) < Number(p.tranches);

  return (
    <div className="proposal">
      <div>
        <h4>{p.description}</h4>
        <div className="meta">
          <span><strong>#{id}</strong></span>
          <span>by <strong>{getNickname(p.manager)}</strong></span>
          {cancelled              ? <Badge>Cancelled</Badge>
           : p.writtenOff === true ? <Badge>Written off</Badge>
           : settled              ? <Badge tone="ok">Settled</Badge>
           : p.secured            ? <Badge tone="ok">Secured</Badge>
           : uncertified          ? <Badge>Awaiting certification</Badge>
           : expired              ? <Badge tone="warn">Expired</Badge>
                                  : <Badge tone="warn">Pending</Badge>}
          {voted && !p.secured && <Badge tone="blue">You voted</Badge>}
          {tranched && (
            <span>tranche <strong className="num">
              {Number(p.tranchesReleased)}/{Number(p.tranches)}
            </strong></span>
          )}
          {p.docsHash ? (
            <a className="mono" style={{ fontSize: 11 }}
               href={`https://ipfs.io/ipfs/${p.docsHash}`}
               target="_blank" rel="noopener noreferrer">docs</a>
          ) : null}
        </div>
        <div className="progress-row">
          <Progress value={share} threshold={approveShareThreshold} />
          <span className="num" style={{ fontSize: 12, color: 'var(--ink-2)', minWidth: 50, textAlign: 'right' }}>
            {share.toFixed(1)}%
          </span>
        </div>
        <div className="meta" style={{ marginTop: 8 }}>
          <span>Approvers: <strong>{(p.approvers || []).length}</strong></span>
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
        {canVote && open && !voted && (
          <Button variant="primary" size="sm"
            disabled={busy}
            onClick={() => approveProposal(id)}>
            Approve
          </Button>
        )}
        {canCancel && (
          <Button size="sm"
            disabled={busy}
            onClick={() => cancelProposal(id)}>
            Cancel
          </Button>
        )}
        {isBoard && uncertified && (
          <Button variant="primary" size="sm"
            disabled={busy}
            onClick={() => certifyProposal(id)}>
            Certify
          </Button>
        )}
        {canRelease && (
          <Button size="sm"
            disabled={busy}
            onClick={() => releaseTranche(id)}>
            Release tranche
          </Button>
        )}
      </div>
    </div>
  );
}

export default function ProposalsScreen() {
  const { proposals, approvalShareFor } = useStore();
  const [filter, setFilter] = useState('all');

  const tagged = useMemo(
    () => proposals.map((p, i) => ({ p, i, share: approvalShareFor(p) })),
    [proposals, approvalShareFor]
  );

  const filtered = tagged.filter(({ p }) => {
    if (filter === 'pending')  return isOpenProposal(p);
    if (filter === 'secured')  return (p.secured && p.revenuePaid < p.revenueReceived) || (p.secured && p.revenueReceived === 0n);
    if (filter === 'settled')  return p.secured && p.revenueReceived > 0n && p.revenuePaid >= p.revenueReceived;
    return true;
  });

  const counts = {
    all:      tagged.length,
    pending:  tagged.filter(({ p }) => isOpenProposal(p)).length,
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
