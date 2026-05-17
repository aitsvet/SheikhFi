import { useState } from 'react';
import { ethers } from 'ethers';

export default function InvestorUI({ contract, refresh, loading }) {
  const [depositAmount, setDepositAmount] = useState('');
  const [txStatus, setTxStatus] = useState('');

  const deposit = async () => {
    setTxStatus('Depositing...');
    try {
      await (await contract.depositFunds({ value: ethers.parseEther(depositAmount) })).wait();
      setTxStatus('Deposit successful!');
      refresh();
    } catch (e) {
      setTxStatus('Deposit failed: ' + e.message);
    }
  };

  return (
    <div>
      <h2 className="h-section">Investor Actions</h2>
      <input
        className="input"
        type="number"
        placeholder="Amount (ETH)"
        value={depositAmount}
        onChange={e => setDepositAmount(e.target.value)}
        disabled={loading}
      />
      <button className="btn" onClick={deposit} disabled={loading || !depositAmount}>Deposit</button>
      <br /><br />
      <div>{txStatus}</div>
    </div>
  );
}
