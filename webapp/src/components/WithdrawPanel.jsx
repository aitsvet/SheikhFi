import { ethers } from 'ethers';

export default function WithdrawPanel({ amount, onWithdraw, loading }) {
  return (
    <div className="withdraw">
      <span>Available to withdraw: <strong>{ethers.formatEther(amount)} ETH</strong></span>
      <button className="btn" onClick={onWithdraw} disabled={loading}>Withdraw</button>
    </div>
  );
}
