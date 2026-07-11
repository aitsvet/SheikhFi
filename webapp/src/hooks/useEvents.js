import { useEffect, useState } from 'react';

// Public Base Sepolia RPC caps eth_getLogs at ~1000 blocks per call.
// 800 leaves safety headroom against drift / other providers.
const CHUNK = 800;

// Raw logs (hex strings — JSON-safe, no BigInt) plus block timestamps are
// cached in localStorage per contract; every mount only scans the blocks
// added since the last successful scan. Decoding is cheap and re-runs on
// every load, so ABI upgrades don't invalidate the cache.
const cacheKey = (address) => `sheikhfi:events:v1:${address.toLowerCase()}`;

function readCache(address) {
  try {
    const raw = localStorage.getItem(cacheKey(address));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.logs) || typeof parsed.lastBlock !== 'number') return null;
    return parsed;
  } catch { return null; }
}

function writeCache(address, lastBlock, logs) {
  try {
    localStorage.setItem(cacheKey(address), JSON.stringify({ lastBlock, logs }));
  } catch { /* quota exceeded — next load rescans */ }
}

export function useEvents(contract, deployBlock, refreshKey) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [failedChunks, setFailedChunks] = useState(0);

  useEffect(() => {
    if (!contract) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const provider = contract.runner?.provider ?? contract.provider;
        const address  = await contract.getAddress();
        const latest   = await provider.getBlockNumber();

        const cache = readCache(address);
        const logs  = cache ? [...cache.logs] : [];
        const start = cache
          ? cache.lastBlock + 1
          : (deployBlock ?? Math.max(0, latest - 50_000));

        // One getLogs call per chunk, filtered only by address — far cheaper
        // than N filters per chunk and avoids the "could not coalesce" path
        // that public RPCs return when overloaded.
        let failed = 0;
        const fresh = [];
        for (let from = start; from <= latest; from += CHUNK) {
          if (cancelled) return;
          const to = Math.min(from + CHUNK - 1, latest);
          try {
            const chunk = await provider.getLogs({
              address, fromBlock: from, toBlock: to,
            });
            fresh.push(...chunk.map(log => ({
              topics: [...log.topics],
              data: log.data,
              blockNumber: log.blockNumber,
              txHash: log.transactionHash,
              logIndex: log.index ?? log.logIndex ?? 0,
              timestamp: 0,
            })));
          } catch { failed += 1; }
        }

        // Block timestamps for the fresh logs only (one call per unique block).
        const tsCache = new Map();
        await Promise.all([...new Set(fresh.map(e => e.blockNumber))].map(async (bn) => {
          try {
            const b = await provider.getBlock(bn);
            tsCache.set(bn, Number(b?.timestamp ?? 0));
          } catch { tsCache.set(bn, 0); }
        }));
        for (const e of fresh) e.timestamp = tsCache.get(e.blockNumber) || 0;

        logs.push(...fresh);
        // Advancing lastBlock past a failed chunk would freeze the gap into
        // the cache forever — only persist a fully successful scan.
        if (failed === 0) writeCache(address, latest, logs);

        // Decode client-side using the contract interface.
        const decoded = [];
        for (const log of logs) {
          try {
            const parsed = contract.interface.parseLog({
              topics: log.topics, data: log.data,
            });
            if (!parsed) continue;
            decoded.push({
              name:        parsed.name,
              args:        parsed.args,
              blockNumber: log.blockNumber,
              txHash:      log.txHash,
              logIndex:    log.logIndex,
              timestamp:   log.timestamp,
            });
          } catch { /* unknown event — skip */ }
        }

        decoded.sort((a, b) =>
          b.blockNumber - a.blockNumber || b.logIndex - a.logIndex);
        if (!cancelled) {
          setEvents(decoded);
          setFailedChunks(failed);
        }
      } catch { /* RPC unavailable */ }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [contract, deployBlock, refreshKey]);

  return { events, loading, failedChunks };
}
