import { TASK_STATUSES, TRANSITIONS } from '../lib/constants.js';
import { parseJsonArray } from '../lib/db.js';

export function canTransition(fromStatus, toStatus, role) {
  if (role === 'admin') return true;

  const allowed = TRANSITIONS[fromStatus] || [];
  if (!allowed.includes(toStatus)) return false;

  if (toStatus === 'Blocked') {
    return role === 'worker' || role === 'manager' || role === 'admin';
  }

  if (fromStatus === 'Backlog' || toStatus === 'Archived') {
    return role === 'manager' || role === 'admin';
  }

  if (fromStatus === 'Ready' || fromStatus === 'InProgress') {
    return role === 'worker' || role === 'admin';
  }

  if (fromStatus === 'InReview') {
    return role === 'manager' || role === 'admin';
  }

  return role === 'admin';
}

export function validateStateGuards(task, proposedStatus, artifactCount = 0, reviewerVerdict = null) {
  if (!TASK_STATUSES.includes(proposedStatus)) {
    return { ok: false, reason: `Invalid status: ${proposedStatus}` };
  }

  if (proposedStatus === 'Ready') {
    if ((task.acceptanceCriteria || []).length < 1) {
      return { ok: false, reason: 'Ready requires at least 1 acceptance criteria' };
    }
    if ((task.definitionOfDone || []).length < 1) {
      return { ok: false, reason: 'Ready requires at least 1 definition of done item' };
    }
    if (!Array.isArray(task.dependencies)) {
      return { ok: false, reason: 'dependencies must be array' };
    }
  }

  if (proposedStatus === 'InReview') {
    if (artifactCount < 1) {
      return { ok: false, reason: 'InProgress -> InReview requires at least one artifact' };
    }
  }

  if (proposedStatus === 'Done') {
    if (reviewerVerdict !== 'pass') {
      return { ok: false, reason: 'InReview -> Done requires reviewer verdict pass' };
    }
  }

  return { ok: true };
}

export function needsDecompose(task, threshold = 4) {
  return typeof task.effort === 'number' && task.effort >= threshold;
}

export function calculatePriorityScore(task) {
  const a = Number(task.priorityModel || 3);
  const b = Number(task.urgency || 3);
  const c = Number(task.riskReduction || 3);
  const e = Number(task.effort || 3);

  return a * 2 + b * 1.5 + c * 1.2 - e * 0.8;
}
