import { Badge, Card, CardHead, Empty, formatEtherExact, shortAddr } from '../ui';
import { useStore } from '../state';
import { PageHead, WithdrawPill } from './PageHead';
import deploymentJson from '../abi/deployment.json';
import { networkFor } from '../networks';

const EVENT_META = {
  InvestorAdded:      { tone: 'pink', label: 'Partner onboarded' },
  ManagerAdded:       { tone: 'blue', label: 'Operator onboarded' },
  FundsDeposited:     { tone: 'pink', label: 'Deposit' },
  ProposalSubmitted:  { tone: 'warn', label: 'Proposal submitted' },
  ProposalFunded:     { tone: 'ok',   label: 'Proposal secured' },
  RevenueReceived:    { tone: 'blue', label: 'Revenue received' },
  RevenueDistributed: { tone: 'ok',   label: 'Revenue distributed' },
  Withdrawn:          { tone: '',     label: 'Withdrawn' },
};

function fmtTs(unix) {
  if (!unix) return '—';
  const d = new Date(unix * 1000);
  return d.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
}

function describe(ev, getNickname) {
  const a = ev.args || [];
  switch (ev.name) {
    case 'InvestorAdded':
      return (<>
        <strong>{a[1]}</strong> ({shortAddr(a[0])}) added as partner · rate <span className="num">{a[2].toString()}%</span>
      </>);
    case 'ManagerAdded':
      return (<>
        <strong>{a[1]}</strong> ({shortAddr(a[0])}) added as operator · rate <span className="num">{a[2].toString()}%</span>
      </>);
    case 'FundsDeposited':
      return (<>
        <strong>{getNickname(a[0]) || shortAddr(a[0])}</strong> deposited <span className="num">{formatEtherExact(a[1])} ETH</span>
      </>);
    case 'ProposalSubmitted':
      return (<>
        Proposal <strong>#{a[0].toString()}</strong> "{a[2]}" by <strong>{getNickname(a[1]) || shortAddr(a[1])}</strong> · requires <span className="num">{formatEtherExact(a[3])} ETH</span>
      </>);
    case 'ProposalFunded':
      return (<>
        Proposal <strong>#{a[0].toString()}</strong> secured for <strong>{getNickname(a[1]) || shortAddr(a[1])}</strong> · <span className="num">{formatEtherExact(a[2])} ETH</span> earmarked
      </>);
    case 'RevenueReceived':
      return (<>
        <strong>{getNickname(a[1]) || shortAddr(a[1])}</strong> delivered <span className="num">{formatEtherExact(a[2])} ETH</span> revenue on proposal <strong>#{a[0].toString()}</strong>
      </>);
    case 'RevenueDistributed':
      return (<>
        Council distributed <span className="num">{formatEtherExact(a[1])} ETH</span> from proposal <strong>#{a[0].toString()}</strong>
      </>);
    case 'Withdrawn':
      return (<>
        <strong>{getNickname(a[0]) || shortAddr(a[0])}</strong> withdrew <span className="num">{formatEtherExact(a[1])} ETH</span>
      </>);
    default:
      return ev.name;
  }
}

export default function ActivityScreen() {
  const { events, eventsLoading, getNickname } = useStore();
  const net = networkFor(deploymentJson);

  return (
    <>
      <PageHead
        crumb={`Activity · ${net.name}`}
        title="Activity"
        lede="Every on-chain event the contract has emitted, newest first. Click a row's hash to inspect on the block explorer."
        actions={<WithdrawPill />}
      />

      <Card>
        <CardHead
          title="Event log"
          sub={eventsLoading ? 'Loading…' : `${events.length} event${events.length === 1 ? '' : 's'}`}
        />
        {events.length === 0 && !eventsLoading
          ? <div className="card-body"><Empty>No events yet.</Empty></div>
          : (
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 170 }}>Timestamp</th>
                  <th style={{ width: 170 }}>Event</th>
                  <th>Detail</th>
                  <th style={{ width: 90, textAlign: 'right' }}>Block</th>
                  <th style={{ width: 130, textAlign: 'right' }}>Tx</th>
                </tr>
              </thead>
              <tbody>
                {events.map((ev) => {
                  const meta = EVENT_META[ev.name] || { tone: '', label: ev.name };
                  return (
                    <tr key={`${ev.txHash}-${ev.logIndex}`}>
                      <td className="mono" style={{ fontSize: 12, color: 'var(--ink-3)' }}>{fmtTs(ev.timestamp)}</td>
                      <td><Badge tone={meta.tone}>{meta.label}</Badge></td>
                      <td>{describe(ev, getNickname)}</td>
                      <td className="num right" style={{ color: 'var(--ink-3)' }}>{ev.blockNumber}</td>
                      <td className="right">
                        {net.explorer
                          ? <a className="mono" style={{ fontSize: 12 }}
                               href={`${net.explorer}/tx/${ev.txHash}`}
                               target="_blank" rel="noopener noreferrer">
                              {ev.txHash.slice(0, 6)}…{ev.txHash.slice(-4)}
                            </a>
                          : <span className="mono" style={{ fontSize: 12 }}>{ev.txHash.slice(0, 10)}…</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )
        }
      </Card>
    </>
  );
}
