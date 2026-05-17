export default function ConnectBar({ address, nickname, contractAddress, onConnect }) {
  return (
    <>
      <div className="links">
        <a href="https://github.com/aitsvet/sheikhfi" target="_blank" rel="noopener noreferrer">
          github.com/aitsvet/sheikhfi
        </a>
        <br />
        <a
          href={`https://amoy.polygonscan.com/address/${contractAddress}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mono"
        >
          {contractAddress}
        </a>
      </div>
      <div style={{ marginBottom: 16 }}>
        {address
          ? <span>Connected as {nickname}</span>
          : <button className="btn" onClick={onConnect}>Connect MetaMask</button>
        }
      </div>
    </>
  );
}
