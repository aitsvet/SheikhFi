import { Badge, Button, Card, CardHead, Empty, Kpi, Progress, formatEther } from '../ui';
import { SCREENS, useStore } from '../state';
import { PageHead, WithdrawPill } from './PageHead';
import { getActiveDeployment } from '../deployments';
const deploymentJson = getActiveDeployment();
import { networkFor } from '../networks';

function OverviewKpis() {
  const { totalFunds, freeFunds, totalRevenue, approveShareThreshold, proposals } = useStore();
  const secured = proposals.filter(p => p.secured).length;
  return (
    <div className="kpis">
      <Kpi label="Total funds"  value={formatEther(totalFunds)}  unit="ETH"
        hint="Musharaka — pooled by partners" />
      <Kpi label="Free funds"   value={formatEther(freeFunds)}   unit="ETH"
        hint="Unallocated, ready to deploy" />
      <Kpi label="Revenue"      value={formatEther(totalRevenue)} unit="ETH"
        hint="Delivered by operators" />
      <Kpi label="Threshold"    value={Number(approveShareThreshold).toFixed(0)} unit="%"
        hint={`${secured} of ${proposals.length} secured`} />
    </div>
  );
}

export default function OverviewScreen() {
  const { proposals, investors, managers, getNickname,
          approvalShareFor, approveShareThreshold, setScreen } = useStore();
  const net = networkFor(deploymentJson);

  const top = [...proposals]
    .map((p, i) => ({ ...p, _id: i, share: approvalShareFor(p) }))
    .sort((a, b) => {
      if (a.secured !== b.secured) return a.secured ? 1 : -1;
      return b.share - a.share;
    })
    .slice(0, 3);

  return (
    <>
      <PageHead
        crumb="Workspace"
        title="Overview"
        lede={`Pooled-capital partnership running on ${net.name}. Every funded project is backed by a real asset and approved by the partners.`}
        actions={<WithdrawPill />}
      />

      <OverviewKpis />

      <div className="grid-2">
        <Card>
          <CardHead
            title="Top proposals"
            sub="Closest to threshold"
            actions={
              <Button size="sm" variant="ghost" onClick={() => setScreen(SCREENS.PROPOSALS)}>
                View all →
              </Button>
            }
          />
          <div className="card-body stack">
            {top.length === 0 && <Empty>No proposals yet.</Empty>}
            {top.map(p => (
              <div className="proposal" key={p._id}>
                <div>
                  <h4>{p.description}</h4>
                  <div className="meta">
                    <span><strong>#{p._id}</strong></span>
                    <span>by <strong>{getNickname(p.manager)}</strong></span>
                    {p.secured
                      ? <Badge tone="ok">Secured</Badge>
                      : <Badge tone="warn">Pending</Badge>}
                  </div>
                  <div className="progress-row">
                    <Progress value={p.share} threshold={approveShareThreshold} />
                    <span className="num" style={{ fontSize: 12, color: 'var(--ink-2)' }}>
                      {p.share.toFixed(1)}%
                    </span>
                  </div>
                </div>
                <div className="pside">
                  <div className="amount">
                    {formatEther(p.requiredFunds)}<span className="unit"> ETH</span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>required</div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <CardHead title="Partnership" sub="Musharaka · Mudaraba" />
          <div className="card-body">
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>Partners (Musharaka)</div>
                <div className="serif" style={{ fontSize: 28, fontWeight: 500 }}>{investors.length}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>Operators (Mudaraba)</div>
                <div className="serif" style={{ fontSize: 28, fontWeight: 500 }}>{managers.length}</div>
              </div>
            </div>
            <hr style={{ border: 'none', borderTop: '1px solid var(--rule)', margin: '14px 0' }} />
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', fontSize: 13, color: 'var(--ink-2)' }}>
              <li style={{ padding: '6px 0', borderBottom: '1px solid var(--rule-2)' }}>
                <strong>No riba.</strong> No fixed interest — returns track real revenue.
              </li>
              <li style={{ padding: '6px 0', borderBottom: '1px solid var(--rule-2)' }}>
                <strong>No gharar.</strong> Every proposal carries a description and approval trail.
              </li>
              <li style={{ padding: '6px 0' }}>
                <strong>No maysir.</strong> Profits come from real economic activity, not speculation.
              </li>
            </ul>
          </div>
        </Card>
      </div>
    </>
  );
}
