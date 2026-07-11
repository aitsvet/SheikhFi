// Usage: node scripts/use-deployment.mjs <chainId>
// Makes webapp/src/abi/deployments/<chainId>.json the active deployment
// (copies it over webapp/src/abi/deployment.json, which the webapp imports).

import fs from 'node:fs';

const chainId = process.argv[2];
const src = `webapp/src/abi/deployments/${chainId}.json`;

if (!chainId || !fs.existsSync(src)) {
  const dir = 'webapp/src/abi/deployments';
  const known = fs.existsSync(dir)
    ? fs.readdirSync(dir).filter(f => f.endsWith('.json')).map(f => f.replace('.json', ''))
    : [];
  console.error(`Usage: node scripts/use-deployment.mjs <chainId>`);
  console.error(`Known deployments: ${known.join(', ') || '(none)'}`);
  process.exit(1);
}

fs.copyFileSync(src, 'webapp/src/abi/deployment.json');
const dep = JSON.parse(fs.readFileSync(src));
console.log(`Active deployment → ${dep.network} (chainId ${dep.chainId}), contract ${dep.contractAddress}`);
