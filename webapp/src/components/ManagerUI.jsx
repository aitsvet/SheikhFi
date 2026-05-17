import { useState } from 'react';
import { ethers } from 'ethers';

export default function ManagerUI({ contract, status, refresh, loading }) {
  const [desc, setDesc] = useState('');
  const [funds, setFunds] = useState('');
  const [payment, setPayment] = useState('');
  const [selectedProposal, setSelectedProposal] = useState('');
  const [txStatus, setTxStatus] = useState('');

  const submitProposal = async () => {
    setTxStatus('Submitting proposal...');
    try {
      await (await contract.submitProposal(desc, ethers.parseEther(funds))).wait();
      setTxStatus('Proposal submitted!');
      refresh();
    } catch (e) { setTxStatus('Proposal failed: ' + e.message); }
  };

  const receivePayment = async () => {
    setTxStatus('Receiving payment...');
    try {
      await (await contract.receiveRevenue(Number(selectedProposal), { value: ethers.parseEther(payment) })).wait();
      setTxStatus('Payment received!');
      refresh();
    } catch (e) { setTxStatus('Payment failed: ' + e.message); }
  };

  return (
    <div>
      <h2 className="h-section">Manager Actions</h2>
      <input className="input" style={{ width: 220 }} type="text" placeholder="Proposal description"
        value={desc} onChange={e => setDesc(e.target.value)} disabled={loading} />
      <input className="input" type="number" placeholder="Funds required (ETH)"
        value={funds} onChange={e => setFunds(e.target.value)} disabled={loading} />
      <button className="btn" onClick={submitProposal} disabled={loading || !desc || !funds}>
        Submit Proposal
      </button>
      <br /><br />
      <input className="input" type="number" placeholder="Revenue payment (ETH)"
        value={payment} onChange={e => setPayment(e.target.value)} disabled={loading} />
      <select className="select" value={selectedProposal}
        onChange={e => setSelectedProposal(e.target.value)}
        disabled={loading || !status.proposals.length}
        style={{ marginRight: 8 }}>
        <option value="" disabled>Select proposal</option>
        {status.proposals.map((p, i) => <option key={i} value={i}>{i}: {p.description}</option>)}
      </select>
      <button className="btn" onClick={receivePayment} disabled={loading || !payment || selectedProposal === ''}>
        Receive Payment
      </button>
      <div>{txStatus}</div>
    </div>
  );
}
