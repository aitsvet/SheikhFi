import { Button } from '../ui';
import { useStore } from '../state';
import { formatEther } from '../ui';

export function PageHead({ crumb, title, lede, actions }) {
  return (
    <div className="page-head">
      <div>
        {crumb && <div className="crumb">{crumb}</div>}
        <h1>{title}</h1>
        {lede && <div className="lede">{lede}</div>}
      </div>
      {actions && <div className="actions">{actions}</div>}
    </div>
  );
}

export function WithdrawPill() {
  const { identity, withdrawable, pending, withdraw, settle, busy } = useStore();
  if (!identity.addr) return null;
  if (withdrawable === 0n && pending === 0n) return null;
  return (
    <div className="wallet-pill">
      <span>Available</span>
      <span className="num">{formatEther(withdrawable)} ETH</span>
      {pending > 0n && (
        <>
          <span style={{ color: 'var(--ink-3)' }}>· pending</span>
          <span className="num">{formatEther(pending)}</span>
        </>
      )}
      <Button size="sm" variant="primary"
        disabled={busy || withdrawable === 0n}
        onClick={() => withdraw()}>
        Withdraw
      </Button>
      {pending > 0n && (
        <Button size="sm" disabled={busy} onClick={() => settle(identity.addr)}>Settle</Button>
      )}
    </div>
  );
}
