#!/usr/bin/env node
// Reviewer runtime stub: validates worker artifact and returns pass/needs_work.

import { readFileSync } from 'node:fs';

const input = process.argv[2] ? JSON.parse(process.argv[2]) : (() => {
  try { return JSON.parse(readFileSync(0, 'utf8')); } catch { return {}; }
})();

const taskId = input.taskId || 'unknown';
const summary = input.artifact?.summary || '';

const verdict = summary ? 'pass' : 'needs_work';
const result = {
  taskId,
  verdict,
  score: {
    correctness: verdict === 'pass' ? 5 : 2,
    completeness: 4,
    quality: 4,
    risk: 3
  },
  issues: verdict === 'pass' ? [] : [{ type: 'missing', severity: 'medium', description: 'Missing artifact summary' }],
  heartbeat: {
    status: 'reviewed',
    timestamp: new Date().toISOString()
  }
};

process.stdout.write(JSON.stringify(result));
