import { randomUUID } from 'node:crypto';
import { parseJsonArray, toJsonArray, getDatabase } from '../lib/db.js';
import { calculatePriorityScore, validateStateGuards, canTransition } from '../policy/transition.js';

const db = getDatabase();

function nowIso() {
  return new Date().toISOString();
}


function normalizeActor(actorId) {
  const defaultActor = 'manager-01';
  if (!actorId) return defaultActor;
  const existing = getAgent(actorId);
  return existing ? actorId : defaultActor;
}

export function listTasks() {
  const rows = db.prepare('SELECT * FROM tasks ORDER BY updated_at DESC').all();
  return rows.map(mapTask);
}

export function listTasksByStatus(statuses = []) {
  if (!Array.isArray(statuses) || statuses.length === 0) return listTasks();
  const placeholders = statuses.map(() => '?').join(',');
  return db.prepare(`SELECT * FROM tasks WHERE status IN (${placeholders}) ORDER BY priority_score DESC, updated_at ASC`).all(...statuses).map(mapTask);
}

export function getTask(taskId) {
  const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
  return row ? mapTask(row) : null;
}

export function getTaskCountInProgress(agentId = null) {
  const stmt = agentId
    ? 'SELECT COUNT(*) AS c FROM tasks WHERE assignee_agent_id = ? AND status IN (\'InProgress\', \'InReview\')'
    : 'SELECT COUNT(*) AS c FROM tasks WHERE status IN (\'InProgress\', \'InReview\')';
  return agentId ? db.prepare(stmt).get(agentId).c : db.prepare(stmt).get().c;
}

export function listAgents() {
  return db.prepare('SELECT * FROM agents ORDER BY created_at DESC').all();
}

export function createAgent(input) {
  const id = input.id || `agent-${randomUUID()}`;
  const now = nowIso();
  db.prepare(`INSERT INTO agents (id, name, role, model, prompt, tool_scope, is_active, created_at, updated_at)
             VALUES (@id, @name, @role, @model, @prompt, @toolScope, @isActive, @createdAt, @updatedAt)`)
    .run({
      id,
      name: input.name || 'agent',
      role: input.role || 'worker',
      model: input.model || null,
      prompt: input.prompt || null,
      toolScope: input.toolScope || null,
      isActive: input.isActive ? 1 : 0,
      createdAt: now,
      updatedAt: now
    });
  return getAgent(id);
}

export function getAgent(agentId) {
  return db.prepare('SELECT * FROM agents WHERE id = ?').get(agentId) || null;
}

export function upsertDefaultAgents() {
  const count = db.prepare('SELECT COUNT(*) AS c FROM agents').get()?.c || 0;
  if (count > 0) return;
  const now = nowIso();
  const stmt = db.prepare(`INSERT INTO agents (id, name, role, is_active, created_at, updated_at) VALUES (@id,@name,@role,@isActive,@createdAt,@updatedAt)`);
  stmt.run({ id: 'worker-01', name: 'worker-01', role: 'worker', isActive: 1, createdAt: now, updatedAt: now });
  stmt.run({ id: 'reviewer-01', name: 'reviewer-01', role: 'reviewer', isActive: 1, createdAt: now, updatedAt: now });
  stmt.run({ id: 'manager-01', name: 'manager-01', role: 'manager', isActive: 1, createdAt: now, updatedAt: now });
}

export function createTask(input) {
  const id = input.id || makeTaskId();
  const now = nowIso();
  const status = input.status || 'Backlog';

  const payload = {
    id,
    title: input.title || 'Untitled task',
    description: input.description || '',
    status,
    tags: toJsonArray(input.tags, []),
    type: input.type || 'feature',
    priorityModel: input.priorityModel ?? 3,
    urgency: input.urgency ?? 3,
    riskReduction: input.riskReduction ?? 3,
    effort: input.effort ?? 3,
    mandatory: input.mandatory ? 1 : 0,
    dueDate: input.dueDate || null,
    acceptanceCriteria: toJsonArray(input.acceptanceCriteria, []),
    definitionOfDone: toJsonArray(input.definitionOfDone, []),
    dependencies: toJsonArray(input.dependencies, []),
    parentId: input.parentId || null,
    childIds: toJsonArray(input.childIds, []),
    assigneeAgentId: input.assigneeAgentId || null,
    reviewerAgentId: input.reviewerAgentId || 'reviewer-01',
    lockId: input.lockId || null,
    lockExpiresAt: input.lockExpiresAt || null,
    attemptCount: input.attemptCount ?? 0,
    maxAttempt: input.maxAttempt ?? 3,
    version: 1,
    priorityScore: calculatePriorityScore(input),
    createdAt: now,
    updatedAt: now,
    startedAt: null,
    submittedAt: null,
    completedAt: null,
    cycleTimeMs: null,
    leadTimeMs: null
  };

  const stmt = db.prepare(`INSERT INTO tasks (
    id,title,description,status,tags,type,priority_model,urgency,risk_reduction,effort,priority_score,mandatory,due_date,
    acceptance_criteria,definition_of_done,dependencies,parent_id,child_ids,assignee_agent_id,reviewer_agent_id,lock_id,lock_expires_at,
    attempt_count,max_attempt,version,created_at,updated_at,started_at,submitted_at,completed_at,cycle_time_ms,lead_time_ms
  ) VALUES (@id,@title,@description,@status,@tags,@type,@priorityModel,@urgency,@riskReduction,@effort,@priorityScore,@mandatory,@dueDate,
    @acceptanceCriteria,@definitionOfDone,@dependencies,@parentId,@childIds,@assigneeAgentId,@reviewerAgentId,@lockId,@lockExpiresAt,
    @attemptCount,@maxAttempt,@version,@createdAt,@updatedAt,@startedAt,@submittedAt,@completedAt,@cycleTimeMs,@leadTimeMs)`);

  stmt.run(payload);
  emitDecision({
    taskId: id,
    actorAgentId: input.actorAgentId || 'manager-01',
    action: 'create',
    reason: 'task_created'
  });
  emitEvent({ action: 'create_task', actorAgentId: input.actorAgentId || 'manager-01', entity: 'Task', entityId: id, reason: 'task_created' });
  return getTask(id);
}

export function setTaskAssignee(taskId, agentId) {
  const now = nowIso();
  db.prepare('UPDATE tasks SET assignee_agent_id = ?, updated_at = ? WHERE id = ?').run(agentId, now, taskId);
  emitDecision({
    taskId,
    actorAgentId: 'manager-01',
    action: 'assign',
    reason: `assignee=${agentId}`
  });
}

export function acquireTaskLock(taskId, agentId, ttlSeconds = 1800) {
  const task = getTask(taskId);
  if (!task) return { ok: false, code: 'NOT_FOUND' };
  if (task.lockId && task.lockExpiresAt) {
    const now = nowIso();
    if (task.lockExpiresAt > now && task.lockId !== agentId) {
      return { ok: false, code: 'LOCKED', lockId: task.lockId, lockExpiresAt: task.lockExpiresAt };
    }
  }

  const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
  db.prepare('UPDATE tasks SET lock_id = ?, lock_expires_at = ?, version = version + 1, updated_at = ? WHERE id = ?')
    .run(agentId, expiresAt, nowIso(), taskId);
  emitEvent({ action: 'lock_acquired', actorAgentId: agentId, entity: 'Task', entityId: taskId, reason: `expires_at=${expiresAt}` });
  return { ok: true, lockId: agentId, lockExpiresAt: expiresAt };
}

export function releaseTaskLock(taskId, actorAgentId = 'system') {
  const task = getTask(taskId);
  if (!task) return;
  db.prepare('UPDATE tasks SET lock_id = NULL, lock_expires_at = NULL, version = version + 1, updated_at = ? WHERE id = ?').run(nowIso(), taskId);
  emitEvent({ action: 'lock_released', actorAgentId, entity: 'Task', entityId: taskId, reason: 'released' });
}

export function updateTaskStatus({ taskId, toStatus, actorAgentId = 'system', actorRole = 'manager', reason = null, force = false }) {
  const row = getTask(taskId);
  if (!row) return { ok: false, code: 'NOT_FOUND', reason: 'Task not found' };

  const fromStatus = row.status;
  if (!force) {
    const guard = validateStateGuards(row, toStatus, countArtifacts(taskId), getLatestReviewVerdict(taskId));
    if (!guard.ok) return { ok: false, code: 'GUARD_FAILED', reason: guard.reason };

    if (!canTransition(fromStatus, toStatus, actorRole)) {
      return { ok: false, code: 'FORBIDDEN', reason: 'Transition not allowed for this role' };
    }
  }

  if (force && actorRole !== 'admin') {
    return { ok: false, code: 'FORBIDDEN', reason: 'Forced transition requires admin role' };
  }

  if (fromStatus === 'Ready' && toStatus === 'InProgress' && row.attemptCount >= row.maxAttempt) {
    return { ok: false, code: 'ATTEMPT_EXCEEDED', reason: `maxAttempt ${row.maxAttempt} already reached` };
  }

  const now = nowIso();
  const updateParts = ['status = ?', 'version = version + 1', 'updated_at = ?'];
  const updateValues = [toStatus, now];

  if (toStatus === 'InProgress' && !row.startedAt) {
    updateParts.push('started_at = ?');
    updateValues.push(now);
  }
  if (toStatus === 'InReview') {
    updateParts.push('submitted_at = ?');
    updateValues.push(now);
  }
  if (toStatus === 'Done') {
    updateParts.push('completed_at = ?');
    updateValues.push(now);
  }
  if (fromStatus !== 'InProgress' && toStatus === 'InProgress') {
    updateParts.push('attempt_count = attempt_count + 1');
  }

  const setClause = updateParts.join(', ');
  updateValues.push(taskId);
  db.prepare(`UPDATE tasks SET ${setClause} WHERE id = ?`).run(...updateValues);

  emitDecision({
    taskId,
    actorAgentId,
    fromStatus,
    toStatus,
    action: 'promote',
    reason: reason || `${fromStatus}->${toStatus}`
  });
  emitEvent({ action: 'transition', actorAgentId, entity: 'Task', entityId: taskId, reason: reason || `${fromStatus}->${toStatus}` });

  return { ok: true, task: getTask(taskId) };
}

export function addArtifact(input) {
  const id = input.id || `A-${randomUUID()}`;
  const now = nowIso();
  db.prepare(`INSERT INTO artifacts (id, task_id, kind, location, summary, repro_steps, checksum, created_by_agent_id, created_at)
    VALUES (@id, @taskId, @kind, @location, @summary, @reproSteps, @checksum, @createdByAgentId, @createdAt)`).run({
      id,
      taskId: input.taskId,
      kind: input.kind || 'doc',
      location: input.location || '',
      summary: input.summary || '',
      reproSteps: toJsonArray(input.reproSteps, []),
      checksum: input.checksum || null,
      createdByAgentId: input.createdByAgentId || 'worker-01',
      createdAt: now
    });
  emitEvent({ action: 'artifact_created', actorAgentId: input.createdByAgentId || 'worker-01', entity: 'Artifact', entityId: id, reason: `task=${input.taskId}` });
  return getArtifact(id);
}

export function listArtifacts(taskId) {
  const rows = db.prepare('SELECT * FROM artifacts WHERE task_id = ? ORDER BY created_at DESC').all(taskId);
  return rows.map(mapArtifact);
}

export function addReviewReport(input) {
  const id = input.id || randomUUID();
  const now = nowIso();
  db.prepare(`INSERT INTO review_reports
    (id, task_id, verdict, correctness, completeness, quality, risk, reviewer_agent_id, created_at, updated_at, comments)
    VALUES (@id,@taskId,@verdict,@correctness,@completeness,@quality,@risk,@reviewerAgentId,@createdAt,@updatedAt,@comments)`).run({
      id,
      taskId: input.taskId,
      verdict: input.verdict,
      correctness: input.correctness ?? null,
      completeness: input.completeness ?? null,
      quality: input.quality ?? null,
      risk: input.risk ?? null,
      reviewerAgentId: input.reviewerAgentId || 'reviewer-01',
      createdAt: now,
      updatedAt: now,
      comments: input.comments || ''
    });

  if (Array.isArray(input.issues)) {
    const issueStmt = db.prepare(`INSERT INTO review_issues (id, review_report_id, type, severity, description, created_at)
      VALUES (@id, @reviewReportId, @type, @severity, @description, @createdAt)`);
    for (const issue of input.issues) {
      issueStmt.run({
        id: `${id}-${randomUUID()}`,
        reviewReportId: id,
        type: issue.type,
        severity: issue.severity,
        description: issue.description,
        createdAt: now
      });
    }
  }

  emitEvent({ action: 'review_created', actorAgentId: input.reviewerAgentId || 'reviewer-01', entity: 'ReviewReport', entityId: id, reason: `verdict=${input.verdict}` });
  return getReviewReport(id);
}

export function listReviewReports(taskId) {
  return db.prepare('SELECT * FROM review_reports WHERE task_id = ? ORDER BY created_at DESC').all(taskId);
}

export function emitDecision(input) {
  const id = randomUUID();
  db.prepare(`INSERT INTO decisions (id, task_id, actor_agent_id, from_status, to_status, action, reason, details, created_at)
    VALUES (@id, @taskId, @actorAgentId, @fromStatus, @toStatus, @action, @reason, @details, @createdAt)`)
    .run({
      id,
      taskId: input.taskId,
      actorAgentId: normalizeActor(input.actorAgentId),
      fromStatus: input.fromStatus || null,
      toStatus: input.toStatus || null,
      action: input.action,
      reason: input.reason || null,
      details: JSON.stringify(input.details || {}),
      createdAt: nowIso()
    });
}

export function listAuditEvents(limit = 100) {
  return db.prepare('SELECT * FROM audit_events ORDER BY created_at DESC LIMIT ?').all(limit);
}

export function listDecisionEvents(taskId = null) {
  if (!taskId) return db.prepare('SELECT * FROM decisions ORDER BY created_at DESC').all();
  return db.prepare('SELECT * FROM decisions WHERE task_id = ? ORDER BY created_at DESC').all(taskId);
}

export function listBlockedTasks() {
  return listTasksByStatus(['Blocked']);
}

function emitEvent({ action, actorAgentId, entity, entityId, reason }) {
  const id = randomUUID();
  db.prepare(`INSERT INTO audit_events (id, actor_agent_id, action, entity, entity_id, payload, reason, created_at)
    VALUES (@id, @actorAgentId, @action, @entity, @entityId, @payload, @reason, @createdAt)`)
    .run({
      id,
      actorAgentId: normalizeActor(actorAgentId),
      action,
      entity,
      entityId,
      payload: JSON.stringify({ action, reason }),
      reason,
      createdAt: nowIso()
    });
}

function getLatestReviewVerdict(taskId) {
  const row = db.prepare('SELECT verdict FROM review_reports WHERE task_id = ? ORDER BY created_at DESC LIMIT 1').get(taskId);
  return row?.verdict || null;
}

function countArtifacts(taskId) {
  return db.prepare('SELECT COUNT(*) AS c FROM artifacts WHERE task_id = ?').get(taskId)?.c || 0;
}

function makeTaskId() {
  const y = new Date().getFullYear();
  const rand = String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0');
  return `T-${y}-${rand}`;
}

function getArtifact(id) {
  return mapArtifact(db.prepare('SELECT * FROM artifacts WHERE id = ?').get(id));
}

function getReviewReport(id) {
  return db.prepare('SELECT * FROM review_reports WHERE id = ?').get(id);
}

function mapTask(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
    tags: parseJsonArray(row.tags),
    type: row.type,
    priorityModel: row.priority_model,
    urgency: row.urgency,
    riskReduction: row.risk_reduction,
    effort: row.effort,
    priorityScore: row.priority_score,
    mandatory: !!row.mandatory,
    dueDate: row.due_date,
    acceptanceCriteria: parseJsonArray(row.acceptance_criteria),
    definitionOfDone: parseJsonArray(row.definition_of_done),
    dependencies: parseJsonArray(row.dependencies),
    parentId: row.parent_id,
    childIds: parseJsonArray(row.child_ids),
    assigneeAgentId: row.assignee_agent_id,
    reviewerAgentId: row.reviewer_agent_id,
    lockId: row.lock_id,
    lockExpiresAt: row.lock_expires_at,
    attemptCount: row.attempt_count,
    maxAttempt: row.max_attempt,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    startedAt: row.started_at,
    submittedAt: row.submitted_at,
    completedAt: row.completed_at,
    cycleTimeMs: row.cycle_time_ms,
    leadTimeMs: row.lead_time_ms
  };
}

function mapArtifact(row) {
  return {
    id: row.id,
    taskId: row.task_id,
    kind: row.kind,
    location: row.location,
    summary: row.summary,
    reproSteps: parseJsonArray(row.repro_steps),
    checksum: row.checksum,
    createdByAgentId: row.created_by_agent_id,
    createdAt: row.created_at
  };
}

upsertDefaultAgents();
