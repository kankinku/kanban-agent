import { spawn, spawnSync } from 'node:child_process';
import { getSecret, getSecretByProvider, saveSecret } from '../services/secretService.js';

const IS_WIN = process.platform === 'win32';
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

function findBin(cmd) {
  const r = spawnSync(IS_WIN ? 'where' : 'which', [cmd], { encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim().split('\n')[0].trim() : null;
}

function runSync(bin, args, timeout = 10000) {
  try {
    return spawnSync(bin, args, { encoding: 'utf8', timeout, shell: IS_WIN });
  } catch (error) {
    return { status: 1, stdout: '', stderr: error.message };
  }
}

function quoteArg(arg) {
  const s = String(arg ?? '');
  if (!s) return '""';
  return /[\s"]/u.test(s) ? `"${s.replace(/"/g, '\\"')}"` : s;
}

function getGeminiCliBin() {
  return findBin('gemini');
}

function getGeminiApiKey() {
  try {
    const byProvider = getSecretByProvider('gemini', 'api-key');
    if (byProvider?.value) return byProvider.value;

    // backward compatibility
    const legacy = getSecret('gemini-api-key');
    if (legacy?.value) return legacy.value;
  } catch {
    // ignore
  }
  return process.env.GEMINI_API_KEY || null;
}

function getStoredOAuthToken() {
  const candidates = [
    ['google-gemini-cli', 'access-token'],
    ['gemini-oauth', 'access-token'],
    ['google-antigravity', 'access-token']
  ];

  for (const [provider, keyName] of candidates) {
    try {
      const s = getSecretByProvider(provider, keyName);
      if (s?.value) return s.value;
    } catch {
      // ignore
    }
  }

  return null;
}

function getGcloudAccessToken() {
  const gcloud = findBin('gcloud');
  if (!gcloud) return null;

  const r = runSync(gcloud, ['auth', 'print-access-token'], 12000);
  if (r.status !== 0) return null;

  const token = (r.stdout || '').trim();
  return token || null;
}

function getGeminiOAuthToken() {
  return getStoredOAuthToken() || getGcloudAccessToken();
}

function getOAuthStatusMarker() {
  return getSecretByProvider('google-gemini-cli', 'auth-status')?.value || null;
}

function markOAuthConnected(source) {
  saveSecret({
    provider: 'google-gemini-cli',
    keyName: 'auth-status',
    value: 'connected',
    metadata: { source, updatedAt: new Date().toISOString() }
  });
}

function extractCliReply(raw) {
  const trimmed = (raw || '').trim();
  if (!trimmed) return '';

  const lines = trimmed.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  const candidates = [trimmed, ...lines.slice().reverse()];

  for (const chunk of candidates) {
    try {
      const parsed = JSON.parse(chunk);
      const text =
        (typeof parsed?.response === 'string' ? parsed.response : null) ||
        parsed?.response?.candidates?.[0]?.content?.parts?.[0]?.text ||
        parsed?.candidates?.[0]?.content?.parts?.[0]?.text ||
        parsed?.output_text ||
        parsed?.text ||
        parsed?.message;
      if (typeof text === 'string' && text.trim()) return text.trim();
    } catch {
      // ignore parse errors
    }
  }

  return trimmed;
}

function callGeminiCli({ prompt, model = 'gemini-2.0-flash', timeoutMs = 120000 }) {
  const gemini = getGeminiCliBin();
  if (!gemini) return { ok: false, error: 'GEMINI_CLI_NOT_INSTALLED', reply: 'Gemini CLI가 설치되어 있지 않습니다.' };

  const cleanedPrompt = String(prompt || '').replace(/\s+/g, ' ').trim();
  if (!cleanedPrompt) return { ok: false, error: 'EMPTY_PROMPT', reply: 'Gemini 요청 프롬프트가 비어 있습니다.' };

  const args = ['--output-format', 'json'];
  if (model) args.push('--model', model);
  args.push(cleanedPrompt);

  const r = runSync(gemini, args, timeoutMs);
  const stdout = (r.stdout || '').trim();
  const stderr = (r.stderr || '').trim();

  if (r.status !== 0) {
    return { ok: false, error: 'GEMINI_CLI_FAILED', reply: stderr || stdout || `exit ${r.status}` };
  }

  markOAuthConnected('gemini_cli');
  return { ok: true, reply: extractCliReply(stdout || stderr), usage: {} };
}

function buildGeminiRequest({ prompt, model, maxTokens, temperature }, { forceOAuth = false } = {}) {
  const apiKey = forceOAuth ? null : getGeminiApiKey();
  const oauthToken = getGeminiOAuthToken();

  if (!apiKey && !oauthToken) {
    return { ok: false, error: 'NO_AUTH', reason: 'Gemini API Key 또는 Google OAuth 인증이 없습니다.' };
  }

  const headers = { 'Content-Type': 'application/json' };
  let url = `${GEMINI_API_BASE}/models/${model}:generateContent`;

  if (apiKey) {
    url += `?key=${encodeURIComponent(apiKey)}`;
  } else {
    headers.Authorization = `Bearer ${oauthToken}`;
  }

  return {
    ok: true,
    url,
    headers,
    authMethod: apiKey ? 'api_key' : 'google_oauth',
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: maxTokens, temperature }
    })
  };
}

export async function callGemini({
  prompt,
  model = 'gemini-2.0-flash',
  maxTokens = 1024,
  temperature = 0.7,
  forceOAuth = false
}) {
  const req = buildGeminiRequest({ prompt, model, maxTokens, temperature }, { forceOAuth });
  if (!req.ok) return { provider: 'gemini', ok: false, error: req.error, reply: req.reason };

  try {
    const res = await fetch(req.url, {
      method: 'POST',
      headers: req.headers,
      body: req.body
    });

    if (!res.ok) {
      return { provider: 'gemini', model, ok: false, error: `HTTP_${res.status}`, reply: await res.text() };
    }

    const data = await res.json();
    return {
      provider: 'gemini',
      model,
      ok: true,
      authMethod: req.authMethod,
      reply: data.candidates?.[0]?.content?.parts?.[0]?.text || '',
      usage: data.usageMetadata || {}
    };
  } catch (err) {
    return { provider: 'gemini', model, ok: false, error: 'NETWORK_ERROR', reply: err.message };
  }
}

export async function callGeminiOAuth(params) {
  const cliResult = callGeminiCli({
    prompt: params?.prompt,
    model: params?.model || 'gemini-2.0-flash',
    timeoutMs: 120000
  });

  if (cliResult.ok) {
    return {
      provider: 'gemini-oauth',
      model: params?.model || 'gemini-2.0-flash',
      ok: true,
      authMethod: 'gemini_cli_oauth',
      reply: cliResult.reply,
      usage: cliResult.usage
    };
  }

  const tokenBased = await callGemini({ ...params, forceOAuth: true });
  if (!tokenBased.ok && !getGeminiOAuthToken() && cliResult.reply) {
    return {
      provider: 'gemini-oauth',
      model: params?.model || 'gemini-2.0-flash',
      ok: false,
      error: 'OAUTH_NOT_CONNECTED',
      reply: cliResult.reply
    };
  }
  return tokenBased;
}

export async function testGeminiApiKey() {
  const key = getGeminiApiKey();
  if (!key) return { connected: false, reason: 'API 키가 없습니다.' };

  try {
    const res = await fetch(`${GEMINI_API_BASE}/models?key=${encodeURIComponent(key)}`);
    return { connected: res.ok, reason: res.ok ? 'OK' : `HTTP ${res.status}` };
  } catch (e) {
    return { connected: false, reason: e.message };
  }
}

export async function testGeminiOAuth() {
  const token = getGeminiOAuthToken();
  if (token) {
    try {
      const res = await fetch(`${GEMINI_API_BASE}/models`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        markOAuthConnected('oauth_token');
        return { connected: true, reason: 'OK' };
      }
      return { connected: false, reason: `HTTP ${res.status}` };
    } catch (e) {
      return { connected: false, reason: e.message };
    }
  }

  const cliSmoke = callGeminiCli({
    prompt: 'Reply with exactly: OK',
    model: 'gemini-2.0-flash',
    timeoutMs: 40000
  });
  if (cliSmoke.ok) return { connected: true, reason: 'OK (Gemini CLI OAuth)' };

  return {
    connected: false,
    reason: cliSmoke.reply || 'Google OAuth 토큰이 없습니다. gemini auth login 또는 gcloud auth login을 먼저 진행해주세요.'
  };
}

export function getGeminiStatus() {
  const configured = !!getGeminiApiKey();
  return { provider: 'gemini', configured, authMethod: configured ? 'api_key' : 'none' };
}

export function getGeminiOAuthStatus() {
  const hasOAuth = !!getGeminiOAuthToken() || getOAuthStatusMarker() === 'connected';
  return {
    provider: 'gemini-oauth',
    configured: hasOAuth,
    authMethod: hasOAuth ? (getGeminiCliBin() ? 'gemini_cli_oauth' : 'google_oauth') : 'none'
  };
}

function startDetached(bin, args) {
  try {
    const proc = spawn(bin, args, { detached: true, stdio: 'ignore', shell: IS_WIN });
    proc.on('error', (e) => console.warn(`[${bin}] spawn error:`, e.message));
    proc.unref();
    return { started: true };
  } catch (error) {
    return { started: false, reason: error.message };
  }
}

function startInWindowsCmd(bin, args, label) {
  try {
    const command = [quoteArg(bin), ...args.map(quoteArg)].join(' ');
    const proc = spawn('cmd.exe', ['/d', '/s', '/c', 'start', '""', 'cmd.exe', '/k', command], {
      detached: true,
      stdio: 'ignore'
    });
    proc.on('error', (e) => console.warn(`[${label}] spawn error:`, e.message));
    proc.unref();
    return { started: true };
  } catch (error) {
    return { started: false, reason: error.message };
  }
}

function startGeminiCliAuth() {
  const gemini = getGeminiCliBin();
  if (!gemini) return { started: false, reason: 'Gemini CLI가 설치되어 있지 않습니다.' };

  const result = IS_WIN
    ? startInWindowsCmd(gemini, ['auth', 'login'], 'gemini')
    : startDetached(gemini, ['auth', 'login']);
  if (!result.started) return result;

  return {
    started: true,
    reason: IS_WIN
      ? 'Gemini 인증용 cmd 창을 열었습니다. 로그인 완료 후 상태 확인을 눌러주세요.'
      : 'Gemini CLI 인증을 시작했습니다. 브라우저에서 로그인 완료 후 상태 확인을 눌러주세요.'
  };
}

function startGcloudAuth() {
  const gcloud = findBin('gcloud');
  if (!gcloud) return { started: false, reason: 'gcloud CLI가 설치되어 있지 않습니다. https://cloud.google.com/sdk' };

  const result = IS_WIN
    ? startInWindowsCmd(gcloud, ['auth', 'login'], 'gcloud')
    : startDetached(gcloud, ['auth', 'login']);
  if (!result.started) return result;

  return {
    started: true,
    reason: IS_WIN
      ? 'gcloud 인증용 cmd 창을 열었습니다. 로그인 완료 후 상태 확인을 눌러주세요.'
      : 'gcloud auth login을 시작했습니다. 브라우저에서 Google 로그인 후 상태 확인을 눌러주세요.'
  };
}

export function startGeminiOAuth() {
  const viaGeminiCli = startGeminiCliAuth();
  if (viaGeminiCli.started) return viaGeminiCli;
  return startGcloudAuth();
}
