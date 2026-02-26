import Database from 'better-sqlite3';
import { mkdirSync, existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// pkg로 패키징된 경우 exe 옆에 data/ 폴더를 사용 (snapshot fs는 읽기 전용)
const isPkg = typeof process.pkg !== 'undefined';
const DEFAULT_DB_PATH = isPkg
  ? join(dirname(process.execPath), 'data', 'kanban.db')
  : join(__dirname, 'data', 'kanban.db');

// schema.sql: 패키징 시 exe 옆, 개발 시 소스 기준 경로
const schemaPath = isPkg
  ? join(dirname(process.execPath), 'schema.sql')
  : join(__dirname, '../models/schema.sql');

export function getDatabase(dbPath = process.env.KANBAN_DB_PATH || DEFAULT_DB_PATH) {
  const dir = dirname(dbPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const db = new Database(dbPath);
  db.pragma('foreign_keys = ON');

  const schemaSql = readFileSync(schemaPath, 'utf-8');
  db.exec(schemaSql);

  // Run migrations safely
  runMigrations(db);

  return db;
}

function runMigrations(db) {
  const columns = db.prepare("PRAGMA table_info(tasks)").all();
  const hasBoardId = columns.some(c => c.name === 'board_id');
  if (!hasBoardId) {
    console.log('[DB] Migrating: Adding board_id column to tasks table...');
    try {
      db.prepare("ALTER TABLE tasks ADD COLUMN board_id TEXT REFERENCES boards(id)").run();
      // 기존 태스크를 위해 기본 보드 강제 생성 및 매핑
      const defaultBoardId = 'board-default';
      db.prepare(`INSERT OR IGNORE INTO boards (id, name, created_at, updated_at) VALUES ('${defaultBoardId}', '기본 프로젝트 (Migrated)', datetime('now'), datetime('now'))`).run();
      db.prepare(`UPDATE tasks SET board_id = '${defaultBoardId}' WHERE board_id IS NULL`).run();
      console.log('[DB] Migration successful.');
    } catch (e) {
      console.error('[DB] Migration failed:', e);
    }
  }
}

export function parseJsonArray(raw, fallback = []) {
  try {
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

export function toJsonArray(value, fallback = []) {
  return JSON.stringify(Array.isArray(value) ? value : fallback);
}
