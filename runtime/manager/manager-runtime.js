#!/usr/bin/env node
// Manager runtime stub: receives reviewer report and decides final action.

import { readFileSync } from 'node:fs';

const input = process.argv[2] ? JSON.parse(process.argv[2]) : (() => {
  try { return JSON.parse(readFileSync(0, 'utf8')); } catch { return {}; }
})();

const taskId = input.taskId || 'unknown';
const verdict = input.verdict || 'needs_work';

const result = {
  taskId,
  action: verdict === 'pass' ? 'approve' : 'request_rework',
  toStatus: verdict === 'pass' ? 'Done' : 'Blocked',
  reason: verdict === 'pass' ? 'Reviewer passed; safe to accept.' : 'Reviewer requested remediation.'
};

process.stdout.write(JSON.stringify(result));
