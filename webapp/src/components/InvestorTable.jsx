import { ethers } from 'ethers';

export default function InvestorTable({ investors }) {
  if (!investors.length) return <div>No investors yet.</div>;
  return (
    <div style={{ marginBottom: 16 }}>
      <h2 className="h-section">Investors</h2>
      <table className="table">
        <thead>
          <tr>
            <th>Nickname</th>
            <th className="right">Funds Invested</th>
            <th className="right">Profit</th>
            <th className="right">Profit Rate</th>
          </tr>
        </thead>
        <tbody>
          {investors.map((inv, i) => (
            <tr key={i}>
              <td>{inv.nickname || (inv.addr ? inv.addr.slice(0, 6) + '...' + inv.addr.slice(-4) : '')}</td>
              <td className="right">{ethers.formatEther(inv.fundsInvested ?? 0n)} ETH</td>
              <td className="right">{ethers.formatEther(inv.profit ?? 0n)} ETH</td>
              <td className="right">{inv.profitRate !== undefined ? Number(inv.profitRate).toFixed(1) + '%' : '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
