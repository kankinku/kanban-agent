import { isOrchestratorPaused } from './control.js';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  listTasksByStatus,
  updateTaskStatus,
  setTaskAssignee,
  getTaskCountInProgress,
  addArtifact,
  addReviewReport
} from './services/kanbanService.js';

const MAX_WIP_PER_AGENT = Number(process.env.KANBAN_MAX_WIP_PER_AGENT || 2);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const WORKER_AGENT_ID = process.env.KANBAN_WORKER_AGENT_ID || 'worker-01';
const REVIEWER_AGENT_ID = process.env.KANBAN_REVIEWER_AGENT_ID || 'reviewer-01';
const MANAGER_AGENT_ID = process.env.KANBAN_MANAGER_AGENT_ID || 'manager-01';

const runtimeBase = path.join(ROOT_DIR, '..', 'runtime');

const runtimeFiles = {
  worker: path.join(runtimeBase, 'worker', 'worker-runtime.js'),
  reviewer: path.join(runtimeBase, 'reviewer', 'reviewer-runtime.js'),
  manager: path.join(runtimeBase, 'manager', 'manager-runtime.js')
};

export function runCycle() {
  if (isOrchestratorPaused()) {
    return { ok: true, moved: 0, reason: 'orchestrator_paused' };
  }

  const inProgress = getTaskCountInProgress(WORKER_AGENT_ID);
  const slots = Math.max(0, MAX_WIP_PER_AGENT - inProgress);
  if (slots === 0) {
    return { ok: true, moved: 0, reason: 'No WIP slots' };
  }

  const ready = listTasksByStatus(['Ready']).slice(0, slots);
  const reports = [];

  for (const task of ready) {
    const started = updateTaskStatus({
      taskId: task.id,
      toStatus: 'InProgress',
      actorRole: 'worker',
      actorAgentId: WORKER_AGENT_ID,
      reason: 'orchestrator_dispatch'
    });
    if (!started.ok) {
      reports.push({ taskId: task.id, step: 'dispatch', ok: false, reason: started.reason });
      continue;
    }

    setTaskAssignee(task.id, WORKER_AGENT_ID);
    const workerOut = runRuntime(runtimeFiles.worker, { taskId: task.id, task });

    if (workerOut?.ok === false) {
      reports.push({ taskId: task.id, step: 'worker', ok: false, reason: workerOut.reason || 'worker failed' });
      continue;
    }

    addArtifact({
      taskId: task.id,
      kind: workerOut.artifact?.kind || 'report',
      location: workerOut.artifact?.location || `runtime/${task.id}/artifact.json`,
      summary: workerOut.artifact?.summary || 'worker artifact',
      createdByAgentId: WORKER_AGENT_ID
    });

    const toReview = updateTaskStatus({
      taskId: task.id,
      toStatus: 'InReview',
      actorRole: 'worker',
      actorAgentId: WORKER_AGENT_ID,
      reason: 'worker_complete_auto_submit'
    });
    if (!toReview.ok) {
      reports.push({ taskId: task.id, step: 'submit', ok: false, reason: toReview.reason });
      continue;
    }

    const reviewOut = runRuntime(runtimeFiles.reviewer, { taskId: task.id, artifact: workerOut.artifact || {} });
    addReviewReport({
      taskId: task.id,
      verdict: reviewOut.verdict || 'needs_work',
      correctness: reviewOut.score?.correctness,
      completeness: reviewOut.score?.completeness,
      quality: reviewOut.score?.quality,
      risk: reviewOut.score?.risk,
      reviewerAgentId: REVIEWER_AGENT_ID,
      comments: reviewOut.verdict === 'pass' ? 'auto-reviewed pass' : 'auto-reviewed needs_work',
      issues: reviewOut.issues || []
    });

    const managerOut = runRuntime(runtimeFiles.manager, { taskId: task.id, verdict: reviewOut.verdict || 'needs_work' });
    if (managerOut.toStatus === 'Done') {
      const done = updateTaskStatus({
        taskId: task.id,
        toStatus: 'Done',
        actorRole: 'manager',
        actorAgentId: MANAGER_AGENT_ID,
        reason: 'auto_approved'
      });
      reports.push({ taskId: task.id, ok: done.ok, step: 'approve', status: done.ok ? 'Done' : 'Blocked' });
    } else {
      const block = updateTaskStatus({
        taskId: task.id,
        toStatus: 'Blocked',
        actorRole: 'manager',
        actorAgentId: MANAGER_AGENT_ID,
        reason: 'needs_work'
      });
      reports.push({ taskId: task.id, ok: block.ok, step: block.ok ? 'block' : 'transition_failed', status: block.ok ? 'Blocked' : block.reason });
    }
  }

  return { ok: true, moved: ready.length, reason: 'cycle_executed', reports };
}

function runRuntime(scriptPath, payload) {
  const result = spawnSync('node', [scriptPath, JSON.stringify(payload)], { encoding: 'utf8' });
  const text = (result.stdout || '').trim();
  const stderr = (result.stderr || '').trim();

  if (result.error) {
    return {
      ok: false,
      verdict: 'needs_work',
      reason: `runtime spawn error: ${result.error.message}`,
      issues: [{ type: 'missing', severity: 'high', description: String(result.error.message) }]
    };
  }

  if (!text) {
    return {
      ok: false,
      verdict: 'needs_work',
      reason: `runtime output empty (exit ${result.status}, err ${stderr || 'none'})`,
      issues: [{
        type: 'missing',
        severity: 'medium',
        description: `runtime output empty: ${stderr || 'none'}`
      }]
    };
  }

  try {
    const parsed = JSON.parse(text);
    return { ...parsed, ok: parsed.ok ?? true };
  } catch (error) {
    return {
      ok: false,
      verdict: 'needs_work',
      reason: `runtime parse failed: ${error.message} :: ${stderr || 'stderr-empty'} :: payload=${text}`,
      issues: [{ type: 'missing', severity: 'high', description: `runtime parse failed: ${error.message}` }]
    };
  }
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const report = runCycle();
  console.log(JSON.stringify(report));
}
