import { useEffect, useMemo, useState } from 'react';
import { useWallet } from './hooks/useWallet';
import { useContractStatus } from './hooks/useContractStatus';
import { useRole, ROLES } from './hooks/useRole';
import { useDetails } from './hooks/useDetails';
import ConnectBar from './components/ConnectBar';
import WithdrawPanel from './components/WithdrawPanel';
import AdminUI from './components/AdminUI';
import ManagerUI from './components/ManagerUI';
import InvestorUI from './components/InvestorUI';
import StatusDashboard from './components/StatusDashboard';
import InvestorTable from './components/InvestorTable';
import ManagersTable from './components/ManagersTable';
import ProposalsTable from './components/ProposalsTable';
import deployment from './abi/deployment.json';
import './App.css';

export default function App() {
  const { address, contract, connect } = useWallet(deployment);
  const { status, loading, refresh } = useContractStatus(contract, address);
  const role = useRole(contract, address, deployment.owner);
  const { investorDetails, managerDetails, getNickname } = useDetails(contract, status, deployment);
  const [busy, setBusy] = useState(false);

  const votedProposals = useMemo(() => {
    if (!address) return {};
    const voted = {};
    status.proposals.forEach((p, i) => {
      voted[i] = (p.approvers || []).some(a => a.toLowerCase() === address.toLowerCase());
    });
    return voted;
  }, [status.proposals, address]);

  const vote = async (proposalId) => {
    setBusy(true);
    try {
      await (await contract.approveProposal(Number(proposalId))).wait();
      refresh();
    } catch (e) { alert('Vote failed: ' + e.message); }
    finally { setBusy(false); }
  };

  const withdraw = async () => {
    setBusy(true);
    try {
      await (await contract.withdraw()).wait();
      refresh();
    } catch (e) { alert('Withdraw failed: ' + e.message); }
    finally { setBusy(false); }
  };

  useEffect(() => {
    const prev = [
      document.body.style.background,
      document.body.style.backgroundRepeat,
      document.body.style.backgroundSize,
      document.body.style.backgroundPosition,
    ];
    document.body.style.background = 'url(./bg.png)';
    document.body.style.backgroundRepeat = 'repeat';
    document.body.style.backgroundSize = '40%';
    document.body.style.backgroundPosition = 'center';
    return () => {
      [
        document.body.style.background,
        document.body.style.backgroundRepeat,
        document.body.style.backgroundSize,
        document.body.style.backgroundPosition,
      ] = prev;
    };
  }, []);

  const isLoading = loading || busy;

  return (
    <div className="page">
      <div className="card">
        <h1 style={{ textAlign: 'center', fontWeight: 700, marginBottom: 24, fontSize: '2.2em' }}>
          شيخ فاي<br /><br />Шейх-Fi DApp
        </h1>
        <ConnectBar
          address={address}
          nickname={getNickname(address)}
          contractAddress={deployment.contractAddress}
          onConnect={connect}
        />
        {address && status.myWithdrawable > 0n && (
          <WithdrawPanel amount={status.myWithdrawable} onWithdraw={withdraw} loading={isLoading} />
        )}
        {role === ROLES.OWNER && <>
          <AdminUI contract={contract} status={status} refresh={refresh} loading={isLoading} />
          <InvestorUI contract={contract} refresh={refresh} loading={isLoading} />
        </>}
        {role === ROLES.MANAGER && (
          <ManagerUI contract={contract} status={status} refresh={refresh} loading={isLoading} />
        )}
        {(role === ROLES.INVESTOR || (address && role === ROLES.NONE)) && (
          <InvestorUI contract={contract} refresh={refresh} loading={isLoading} />
        )}
        <StatusDashboard
          status={status}
          loading={loading}
          getNickname={getNickname}
          ownerAddress={deployment.owner}
        />
        <InvestorTable investors={investorDetails} />
        <ManagersTable managers={managerDetails} />
        <ProposalsTable
          proposals={status.proposals}
          getNickname={getNickname}
          canVote={role === ROLES.OWNER || role === ROLES.INVESTOR}
          onVote={vote}
          votedProposals={votedProposals}
          investorDetails={investorDetails}
          totalFunds={status.totalFunds}
        />
        <hr />
      </div>
    </div>
  );
}
