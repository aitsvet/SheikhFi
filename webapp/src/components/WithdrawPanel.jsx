import { ethers } from 'ethers';

export default function WithdrawPanel({ amount, onWithdraw, pending, onSettle, loading }) {
  return (
    <div className="withdraw">
      <div>
        <div>
          Available to withdraw: <strong>{ethers.formatEther(amount)} ETH</strong>
          <button className="btn" style={{ marginLeft: 12 }} onClick={onWithdraw} disabled={loading || amount === 0n}>Withdraw</button>
        </div>
        {pending > 0n && (
          <div style={{ marginTop: 6 }}>
            Pending accrual: <strong>{ethers.formatEther(pending)} ETH</strong>
            <button className="btn" style={{ marginLeft: 12 }} onClick={onSettle} disabled={loading}>Settle</button>
          </div>
        )}
      </div>
    </div>
  );
}
