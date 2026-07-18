import { Badge, Card, CardHead, Empty, formatEtherExact, shortAddr } from '../ui';
import { useStore } from '../state';
import { PageHead, WithdrawPill } from './PageHead';
import { activeNetwork } from '../deployments';

const EVENT_META = {
  InvestorAdded:      { tone: 'pink', label: 'Partner onboarded' },
  ManagerAdded:       { tone: 'blue', label: 'Operator onboarded' },
  FundsDeposited:     { tone: 'pink', label: 'Deposit' },
  ProposalSubmitted:  { tone: 'warn', label: 'Proposal submitted' },
  ProposalCertified:  { tone: 'ok',   label: 'Board certified' },
  ProposalApproved:   { tone: 'blue', label: 'Vote cast' },
  TrancheReleased:    { tone: 'blue', label: 'Tranche released' },
  BoardChanged:       { tone: 'warn', label: 'Board changed' },
  CollateralPosted:   { tone: 'blue', label: 'Collateral posted' },
  CollateralWithdrawn:{ tone: '',     label: 'Collateral withdrawn' },
  CollateralSlashed:  { tone: 'warn', label: 'Collateral slashed' },
  ProposalFunded:     { tone: 'ok',   label: 'Proposal secured' },
  ProposalCancelled:  { tone: '',     label: 'Proposal cancelled' },
  ThresholdChanged:   { tone: 'warn', label: 'Threshold changed' },
  VotingPeriodChanged:{ tone: 'warn', label: 'Voting period changed' },
  ExitNoticed:        { tone: 'warn', label: 'Exit notice given' },
  NoticePeriodChanged:{ tone: 'warn', label: 'Notice period changed' },
  RevenueReceived:    { tone: 'blue', label: 'Revenue received' },
  PrincipalReturned:  { tone: 'ok',   label: 'Principal returned' },
  ProposalWrittenOff: { tone: 'warn', label: 'Written off' },
  RevenueDistributed: { tone: 'ok',   label: 'Revenue distributed' },
  Exited:             { tone: 'pink', label: 'Partner exit' },
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
    case 'ProposalApproved':
      return (<>
        <strong>{getNickname(a[1]) || shortAddr(a[1])}</strong> approved proposal <strong>#{a[0].toString()}</strong> · <span className="num">{formatEtherExact(a[2])} ETH</span> of weight behind it
      </>);
    case 'ProposalFunded':
      return (<>
        Proposal <strong>#{a[0].toString()}</strong> secured for <strong>{getNickname(a[1]) || shortAddr(a[1])}</strong> · <span className="num">{formatEtherExact(a[2])} ETH</span> earmarked
      </>);
    case 'ProposalCancelled':
      return (<>Proposal <strong>#{a[0].toString()}</strong> cancelled</>);
    case 'ProposalCertified':
      return (<>Board certified proposal <strong>#{a[0].toString()}</strong></>);
    case 'TrancheReleased':
      return (<>
        Tranche <strong>#{a[1].toString()}</strong> of proposal <strong>#{a[0].toString()}</strong> released · <span className="num">{formatEtherExact(a[2])} ETH</span>
      </>);
    case 'BoardChanged':
      return (<>Sharia board handed to <strong>{getNickname(a[0]) || shortAddr(a[0])}</strong></>);
    case 'CollateralPosted':
      return (<>
        <strong>{getNickname(a[0]) || shortAddr(a[0])}</strong> posted <span className="num">{formatEtherExact(a[1])} ETH</span> collateral
      </>);
    case 'CollateralWithdrawn':
      return (<>
        <strong>{getNickname(a[0]) || shortAddr(a[0])}</strong> withdrew <span className="num">{formatEtherExact(a[1])} ETH</span> collateral
      </>);
    case 'CollateralSlashed':
      return (<>
        <strong>{getNickname(a[0]) || shortAddr(a[0])}</strong> slashed <span className="num">{formatEtherExact(a[2])} ETH</span> on proposal <strong>#{a[1].toString()}</strong> · "{a[3]}"
      </>);
    case 'ThresholdChanged':
      return (<>Approval threshold set to <span className="num">{a[0].toString()}%</span></>);
    case 'VotingPeriodChanged':
      return (<>Voting period set to <span className="num">{(Number(a[0]) / 86400).toFixed(0)} days</span></>);
    case 'RevenueReceived':
      return (<>
        <strong>{getNickname(a[1]) || shortAddr(a[1])}</strong> delivered <span className="num">{formatEtherExact(a[2])} ETH</span> revenue on proposal <strong>#{a[0].toString()}</strong>
      </>);
    case 'PrincipalReturned':
      return (<>
        <strong>{getNickname(a[1]) || shortAddr(a[1])}</strong> returned <span className="num">{formatEtherExact(a[2])} ETH</span> of principal on proposal <strong>#{a[0].toString()}</strong>
      </>);
    case 'ProposalWrittenOff':
      return (<>
        Proposal <strong>#{a[0].toString()}</strong> written off · <span className="num">{formatEtherExact(a[1])} ETH</span> loss shared pro-rata
      </>);
    case 'Exited':
      return (<>
        <strong>{getNickname(a[0]) || shortAddr(a[0])}</strong> exited <span className="num">{formatEtherExact(a[1])} ETH</span> of stake
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
  const { events, eventsLoading, eventsFailedChunks, getNickname } = useStore();
  const net = activeNetwork;
  const sub = eventsLoading
    ? 'Loading…'
    : `${events.length} event${events.length === 1 ? '' : 's'}`
      + (eventsFailedChunks > 0
          ? ` · ${eventsFailedChunks} range(s) failed — log may be incomplete`
          : '');

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
          sub={sub}
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
