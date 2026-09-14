#!/usr/bin/env node
import { execFileSync } from 'node:child_process';

const blockedNames = [
  /^\.env(?:\..*)?$/i,
  /^credentials.*\.json$/i,
  /^service-account.*\.json$/i,
  /^importar_clientes.*\.sql$/i,
  /^exportar_clientes.*\.sql$/i,
  /^clientes-.*\.(csv|xlsx)$/i,
  /\.(pem|key|p12|pfx)$/i,
];

const allowlisted = new Set(['.env.example']);
const staged = execFileSync('git', ['diff', '--cached', '--name-only'], { encoding: 'utf8' })
  .split(/\r?\n/)
  .filter(Boolean);

const blocked = staged.filter((path) => {
  const filename = path.split('/').pop();
  return !allowlisted.has(filename) && blockedNames.some((pattern) => pattern.test(filename));
});

if (blocked.length) {
  console.error('Commit blocked: sensitive file names detected:');
  blocked.forEach((path) => console.error(` - ${path}`));
  console.error('Remove the files from the commit or use a redacted fixture outside production data.');
  process.exit(1);
}

console.log('Sensitive-file name check passed.');
