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
  return db;
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
