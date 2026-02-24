#!/usr/bin/env node
// Worker runtime stub: receives task payload via stdin or arg and emits artifact json to stdout.

import { readFileSync } from 'node:fs';

const input = process.argv[2] ? JSON.parse(process.argv[2]) : (() => {
  try { return JSON.parse(readFileSync(0, 'utf8')); } catch { return {}; }
})();

const taskId = input.taskId || 'unknown';
const result = {
  taskId,
  ok: true,
  artifact: {
    kind: 'report',
    summary: `Worker mock artifact for ${taskId}`,
    location: `/tmp/artifacts/${taskId}/result.md`
  },
  heartbeat: {
    status: 'done',
    timestamp: new Date().toISOString()
  }
};

process.stdout.write(JSON.stringify(result));
