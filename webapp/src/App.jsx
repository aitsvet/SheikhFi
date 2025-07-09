import React, { useEffect, useState } from 'react';
import { ethers } from 'ethers';
import deployment from './abi/deployment.json';

const CONTRACT_ADDRESS = deployment.contractAddress;
const OWNER_ADDRESS = deployment.owner;
const OWNER_NICKNAME = deployment.ownerNickname;

const ROLES = {
  NONE: 'none',
  INVESTOR: 'investor',
  MANAGER: 'manager',
  OWNER: 'owner',
};

// Common button style with diagonal gradient
const buttonStyle = {
  background: 'linear-gradient(135deg, #386bb9 0%, #e51f78 100%)',
  color: 'white',
  border: 'none',
  borderRadius: '6px',
  padding: '8px 16px',
  fontSize: '1em',
  cursor: 'pointer',
  fontWeight: 'bold',
  transition: 'all 0.2s ease',
  boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
};

const buttonHoverStyle = {
  ...buttonStyle,
  transform: 'translateY(-1px)',
  boxShadow: '0 4px 8px rgba(0,0,0,0.2)',
};

// Common select style with diagonal gradient
const selectStyle = {
  color: 'white',
  border: 'none',
  borderRadius: '6px',
  padding: '8px 12px',
  fontSize: '1em',
  cursor: 'pointer',
  fontWeight: 'bold',
  transition: 'all 0.2s ease',
  boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
};

function App() {
  const [address, setAddress] = useState('');
  const [contract, setContract] = useState();
  const [provider, setProvider] = useState();
  const [signer, setSigner] = useState();
  const [role, setRole] = useState(ROLES.NONE);
  const [status, setStatus] = useState({
    totalFunds: 0n,
    freeFunds: 0n,
    proposalCount: 0,
    investorAddresses: [],
    managerAddresses: [],
    proposals: [],
    approveShareThreshold: 0,
  });
  const [loading, setLoading] = useState(false);
  const [investorDetails, setInvestorDetails] = useState([]);
  const [managerDetails, setManagerDetails] = useState([]);
  const [votedProposals, setVotedProposals] = useState({});

  // Logout handler
  const logout = () => {
    setAddress('');
    setContract(undefined);
    setRole(ROLES.NONE);
    setProvider(undefined);
    setSigner(undefined);
  };

  // Connect wallet
  const connectWallet = async () => {
    if (!window.ethereum) {
      alert('MetaMask is required!');
      return;
    }
    const _provider = new ethers.BrowserProvider(window.ethereum);
    await _provider.send('eth_requestAccounts', []);
    const _signer = await _provider.getSigner();
    setProvider(_provider);
    setSigner(_signer);
    const userAddress = await _signer.getAddress();
    setAddress(userAddress);
    const _contract = new ethers.Contract(CONTRACT_ADDRESS, deployment.abi, _signer);
    setContract(_contract);
  };

  // Auto-login and account change detection
  useEffect(() => {
    if (!window.ethereum) return;
    (async () => {
      try {
        const accounts = await window.ethereum.request({ method: 'eth_accounts' });
        if (accounts && accounts.length > 0) {
          const _provider = new ethers.BrowserProvider(window.ethereum);
          const _signer = await _provider.getSigner();
          setProvider(_provider);
          setSigner(_signer);
          const userAddress = await _signer.getAddress();
          setAddress(userAddress);
          const _contract = new ethers.Contract(CONTRACT_ADDRESS, deployment.abi, _signer);
          setContract(_contract);
        }
      } catch {}
    })();
    const handleAccountsChanged = async (accounts) => {
      if (accounts.length === 0) {
        logout();
      } else {
        const _provider = new ethers.BrowserProvider(window.ethereum);
        const _signer = await _provider.getSigner();
        setProvider(_provider);
        setSigner(_signer);
        const userAddress = await _signer.getAddress();
        setAddress(userAddress);
        const _contract = new ethers.Contract(CONTRACT_ADDRESS, deployment.abi, _signer);
        setContract(_contract);
      }
    };
    window.ethereum.on('accountsChanged', handleAccountsChanged);
    return () => {
      if (window.ethereum.removeListener) {
        window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
      }
    };
  }, []);

  // Detect role
  useEffect(() => {
    if (!contract || !address) return;
    (async () => {
      let isInvestor = false, isManager = false;
      try { isInvestor = await contract.isInvestor(address); } catch {}
      try { isManager = await contract.isManager(address); } catch {}
      if (address.toLowerCase() === OWNER_ADDRESS.toLowerCase()) setRole(ROLES.OWNER);
      else if (isManager) setRole(ROLES.MANAGER);
      else if (isInvestor) setRole(ROLES.INVESTOR);
      else setRole(ROLES.NONE);
    })();
  }, [contract, address]);

  // Fetch contract status
  useEffect(() => {
    if (!contract) return;
    (async () => {
      setLoading(true);
      let totalFunds = 0n, freeFunds = 0n, proposalCount = 0, investorAddresses = [], managerAddresses = [], proposals = [], approveShareThreshold = 0;
      try {
        totalFunds = await contract.totalFunds();
        freeFunds = await contract.freeFunds();
        approveShareThreshold = await contract.approveShareThreshold();
        // Get investor addresses
        let invCount = 0;
        try { while (true) { await contract.investorAddresses(invCount); invCount++; } } catch {}
        investorAddresses = [];
        for (let i = 0; i < invCount; i++) {
          investorAddresses.push(await contract.investorAddresses(i));
        }
        // Get manager addresses
        let mgrCount = 0;
        try { while (true) { await contract.managerAddresses(mgrCount); mgrCount++; } } catch {}
        managerAddresses = [];
        for (let i = 0; i < mgrCount; i++) {
          managerAddresses.push(await contract.managerAddresses(i));
        }
        // Get proposals and their approvers
        let propCount = 0;
        try { while (true) { await contract.proposals(propCount); propCount++; } } catch {}
        proposals = [];
        for (let i = 0; i < propCount; i++) {
          const proposalRaw = await contract.proposals(i);
          let approvers = [];
          try {
            approvers = await contract.getApprovers(i);
          } catch {}
          const proposal = {
            manager: proposalRaw[0],
            description: proposalRaw[1],
            requiredFunds: proposalRaw[2],
            secured: proposalRaw[3],
            revenueReceived: proposalRaw[4],
            revenuePayed: proposalRaw[5],
            approvers
          };
          proposals.push(proposal);
        }
        proposalCount = propCount;
      } catch {}
      setStatus({ totalFunds, freeFunds, proposalCount, investorAddresses, managerAddresses, proposals, approveShareThreshold });
      setLoading(false);
    })();
  }, [contract]);

  // Fetch all investor details
  useEffect(() => {
    if (!contract) return;
    (async () => {
      try {
        const details = await Promise.all(
          status.investorAddresses.map(async (addr) => {
            let investor = await contract.investors(addr);
            return { 
              addr, 
              nickname: investor.nickname, 
              fundsInvested: investor.fundsInvested, 
              profit: investor.profit, 
              profitRate: investor.profitRate 
            };
          })
        );
        setInvestorDetails(details);
      } catch {
        setInvestorDetails([]);
      }
    })();
  }, [contract, status.investorAddresses]);

  // Fetch all manager details
  useEffect(() => {
    if (!contract) return;
    (async () => {
      try {
        const details = await Promise.all(
          status.managerAddresses.map(async (addr) => {
            let manager = await contract.managers(addr);
            return { 
              addr, 
              nickname: manager.nickname, 
              fundsSecured: manager.fundsSecured, 
              profit: manager.profit, 
              profitRate: manager.profitRate 
            };
          })
        );
        setManagerDetails(details);
      } catch {
        setManagerDetails([]);
      }
    })();
  }, [contract, status.managerAddresses]);

  // Check which proposals user has voted on
  useEffect(() => {
    if (!contract || !address || role !== ROLES.INVESTOR && role !== ROLES.OWNER) return;
    (async () => {
      const voted = {};
      for (let i = 0; i < status.proposals.length; i++) {
        try {
          const approvers = await contract.getApprovers(i);
          voted[i] = approvers.some(addr => addr.toLowerCase() === address.toLowerCase());
        } catch {}
      }
      setVotedProposals(voted);
    })();
  }, [contract, address, role, status.proposals]);

  // Voting function
  const vote = async (proposalId) => {
    setLoading(true);
    try {
      const tx = await contract.approveProposal(Number(proposalId));
      await tx.wait();
      setLoading(false);
      window.location.reload();
    } catch (e) {
      setLoading(false);
      alert('Vote failed: ' + e.message);
    }
  };

  // Helper to get nickname for an address
  function getNickname(addr) {
    if (!addr) return '';
    if (managerDetails && managerDetails.length) {
      const found = managerDetails.find(m => m.addr.toLowerCase() === addr.toLowerCase());
      if (found && found.nickname) return found.nickname;
    }
    if (investorDetails && investorDetails.length) {
      const found = investorDetails.find(i => i.addr.toLowerCase() === addr.toLowerCase());
      if (found && found.nickname) return found.nickname;
    }
    if (addr.toLowerCase() === OWNER_ADDRESS.toLowerCase()) return OWNER_NICKNAME;
    return addr.slice(0, 6) + '...' + addr.slice(-4);
  }

  // Set body background image and gradient
  useEffect(() => {
    const prevBg = document.body.style.background;
    const prevBgRepeat = document.body.style.backgroundRepeat;
    const prevBgSize = document.body.style.backgroundSize;
    const prevBgPosition = document.body.style.backgroundPosition;
    document.body.style.background = 'url(./bg.png)';
    document.body.style.backgroundRepeat = 'repeat';
    document.body.style.backgroundSize = '40%';
    document.body.style.backgroundPosition = 'center';
    return () => {
      document.body.style.background = prevBg;
      document.body.style.backgroundRepeat = prevBgRepeat;
      document.body.style.backgroundSize = prevBgSize;
      document.body.style.backgroundPosition = prevBgPosition;
    };
  }, []);

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'flex-start',
      color: '#181818',
      fontFamily: 'Segoe UI, Arial, sans-serif',
      padding: 24
    }}>
      <div style={{
        maxWidth: 900,
        width: '100%',
        background: '#fff',
        borderRadius: 16,
        boxShadow: '0 4px 32px rgba(0,0,0,0.07)',
        padding: 24,
        margin: '0 auto',
        zIndex: 1
      }}>
        <h1 style={{ textAlign: 'center', fontWeight: 700, marginBottom: 24, fontSize: '2.2em' }}>شيخ فاي<br/><br/>Шейх-Fi DApp</h1>
        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          <a 
            href="https://github.com/aitsvet/sheikhfi"
            target="_blank" 
            rel="noopener noreferrer"
            style={{ 
              color: '#0066cc', 
              textDecoration: 'none',
              fontSize: '0.9em',
              marginRight: '16px'
            }}
          >
            github.com/aitsvet/sheikhfi
          </a>
          <br></br>
          <a 
            href={`https://amoy.polygonscan.com/address/${CONTRACT_ADDRESS}`}
            target="_blank" 
            rel="noopener noreferrer"
            style={{ 
              fontFamily: 'monospace', 
              color: '#0066cc', 
              textDecoration: 'none',
              fontSize: '0.9em'
            }}
          >
            {CONTRACT_ADDRESS}
          </a>
        </div>
        <div style={{ marginBottom: 16 }}>
          {address ? (
            <>
              <span style={{ marginRight: 8 }}>
                Connected as {getNickname(address)}
              </span>
            </>
          ) : (
            <button onClick={connectWallet} style={buttonStyle}>Connect MetaMask</button>
          )}
        </div>
        {/* Action block (AdminUI, InvestorUI, ManagerUI) */}
        {role === ROLES.OWNER && <>
          <AdminUI contract={contract} status={status} refresh={() => window.location.reload()} loading={loading} />
          <InvestorUI contract={contract} status={status} refresh={() => window.location.reload()} address={address} loading={loading} isAdmin={true} isManager={false} getNickname={getNickname} />
        </>}
        {role === ROLES.MANAGER && <ManagerUI contract={contract} status={status} refresh={() => window.location.reload()} loading={loading} managerNickname={getNickname(address)} />}
        {(role === ROLES.INVESTOR || (address && role === ROLES.NONE)) && <InvestorUI contract={contract} status={status} refresh={() => window.location.reload()} address={address} loading={loading} isAdmin={false} isManager={false} getNickname={getNickname} />}
        {/* Tables section */}
        <StatusDashboard status={status} loading={loading} getNickname={getNickname} managerDetails={managerDetails} />
        <InvestorTable investors={investorDetails} />
        <ManagersTable managers={managerDetails} />
        <ProposalsTable proposals={status.proposals} getNickname={getNickname} canVote={role === ROLES.OWNER || role === ROLES.INVESTOR} onVote={vote} votedProposals={votedProposals} investorDetails={investorDetails} totalFunds={status.totalFunds} approveShareThreshold={status.approveShareThreshold} />
        <hr />
      </div>
    </div>
  );
}

function StatusDashboard({ status, loading, getNickname, managerDetails }) {
  if (loading) return <div>Loading contract status...</div>;
  // Calculate total revenue across all proposals
  const totalRevenue = status.proposals.reduce((sum, p) => sum + (p.revenueReceived ?? 0n), 0n);
  return (
    <div style={{ marginBottom: 16 }}>
      <h2 style={{ margin: 0, marginBottom: 8, color: '#222', textAlign: 'center', fontSize: '1.4em' }}>Contract Status</h2>
      <table style={{ width: '100%', background: '#fff', color: '#222', borderCollapse: 'collapse', border: '1px solid #eee', fontSize: '1em' }}>
        <tbody>
          <tr>
            <th style={{ textAlign: 'left', padding: 4, background: '#eee', width: 200, fontWeight: 500, borderBottom: '1px solid #eee' }}>Total Funds</th>
            <td style={{ padding: 4, borderBottom: '1px solid #eee' }}>{ethers.formatEther(status.totalFunds)}</td>
          </tr>
          <tr>
            <th style={{ textAlign: 'left', padding: 4, background: '#eee', fontWeight: 500, borderBottom: '1px solid #eee' }}>Free Funds</th>
            <td style={{ padding: 4, borderBottom: '1px solid #eee' }}>{ethers.formatEther(status.freeFunds)}</td>
          </tr>
          <tr>
            <th style={{ textAlign: 'left', padding: 4, background: '#eee', fontWeight: 500, borderBottom: '1px solid #eee' }}>Total Revenue</th>
            <td style={{ padding: 4, borderBottom: '1px solid #eee' }}>{ethers.formatEther(totalRevenue)}</td>
          </tr>
          <tr>
            <th style={{ textAlign: 'left', padding: 4, background: '#eee', fontWeight: 500, borderBottom: '1px solid #eee' }}>Approval Threshold</th>
            <td style={{ padding: 4, borderBottom: '1px solid #eee' }}>{Number(status.approveShareThreshold).toFixed(1)}%</td>
          </tr>
          <tr>
            <th style={{ textAlign: 'left', padding: 4, background: '#eee', fontWeight: 500 }}>Owner</th>
            <td style={{ padding: 4 }}>{getNickname(OWNER_ADDRESS)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function InvestorTable({ investors }) {
  if (!investors.length) return <div>No investors yet.</div>;
  return (
    <div style={{ marginBottom: 16 }}>
      <h2 style={{ margin: 0, marginBottom: 8, color: '#222', textAlign: 'center', fontSize: '1.4em' }}>Investors</h2>
      <table style={{ width: '100%', background: '#fff', color: '#222', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: '#eee' }}>
            <th style={{ textAlign: 'left', padding: 4 }}>Nickname</th>
            <th style={{ textAlign: 'right', padding: 4 }}>Funds Invested</th>
            <th style={{ textAlign: 'right', padding: 4 }}>Profit</th>
            <th style={{ textAlign: 'right', padding: 4 }}>Profit Rate</th>
          </tr>
        </thead>
        <tbody>
          {investors.map((inv, i) => (
            <tr key={i}>
              <td style={{ padding: 4 }}>{inv.nickname || (inv.addr ? inv.addr.slice(0, 6) + '...' + inv.addr.slice(-4) : '')}</td>
              <td style={{ textAlign: 'right', padding: 4 }}>{Number(ethers.formatEther(inv.fundsInvested ?? 0n))}</td>
              <td style={{ textAlign: 'right', padding: 4 }}>{Number(ethers.formatEther(inv.profit ?? 0n))}</td>
              <td style={{ textAlign: 'right', padding: 4 }}>{inv.profitRate !== undefined ? Number(inv.profitRate).toFixed(1) + '%' : '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ProposalsTable({ proposals, getNickname, canVote, onVote, votedProposals, investorDetails, totalFunds, approveShareThreshold }) {
  if (!proposals.length) return <div>No proposals yet.</div>;
  // Helper to get funded amount for an address
  const getFundsInvested = (addr) => {
    const found = investorDetails.find(i => i.addr.toLowerCase() === addr.toLowerCase());
    return found ? found.fundsInvested ?? 0n : 0n;
  };
  return (
    <div style={{ marginBottom: 16 }}>
      <h2 style={{ margin: 0, marginBottom: 8, color: '#222', textAlign: 'center', fontSize: '1.4em' }}>Proposals</h2>
      <table style={{ width: '100%', background: '#fff', color: '#222', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: '#eee' }}>
            <th style={{ textAlign: 'left', padding: 4 }}>ID</th>
            <th style={{ textAlign: 'left', padding: 4 }}>Description</th>
            <th style={{ textAlign: 'left', padding: 4 }}>Manager</th>
            <th style={{ textAlign: 'right', padding: 4 }}>Required</th>
            <th style={{ textAlign: 'right', padding: 4 }}>Approve Share</th>
            <th style={{ textAlign: 'center', padding: 4 }}>Secured</th>
            <th style={{ textAlign: 'right', padding: 4 }}>Revenue Received</th>
            <th style={{ textAlign: 'right', padding: 4 }}>Revenue Payed</th>
            <th style={{ textAlign: 'center', padding: 4 }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {proposals.map((p, i) => {
            // Calculate approveShare as sum of fundsInvested for all approvers
            const approveShare = (p.approvers || []).reduce((sum, addr) => sum + getFundsInvested(addr), 0n);
            let approveSharePct = '-';
            if (totalFunds && totalFunds > 0n) {
              approveSharePct = ((Number(approveShare) / Number(totalFunds)) * 100).toFixed(1) + '%';
            }
            const revenueReceived = Number(ethers.formatEther(p.revenueReceived ?? 0n));
            const revenuePayed = Number(ethers.formatEther(p.revenuePayed ?? 0n));
            return (
              <tr key={i}>
                <td style={{ padding: 4 }}>{i}</td>
                <td style={{ padding: 4 }}>{p.description}</td>
                <td style={{ padding: 4 }}>{getNickname && p.manager ? getNickname(p.manager) : ''}</td>
                <td style={{ textAlign: 'right', padding: 4 }}>{Number(ethers.formatEther(p.requiredFunds ?? 0n))}</td>
                <td style={{ textAlign: 'right', padding: 4 }}>{approveSharePct}</td>
                <td style={{ textAlign: 'center', padding: 4 }}>{p.secured ? 'Yes' : 'No'}</td>
                <td style={{ textAlign: 'right', padding: 4 }}>{revenueReceived}</td>
                <td style={{ textAlign: 'right', padding: 4 }}>{revenuePayed}</td>
                <td style={{ textAlign: 'center', padding: 4 }}>
                  {canVote && !p.secured && !votedProposals[i] && (
                    <button style={buttonStyle} onClick={() => onVote(i)}>Vote</button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ManagersTable({ managers }) {
  if (!managers.length) return <div>No managers yet.</div>;
  return (
    <div style={{ marginBottom: 16 }}>
      <h2 style={{ margin: 0, marginBottom: 8, color: '#222', textAlign: 'center' }}>Managers</h2>
      <table style={{ width: '100%', background: '#fff', color: '#222', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: '#eee' }}>
            <th style={{ textAlign: 'left', padding: 4 }}>Nickname</th>
            <th style={{ textAlign: 'right', padding: 4 }}>Funds Secured</th>
            <th style={{ textAlign: 'right', padding: 4 }}>Profit</th>
            <th style={{ textAlign: 'right', padding: 4 }}>Profit Rate</th>
          </tr>
        </thead>
        <tbody>
          {managers.map((m, i) => (
            <tr key={i}>
              <td style={{ padding: 4 }}>{m.nickname || (m.addr ? m.addr.slice(0, 6) + '...' + m.addr.slice(-4) : '')}</td>
              <td style={{ textAlign: 'right', padding: 4 }}>{Number(ethers.formatEther(m.fundsSecured ?? 0n))}</td>
              <td style={{ textAlign: 'right', padding: 4 }}>{Number(ethers.formatEther(m.profit ?? 0n))}</td>
              <td style={{ textAlign: 'right', padding: 4 }}>{m.profitRate !== undefined ? Number(m.profitRate).toFixed(1) + '%' : '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function InvestorUI({ contract, status, refresh, address, loading, isAdmin, isManager, getNickname }) {
  const [depositAmount, setDepositAmount] = useState('');
  const [txStatus, setTxStatus] = useState('');

  const deposit = async () => {
    setTxStatus('Depositing...');
    try {
      const tx = await contract.depositFunds({ value: ethers.parseEther(depositAmount) });
      await tx.wait();
      setTxStatus('Deposit successful!');
      refresh();
    } catch (e) {
      setTxStatus('Deposit failed: ' + e.message);
    }
  };

  return (
    <div>
      <h2 style={{ textAlign: 'center', fontSize: '1.4em' }}>{isAdmin ? (isManager ? 'Manager' : 'Investor') : isManager ? 'Manager' : 'Investor'} Actions</h2>
      <input
        type="number"
        placeholder="Amount"
        value={depositAmount}
        onChange={e => setDepositAmount(e.target.value)}
        disabled={loading}
        style={{
          background: '#fff',
          color: '#181818',
          border: '1px solid #ddd',
          borderRadius: 6,
          padding: '8px 12px',
          margin: '4px 0',
          fontSize: '1em',
          width: 180
        }}
      />
      <button onClick={deposit} disabled={loading || !depositAmount} style={buttonStyle}>Deposit</button>
      <br /><br />
      <div>{txStatus}</div>
    </div>
  );
}

function ManagerUI({ contract, status, refresh, loading, managerNickname }) {
  const [desc, setDesc] = useState('');
  const [funds, setFunds] = useState('');
  const [payment, setPayment] = useState('');
  const [selectedProposal, setSelectedProposal] = useState('');
  const [txStatus, setTxStatus] = useState('');

  const submitProposal = async () => {
    setTxStatus('Submitting proposal...');
    try {
      const tx = await contract.submitProposal(desc, ethers.parseEther(funds));
      await tx.wait();
      setTxStatus('Proposal submitted!');
      refresh();
    } catch (e) {
      setTxStatus('Proposal failed: ' + e.message);
    }
  };

  const receivePayment = async () => {
    setTxStatus('Receiving payment...');
    try {
      const tx = await contract.recieveRevenue(Number(selectedProposal), { value: ethers.parseEther(payment) });
      await tx.wait();
      setTxStatus('Payment received!');
      refresh();
    } catch (e) {
      setTxStatus('Payment failed: ' + e.message);
    }
  };

  return (
    <div>
      <h2 style={{ textAlign: 'center', fontSize: '1.4em' }}>Manager Actions</h2>
      <input
        type="text"
        placeholder="Proposal description"
        value={desc}
        onChange={e => setDesc(e.target.value)}
        disabled={loading}
        style={{
          background: '#fff',
          color: '#181818',
          border: '1px solid #ddd',
          borderRadius: 6,
          padding: '8px 12px',
          margin: '4px 0',
          fontSize: '1em',
          width: 220
        }}
      />
      <input
        type="number"
        placeholder="Funds required"
        value={funds}
        onChange={e => setFunds(e.target.value)}
        disabled={loading}
        style={{
          background: '#fff',
          color: '#181818',
          border: '1px solid #ddd',
          borderRadius: 6,
          padding: '8px 12px',
          margin: '4px 0',
          fontSize: '1em',
          width: 180
        }}
      />
      <button onClick={submitProposal} disabled={loading || !desc || !funds} style={buttonStyle}>Submit Proposal</button>
      <br /><br />
      <input
        type="number"
        placeholder="Revenue payment"
        value={payment}
        onChange={e => setPayment(e.target.value)}
        disabled={loading}
        style={{
          background: '#fff',
          color: '#181818',
          border: '1px solid #ddd',
          borderRadius: 6,
          padding: '8px 12px',
          margin: '4px 0',
          fontSize: '1em',
          width: 180
        }}
      />
      <select
        value={selectedProposal}
        onChange={e => setSelectedProposal(e.target.value)}
        disabled={loading || !status.proposals.length}
        style={{
          marginRight: 8,
          padding: '8px 12px',
          borderRadius: 6,
          border: '1px solid #ddd',
          fontSize: '1em'
        }}
      >
        <option value="" disabled>Select proposal</option>
        {status.proposals.map((p, i) => (
          <option key={i} value={i}>
            {i}: {p.description}
          </option>
        ))}
      </select>
      <button onClick={receivePayment} disabled={loading || !payment || selectedProposal === ''} style={buttonStyle}>Receive Payment</button>
      <div>{txStatus}</div>
    </div>
  );
}

function AdminUI({ contract, status, refresh, loading }) {
  const [txStatus, setTxStatus] = useState('');
  const [selectedProposal, setSelectedProposal] = useState('');
  const [newInvestorAddress, setNewInvestorAddress] = useState('');
  const [newInvestorNickname, setNewInvestorNickname] = useState('');
  const [newInvestorProfitRate, setNewInvestorProfitRate] = useState('');
  const [newManagerAddress, setNewManagerAddress] = useState('');
  const [newManagerNickname, setNewManagerNickname] = useState('');
  const [newManagerProfitRate, setNewManagerProfitRate] = useState('');
  const [showAddInvestor, setShowAddInvestor] = useState(false);
  const [showAddManager, setShowAddManager] = useState(false);

  const distribute = async () => {
    setTxStatus('Distributing profits...');
    try {
      const tx = await contract.distributeRevenue(Number(selectedProposal));
      await tx.wait();
      setTxStatus('Profits distributed!');
      refresh();
    } catch (e) {
      setTxStatus('Distribution failed: ' + e.message);
    }
  };

  const addInvestor = async () => {
    setTxStatus('Adding investor...');
    try {
      const tx = await contract.addInvestor(newInvestorAddress, newInvestorNickname, Number(newInvestorProfitRate));
      await tx.wait();
      setTxStatus('Investor added!');
      setNewInvestorAddress('');
      setNewInvestorNickname('');
      setNewInvestorProfitRate('');
      refresh();
    } catch (e) {
      setTxStatus('Add investor failed: ' + e.message);
    }
  };

  const addManager = async () => {
    setTxStatus('Adding manager...');
    try {
      const tx = await contract.addManager(newManagerAddress, newManagerNickname, Number(newManagerProfitRate));
      await tx.wait();
      setTxStatus('Manager added!');
      setNewManagerAddress('');
      setNewManagerNickname('');
      setNewManagerProfitRate('');
      refresh();
    } catch (e) {
      setTxStatus('Add manager failed: ' + e.message);
    }
  };

  return (
    <div>
      <h2 style={{ textAlign: 'center', fontSize: '1.4em' }}>Admin Actions</h2>
      
      {/* Add Investor Section */}
      <div style={{ marginBottom: 16, border: '1px solid #ddd', borderRadius: 8 }}>
        <div 
          style={{ 
            padding: '12px 16px', 
            background: '#f5f5f5', 
            cursor: 'pointer',
            borderBottom: showAddInvestor ? '1px solid #ddd' : 'none',
            borderRadius: showAddInvestor ? '8px 8px 0 0' : '8px'
          }}
          onClick={() => setShowAddInvestor(!showAddInvestor)}
        >
          <h3 style={{ margin: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            Add Investor
            <span style={{ fontSize: '18px', fontWeight: 'bold' }}>
              {showAddInvestor ? '−' : '+'}
            </span>
          </h3>
        </div>
        {showAddInvestor && (
          <div style={{ padding: 16 }}>
            <input
              type="text"
              placeholder="Address"
              value={newInvestorAddress}
              onChange={e => setNewInvestorAddress(e.target.value)}
              disabled={loading}
              style={{
                background: '#fff',
                color: '#181818',
                border: '1px solid #ddd',
                borderRadius: 6,
                padding: '8px 12px',
                margin: '4px 4px 4px 0',
                fontSize: '1em',
                width: 200
              }}
            />
            <input
              type="text"
              placeholder="Nickname"
              value={newInvestorNickname}
              onChange={e => setNewInvestorNickname(e.target.value)}
              disabled={loading}
              style={{
                background: '#fff',
                color: '#181818',
                border: '1px solid #ddd',
                borderRadius: 6,
                padding: '8px 12px',
                margin: '4px',
                fontSize: '1em',
                width: 120
              }}
            />
            <input
              type="number"
              placeholder="Profit Rate %"
              value={newInvestorProfitRate}
              onChange={e => setNewInvestorProfitRate(e.target.value)}
              disabled={loading}
              style={{
                background: '#fff',
                color: '#181818',
                border: '1px solid #ddd',
                borderRadius: 6,
                padding: '8px 12px',
                margin: '4px 4px 4px 0',
                fontSize: '1em',
                width: 100
              }}
            />
            <button onClick={addInvestor} disabled={loading || !newInvestorAddress || !newInvestorNickname || !newInvestorProfitRate} style={buttonStyle}>
              Add Investor
            </button>
          </div>
        )}
      </div>

      {/* Add Manager Section */}
      <div style={{ marginBottom: 16, border: '1px solid #ddd', borderRadius: 8 }}>
        <div 
          style={{ 
            padding: '12px 16px', 
            background: '#f5f5f5', 
            cursor: 'pointer',
            borderBottom: showAddManager ? '1px solid #ddd' : 'none',
            borderRadius: showAddManager ? '8px 8px 0 0' : '8px'
          }}
          onClick={() => setShowAddManager(!showAddManager)}
        >
          <h3 style={{ margin: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            Add Manager
            <span style={{ fontSize: '18px', fontWeight: 'bold' }}>
              {showAddManager ? '−' : '+'}
            </span>
          </h3>
        </div>
        {showAddManager && (
          <div style={{ padding: 16 }}>
            <input
              type="text"
              placeholder="Address"
              value={newManagerAddress}
              onChange={e => setNewManagerAddress(e.target.value)}
              disabled={loading}
              style={{
                background: '#fff',
                color: '#181818',
                border: '1px solid #ddd',
                borderRadius: 6,
                padding: '8px 12px',
                margin: '4px 4px 4px 0',
                fontSize: '1em',
                width: 200
              }}
            />
            <input
              type="text"
              placeholder="Nickname"
              value={newManagerNickname}
              onChange={e => setNewManagerNickname(e.target.value)}
              disabled={loading}
              style={{
                background: '#fff',
                color: '#181818',
                border: '1px solid #ddd',
                borderRadius: 6,
                padding: '8px 12px',
                margin: '4px',
                fontSize: '1em',
                width: 120
              }}
            />
            <input
              type="number"
              placeholder="Profit Rate %"
              value={newManagerProfitRate}
              onChange={e => setNewManagerProfitRate(e.target.value)}
              disabled={loading}
              style={{
                background: '#fff',
                color: '#181818',
                border: '1px solid #ddd',
                borderRadius: 6,
                padding: '8px 12px',
                margin: '4px 4px 4px 0',
                fontSize: '1em',
                width: 100
              }}
            />
            <button onClick={addManager} disabled={loading || !newManagerAddress || !newManagerNickname || !newManagerProfitRate} style={buttonStyle}>
              Add Manager
            </button>
          </div>
        )}
      </div>

      {/* Distribute Revenue Section */}
      <div style={{ marginBottom: 16, padding: 16, border: '1px solid #ddd', borderRadius: 8 }}>
        <h3 style={{ margin: '0 0 8px 0' }}>Distribute Revenue</h3>
        <select
          value={selectedProposal}
          onChange={e => setSelectedProposal(e.target.value)}
          disabled={loading || !status.proposals.length}
          style={{
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            padding: '8px 12px',
            fontSize: '1em',
            cursor: 'pointer',
            fontWeight: 'bold',
            transition: 'all 0.2s ease',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
          }}
        >
          <option value="" disabled>Select proposal</option>
          {status.proposals.map((p, i) => (
            <option key={i} value={i}>
              {i}: {p.description}
            </option>
          ))}
        </select>
        <button onClick={distribute} disabled={loading || selectedProposal === ''} style={buttonStyle}>Distribute Profits</button>
      </div>

      <div>{txStatus}</div>
    </div>
  );
}

export default App;
