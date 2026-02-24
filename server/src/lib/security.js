import crypto from 'node:crypto';

const ENC_KEY = process.env.KANBAN_SECRET_KEY;
const ALGO = 'aes-256-gcm';
const IV_LEN = 12;
const TAG_LEN = 16;

function getKey() {
  if (!ENC_KEY) return null;
  const buf = Buffer.from(ENC_KEY, 'hex');
  if (buf.length !== 32) return null;
  return buf;
}

export function encryptValue(plainText) {
  const key = getKey();
  if (!key) return plainText;
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(String(plainText)), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decryptValue(payload) {
  const key = getKey();
  if (!key) return payload;
  try {
    const [ivHex, tagHex, dataHex] = String(payload).split(':');
    const decipher = crypto.createDecipheriv(ALGO, key, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(dataHex, 'hex')),
      decipher.final()
    ]);
    return decrypted.toString('utf8');
  } catch {
    return '[DECRYPT_FAILED]';
  }
}

export function maskSecret(value) {
  const s = String(value || '');
  if (!s) return '';
  if (s.length <= 8) return '***';
  return `${s.slice(0, 3)}***${s.slice(-3)}`;
}
