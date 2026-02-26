import { spawnSync, spawn } from 'node:child_process';
import { exec } from 'node:child_process';
import { getSecretByProvider, saveSecret } from '../services/secretService.js';

const IS_WIN = process.platform === 'win32';

const GITHUB_DEVICE_CODE_URL = 'https://github.com/login/device/code';
const GITHUB_ACCESS_TOKEN_URL = 'https://github.com/login/oauth/access_token';
const GITHUB_COPILOT_TOKEN_URL = 'https://api.github.com/copilot_internal/v2/token';
const COPILOT_API_BASE = 'https://api.individual.githubcopilot.com';

// OpenClaw and many clients use this GitHub OAuth app client_id for Copilot flow.
const COPILOT_OAUTH_CLIENT_ID = process.env.GITHUB_COPILOT_OAUTH_CLIENT_ID || 'Iv1.b507a08c87ecfe98';
const COPILOT_OAUTH_SCOPE = process.env.GITHUB_COPILOT_OAUTH_SCOPE || 'read:user';

const COPILOT_TOKEN_SKEW_MS = 30_000;

/** @type {{status:'pending'|'success'|'error', userCode?:string, expiresAt?:number, message?:string}|null} */
let deviceFlowState = null;
/** @type {{token:string, expiresAt:number}|null} */
let cachedCopilotToken = null;

function findGhBin() {
  const result = spawnSync(IS_WIN ? 'where' : 'which', ['gh'], { encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim().split('\n')[0].trim() : null;
}

function checkGhAuthStatus() {
  const bin = findGhBin();
  if (!bin) return { authenticated: false, output: 'gh CLI 미설치' };
  try {
    const result = spawnSync(bin, ['auth', 'status'], { encoding: 'utf8', timeout: 10_000, shell: IS_WIN });
    const output = `${result.stdout || ''}${result.stderr || ''}`.trim();
    const authenticated = result.status === 0 || output.includes('Logged in') || output.includes('oauth_token');
    return { authenticated, output };
  } catch (err) {
    return { authenticated: false, output: err.message };
  }
}

function getGhCliToken() {
  const bin = findGhBin();
  if (!bin) return null;
  try {
    const result = spawnSync(bin, ['auth', 'token'], { encoding: 'utf8', timeout: 10_000, shell: IS_WIN });
    if (result.status !== 0) return null;
    const token = (result.stdout || '').trim();
    return token || null;
  } catch {
    return null;
  }
}

function openBrowser(url) {
  const cmd = IS_WIN
    ? `start "" "${url}"`
    : process.platform === 'darwin'
      ? `open "${url}"`
      : `xdg-open "${url}"`;
  exec(cmd, () => {});
}

function getStoredGithubToken() {
  try {
    const s = getSecretByProvider('github-copilot', 'github-token');
    if (s?.value) return s.value;
  } catch {
    // ignore
  }
  return null;
}

function getGithubAccessToken() {
  return getStoredGithubToken() || process.env.GITHUB_TOKEN || getGhCliToken();
}

function parseDateToMillis(value) {
  if (!value) return Date.now() + 10 * 60_000;
  const millis = new Date(value).getTime();
  return Number.isFinite(millis) ? millis : Date.now() + 10 * 60_000;
}

async function exchangeGithubToCopilotToken(githubToken) {
  const res = await fetch(GITHUB_COPILOT_TOKEN_URL, {
    headers: {
      Accept: 'application/json',
      Authorization: `token ${githubToken}`,
      'User-Agent': 'kanban-agent-copilot'
    }
  });
  if (!res.ok) {
    const body = await res.text();
    return { ok: false, reason: `HTTP_${res.status}: ${body}` };
  }
  const data = await res.json();
  const token = data?.token;
  if (!token) return { ok: false, reason: 'Copilot token 응답이 비어 있습니다.' };
  const expiresAt = parseDateToMillis(data.expires_at);
  return { ok: true, token, expiresAt };
}

async function getCopilotAccessToken() {
  if (cachedCopilotToken && cachedCopilotToken.expiresAt - Date.now() > COPILOT_TOKEN_SKEW_MS) {
    return { ok: true, token: cachedCopilotToken.token, source: 'cache' };
  }

  const githubToken = getGithubAccessToken();
  if (!githubToken) return { ok: false, reason: 'GitHub access token이 없습니다.' };

  const exchanged = await exchangeGithubToCopilotToken(githubToken);
  if (!exchanged.ok) return { ok: false, reason: exchanged.reason };

  cachedCopilotToken = { token: exchanged.token, expiresAt: exchanged.expiresAt };
  return { ok: true, token: exchanged.token, source: 'exchanged' };
}

function normalizeModel(model) {
  if (!model) return 'gpt-4o';
  if (model.startsWith('copilot-')) return model.replace(/^copilot-/, '');
  return model;
}

async function callCopilotApi({ prompt, model }) {
  const access = await getCopilotAccessToken();
  if (!access.ok) {
    return {
      provider: 'github-copilot',
      ok: false,
      error: 'NOT_AUTHENTICATED',
      reply: access.reason
    };
  }

  try {
    const res = await fetch(`${COPILOT_API_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${access.token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent': 'GitHubCopilotChat/0.13.0',
        'editor-version': 'vscode/1.95.0',
        'editor-plugin-version': 'copilot-chat/0.22.0'
      },
      body: JSON.stringify({
        model: normalizeModel(model),
        messages: [{ role: 'user', content: prompt }],
        stream: false
      })
    });

    if (!res.ok) {
      return {
        provider: 'github-copilot',
        model,
        ok: false,
        error: `HTTP_${res.status}`,
        reply: await res.text()
      };
    }

    const data = await res.json();
    return {
      provider: 'github-copilot',
      model,
      ok: true,
      reply: data?.choices?.[0]?.message?.content || '',
      usage: data?.usage || {}
    };
  } catch (err) {
    return { provider: 'github-copilot', model, ok: false, error: 'NETWORK_ERROR', reply: err.message };
  }
}

function callGhCopilotFallback(prompt, model) {
  const bin = findGhBin();
  if (!bin) {
    return {
      provider: 'github-copilot',
      model,
      ok: false,
      error: 'GH_NOT_INSTALLED',
      reply: 'GitHub CLI(gh)가 설치되어 있지 않습니다.'
    };
  }
  const auth = checkGhAuthStatus();
  if (!auth.authenticated) {
    return {
      provider: 'github-copilot',
      model,
      ok: false,
      error: 'NOT_AUTHENTICATED',
      reply: `GitHub 인증이 필요합니다: ${auth.output}`
    };
  }

  try {
    const result = spawnSync(bin, ['copilot', 'suggest', '-t', 'shell', prompt], {
      encoding: 'utf8',
      timeout: 60_000,
      shell: IS_WIN
    });
    const output = (result.stdout || '').trim() || (result.stderr || '').trim();
    return {
      provider: 'github-copilot',
      model,
      ok: result.status === 0,
      reply: output || '(empty output)',
      exitCode: result.status
    };
  } catch (err) {
    return { provider: 'github-copilot', model, ok: false, error: 'RUNTIME_ERROR', reply: err.message };
  }
}

export async function callGithubCopilot({ prompt, model = 'copilot-gpt-4o' }) {
  const apiResult = await callCopilotApi({ prompt, model });
  if (apiResult.ok) return apiResult;
  return callGhCopilotFallback(prompt, model);
}

async function pollDeviceAccessToken({ deviceCode, intervalSeconds, expiresAt, userCode }) {
  let interval = intervalSeconds;

  while (Date.now() < expiresAt) {
    await new Promise(resolve => setTimeout(resolve, interval * 1000));

    const body = new URLSearchParams({
      client_id: COPILOT_OAUTH_CLIENT_ID,
      device_code: deviceCode,
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
    });

    let res;
    try {
      res = await fetch(GITHUB_ACCESS_TOKEN_URL, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
        body
      });
    } catch (error) {
      deviceFlowState = { status: 'error', userCode, message: `네트워크 오류: ${error.message}` };
      return;
    }

    const data = await res.json();
    if (data.access_token) {
      saveSecret({
        provider: 'github-copilot',
        keyName: 'github-token',
        value: data.access_token,
        metadata: { source: 'device_flow', updatedAt: new Date().toISOString() }
      });
      deviceFlowState = { status: 'success', message: 'GitHub Copilot 인증이 완료되었습니다.' };
      return;
    }

    if (data.error === 'authorization_pending') continue;
    if (data.error === 'slow_down') {
      interval += 5;
      continue;
    }
    if (data.error === 'expired_token') {
      deviceFlowState = { status: 'error', userCode, message: '디바이스 코드가 만료되었습니다. 다시 시도해주세요.' };
      return;
    }

    deviceFlowState = { status: 'error', userCode, message: data.error_description || data.error || '인증 실패' };
    return;
  }

  deviceFlowState = { status: 'error', userCode, message: '인증 시간이 만료되었습니다. 다시 시도해주세요.' };
}

export async function startDeviceAuthLogin() {
  try {
    const body = new URLSearchParams({
      client_id: COPILOT_OAUTH_CLIENT_ID,
      scope: COPILOT_OAUTH_SCOPE
    });
    const res = await fetch(GITHUB_DEVICE_CODE_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body
    });

    if (!res.ok) {
      return { started: false, reason: `GitHub device code 요청 실패 (HTTP ${res.status})` };
    }

    const data = await res.json();
    const userCode = data.user_code;
    const verificationUri = data.verification_uri;
    const verificationUriComplete = data.verification_uri_complete;
    const deviceCode = data.device_code;
    const interval = Number(data.interval || 5);
    const expiresIn = Number(data.expires_in || 900);
    const expiresAt = Date.now() + expiresIn * 1000;

    if (!deviceCode || !verificationUri || !userCode) {
      return { started: false, reason: 'GitHub device flow 응답이 올바르지 않습니다.' };
    }

    deviceFlowState = { status: 'pending', userCode, expiresAt, message: '브라우저 인증 대기중' };
    const targetUrl = verificationUriComplete || verificationUri;
    openBrowser(targetUrl);

    void pollDeviceAccessToken({
      deviceCode,
      intervalSeconds: interval,
      expiresAt,
      userCode
    });

    return {
      started: true,
      reason: `브라우저에서 GitHub 로그인 후 코드를 승인해주세요. 코드: ${userCode}`,
      userCode,
      verificationUri,
      verificationUriComplete
    };
  } catch (err) {
    return { started: false, reason: err.message };
  }
}

// Backward-compatible name used in existing provider hub
export function startGhAuthLogin() {
  return startDeviceAuthLogin();
}

export async function testConnection() {
  const access = await getCopilotAccessToken();
  if (access.ok) return { connected: true, reason: 'OK (Copilot token 발급 성공)' };

  if (deviceFlowState?.status === 'pending') {
    return {
      connected: false,
      reason: `GitHub 디바이스 인증 진행 중입니다. 코드: ${deviceFlowState.userCode || '-'}`
    };
  }

  const ghStatus = checkGhAuthStatus();
  if (ghStatus.authenticated) return { connected: true, reason: 'OK (gh CLI 인증됨)' };

  return { connected: false, reason: access.reason || ghStatus.output || '인증되지 않음' };
}

export function getStatus() {
  const hasToken = !!getStoredGithubToken();
  if (hasToken) {
    return { provider: 'github-copilot', configured: true, authMethod: 'device_oauth' };
  }

  const ghStatus = checkGhAuthStatus();
  if (ghStatus.authenticated) {
    return { provider: 'github-copilot', configured: true, authMethod: 'gh_cli_oauth' };
  }

  if (deviceFlowState?.status === 'pending') {
    return {
      provider: 'github-copilot',
      configured: false,
      authMethod: 'oauth_pending',
      pendingUserCode: deviceFlowState.userCode
    };
  }

  return { provider: 'github-copilot', configured: false, authMethod: 'none' };
}
