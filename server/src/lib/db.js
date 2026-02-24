import Database from 'better-sqlite3';
import { mkdirSync, existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DEFAULT_DB_PATH = join(__dirname, 'data', 'kanban.db');
const schemaPath = join(__dirname, '../models/schema.sql');

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
