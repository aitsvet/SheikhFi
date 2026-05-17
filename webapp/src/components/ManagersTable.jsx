import { ethers } from 'ethers';

export default function ManagersTable({ managers }) {
  if (!managers.length) return <div>No managers yet.</div>;
  return (
    <div style={{ marginBottom: 16 }}>
      <h2 className="h-section">Managers</h2>
      <table className="table">
        <thead>
          <tr>
            <th>Nickname</th>
            <th className="right">Funds Secured</th>
            <th className="right">Profit</th>
            <th className="right">Profit Rate</th>
          </tr>
        </thead>
        <tbody>
          {managers.map((m, i) => (
            <tr key={i}>
              <td>{m.nickname || (m.addr ? m.addr.slice(0, 6) + '...' + m.addr.slice(-4) : '')}</td>
              <td className="right">{ethers.formatEther(m.fundsSecured ?? 0n)} ETH</td>
              <td className="right">{ethers.formatEther(m.profit ?? 0n)} ETH</td>
              <td className="right">{m.profitRate !== undefined ? Number(m.profitRate).toFixed(1) + '%' : '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
