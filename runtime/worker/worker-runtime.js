#!/usr/bin/env node
// Worker runtime stub: receives task payload via stdin or arg and emits artifact json to stdout.

import { readFileSync } from 'node:fs';
import crypto from 'node:crypto';

const input = process.argv[2] ? JSON.parse(process.argv[2]) : (() => {
  try { return JSON.parse(readFileSync(0, 'utf8')); } catch { return {}; }
})();

const taskId = input.taskId || 'unknown';
const summary = `Worker mock artifact for ${taskId}`;
const location = `runtime/artifacts/${taskId}/result.json`;
const checksum = crypto.createHash('sha256').update(`${summary}:${location}`).digest('hex');

const result = {
  taskId,
  ok: true,
  artifact: {
    kind: 'report',
    summary,
    location,
    checksum
  },
  heartbeat: {
    status: 'done',
    timestamp: new Date().toISOString()
  }
};

process.stdout.write(JSON.stringify(result));
