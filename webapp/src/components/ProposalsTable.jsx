import { ethers } from 'ethers';

export default function ProposalsTable({ proposals, getNickname, canVote, onVote, votedProposals, investorDetails, totalFunds }) {
  if (!proposals.length) return <div>No proposals yet.</div>;

  const getFundsInvested = (addr) => {
    const found = investorDetails.find(i => i.addr.toLowerCase() === addr.toLowerCase());
    return found?.fundsInvested ?? 0n;
  };

  return (
    <div style={{ marginBottom: 16 }}>
      <h2 className="h-section">Proposals</h2>
      <table className="table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Description</th>
            <th>Manager</th>
            <th className="right">Required</th>
            <th className="right">Approve Share</th>
            <th className="center">Secured</th>
            <th className="right">Revenue Received</th>
            <th className="right">Revenue Paid</th>
            <th className="center">Actions</th>
          </tr>
        </thead>
        <tbody>
          {proposals.map((p, i) => {
            const approveShare = (p.approvers || []).reduce((sum, a) => sum + getFundsInvested(a), 0n);
            const approveSharePct = totalFunds > 0n
              ? ((Number(approveShare) / Number(totalFunds)) * 100).toFixed(1) + '%'
              : '-';
            return (
              <tr key={i}>
                <td>{i}</td>
                <td>{p.description}</td>
                <td>{p.manager ? getNickname(p.manager) : ''}</td>
                <td className="right">{ethers.formatEther(p.requiredFunds ?? 0n)} ETH</td>
                <td className="right">{approveSharePct}</td>
                <td className="center">{p.secured ? 'Yes' : 'No'}</td>
                <td className="right">{ethers.formatEther(p.revenueReceived ?? 0n)} ETH</td>
                <td className="right">{ethers.formatEther(p.revenuePaid ?? 0n)} ETH</td>
                <td className="center">
                  {canVote && !p.secured && !votedProposals[i] && (
                    <button className="btn" onClick={() => onVote(i)}>Vote</button>
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
