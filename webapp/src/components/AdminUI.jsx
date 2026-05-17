import { useState } from 'react';

function Collapsible({ title, children }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="section">
      <div className={`section-header${open ? ' open' : ''}`} onClick={() => setOpen(o => !o)}>
        <span>{title}</span>
        <span>{open ? '−' : '+'}</span>
      </div>
      {open && <div className="section-body">{children}</div>}
    </div>
  );
}

export default function AdminUI({ contract, status, refresh, loading }) {
  const [txStatus, setTxStatus] = useState('');
  const [selectedProposal, setSelectedProposal] = useState('');
  const [invAddr, setInvAddr] = useState('');
  const [invNick, setInvNick] = useState('');
  const [invRate, setInvRate] = useState('');
  const [mgrAddr, setMgrAddr] = useState('');
  const [mgrNick, setMgrNick] = useState('');
  const [mgrRate, setMgrRate] = useState('');

  const addInvestor = async () => {
    setTxStatus('Adding investor...');
    try {
      await (await contract.addInvestor(invAddr, invNick, Number(invRate))).wait();
      setTxStatus('Investor added!');
      setInvAddr(''); setInvNick(''); setInvRate('');
      refresh();
    } catch (e) { setTxStatus('Failed: ' + e.message); }
  };

  const addManager = async () => {
    setTxStatus('Adding manager...');
    try {
      await (await contract.addManager(mgrAddr, mgrNick, Number(mgrRate))).wait();
      setTxStatus('Manager added!');
      setMgrAddr(''); setMgrNick(''); setMgrRate('');
      refresh();
    } catch (e) { setTxStatus('Failed: ' + e.message); }
  };

  const distribute = async () => {
    setTxStatus('Distributing profits...');
    try {
      await (await contract.distributeRevenue(Number(selectedProposal))).wait();
      setTxStatus('Profits distributed!');
      refresh();
    } catch (e) { setTxStatus('Failed: ' + e.message); }
  };

  return (
    <div>
      <h2 className="h-section">Admin Actions</h2>

      <Collapsible title="Add Investor">
        <input className="input" style={{ width: 200 }} type="text" placeholder="Address"
          value={invAddr} onChange={e => setInvAddr(e.target.value)} disabled={loading} />
        <input className="input" style={{ width: 120 }} type="text" placeholder="Nickname"
          value={invNick} onChange={e => setInvNick(e.target.value)} disabled={loading} />
        <input className="input" style={{ width: 100 }} type="number" placeholder="Profit Rate %"
          value={invRate} onChange={e => setInvRate(e.target.value)} disabled={loading} />
        <button className="btn" onClick={addInvestor}
          disabled={loading || !invAddr || !invNick || !invRate}>
          Add Investor
        </button>
      </Collapsible>

      <Collapsible title="Add Manager">
        <input className="input" style={{ width: 200 }} type="text" placeholder="Address"
          value={mgrAddr} onChange={e => setMgrAddr(e.target.value)} disabled={loading} />
        <input className="input" style={{ width: 120 }} type="text" placeholder="Nickname"
          value={mgrNick} onChange={e => setMgrNick(e.target.value)} disabled={loading} />
        <input className="input" style={{ width: 100 }} type="number" placeholder="Profit Rate %"
          value={mgrRate} onChange={e => setMgrRate(e.target.value)} disabled={loading} />
        <button className="btn" onClick={addManager}
          disabled={loading || !mgrAddr || !mgrNick || !mgrRate}>
          Add Manager
        </button>
      </Collapsible>

      <div className="section">
        <div className="section-body">
          <h3 style={{ margin: '0 0 8px 0' }}>Distribute Revenue</h3>
          <select className="select" value={selectedProposal}
            onChange={e => setSelectedProposal(e.target.value)}
            disabled={loading || !status.proposals.length}
            style={{ marginRight: 8 }}>
            <option value="" disabled>Select proposal</option>
            {status.proposals.map((p, i) => (
              <option key={i} value={i}>{i}: {p.description}</option>
            ))}
          </select>
          <button className="btn" onClick={distribute} disabled={loading || selectedProposal === ''}>
            Distribute Profits
          </button>
        </div>
      </div>

      <div>{txStatus}</div>
    </div>
  );
}
