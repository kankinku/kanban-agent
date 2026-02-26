-- SQLite schema for Kanban SSOT core entities

CREATE TABLE IF NOT EXISTS boards (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('worker','reviewer','manager','admin')),
  model TEXT,
  prompt TEXT,
  tool_scope TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  board_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('Backlog','Ready','InProgress','InReview','Blocked','Done','Archived')),
  tags TEXT NOT NULL DEFAULT '[]',
  type TEXT NOT NULL CHECK(type IN ('feature','bug','research','ops','content','infra','refactor','spike')),
  priority_model INTEGER CHECK(priority_model BETWEEN 1 AND 5),
  urgency INTEGER CHECK(urgency BETWEEN 1 AND 5),
  risk_reduction INTEGER CHECK(risk_reduction BETWEEN 1 AND 5),
  effort INTEGER CHECK(effort BETWEEN 1 AND 5),
  priority_score REAL DEFAULT 0,
  mandatory INTEGER NOT NULL DEFAULT 0,
  due_date TEXT,
  acceptance_criteria TEXT NOT NULL DEFAULT '[]',
  definition_of_done TEXT NOT NULL DEFAULT '[]',
  dependencies TEXT NOT NULL DEFAULT '[]',
  parent_id TEXT,
  child_ids TEXT NOT NULL DEFAULT '[]',
  assignee_agent_id TEXT,
  reviewer_agent_id TEXT,
  lock_id TEXT,
  lock_expires_at TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  max_attempt INTEGER NOT NULL DEFAULT 3,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  started_at TEXT,
  submitted_at TEXT,
  completed_at TEXT,
  cycle_time_ms INTEGER,
  lead_time_ms INTEGER,
  FOREIGN KEY (board_id) REFERENCES boards(id),
  FOREIGN KEY (assignee_agent_id) REFERENCES agents(id),
  FOREIGN KEY (reviewer_agent_id) REFERENCES agents(id),
  FOREIGN KEY (parent_id) REFERENCES tasks(id)
);

CREATE TABLE IF NOT EXISTS artifacts (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('doc','code','dataset','report','link','image','log')),
  location TEXT NOT NULL,
  summary TEXT NOT NULL,
  repro_steps TEXT NOT NULL DEFAULT '[]',
  checksum TEXT,
  created_by_agent_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (task_id) REFERENCES tasks(id),
  FOREIGN KEY (created_by_agent_id) REFERENCES agents(id)
);

CREATE TABLE IF NOT EXISTS review_reports (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  verdict TEXT NOT NULL CHECK(verdict IN ('pass','needs_work')),
  correctness INTEGER CHECK(correctness BETWEEN 1 AND 5),
  completeness INTEGER CHECK(completeness BETWEEN 1 AND 5),
  quality INTEGER CHECK(quality BETWEEN 1 AND 5),
  risk INTEGER CHECK(risk BETWEEN 1 AND 5),
  reviewer_agent_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  comments TEXT NOT NULL DEFAULT '',
  FOREIGN KEY (task_id) REFERENCES tasks(id),
  FOREIGN KEY (reviewer_agent_id) REFERENCES agents(id)
);

CREATE TABLE IF NOT EXISTS review_issues (
  id TEXT PRIMARY KEY,
  review_report_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('defect','missing','risk','style','test','performance','security','ops')),
  severity TEXT NOT NULL CHECK(severity IN ('critical','high','medium','low')),
  description TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (review_report_id) REFERENCES review_reports(id)
);

CREATE TABLE IF NOT EXISTS decisions (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  actor_agent_id TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT,
  action TEXT NOT NULL CHECK(action IN ('create','promote','assign','submit','review_pass','review_rework','archive','reopen','block')),
  reason TEXT,
  details TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (task_id) REFERENCES tasks(id),
  FOREIGN KEY (actor_agent_id) REFERENCES agents(id)
);

CREATE TABLE IF NOT EXISTS secrets (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  key_name TEXT NOT NULL,
  encrypted_value TEXT NOT NULL,
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  actor_agent_id TEXT,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  payload TEXT NOT NULL DEFAULT '{}',
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (actor_agent_id) REFERENCES agents(id)
);
