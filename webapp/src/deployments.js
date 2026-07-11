// Multi-chain deployment registry. Every per-chain snapshot in
// abi/deployments/ is bundled; the active one is picked at runtime from
// localStorage (network selector) with the build-time deployment.json as
// the default.
import bundled from './abi/deployment.json';

const modules = import.meta.glob('./abi/deployments/*.json', { eager: true });

export const DEPLOYMENTS = {};
for (const mod of Object.values(modules)) {
  const dep = mod.default ?? mod;
  if (dep?.chainId && dep?.contractAddress) DEPLOYMENTS[dep.chainId] = dep;
}
if (bundled?.chainId && !DEPLOYMENTS[bundled.chainId]) {
  DEPLOYMENTS[bundled.chainId] = bundled;
}

const KEY = 'sheikhfi:chain';

export function getActiveDeployment() {
  try {
    const pick = localStorage.getItem(KEY);
    if (pick && DEPLOYMENTS[pick]) return DEPLOYMENTS[pick];
  } catch { /* storage unavailable */ }
  return bundled;
}

// Full reload on switch — deliberately simple: every hook rebuilds against
// the newly active deployment.
export function setActiveChain(chainId) {
  try {
    if (String(chainId) === String(bundled.chainId)) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, String(chainId));
  } catch { /* storage unavailable */ }
  location.reload();
}
