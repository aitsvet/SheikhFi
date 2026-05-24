import { Avatar, Badge, Card, CardHead, Empty, formatEther, shortAddr } from '../ui';
import { useStore } from '../state';
import { PageHead, WithdrawPill } from './PageHead';

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
    </>
  );
}
