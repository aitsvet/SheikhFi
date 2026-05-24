import { useEffect, useState } from 'react';

// Public Base Sepolia RPC caps eth_getLogs at ~1000 blocks per call.
// 800 leaves safety headroom against drift / other providers.
const CHUNK = 800;

export function useEvents(contract, deployBlock, refreshKey) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!contract) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const provider = contract.runner?.provider ?? contract.provider;
        const address  = await contract.getAddress();
        const latest   = await provider.getBlockNumber();
        const start    = deployBlock ?? Math.max(0, latest - 50_000);

        // One getLogs call per chunk, filtered only by address — far cheaper
        // than N filters per chunk and avoids the "could not coalesce" path
        // that public RPCs return when overloaded.
        const rawLogs = [];
        for (let from = start; from <= latest; from += CHUNK) {
          if (cancelled) return;
          const to = Math.min(from + CHUNK - 1, latest);
          try {
            const chunk = await provider.getLogs({
              address, fromBlock: from, toBlock: to,
            });
            rawLogs.push(...chunk);
          } catch { /* chunk skipped */ }
        }

        // Decode client-side using the contract interface.
        const decoded = [];
        for (const log of rawLogs) {
          try {
            const parsed = contract.interface.parseLog({
              topics: log.topics, data: log.data,
            });
            if (!parsed) continue;
            decoded.push({
              name:        parsed.name,
              args:        parsed.args,
              blockNumber: log.blockNumber,
              txHash:      log.transactionHash,
              logIndex:    log.index ?? log.logIndex ?? 0,
            });
          } catch { /* unknown event — skip */ }
        }

        // Block timestamps (one call per unique block).
        const tsCache = new Map();
        await Promise.all([...new Set(decoded.map(e => e.blockNumber))].map(async (bn) => {
          try {
            const b = await provider.getBlock(bn);
            tsCache.set(bn, Number(b?.timestamp ?? 0));
          } catch { tsCache.set(bn, 0); }
        }));
        for (const e of decoded) e.timestamp = tsCache.get(e.blockNumber) || 0;

        decoded.sort((a, b) =>
          b.blockNumber - a.blockNumber || b.logIndex - a.logIndex);
        if (!cancelled) setEvents(decoded);
      } catch { /* RPC unavailable */ }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [contract, deployBlock, refreshKey]);

  return { events, loading };
}
