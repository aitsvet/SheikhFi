import { ethers } from 'ethers';

export default function StatusDashboard({ status, loading, getNickname, ownerAddress }) {
  if (loading) return <div>Loading contract status...</div>;
  const totalRevenue = status.proposals.reduce((sum, p) => sum + (p.revenueReceived ?? 0n), 0n);
  return (
    <div style={{ marginBottom: 16 }}>
      <h2 className="h-section">Contract Status</h2>
      <table className="table" style={{ border: '1px solid #eee' }}>
        <tbody>
          <tr>
            <th style={{ width: 200, borderBottom: '1px solid #eee' }}>Total Funds</th>
            <td style={{ borderBottom: '1px solid #eee' }}>{ethers.formatEther(status.totalFunds)} ETH</td>
          </tr>
          <tr>
            <th style={{ borderBottom: '1px solid #eee' }}>Free Funds</th>
            <td style={{ borderBottom: '1px solid #eee' }}>{ethers.formatEther(status.freeFunds)} ETH</td>
          </tr>
          <tr>
            <th style={{ borderBottom: '1px solid #eee' }}>Total Revenue</th>
            <td style={{ borderBottom: '1px solid #eee' }}>{ethers.formatEther(totalRevenue)} ETH</td>
          </tr>
          <tr>
            <th style={{ borderBottom: '1px solid #eee' }}>Approval Threshold</th>
            <td style={{ borderBottom: '1px solid #eee' }}>{Number(status.approveShareThreshold).toFixed(1)}%</td>
          </tr>
          <tr>
            <th>Owner</th>
            <td>{getNickname(ownerAddress)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
