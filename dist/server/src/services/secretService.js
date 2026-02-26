import { randomUUID } from 'node:crypto';
import { getDatabase } from '../lib/db.js';
import { encryptValue, decryptValue, maskSecret } from '../lib/security.js';

const db = getDatabase();

export function saveSecret(input) {
  const now = new Date().toISOString();
  const existing = db.prepare('SELECT id, created_at FROM secrets WHERE provider = ? AND key_name = ? ORDER BY updated_at DESC LIMIT 1')
    .get(input.provider, input.keyName);
  const id = input.id || existing?.id || `secret-${randomUUID()}`;
  const encrypted = encryptValue(input.value);
  if (existing) {
    db.prepare(`UPDATE secrets
      SET encrypted_value = @encryptedValue,
          metadata = @metadata,
          updated_at = @updatedAt
      WHERE id = @id`).run({
      id,
      encryptedValue: encrypted,
      metadata: JSON.stringify(input.metadata || {}),
      updatedAt: now
    });
    return { id, provider: input.provider, keyName: input.keyName, createdAt: existing.created_at, updatedAt: now };
  }

  db.prepare(`INSERT INTO secrets (id, provider, key_name, encrypted_value, metadata, created_at, updated_at)
    VALUES (@id, @provider, @keyName, @encryptedValue, @metadata, @createdAt, @updatedAt)`).run({
      id,
      provider: input.provider,
      keyName: input.keyName,
      encryptedValue: encrypted,
      metadata: JSON.stringify(input.metadata || {}),
      createdAt: now,
      updatedAt: now
    });
  return { id, provider: input.provider, keyName: input.keyName, createdAt: now, updatedAt: now };
}

export function listSecrets() {
  const rows = db.prepare('SELECT id, provider, key_name, encrypted_value, metadata, created_at, updated_at FROM secrets ORDER BY updated_at DESC').all();
  return rows.map(r => ({
    id: r.id,
    provider: r.provider,
    keyName: r.key_name,
    value: maskSecret(decryptValue(r.encrypted_value)),
    metadata: toJsonArraySafe(r.metadata),
    createdAt: r.created_at,
    updatedAt: r.updated_at
  }));
}

export function getSecret(id) {
  const row = db.prepare('SELECT * FROM secrets WHERE id = ?').get(id);
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

export function getSecretByProvider(provider, keyName) {
  const row = db.prepare('SELECT * FROM secrets WHERE provider = ? AND key_name = ? ORDER BY updated_at DESC LIMIT 1')
    .get(provider, keyName);
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

export function deleteSecret(id) {
  return db.prepare('DELETE FROM secrets WHERE id = ?').run(id).changes;
}

function toJsonArraySafe(raw) {
  try { return JSON.parse(raw || '{}'); } catch { return {}; }
}
