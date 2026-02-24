import { spawn } from 'node:child_process';
import path from 'node:path';

const args = process.argv.slice(2);

if (args.includes('--serve-web')) {
  const dir = path.resolve(process.cwd(), '..', 'web');
  const command = `npx -y http-server "${dir}" -p 4173 -c-1`;
  console.log('Starting web dashboard on http://localhost:4173');
  // Best-effort; keep separate process for local usage.
  spawn(command, { shell: true, stdio: 'inherit' });
}

import './api/server.js';
