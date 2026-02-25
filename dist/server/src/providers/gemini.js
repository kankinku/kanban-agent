import { spawn, spawnSync } from 'node:child_process';
import { getSecret } from '../services/secretService.js';

// ── Helpers ──────────────────────────────────────────────────────────────────
function findBin(cmd) {
  const r = spawnSync(process.platform === 'win32' ? 'where' : 'which', [cmd], { encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim().split('\n')[0].trim() : null;
}

// ── Gemini API Key ────────────────────────────────────────────────────────────
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

function getGeminiApiKey() {
  try { const s = getSecret('gemini-api-key'); if (s?.value) return s.value; } catch { }
  return process.env.GEMINI_API_KEY || null;
}

export async function callGemini({ prompt, model = 'gemini-2.0-flash', maxTokens = 1024, temperature = 0.7 }) {
  const key = getGeminiApiKey();
  if (!key) return { provider: 'gemini', ok: false, error: 'NO_API_KEY', reply: 'Gemini API 키 미설정' };
  try {
    const res = await fetch(`${GEMINI_API_BASE}/models/${model}:generateContent?key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: maxTokens, temperature } })
    });
    if (!res.ok) return { provider: 'gemini', ok: false, error: `HTTP_${res.status}`, reply: await res.text() };
    const data = await res.json();
    return { provider: 'gemini', model, ok: true, reply: data.candidates?.[0]?.content?.parts?.[0]?.text || '', usage: data.usageMetadata || {} };
  } catch (err) { return { provider: 'gemini', ok: false, error: 'NETWORK_ERROR', reply: err.message }; }
}

export async function testGeminiApiKey() {
  const key = getGeminiApiKey();
  if (!key) return { connected: false, reason: 'API 키 미설정' };
  try {
    const res = await fetch(`${GEMINI_API_BASE}/models?key=${key}`);
    return { connected: res.ok, reason: res.ok ? 'OK' : `HTTP ${res.status}` };
  } catch (e) { return { connected: false, reason: e.message }; }
}

export function getGeminiStatus() {
  return { provider: 'gemini', configured: !!getGeminiApiKey(), authMethod: getGeminiApiKey() ? 'api_key' : 'none' };
}

// ── Gemini Google OAuth (gcloud) ──────────────────────────────────────────────
function checkGcloudAuth() {
  try {
    const r = spawnSync('gcloud', ['auth', 'print-access-token'], { encoding: 'utf8', timeout: 8000 });
    return { authenticated: r.status === 0 && !!(r.stdout || '').trim(), output: (r.stdout + r.stderr).trim() };
  } catch (e) { return { authenticated: false, output: e.message }; }
}

export function startGeminiOAuth() {
  if (!findBin('gcloud')) return { started: false, reason: 'gcloud CLI 미설치. https://cloud.google.com/sdk 참조' };
  try {
    const proc = spawn('gcloud', ['auth', 'login'], { detached: true, stdio: 'ignore' });
    proc.unref();
    return { started: true, reason: 'gcloud auth login 시작됨. 브라우저에서 Google 계정 인증을 완료해 주세요.' };
  } catch (e) { return { started: false, reason: e.message }; }
}

export async function testGeminiOAuth() {
  const auth = checkGcloudAuth();
  return { connected: auth.authenticated, reason: auth.authenticated ? 'Google OAuth 인증 완료' : (findBin('gcloud') ? '미인증' : 'gcloud CLI 미설치') };
}

export function getGeminiOAuthStatus() {
  if (!findBin('gcloud')) return { provider: 'gemini-oauth', configured: false, authMethod: 'none' };
  const auth = checkGcloudAuth();
  return { provider: 'gemini-oauth', configured: auth.authenticated, authMethod: auth.authenticated ? 'google_oauth' : 'none' };
}
