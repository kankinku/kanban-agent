const __importMetaResolver = require('url').pathToFileURL(__filename).href;
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// src/index.js
var import_node_child_process5 = require("node:child_process");

// src/api/server.js
var import_node_http = require("node:http");
var import_node_child_process4 = require("node:child_process");
var import_node_fs2 = require("node:fs");
var import_node_path3 = require("node:path");
var import_node_url3 = require("node:url");

// src/services/kanbanService.js
var import_node_crypto = require("node:crypto");

// src/lib/db.js
var import_better_sqlite3 = __toESM(require("better-sqlite3"), 1);
var import_node_fs = require("node:fs");
var import_node_path = require("node:path");
var import_node_url = require("node:url");
var __filename = (0, import_node_url.fileURLToPath)(__importMetaResolver);
var __dirname = (0, import_node_path.dirname)(__filename);
var isPkg = typeof process.pkg !== "undefined";
var DEFAULT_DB_PATH = isPkg ? (0, import_node_path.join)((0, import_node_path.dirname)(process.execPath), "data", "kanban.db") : (0, import_node_path.join)(__dirname, "data", "kanban.db");
var schemaPath = isPkg ? (0, import_node_path.join)((0, import_node_path.dirname)(process.execPath), "schema.sql") : (0, import_node_path.join)(__dirname, "../models/schema.sql");
function getDatabase(dbPath = process.env.KANBAN_DB_PATH || DEFAULT_DB_PATH) {
  const dir = (0, import_node_path.dirname)(dbPath);
  if (!(0, import_node_fs.existsSync)(dir)) (0, import_node_fs.mkdirSync)(dir, { recursive: true });
  const db3 = new import_better_sqlite3.default(dbPath);
  db3.pragma("foreign_keys = ON");
  const schemaSql = (0, import_node_fs.readFileSync)(schemaPath, "utf-8");
  db3.exec(schemaSql);
  return db3;
}
function parseJsonArray(raw, fallback = []) {
  try {
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}
function toJsonArray(value, fallback = []) {
  return JSON.stringify(Array.isArray(value) ? value : fallback);
}

// src/lib/constants.js
var TASK_STATUSES = ["Backlog", "Ready", "InProgress", "InReview", "Blocked", "Done", "Archived"];
var TRANSITIONS = {
  Backlog: ["Ready", "Blocked"],
  Ready: ["InProgress", "Blocked"],
  InProgress: ["InReview", "Blocked"],
  InReview: ["Done", "Backlog", "Ready", "Blocked"],
  Blocked: ["Backlog", "Ready", "InProgress", "InReview", "Done", "Archived"],
  Done: ["Archived", "Blocked"],
  Archived: []
};

// src/policy/transition.js
function canTransition(fromStatus, toStatus, role) {
  if (role === "admin") return true;
  const allowed = TRANSITIONS[fromStatus] || [];
  if (!allowed.includes(toStatus)) return false;
  if (toStatus === "Blocked") {
    return role === "worker" || role === "manager" || role === "admin";
  }
  if (fromStatus === "Backlog" || toStatus === "Archived") {
    return role === "manager" || role === "admin";
  }
  if (fromStatus === "Ready" || fromStatus === "InProgress") {
    return role === "worker" || role === "admin";
  }
  if (fromStatus === "InReview") {
    return role === "manager" || role === "admin";
  }
  return role === "admin";
}
function validateStateGuards(task, proposedStatus, artifactCount = 0, reviewerVerdict = null) {
  if (!TASK_STATUSES.includes(proposedStatus)) {
    return { ok: false, reason: `Invalid status: ${proposedStatus}` };
  }
  if (proposedStatus === "Ready") {
    if ((task.acceptanceCriteria || []).length < 1) {
      return { ok: false, reason: "Ready requires at least 1 acceptance criteria" };
    }
    if ((task.definitionOfDone || []).length < 1) {
      return { ok: false, reason: "Ready requires at least 1 definition of done item" };
    }
    if (!Array.isArray(task.dependencies)) {
      return { ok: false, reason: "dependencies must be array" };
    }
  }
  if (proposedStatus === "InReview") {
    if (artifactCount < 1) {
      return { ok: false, reason: "InProgress -> InReview requires at least one artifact" };
    }
  }
  if (proposedStatus === "Done") {
    if (reviewerVerdict !== "pass") {
      return { ok: false, reason: "InReview -> Done requires reviewer verdict pass" };
    }
  }
  return { ok: true };
}
function calculatePriorityScore(task) {
  const a = Number(task.priorityModel || 3);
  const b = Number(task.urgency || 3);
  const c = Number(task.riskReduction || 3);
  const e = Number(task.effort || 3);
  return a * 2 + b * 1.5 + c * 1.2 - e * 0.8;
}

// src/services/kanbanService.js
var db = getDatabase();
function nowIso() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
function normalizeActor(actorId) {
  const defaultActor = "manager-01";
  if (!actorId) return defaultActor;
  const existing = getAgent(actorId);
  return existing ? actorId : defaultActor;
}
function listTasks() {
  const rows = db.prepare("SELECT * FROM tasks ORDER BY updated_at DESC").all();
  return rows.map(mapTask);
}
function listTasksByStatus(statuses = []) {
  if (!Array.isArray(statuses) || statuses.length === 0) return listTasks();
  const placeholders = statuses.map(() => "?").join(",");
  return db.prepare(`SELECT * FROM tasks WHERE status IN (${placeholders}) ORDER BY priority_score DESC, updated_at ASC`).all(...statuses).map(mapTask);
}
function getTask(taskId) {
  const row = db.prepare("SELECT * FROM tasks WHERE id = ?").get(taskId);
  return row ? mapTask(row) : null;
}
function getTaskCountInProgress(agentId = null) {
  return db.prepare("SELECT COUNT(*) AS c FROM tasks WHERE status IN ('InProgress', 'InReview')").get().c;
}
function listAgents() {
  return db.prepare("SELECT * FROM agents ORDER BY created_at DESC").all();
}
function createAgent(input) {
  const id = input.id || `agent-${(0, import_node_crypto.randomUUID)()}`;
  const now = nowIso();
  db.prepare(`INSERT INTO agents (id, name, role, model, prompt, tool_scope, is_active, created_at, updated_at)
             VALUES (@id, @name, @role, @model, @prompt, @toolScope, @isActive, @createdAt, @updatedAt)`).run({
    id,
    name: input.name || "agent",
    role: input.role || "worker",
    model: input.model || null,
    prompt: input.prompt || null,
    toolScope: input.toolScope || null,
    isActive: input.isActive ? 1 : 0,
    createdAt: now,
    updatedAt: now
  });
  return getAgent(id);
}
function getAgent(agentId) {
  return db.prepare("SELECT * FROM agents WHERE id = ?").get(agentId) || null;
}
function updateAgent(agentId, input) {
  const now = nowIso();
  db.prepare(`UPDATE agents SET name=@name, role=@role, model=@model, prompt=@prompt,
    tool_scope=@toolScope, is_active=@isActive, updated_at=@updatedAt WHERE id=@id`).run({
    id: agentId,
    name: input.name,
    role: input.role,
    model: input.model || null,
    prompt: input.prompt || null,
    toolScope: input.toolScope || null,
    isActive: input.isActive !== false ? 1 : 0,
    updatedAt: now
  });
  return getAgent(agentId);
}
function deleteAgent(agentId) {
  db.prepare("DELETE FROM agents WHERE id = ?").run(agentId);
  return { deleted: agentId };
}
function upsertDefaultAgents() {
  const now = nowIso();
  const stmt = db.prepare(`INSERT OR IGNORE INTO agents (id, name, role, model, prompt, is_active, created_at, updated_at) VALUES (@id,@name,@role,@model,@prompt,@isActive,@createdAt,@updatedAt)`);
  stmt.run({
    id: "pm-01",
    name: "\uD504\uB85C\uC81D\uD2B8 \uB9E4\uB2C8\uC800",
    role: "manager",
    model: "gemini-2.0-flash",
    prompt: "\uD504\uB85C\uC81D\uD2B8 \uC124\uBA85\uC744 \uC77D\uACE0 \uC2E4\uD589 \uAC00\uB2A5\uD55C \uC791\uC5C5(Task)\uC73C\uB85C \uBD84\uD574\uD558\uC5EC Backlog\uC5D0 \uB4F1\uB85D\uD569\uB2C8\uB2E4. \uAC01 \uC791\uC5C5\uC740 \uBA85\uD655\uD55C \uD1B5\uACFC \uAE30\uC900(Acceptance Criteria)\uC744 \uD3EC\uD568\uD574\uC57C \uD569\uB2C8\uB2E4.",
    isActive: 1,
    createdAt: now,
    updatedAt: now
  });
  stmt.run({
    id: "worker-01",
    name: "Feature Worker",
    role: "worker",
    model: "codex",
    prompt: "\uD560\uB2F9\uB41C \uAC1C\uBC1C \uC791\uC5C5\uC744 \uAD6C\uD604\uD558\uACE0 \uC0B0\uCD9C\uBB3C(\uCF54\uB4DC, \uBB38\uC11C)\uC744 \uC81C\uCD9C\uD569\uB2C8\uB2E4.",
    isActive: 1,
    createdAt: now,
    updatedAt: now
  });
  stmt.run({
    id: "reviewer-01",
    name: "Code Reviewer",
    role: "reviewer",
    model: "gemini-2.0-flash",
    prompt: "\uC81C\uCD9C\uB41C \uC0B0\uCD9C\uBB3C\uC744 \uAC80\uD1A0\uD558\uACE0 \uD1B5\uACFC \uAE30\uC900 \uCDA9\uC871 \uC5EC\uBD80\uB97C \uD310\uB2E8\uD569\uB2C8\uB2E4.",
    isActive: 1,
    createdAt: now,
    updatedAt: now
  });
  stmt.run({
    id: "manager-01",
    name: "Decision Manager",
    role: "manager",
    model: "gpt-4o-mini",
    prompt: "\uB9AC\uBDF0 \uACB0\uACFC\uB97C \uBC14\uD0D5\uC73C\uB85C \uC791\uC5C5\uC744 \uC644\uB8CC \uCC98\uB9AC\uD558\uAC70\uB098 \uC7AC\uC791\uC5C5\uC744 \uC9C0\uC2DC\uD569\uB2C8\uB2E4.",
    isActive: 1,
    createdAt: now,
    updatedAt: now
  });
}
function createTask(input) {
  const id = input.id || makeTaskId();
  const now = nowIso();
  const status = input.status || "Backlog";
  const payload = {
    id,
    title: input.title || "Untitled task",
    description: input.description || "",
    status,
    tags: toJsonArray(input.tags, []),
    type: input.type || "feature",
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
    reviewerAgentId: input.reviewerAgentId || "reviewer-01",
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
    actorAgentId: input.actorAgentId || "manager-01",
    action: "create",
    reason: "task_created"
  });
  emitEvent({ action: "create_task", actorAgentId: input.actorAgentId || "manager-01", entity: "Task", entityId: id, reason: "task_created" });
  return getTask(id);
}
function setTaskAssignee(taskId, agentId) {
  const now = nowIso();
  db.prepare("UPDATE tasks SET assignee_agent_id = ?, updated_at = ? WHERE id = ?").run(agentId, now, taskId);
  emitDecision({
    taskId,
    actorAgentId: "manager-01",
    action: "assign",
    reason: `assignee=${agentId}`
  });
}
function acquireTaskLock(taskId, agentId, ttlSeconds = 1800) {
  const task = getTask(taskId);
  if (!task) return { ok: false, code: "NOT_FOUND" };
  if (task.lockId && task.lockExpiresAt) {
    const now = nowIso();
    if (task.lockExpiresAt > now && task.lockId !== agentId) {
      return { ok: false, code: "LOCKED", lockId: task.lockId, lockExpiresAt: task.lockExpiresAt };
    }
  }
  const expiresAt = new Date(Date.now() + ttlSeconds * 1e3).toISOString();
  db.prepare("UPDATE tasks SET lock_id = ?, lock_expires_at = ?, version = version + 1, updated_at = ? WHERE id = ?").run(agentId, expiresAt, nowIso(), taskId);
  emitEvent({ action: "lock_acquired", actorAgentId: agentId, entity: "Task", entityId: taskId, reason: `expires_at=${expiresAt}` });
  return { ok: true, lockId: agentId, lockExpiresAt: expiresAt };
}
function releaseTaskLock(taskId, actorAgentId = "system") {
  const task = getTask(taskId);
  if (!task) return;
  db.prepare("UPDATE tasks SET lock_id = NULL, lock_expires_at = NULL, version = version + 1, updated_at = ? WHERE id = ?").run(nowIso(), taskId);
  emitEvent({ action: "lock_released", actorAgentId, entity: "Task", entityId: taskId, reason: "released" });
}
function updateTaskStatus({ taskId, toStatus, actorAgentId = "system", actorRole = "manager", reason = null, force = false }) {
  const row = getTask(taskId);
  if (!row) return { ok: false, code: "NOT_FOUND", reason: "Task not found" };
  const fromStatus = row.status;
  if (!force) {
    const guard = validateStateGuards(row, toStatus, countArtifacts(taskId), getLatestReviewVerdict(taskId));
    if (!guard.ok) return { ok: false, code: "GUARD_FAILED", reason: guard.reason };
    if (!canTransition(fromStatus, toStatus, actorRole)) {
      return { ok: false, code: "FORBIDDEN", reason: "Transition not allowed for this role" };
    }
  }
  if (force && actorRole !== "admin") {
    return { ok: false, code: "FORBIDDEN", reason: "Forced transition requires admin role" };
  }
  if (fromStatus === "Ready" && toStatus === "InProgress" && row.attemptCount >= row.maxAttempt) {
    return { ok: false, code: "ATTEMPT_EXCEEDED", reason: `maxAttempt ${row.maxAttempt} already reached` };
  }
  const now = nowIso();
  const updateParts = ["status = ?", "version = version + 1", "updated_at = ?"];
  const updateValues = [toStatus, now];
  if (toStatus === "InProgress" && !row.startedAt) {
    updateParts.push("started_at = ?");
    updateValues.push(now);
  }
  if (toStatus === "InReview") {
    updateParts.push("submitted_at = ?");
    updateValues.push(now);
  }
  if (toStatus === "Done") {
    updateParts.push("completed_at = ?");
    updateValues.push(now);
  }
  if (fromStatus !== "InProgress" && toStatus === "InProgress") {
    updateParts.push("attempt_count = attempt_count + 1");
  }
  const setClause = updateParts.join(", ");
  updateValues.push(taskId);
  db.prepare(`UPDATE tasks SET ${setClause} WHERE id = ?`).run(...updateValues);
  emitDecision({
    taskId,
    actorAgentId,
    fromStatus,
    toStatus,
    action: "promote",
    reason: reason || `${fromStatus}->${toStatus}`
  });
  emitEvent({ action: "transition", actorAgentId, entity: "Task", entityId: taskId, reason: reason || `${fromStatus}->${toStatus}` });
  return { ok: true, task: getTask(taskId) };
}
function computeArtifactChecksum(content) {
  return (0, import_node_crypto.createHash)("sha256").update(String(content || "")).digest("hex");
}
function addArtifact(input) {
  const id = input.id || `A-${(0, import_node_crypto.randomUUID)()}`;
  const now = nowIso();
  const checksumBase = input.content || `${input.summary || ""}:${input.location || ""}`;
  const checksum = input.checksum || computeArtifactChecksum(checksumBase);
  db.prepare(`INSERT INTO artifacts (id, task_id, kind, location, summary, repro_steps, checksum, created_by_agent_id, created_at)
    VALUES (@id, @taskId, @kind, @location, @summary, @reproSteps, @checksum, @createdByAgentId, @createdAt)`).run({
    id,
    taskId: input.taskId,
    kind: input.kind || "doc",
    location: input.location || "",
    summary: input.summary || "",
    reproSteps: toJsonArray(input.reproSteps, []),
    checksum,
    createdByAgentId: input.createdByAgentId || "worker-01",
    createdAt: now
  });
  emitEvent({ action: "artifact_created", actorAgentId: input.createdByAgentId || "worker-01", entity: "Artifact", entityId: id, reason: `task=${input.taskId}` });
  return getArtifact(id);
}
function listArtifacts(taskId) {
  const rows = db.prepare("SELECT * FROM artifacts WHERE task_id = ? ORDER BY created_at DESC").all(taskId);
  return rows.map(mapArtifact);
}
function addReviewReport(input) {
  const id = input.id || (0, import_node_crypto.randomUUID)();
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
    reviewerAgentId: input.reviewerAgentId || "reviewer-01",
    createdAt: now,
    updatedAt: now,
    comments: input.comments || ""
  });
  if (Array.isArray(input.issues)) {
    const issueStmt = db.prepare(`INSERT INTO review_issues (id, review_report_id, type, severity, description, created_at)
      VALUES (@id, @reviewReportId, @type, @severity, @description, @createdAt)`);
    for (const issue of input.issues) {
      issueStmt.run({
        id: `${id}-${(0, import_node_crypto.randomUUID)()}`,
        reviewReportId: id,
        type: issue.type,
        severity: issue.severity,
        description: issue.description,
        createdAt: now
      });
    }
  }
  emitEvent({ action: "review_created", actorAgentId: input.reviewerAgentId || "reviewer-01", entity: "ReviewReport", entityId: id, reason: `verdict=${input.verdict}` });
  return getReviewReport(id);
}
function listReviewReports(taskId) {
  return db.prepare("SELECT * FROM review_reports WHERE task_id = ? ORDER BY created_at DESC").all(taskId);
}
function listAllReviewReports(limit = 100) {
  return db.prepare("SELECT * FROM review_reports ORDER BY created_at DESC LIMIT ?").all(limit);
}
function emitDecision(input) {
  const id = (0, import_node_crypto.randomUUID)();
  db.prepare(`INSERT INTO decisions (id, task_id, actor_agent_id, from_status, to_status, action, reason, details, created_at)
    VALUES (@id, @taskId, @actorAgentId, @fromStatus, @toStatus, @action, @reason, @details, @createdAt)`).run({
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
function listAuditEvents(limit = 100) {
  return db.prepare("SELECT * FROM audit_events ORDER BY created_at DESC LIMIT ?").all(limit);
}
function listDecisionEvents(taskId = null) {
  if (!taskId) return db.prepare("SELECT * FROM decisions ORDER BY created_at DESC").all();
  return db.prepare("SELECT * FROM decisions WHERE task_id = ? ORDER BY created_at DESC").all(taskId);
}
function listBlockedTasks() {
  return listTasksByStatus(["Blocked"]);
}
function emitEvent({ action, actorAgentId, entity, entityId, reason }) {
  const id = (0, import_node_crypto.randomUUID)();
  db.prepare(`INSERT INTO audit_events (id, actor_agent_id, action, entity, entity_id, payload, reason, created_at)
    VALUES (@id, @actorAgentId, @action, @entity, @entityId, @payload, @reason, @createdAt)`).run({
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
  const row = db.prepare("SELECT verdict FROM review_reports WHERE task_id = ? ORDER BY created_at DESC LIMIT 1").get(taskId);
  return row?.verdict || null;
}
function countArtifacts(taskId) {
  return db.prepare("SELECT COUNT(*) AS c FROM artifacts WHERE task_id = ?").get(taskId)?.c || 0;
}
function makeTaskId() {
  const y = (/* @__PURE__ */ new Date()).getFullYear();
  const rand = String(Math.floor(Math.random() * 1e6)).padStart(6, "0");
  return `T-${y}-${rand}`;
}
function getArtifact(id) {
  return mapArtifact(db.prepare("SELECT * FROM artifacts WHERE id = ?").get(id));
}
function getReviewReport(id) {
  return db.prepare("SELECT * FROM review_reports WHERE id = ?").get(id);
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

// src/control.js
var state = {
  orchestratorPaused: false
};
function isOrchestratorPaused() {
  return state.orchestratorPaused;
}
function setOrchestratorPaused(paused) {
  state.orchestratorPaused = Boolean(paused);
  return { ok: true, orchestratorPaused: state.orchestratorPaused };
}
function orchestratorStatus() {
  return { orchestratorPaused: state.orchestratorPaused };
}

// src/orchestrator.js
var import_node_path2 = __toESM(require("node:path"), 1);
var import_node_url2 = require("node:url");
var import_node_crypto4 = __toESM(require("node:crypto"), 1);

// src/services/secretService.js
var import_node_crypto3 = require("node:crypto");

// src/lib/security.js
var import_node_crypto2 = __toESM(require("node:crypto"), 1);
var ENC_KEY = process.env.KANBAN_SECRET_KEY;
var ALGO = "aes-256-gcm";
var IV_LEN = 12;
function getKey() {
  if (!ENC_KEY) return null;
  const buf = Buffer.from(ENC_KEY, "hex");
  if (buf.length !== 32) return null;
  return buf;
}
function encryptValue(plainText) {
  const key = getKey();
  if (!key) return plainText;
  const iv = import_node_crypto2.default.randomBytes(IV_LEN);
  const cipher = import_node_crypto2.default.createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(String(plainText)), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}
function decryptValue(payload) {
  const key = getKey();
  if (!key) return payload;
  try {
    const [ivHex, tagHex, dataHex] = String(payload).split(":");
    const decipher = import_node_crypto2.default.createDecipheriv(ALGO, key, Buffer.from(ivHex, "hex"));
    decipher.setAuthTag(Buffer.from(tagHex, "hex"));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(dataHex, "hex")),
      decipher.final()
    ]);
    return decrypted.toString("utf8");
  } catch {
    return "[DECRYPT_FAILED]";
  }
}
function maskSecret(value) {
  const s = String(value || "");
  if (!s) return "";
  if (s.length <= 8) return "***";
  return `${s.slice(0, 3)}***${s.slice(-3)}`;
}

// src/services/secretService.js
var db2 = getDatabase();
function saveSecret(input) {
  const id = input.id || `secret-${(0, import_node_crypto3.randomUUID)()}`;
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const encrypted = encryptValue(input.value);
  db2.prepare(`INSERT INTO secrets (id, provider, key_name, encrypted_value, metadata, created_at, updated_at)
    VALUES (@id, @provider, @keyName, @encryptedValue, @metadata, @createdAt, @updatedAt)`).run({
    id,
    provider: input.provider,
    keyName: input.keyName,
    encryptedValue: encrypted,
    metadata: JSON.stringify(input.metadata || {}),
    createdAt: now,
    updatedAt: now
  });
  return { id, provider: input.provider, keyName: input.keyName, createdAt: now };
}
function listSecrets() {
  const rows = db2.prepare("SELECT id, provider, key_name, encrypted_value, metadata, created_at, updated_at FROM secrets ORDER BY updated_at DESC").all();
  return rows.map((r) => ({
    id: r.id,
    provider: r.provider,
    keyName: r.key_name,
    value: maskSecret(decryptValue(r.encrypted_value)),
    metadata: toJsonArraySafe(r.metadata),
    createdAt: r.created_at,
    updatedAt: r.updated_at
  }));
}
function getSecret(id) {
  const row = db2.prepare("SELECT * FROM secrets WHERE id = ?").get(id);
  if (!row) return null;
  return {
    id: row.id,
    provider: row.provider,
    keyName: row.key_name,
    value: decryptValue(row.encrypted_value),
    metadata: toJsonArraySafe(row.metadata),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
function deleteSecret(id) {
  return db2.prepare("DELETE FROM secrets WHERE id = ?").run(id).changes;
}
function toJsonArraySafe(raw) {
  try {
    return JSON.parse(raw || "{}");
  } catch {
    return {};
  }
}

// src/providers/openai.js
var OPENAI_API_BASE = "https://api.openai.com/v1";
function getApiKey() {
  try {
    const s = getSecret("openai-api-key");
    if (s?.value) return s.value;
  } catch {
  }
  return process.env.OPENAI_API_KEY || null;
}
async function callOpenAI({ prompt, model = "gpt-4o-mini", maxTokens = 1024, temperature = 0.7, systemPrompt = "" }) {
  const apiKey = getApiKey();
  if (!apiKey) return { provider: "openai", ok: false, error: "NO_API_KEY", reply: "OpenAI API \uD0A4 \uBBF8\uC124\uC815" };
  const messages = [];
  if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
  messages.push({ role: "user", content: prompt });
  try {
    const res = await fetch(`${OPENAI_API_BASE}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature })
    });
    if (!res.ok) return { provider: "openai", model, ok: false, error: `HTTP_${res.status}`, reply: await res.text() };
    const data = await res.json();
    return { provider: "openai", model, ok: true, reply: data.choices?.[0]?.message?.content || "", usage: data.usage || {} };
  } catch (err) {
    return { provider: "openai", model, ok: false, error: "NETWORK_ERROR", reply: err.message };
  }
}
async function testConnection() {
  const key = getApiKey();
  if (!key) return { connected: false, reason: "API \uD0A4 \uBBF8\uC124\uC815" };
  try {
    const res = await fetch(`${OPENAI_API_BASE}/models`, { headers: { "Authorization": `Bearer ${key}` } });
    return { connected: res.ok, reason: res.ok ? "OK" : `HTTP ${res.status}` };
  } catch (e) {
    return { connected: false, reason: e.message };
  }
}
function getStatus() {
  return { provider: "openai", configured: !!getApiKey(), authMethod: getApiKey() ? "api_key" : "none" };
}

// src/providers/gemini.js
var import_node_child_process = require("node:child_process");
function findBin(cmd) {
  const r = (0, import_node_child_process.spawnSync)(process.platform === "win32" ? "where" : "which", [cmd], { encoding: "utf8" });
  return r.status === 0 ? r.stdout.trim().split("\n")[0].trim() : null;
}
var GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";
function getGeminiApiKey() {
  try {
    const s = getSecret("gemini-api-key");
    if (s?.value) return s.value;
  } catch {
  }
  return process.env.GEMINI_API_KEY || null;
}
async function callGemini({ prompt, model = "gemini-2.0-flash", maxTokens = 1024, temperature = 0.7 }) {
  const key = getGeminiApiKey();
  if (!key) return { provider: "gemini", ok: false, error: "NO_API_KEY", reply: "Gemini API \uD0A4 \uBBF8\uC124\uC815" };
  try {
    const res = await fetch(`${GEMINI_API_BASE}/models/${model}:generateContent?key=${key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: maxTokens, temperature } })
    });
    if (!res.ok) return { provider: "gemini", ok: false, error: `HTTP_${res.status}`, reply: await res.text() };
    const data = await res.json();
    return { provider: "gemini", model, ok: true, reply: data.candidates?.[0]?.content?.parts?.[0]?.text || "", usage: data.usageMetadata || {} };
  } catch (err) {
    return { provider: "gemini", ok: false, error: "NETWORK_ERROR", reply: err.message };
  }
}
async function testGeminiApiKey() {
  const key = getGeminiApiKey();
  if (!key) return { connected: false, reason: "API \uD0A4 \uBBF8\uC124\uC815" };
  try {
    const res = await fetch(`${GEMINI_API_BASE}/models?key=${key}`);
    return { connected: res.ok, reason: res.ok ? "OK" : `HTTP ${res.status}` };
  } catch (e) {
    return { connected: false, reason: e.message };
  }
}
function getGeminiStatus() {
  return { provider: "gemini", configured: !!getGeminiApiKey(), authMethod: getGeminiApiKey() ? "api_key" : "none" };
}
function checkGcloudAuth() {
  try {
    const r = (0, import_node_child_process.spawnSync)("gcloud", ["auth", "print-access-token"], { encoding: "utf8", timeout: 8e3 });
    return { authenticated: r.status === 0 && !!(r.stdout || "").trim(), output: (r.stdout + r.stderr).trim() };
  } catch (e) {
    return { authenticated: false, output: e.message };
  }
}
function startGeminiOAuth() {
  if (!findBin("gcloud")) return { started: false, reason: "gcloud CLI \uBBF8\uC124\uCE58. https://cloud.google.com/sdk \uCC38\uC870" };
  try {
    const proc = (0, import_node_child_process.spawn)("gcloud", ["auth", "login"], { detached: true, stdio: "ignore" });
    proc.unref();
    return { started: true, reason: "gcloud auth login \uC2DC\uC791\uB428. \uBE0C\uB77C\uC6B0\uC800\uC5D0\uC11C Google \uACC4\uC815 \uC778\uC99D\uC744 \uC644\uB8CC\uD574 \uC8FC\uC138\uC694." };
  } catch (e) {
    return { started: false, reason: e.message };
  }
}
async function testGeminiOAuth() {
  const auth = checkGcloudAuth();
  return { connected: auth.authenticated, reason: auth.authenticated ? "Google OAuth \uC778\uC99D \uC644\uB8CC" : findBin("gcloud") ? "\uBBF8\uC778\uC99D" : "gcloud CLI \uBBF8\uC124\uCE58" };
}
function getGeminiOAuthStatus() {
  if (!findBin("gcloud")) return { provider: "gemini-oauth", configured: false, authMethod: "none" };
  const auth = checkGcloudAuth();
  return { provider: "gemini-oauth", configured: auth.authenticated, authMethod: auth.authenticated ? "google_oauth" : "none" };
}

// src/providers/codex.js
var import_node_child_process2 = require("node:child_process");
function findBin2(cmd) {
  const r = (0, import_node_child_process2.spawnSync)(process.platform === "win32" ? "where" : "which", [cmd], { encoding: "utf8" });
  return r.status === 0 ? r.stdout.trim().split("\n")[0].trim() : null;
}
function checkCodexAuth() {
  try {
    const r = (0, import_node_child_process2.spawnSync)("codex", ["auth", "status"], { encoding: "utf8", timeout: 8e3 });
    const out = (r.stdout + r.stderr).trim();
    return { authenticated: r.status === 0, output: out };
  } catch (e) {
    return { authenticated: false, output: e.message };
  }
}
async function callCodex({ prompt, mode = "ask", workDir = "." }) {
  if (!findBin2("codex")) return { provider: "codex", ok: false, error: "NOT_INSTALLED", reply: "Codex CLI \uBBF8\uC124\uCE58" };
  const auth = checkCodexAuth();
  if (!auth.authenticated) return { provider: "codex", ok: false, error: "NOT_AUTHENTICATED", reply: `\uC778\uC99D \uD544\uC694: ${auth.output}` };
  const args = [...mode === "auto-edit" ? ["--auto-edit"] : mode === "full-auto" ? ["--full-auto"] : [], prompt];
  const r = (0, import_node_child_process2.spawnSync)("codex", args, { encoding: "utf8", timeout: 12e4, cwd: workDir });
  return { provider: "codex", ok: r.status === 0, reply: (r.stdout || r.stderr || "(empty)").trim() };
}
function startCodexLogin() {
  if (!findBin2("codex")) return { started: false, reason: "Codex CLI \uBBF8\uC124\uCE58. npm install -g @openai/codex" };
  try {
    const proc = (0, import_node_child_process2.spawn)("codex", ["auth", "login"], { detached: true, stdio: "ignore" });
    proc.unref();
    return { started: true, reason: "codex auth login \uC2DC\uC791\uB428. \uBE0C\uB77C\uC6B0\uC800 \uB610\uB294 \uD130\uBBF8\uB110\uC5D0\uC11C \uC778\uC99D\uC744 \uC644\uB8CC\uD574 \uC8FC\uC138\uC694." };
  } catch (e) {
    return { started: false, reason: e.message };
  }
}
async function testConnection2() {
  if (!findBin2("codex")) return { connected: false, reason: "Codex CLI \uBBF8\uC124\uCE58" };
  const auth = checkCodexAuth();
  return { connected: auth.authenticated, reason: auth.authenticated ? "OAuth \uC778\uC99D \uC644\uB8CC" : auth.output };
}
function getStatus2() {
  if (!findBin2("codex")) return { provider: "codex", configured: false, authMethod: "none" };
  const auth = checkCodexAuth();
  return { provider: "codex", configured: auth.authenticated, authMethod: auth.authenticated ? "oauth" : "none" };
}

// src/providers/github-copilot.js
var import_node_child_process3 = require("node:child_process");
function findGhBin() {
  const result = (0, import_node_child_process3.spawnSync)(process.platform === "win32" ? "where" : "which", ["gh"], { encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim().split("\n")[0].trim() : null;
}
function checkGhAuthStatus() {
  try {
    const result = (0, import_node_child_process3.spawnSync)("gh", ["auth", "status"], { encoding: "utf8", timeout: 1e4 });
    const output = (result.stdout + result.stderr).trim();
    const authenticated = result.status === 0 || output.includes("Logged in") || output.includes("oauth_token");
    return { authenticated, output };
  } catch (err) {
    return { authenticated: false, output: err.message };
  }
}
async function callGithubCopilot({ prompt, model = "copilot-gpt-4o" }) {
  const bin = findGhBin();
  if (!bin) {
    return {
      provider: "github-copilot",
      ok: false,
      error: "GH_NOT_INSTALLED",
      reply: "GitHub CLI(gh)\uAC00 \uC124\uCE58\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4. https://cli.github.com/ \uC5D0\uC11C \uC124\uCE58\uD558\uC138\uC694."
    };
  }
  const auth = checkGhAuthStatus();
  if (!auth.authenticated) {
    return {
      provider: "github-copilot",
      ok: false,
      error: "NOT_AUTHENTICATED",
      reply: `GitHub CLI \uC778\uC99D\uC774 \uD544\uC694\uD569\uB2C8\uB2E4. \uD130\uBBF8\uB110\uC5D0\uC11C 'gh auth login'\uC744 \uC2E4\uD589\uD558\uC138\uC694.
\uC0C1\uD0DC: ${auth.output}`
    };
  }
  try {
    const result = (0, import_node_child_process3.spawnSync)("gh", ["copilot", "suggest", "-t", "shell", prompt], {
      encoding: "utf8",
      timeout: 6e4
    });
    const output = (result.stdout || "").trim() || (result.stderr || "").trim();
    return {
      provider: "github-copilot",
      model,
      ok: result.status === 0,
      reply: output || "(empty output)",
      exitCode: result.status
    };
  } catch (err) {
    return { provider: "github-copilot", model, ok: false, error: "RUNTIME_ERROR", reply: err.message };
  }
}
function startGhAuthLogin() {
  const bin = findGhBin();
  if (!bin) return { started: false, reason: "gh CLI \uBBF8\uC124\uCE58" };
  try {
    const proc = (0, import_node_child_process3.spawn)("gh", ["auth", "login", "--web"], {
      detached: true,
      stdio: "ignore"
    });
    proc.unref();
    return { started: true, reason: "gh auth login --web \uD504\uB85C\uC138\uC2A4 \uC2DC\uC791\uB428. \uBE0C\uB77C\uC6B0\uC800\uC5D0\uC11C \uC778\uC99D\uC744 \uC644\uB8CC\uD574 \uC8FC\uC138\uC694." };
  } catch (err) {
    return { started: false, reason: err.message };
  }
}
async function testConnection3() {
  const bin = findGhBin();
  if (!bin) return { connected: false, reason: "GitHub CLI(gh) \uBBF8\uC124\uCE58" };
  const auth = checkGhAuthStatus();
  return { connected: auth.authenticated, reason: auth.authenticated ? "GitHub OAuth \uC778\uC99D \uC644\uB8CC" : auth.output };
}
function getStatus3() {
  const bin = findGhBin();
  if (!bin) return { provider: "github-copilot", configured: false, authMethod: "none" };
  const auth = checkGhAuthStatus();
  return { provider: "github-copilot", configured: auth.authenticated, authMethod: auth.authenticated ? "gh_oauth" : "none" };
}

// src/providers/index.js
var providers = {
  openai: { call: callOpenAI, test: testConnection, status: getStatus },
  gemini: { call: callGemini, test: testGeminiApiKey, status: getGeminiStatus },
  "gemini-oauth": { call: callGemini, test: testGeminiOAuth, status: getGeminiOAuthStatus },
  codex: { call: callCodex, test: testConnection2, status: getStatus2 },
  "github-copilot": { call: callGithubCopilot, test: testConnection3, status: getStatus3 }
};
async function callProvider(name, params) {
  const p = providers[name];
  if (!p) return { ok: false, error: "UNKNOWN_PROVIDER" };
  return p.call(params);
}
async function testProvider(name) {
  const p = providers[name];
  if (!p) return { connected: false, reason: `Unknown: ${name}` };
  return p.test();
}
function getAllProviderStatus() {
  return Object.values(providers).map((p) => p.status());
}
function triggerOAuthLogin(name) {
  if (name === "codex") return startCodexLogin();
  if (name === "gemini-oauth") return startGeminiOAuth();
  if (name === "github-copilot") return startGhAuthLogin();
  return { started: false, reason: `${name}\uC740 OAuth \uD2B8\uB9AC\uAC70\uB97C \uC9C0\uC6D0\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.` };
}

// src/orchestrator.js
var MAX_WIP = Number(process.env.KANBAN_MAX_WIP || 2);
var __filename2 = (0, import_node_url2.fileURLToPath)(__importMetaResolver);
var __dirname2 = import_node_path2.default.dirname(__filename2);
var ROOT_DIR = import_node_path2.default.resolve(__dirname2, "..");
var WORKER_AGENT_ID = process.env.KANBAN_WORKER_AGENT_ID || "worker-01";
var REVIEWER_AGENT_ID = process.env.KANBAN_REVIEWER_AGENT_ID || "reviewer-01";
var MANAGER_AGENT_ID = process.env.KANBAN_MANAGER_AGENT_ID || "manager-01";
var PM_AGENT_ID = process.env.KANBAN_PM_AGENT_ID || "pm-01";
var runtimeBase = import_node_path2.default.join(ROOT_DIR, "..", "runtime");
var runtimeFiles = {
  worker: import_node_path2.default.join(runtimeBase, "worker", "worker-runtime.js"),
  reviewer: import_node_path2.default.join(runtimeBase, "reviewer", "reviewer-runtime.js"),
  manager: import_node_path2.default.join(runtimeBase, "manager", "manager-runtime.js")
};
var _cycleRunning = false;
function resolveProvider(model) {
  if (!model) return null;
  const m = model.toLowerCase();
  if (m.startsWith("gpt") || m.includes("openai")) return "openai";
  if (m.startsWith("gemini")) return "gemini";
  if (m === "codex") return "codex";
  if (m.includes("copilot") || m.includes("github")) return "github-copilot";
  return null;
}
async function callProviderWithFallback(providerName, params, stubFn) {
  if (providerName) {
    try {
      const result = await callProvider(providerName, params);
      if (result?.ok !== false) return { ...result, usedProvider: providerName };
    } catch (err) {
      console.error(`[orchestrator] provider ${providerName} error:`, err.message);
    }
  }
  return { ...stubFn(), usedProvider: "stub" };
}
function workerStub(taskId) {
  const summary = `Worker stub artifact for ${taskId}`;
  const location = `runtime/artifacts/${taskId}/result.json`;
  const checksum = import_node_crypto4.default.createHash("sha256").update(`${summary}:${location}`).digest("hex");
  return { ok: true, artifact: { kind: "report", summary, location, checksum } };
}
function reviewerStub(artifactSummary) {
  const verdict = artifactSummary ? "pass" : "needs_work";
  return {
    verdict,
    score: { correctness: verdict === "pass" ? 5 : 2, completeness: 4, quality: 4, risk: 3 },
    issues: verdict === "pass" ? [] : [{ type: "missing", severity: "medium", description: "Empty artifact summary" }]
  };
}
function managerStub(verdict) {
  return { toStatus: verdict === "pass" ? "Done" : "Blocked" };
}
async function runWorker(task, agentModel) {
  const providerName = resolveProvider(agentModel);
  const ac = (task.acceptanceCriteria || []).join("\n- ");
  const dod = (task.definitionOfDone || []).join("\n- ");
  const systemPrompt = `\uB2F9\uC2E0\uC740 Feature Worker \uC5D0\uC774\uC804\uD2B8\uC785\uB2C8\uB2E4. \uD560\uB2F9\uB41C \uD0DC\uC2A4\uD06C\uB97C \uC218\uD589\uD558\uACE0 \uACB0\uACFC \uBCF4\uACE0\uC11C\uB97C \uC791\uC131\uD569\uB2C8\uB2E4.`;
  const prompt = `## \uD0DC\uC2A4\uD06C ID: ${task.id}
## \uC81C\uBAA9: ${task.title}
## \uC124\uBA85: ${task.description || "(\uC124\uBA85 \uC5C6\uC74C)"}
${ac ? `## \uD1B5\uACFC \uAE30\uC900:
- ${ac}` : ""}
${dod ? `## \uC644\uB8CC \uC815\uC758:
- ${dod}` : ""}

\uC704 \uD0DC\uC2A4\uD06C\uB97C \uC218\uD589\uD558\uACE0 \uC8FC\uC694 \uACB0\uACFC, \uAD6C\uD604 \uB0B4\uC6A9, \uD2B9\uC774\uC0AC\uD56D\uC744 \uAC04\uACB0\uD558\uAC8C \uC694\uC57D\uD574 \uC8FC\uC138\uC694.`;
  const result = await callProviderWithFallback(
    providerName,
    { prompt, systemPrompt, maxTokens: 1024, temperature: 0.3 },
    () => workerStub(task.id)
  );
  if (result.usedProvider !== "stub" && result.reply) {
    const summary = result.reply.trim().slice(0, 2e3);
    const location = `ai/artifacts/${task.id}/result.md`;
    const checksum = import_node_crypto4.default.createHash("sha256").update(summary).digest("hex");
    return {
      ok: true,
      usedProvider: result.usedProvider,
      artifact: { kind: "report", summary, location, checksum }
    };
  }
  return result.usedProvider === "stub" ? workerStub(task.id) : { ok: false, reason: result.error || "provider returned no reply" };
}
async function runReviewer(task, artifact, agentModel) {
  const providerName = resolveProvider(agentModel);
  const ac = (task.acceptanceCriteria || []).join("\n- ");
  const systemPrompt = `\uB2F9\uC2E0\uC740 Code Reviewer \uC5D0\uC774\uC804\uD2B8\uC785\uB2C8\uB2E4. \uC6CC\uCEE4\uAC00 \uC81C\uCD9C\uD55C \uC0B0\uCD9C\uBB3C\uC744 \uAC80\uD1A0\uD558\uACE0 \uD1B5\uACFC \uC5EC\uBD80\uB97C \uD310\uB2E8\uD569\uB2C8\uB2E4.`;
  const prompt = `## \uD0DC\uC2A4\uD06C: ${task.title}
## \uD1B5\uACFC \uAE30\uC900:
- ${ac || "(\uAE30\uC900 \uC5C6\uC74C)"}
## \uC6CC\uCEE4 \uACB0\uACFC \uC694\uC57D:
${artifact.summary || "(\uBE44\uC5B4 \uC788\uC74C)"}

\uC704 \uB0B4\uC6A9\uC744 \uAC80\uD1A0\uD558\uACE0 \uC544\uB798 \uD615\uC2DD\uC73C\uB85C \uB2F5\uD558\uC138\uC694:
verdict: pass \uB610\uB294 needs_work
reason: (\uD310\uB2E8 \uADFC\uAC70 \uD55C \uC904)`;
  const result = await callProviderWithFallback(
    providerName,
    { prompt, systemPrompt, maxTokens: 256, temperature: 0.1 },
    () => reviewerStub(artifact.summary)
  );
  if (result.usedProvider !== "stub" && result.reply) {
    const reply = result.reply.toLowerCase();
    const verdict = reply.includes("needs_work") || reply.includes("needs work") || reply.includes("\uC7AC\uC791\uC5C5") ? "needs_work" : "pass";
    const score = verdict === "pass" ? { correctness: 5, completeness: 4, quality: 4, risk: 3 } : { correctness: 2, completeness: 3, quality: 2, risk: 4 };
    return { verdict, score, issues: [], usedProvider: result.usedProvider, rawReply: result.reply };
  }
  return { ...reviewerStub(artifact.summary), usedProvider: "stub" };
}
async function runManager(task, reviewOut, agentModel) {
  const providerName = resolveProvider(agentModel);
  const systemPrompt = `\uB2F9\uC2E0\uC740 Decision Manager \uC5D0\uC774\uC804\uD2B8\uC785\uB2C8\uB2E4. \uB9AC\uBDF0 \uACB0\uACFC\uB97C \uBC14\uD0D5\uC73C\uB85C \uD0DC\uC2A4\uD06C \uCD5C\uC885 \uCC98\uB9AC\uB97C \uACB0\uC815\uD569\uB2C8\uB2E4.`;
  const prompt = `## \uD0DC\uC2A4\uD06C: ${task.title}
## \uB9AC\uBDF0 \uACB0\uACFC: ${reviewOut.verdict}
## \uB9AC\uBDF0 \uCF54\uBA58\uD2B8: ${reviewOut.rawReply || (reviewOut.verdict === "pass" ? "\uAE30\uC900 \uCDA9\uC871" : "\uC7AC\uC791\uC5C5 \uD544\uC694")}

\uD0DC\uC2A4\uD06C\uB97C \uC644\uB8CC(Done) \uCC98\uB9AC\uD558\uAC70\uB098 \uC7AC\uC791\uC5C5(Blocked)\uC744 \uC9C0\uC2DC\uD558\uC138\uC694.
decision: Done \uB610\uB294 Blocked`;
  const result = await callProviderWithFallback(
    providerName,
    { prompt, systemPrompt, maxTokens: 128, temperature: 0.1 },
    () => managerStub(reviewOut.verdict)
  );
  if (result.usedProvider !== "stub" && result.reply) {
    const reply = result.reply.toLowerCase();
    const toStatus = reply.includes("blocked") || reply.includes("\uC7AC\uC791\uC5C5") ? "Blocked" : "Done";
    return { toStatus, usedProvider: result.usedProvider };
  }
  return { ...managerStub(reviewOut.verdict), usedProvider: "stub" };
}
async function runPmDecompose(task, agentModel) {
  const providerName = resolveProvider(agentModel);
  const systemPrompt = `\uB2F9\uC2E0\uC740 Project Manager \uC5D0\uC774\uC804\uD2B8\uC785\uB2C8\uB2E4. \uD504\uB85C\uC81D\uD2B8 \uC124\uBA85\uC744 \uC77D\uACE0 \uC2E4\uD589 \uAC00\uB2A5\uD55C \uD558\uC704 \uD0DC\uC2A4\uD06C \uBAA9\uB85D\uC744 JSON\uC73C\uB85C \uBC18\uD658\uD569\uB2C8\uB2E4.`;
  const prompt = `## \uD504\uB85C\uC81D\uD2B8 \uC124\uBA85:
${task.description}

## \uD0DC\uC2A4\uD06C \uBD84\uD574 \uC694\uCCAD
\uC704 \uD504\uB85C\uC81D\uD2B8\uB97C \uAC1C\uBC1C \uD0DC\uC2A4\uD06C\uB85C \uBD84\uD574\uD558\uC138\uC694. \uAC01 \uD0DC\uC2A4\uD06C\uB294 \uB3C5\uB9BD\uC801\uC73C\uB85C \uC2E4\uD589 \uAC00\uB2A5\uD574\uC57C \uD569\uB2C8\uB2E4.
\uB2E4\uC74C JSON \uBC30\uC5F4 \uD615\uC2DD\uC73C\uB85C\uB9CC \uB2F5\uD558\uC138\uC694 (\uC124\uBA85 \uC5C6\uC774):
[
  {
    "title": "\uD0DC\uC2A4\uD06C \uC81C\uBAA9",
    "description": "\uC0C1\uC138 \uC124\uBA85",
    "type": "feature|bugfix|refactor|docs",
    "effort": 1-5,
    "acceptanceCriteria": ["\uAE30\uC9001", "\uAE30\uC9002"],
    "definitionOfDone": ["\uC644\uB8CC \uC815\uC7581"]
  }
]`;
  let subtasks = [];
  if (providerName) {
    try {
      const result = await callProvider(providerName, { prompt, systemPrompt, maxTokens: 2048, temperature: 0.4 });
      if (result?.reply) {
        const jsonMatch = result.reply.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          try {
            subtasks = JSON.parse(jsonMatch[0]);
          } catch {
          }
        }
      }
    } catch (err) {
      console.error(`[orchestrator] PM provider error:`, err.message);
    }
  }
  if (!subtasks || subtasks.length === 0) {
    subtasks = [
      { title: `${task.title} - \uD658\uACBD \uC124\uC815`, description: "\uAC1C\uBC1C \uD658\uACBD \uC900\uBE44 \uBC0F \uCD08\uAE30 \uC124\uC815", type: "feature", effort: 2, acceptanceCriteria: ["\uD658\uACBD \uC124\uC815 \uC644\uB8CC"], definitionOfDone: ["\uC2E4\uD589 \uAC00\uB2A5\uD55C \uC0C1\uD0DC"] },
      { title: `${task.title} - \uD575\uC2EC \uAE30\uB2A5 \uAD6C\uD604`, description: "\uC8FC\uC694 \uAE30\uB2A5 \uAD6C\uD604", type: "feature", effort: 4, acceptanceCriteria: ["\uD575\uC2EC \uAE30\uB2A5 \uB3D9\uC791"], definitionOfDone: ["\uCF54\uB4DC \uC791\uC131 \uC644\uB8CC"] },
      { title: `${task.title} - \uD14C\uC2A4\uD2B8 \uAC80\uC99D`, description: "\uAE30\uB2A5 \uD14C\uC2A4\uD2B8 \uBC0F \uAC80\uC99D", type: "feature", effort: 3, acceptanceCriteria: ["\uD14C\uC2A4\uD2B8 \uD1B5\uACFC"], definitionOfDone: ["\uD14C\uC2A4\uD2B8 \uCF00\uC774\uC2A4 \uC791\uC131 \uC644\uB8CC"] }
    ];
  }
  const created = [];
  for (const sub of subtasks.slice(0, 10)) {
    const newTask = createTask({
      title: sub.title || "\uD558\uC704 \uD0DC\uC2A4\uD06C",
      description: sub.description || "",
      type: sub.type || "feature",
      effort: sub.effort ?? 3,
      urgency: 3,
      priorityModel: 3,
      riskReduction: 3,
      status: "Backlog",
      acceptanceCriteria: sub.acceptanceCriteria || ["\uD0DC\uC2A4\uD06C \uC644\uB8CC"],
      definitionOfDone: sub.definitionOfDone || ["\uC0B0\uCD9C\uBB3C \uC81C\uCD9C"],
      parentId: task.id
    });
    created.push(newTask.id);
  }
  return { ok: true, createdSubtasks: created };
}
async function runCycle() {
  if (isOrchestratorPaused()) {
    return { ok: true, moved: 0, reason: "orchestrator_paused" };
  }
  if (_cycleRunning) {
    return { ok: true, moved: 0, reason: "cycle_already_running" };
  }
  _cycleRunning = true;
  try {
    return await _runCycleImpl();
  } finally {
    _cycleRunning = false;
  }
}
async function _runCycleImpl() {
  const inProgress = getTaskCountInProgress();
  const slots = Math.max(0, MAX_WIP - inProgress);
  if (slots === 0) {
    return { ok: true, moved: 0, reason: "No WIP slots" };
  }
  const ready = listTasksByStatus(["Ready"]).slice(0, slots);
  const reports = [];
  for (const task of ready) {
    if (task.assigneeAgentId === PM_AGENT_ID || task.title?.startsWith("[\uD504\uB85C\uC81D\uD2B8 \uC14B\uC5C5]")) {
      const pmAgent = getAgent(PM_AGENT_ID);
      const pmModel = pmAgent?.model || null;
      const startPm = updateTaskStatus({
        taskId: task.id,
        toStatus: "InProgress",
        actorRole: "worker",
        actorAgentId: PM_AGENT_ID,
        reason: "pm_kickoff"
      });
      if (!startPm.ok) {
        reports.push({ taskId: task.id, step: "pm_dispatch", ok: false, reason: startPm.reason });
        continue;
      }
      const pmOut = await runPmDecompose(task, pmModel);
      addArtifact({
        taskId: task.id,
        kind: "report",
        location: `pm/${task.id}/subtasks.json`,
        summary: `\uBD84\uD574\uB41C \uD558\uC704 \uD0DC\uC2A4\uD06C: ${pmOut.createdSubtasks?.length || 0}\uAC1C`,
        createdByAgentId: PM_AGENT_ID
      });
      updateTaskStatus({ taskId: task.id, toStatus: "InReview", actorRole: "worker", actorAgentId: PM_AGENT_ID, reason: "pm_decompose_complete" });
      addReviewReport({ taskId: task.id, verdict: "pass", correctness: 5, completeness: 5, quality: 5, risk: 1, reviewerAgentId: REVIEWER_AGENT_ID, comments: `PM \uBD84\uD574 \uC644\uB8CC: ${pmOut.createdSubtasks?.length || 0}\uAC1C \uD558\uC704 \uD0DC\uC2A4\uD06C \uC0DD\uC131`, issues: [] });
      updateTaskStatus({ taskId: task.id, toStatus: "Done", actorRole: "manager", actorAgentId: MANAGER_AGENT_ID, reason: "pm_approved" });
      reports.push({ taskId: task.id, ok: true, step: "pm_decompose", subtasks: pmOut.createdSubtasks });
      continue;
    }
    const started = updateTaskStatus({
      taskId: task.id,
      toStatus: "InProgress",
      actorRole: "worker",
      actorAgentId: WORKER_AGENT_ID,
      reason: "orchestrator_dispatch"
    });
    if (!started.ok) {
      reports.push({ taskId: task.id, step: "dispatch", ok: false, reason: started.reason });
      continue;
    }
    setTaskAssignee(task.id, WORKER_AGENT_ID);
    const workerAgent = getAgent(WORKER_AGENT_ID);
    const reviewerAgent = getAgent(REVIEWER_AGENT_ID);
    const managerAgent = getAgent(MANAGER_AGENT_ID);
    let workerOut;
    try {
      workerOut = await runWorker(task, workerAgent?.model);
    } catch (err) {
      workerOut = { ok: false, reason: err.message };
    }
    if (!workerOut || workerOut.ok === false) {
      updateTaskStatus({
        taskId: task.id,
        toStatus: "Blocked",
        actorRole: "worker",
        actorAgentId: WORKER_AGENT_ID,
        reason: `worker_failed: ${workerOut?.reason || "unknown"}`
      });
      reports.push({ taskId: task.id, step: "worker", ok: false, reason: workerOut?.reason || "worker failed", status: "Blocked" });
      continue;
    }
    addArtifact({
      taskId: task.id,
      kind: workerOut.artifact?.kind || "report",
      location: workerOut.artifact?.location || `runtime/${task.id}/artifact.json`,
      summary: workerOut.artifact?.summary || "worker artifact",
      checksum: workerOut.artifact?.checksum || null,
      createdByAgentId: WORKER_AGENT_ID
    });
    const toReview = updateTaskStatus({
      taskId: task.id,
      toStatus: "InReview",
      actorRole: "worker",
      actorAgentId: WORKER_AGENT_ID,
      reason: "worker_complete_auto_submit"
    });
    if (!toReview.ok) {
      reports.push({ taskId: task.id, step: "submit", ok: false, reason: toReview.reason });
      continue;
    }
    let reviewOut;
    try {
      reviewOut = await runReviewer(task, workerOut.artifact || {}, reviewerAgent?.model);
    } catch (err) {
      reviewOut = { ...reviewerStub(workerOut.artifact?.summary), usedProvider: "stub" };
    }
    addReviewReport({
      taskId: task.id,
      verdict: reviewOut.verdict || "needs_work",
      correctness: reviewOut.score?.correctness,
      completeness: reviewOut.score?.completeness,
      quality: reviewOut.score?.quality,
      risk: reviewOut.score?.risk,
      reviewerAgentId: REVIEWER_AGENT_ID,
      comments: reviewOut.rawReply || (reviewOut.verdict === "pass" ? "auto-reviewed pass" : "auto-reviewed needs_work"),
      issues: reviewOut.issues || []
    });
    let managerOut;
    try {
      managerOut = await runManager(task, reviewOut, managerAgent?.model);
    } catch (err) {
      managerOut = { ...managerStub(reviewOut.verdict), usedProvider: "stub" };
    }
    if (managerOut.toStatus === "Done") {
      const done = updateTaskStatus({
        taskId: task.id,
        toStatus: "Done",
        actorRole: "manager",
        actorAgentId: MANAGER_AGENT_ID,
        reason: "auto_approved"
      });
      reports.push({ taskId: task.id, ok: done.ok, step: "approve", status: done.ok ? "Done" : "error", providers: { worker: workerOut.usedProvider, reviewer: reviewOut.usedProvider, manager: managerOut.usedProvider } });
    } else {
      const block = updateTaskStatus({
        taskId: task.id,
        toStatus: "Blocked",
        actorRole: "manager",
        actorAgentId: MANAGER_AGENT_ID,
        reason: "needs_work"
      });
      reports.push({ taskId: task.id, ok: block.ok, step: "block", status: "Blocked", providers: { worker: workerOut.usedProvider, reviewer: reviewOut.usedProvider, manager: managerOut.usedProvider } });
    }
  }
  return { ok: true, moved: ready.length, reason: "cycle_executed", reports };
}
if (process.argv[1] === new URL(__importMetaResolver).pathname) {
  runCycle().then((r) => console.log(JSON.stringify(r)));
}

// src/api/server.js
var __filename3 = (0, import_node_url3.fileURLToPath)(__importMetaResolver);
var __dirname3 = (0, import_node_path3.dirname)(__filename3);
var isPkg2 = typeof process.pkg !== "undefined";
var WEB_DIR = isPkg2 ? (0, import_node_path3.join)((0, import_node_path3.dirname)(process.execPath), "web") : (0, import_node_path3.join)(__dirname3, "../../../web");
var PORT = Number(process.env.PORT || 4100);
function addCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}
function sendJson(res, code, data) {
  const body = JSON.stringify(data);
  res.writeHead(code, { "content-type": "application/json; charset=utf-8" });
  res.end(body);
}
function parseJson(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => data += c);
    req.on("end", () => {
      try {
        resolve(JSON.parse(data));
      } catch {
        resolve({});
      }
    });
  });
}
function matchPath(path2, template) {
  const a = path2.split("/").filter(Boolean);
  const b = template.split("/").filter(Boolean);
  if (a.length !== b.length) return null;
  const params = {};
  for (let i = 0; i < a.length; i++) {
    if (b[i].startsWith("{")) {
      params[b[i].replace(/[{}]/g, "")] = a[i];
    } else if (a[i] !== b[i]) return null;
  }
  return params;
}
var server = (0, import_node_http.createServer)(async (req, res) => {
  addCors(res);
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }
  const url = new URL(req.url || "", `http://${req.headers.host || "localhost"}`);
  const path2 = url.pathname;
  const method = req.method || "GET";
  if (method === "GET" && (path2 === "/" || path2 === "/index.html")) {
    const htmlPath = (0, import_node_path3.join)(WEB_DIR, "index.html");
    if ((0, import_node_fs2.existsSync)(htmlPath)) {
      const html = (0, import_node_fs2.readFileSync)(htmlPath, "utf-8");
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      return res.end(html);
    } else {
      res.writeHead(404, { "content-type": "text/plain" });
      return res.end(`web/index.html not found at: ${htmlPath}`);
    }
  }
  if (method === "GET" && (path2 === "/health" || path2 === "/api/health")) {
    return sendJson(res, 200, { ok: true, version: "v0.3.0" });
  }
  if (method === "GET" && path2 === "/api/tasks") return sendJson(res, 200, listTasks());
  if (method === "POST" && path2 === "/api/tasks") {
    const b = await parseJson(req);
    return sendJson(res, 201, createTask(b));
  }
  let m;
  if (m = matchPath(path2, "/api/tasks/{id}")) {
    const t = getTask(m.id);
    if (!t) return sendJson(res, 404, { ok: false, error: "not found" });
    if (method === "GET") return sendJson(res, 200, t);
  }
  if ((m = matchPath(path2, "/api/tasks/{id}/status")) && method === "POST") {
    const b = await parseJson(req);
    const r = updateTaskStatus({ taskId: m.id, toStatus: b.toStatus, actorAgentId: b.actorAgentId || "system", actorRole: b.actorRole || "manager", reason: b.reason });
    return r.ok ? sendJson(res, 200, r.task) : sendJson(res, 400, r);
  }
  if (m = matchPath(path2, "/api/tasks/{id}/artifacts")) {
    if (method === "GET") return sendJson(res, 200, listArtifacts(m.id));
    if (method === "POST") {
      const b = await parseJson(req);
      return sendJson(res, 201, addArtifact({ ...b, taskId: m.id }));
    }
  }
  if (m = matchPath(path2, "/api/tasks/{id}/reviews")) {
    if (method === "GET") return sendJson(res, 200, listReviewReports(m.id));
    if (method === "POST") {
      const b = await parseJson(req);
      return sendJson(res, 201, addReviewReport({ ...b, taskId: m.id }));
    }
  }
  if ((m = matchPath(path2, "/api/tasks/{id}/decisions")) && method === "GET") return sendJson(res, 200, listDecisionEvents(m.id));
  if ((m = matchPath(path2, "/api/tasks/{id}/lock")) && method === "POST") {
    const b = await parseJson(req);
    return sendJson(res, 200, acquireTaskLock(m.id, b.agentId || "system", b.ttlSeconds || 300));
  }
  if ((m = matchPath(path2, "/api/tasks/{id}/release")) && method === "POST") {
    const b = await parseJson(req);
    releaseTaskLock(m.id, b.actorAgentId || "system");
    return sendJson(res, 200, { ok: true });
  }
  if ((m = matchPath(path2, "/api/tasks/{id}/assign")) && method === "POST") {
    const b = await parseJson(req);
    setTaskAssignee(m.id, b.agentId);
    return sendJson(res, 200, { ok: true, taskId: m.id, assignee: b.agentId });
  }
  if ((m = matchPath(path2, "/api/tasks/{id}/retry")) && method === "POST") {
    const b = await parseJson(req);
    const r = updateTaskStatus({ taskId: m.id, toStatus: b.toStatus || "Ready", actorAgentId: b.actorAgentId || "manager-01", actorRole: "admin", reason: b.reason || "manual_retry", force: b.force });
    return r.ok ? sendJson(res, 200, r.task) : sendJson(res, 400, r);
  }
  if (method === "GET" && path2 === "/api/agents") return sendJson(res, 200, listAgents());
  if (method === "POST" && path2 === "/api/agents") {
    const b = await parseJson(req);
    return sendJson(res, 201, createAgent(b));
  }
  if (m = matchPath(path2, "/api/agents/{id}")) {
    const agent = getAgent(m.id);
    if (!agent && method !== "DELETE") return sendJson(res, 404, { ok: false, error: "agent not found" });
    if (method === "GET") return sendJson(res, 200, agent);
    if (method === "PUT" || method === "PATCH") {
      const b = await parseJson(req);
      return sendJson(res, 200, updateAgent(m.id, { ...agent, ...b }));
    }
    if (method === "DELETE") {
      deleteAgent(m.id);
      return sendJson(res, 200, { ok: true, deleted: m.id });
    }
  }
  if (method === "GET" && path2 === "/api/blockeds") return sendJson(res, 200, listBlockedTasks());
  if (method === "GET" && path2 === "/api/audit") {
    const limit = Number(url.searchParams.get("limit") || 100);
    return sendJson(res, 200, listAuditEvents(limit));
  }
  if (method === "GET" && path2 === "/api/decisions") {
    const limit = Number(url.searchParams.get("limit") || 200);
    return sendJson(res, 200, listDecisionEvents(null).slice(0, limit));
  }
  if (method === "GET" && path2 === "/api/reviews") {
    const limit = Number(url.searchParams.get("limit") || 100);
    return sendJson(res, 200, listAllReviewReports(limit));
  }
  if (method === "GET" && path2 === "/api/control/orchestrator") return sendJson(res, 200, orchestratorStatus());
  if (method === "POST" && path2 === "/api/control/orchestrator/pause") return sendJson(res, 200, setOrchestratorPaused(true));
  if (method === "POST" && path2 === "/api/control/orchestrator/resume") return sendJson(res, 200, setOrchestratorPaused(false));
  if (method === "POST" && path2 === "/api/orchestrator/run") return sendJson(res, 200, await runCycle());
  if (method === "GET" && path2 === "/api/providers") return sendJson(res, 200, getAllProviderStatus());
  if ((m = matchPath(path2, "/api/providers/{name}/test")) && method === "POST") {
    return sendJson(res, 200, await testProvider(m.name));
  }
  if ((m = matchPath(path2, "/api/providers/{name}/auth-login")) && method === "POST") {
    return sendJson(res, 200, triggerOAuthLogin(m.name));
  }
  if (method === "GET" && path2 === "/api/secrets") return sendJson(res, 200, listSecrets());
  if (method === "POST" && path2 === "/api/secrets") {
    const b = await parseJson(req);
    if (!b?.provider || !b.keyName || !b.value) return sendJson(res, 400, { ok: false, error: "provider,keyName,value required" });
    return sendJson(res, 201, saveSecret(b));
  }
  if ((m = matchPath(path2, "/api/secrets/{id}")) && method === "DELETE") {
    deleteSecret(m.id);
    return sendJson(res, 200, { ok: true, removed: m.id });
  }
  return sendJson(res, 404, { ok: false, error: "Not found", path: path2 });
});
function killPortAndListen(retried = false) {
  server.listen(PORT, () => {
    upsertDefaultAgents();
    console.log(`Kanban SSOT server running on http://localhost:${PORT}`);
  });
}
server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.warn(`[server] Port ${PORT} is in use. Killing existing process...`);
    try {
      const out = (0, import_node_child_process4.execSync)(`netstat -ano | findstr ":${PORT}.*LISTENING"`, { encoding: "utf8" });
      const pid = out.trim().split(/\s+/).pop();
      if (pid && /^\d+$/.test(pid) && pid !== "0") {
        (0, import_node_child_process4.execSync)(`taskkill /PID ${pid} /F`);
        console.log(`[server] Killed PID ${pid}. Retrying in 1s...`);
        setTimeout(() => {
          server.removeAllListeners("error");
          server.on("error", (e) => {
            console.error("[server] fatal:", e.message);
            process.exit(1);
          });
          server.listen(PORT, () => {
            upsertDefaultAgents();
            console.log(`Kanban SSOT server running on http://localhost:${PORT}`);
          });
        }, 1e3);
        return;
      }
    } catch (e) {
      console.error("[server] Failed to kill port occupant:", e.message);
    }
    console.error(`[server] Could not free port ${PORT}. Exiting.`);
    process.exit(1);
  } else {
    console.error("[server] Unexpected error:", err.message);
    process.exit(1);
  }
});
killPortAndListen();

// src/index.js
var PORT2 = Number(process.env.PORT || 4100);
setTimeout(() => {
  console.log("\n[AI] === \uD504\uB85C\uBC14\uC774\uB354 \uC5F0\uACB0 \uC0C1\uD0DC ===");
  try {
    const statuses = getAllProviderStatus();
    for (const s of statuses) {
      const icon = s.connected ? "\u2713" : "\u2717";
      console.log(`[AI] ${icon} ${s.provider || s.name || JSON.stringify(s)}`);
    }
  } catch (e) {
    console.warn("[AI] \uC0C1\uD0DC \uD655\uC778 \uC2E4\uD328:", e.message);
  }
  console.log("[AI] ================================\n");
  const url = `http://localhost:${PORT2}`;
  console.log(`[browser] Opening ${url} ...`);
  const cmd = process.platform === "win32" ? `start "" "${url}"` : process.platform === "darwin" ? `open "${url}"` : `xdg-open "${url}"`;
  (0, import_node_child_process5.exec)(cmd, (err) => {
    if (err) console.warn("[browser] \uC790\uB3D9 \uC5F4\uAE30 \uC2E4\uD328 (\uC218\uB3D9\uC73C\uB85C \uC811\uC18D\uD558\uC138\uC694):", url);
  });
}, 2e3);
var CYCLE_INTERVAL_MS = Number(process.env.KANBAN_CYCLE_INTERVAL_MS || 3e4);
if (CYCLE_INTERVAL_MS > 0) {
  console.log(`[scheduler] Auto-cycle enabled: every ${CYCLE_INTERVAL_MS / 1e3}s`);
  setInterval(async () => {
    if (isOrchestratorPaused()) return;
    try {
      const result = await runCycle();
      if (result.moved > 0) {
        console.log(`[scheduler] cycle done \u2014 moved=${result.moved}`, JSON.stringify(result.reports || []));
      }
    } catch (err) {
      console.error("[scheduler] cycle error:", err.message);
    }
  }, CYCLE_INTERVAL_MS);
}
