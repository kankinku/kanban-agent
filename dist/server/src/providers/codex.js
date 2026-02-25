import { spawnSync, spawn } from 'node:child_process';

function findBin(cmd) {
  const r = spawnSync(process.platform === 'win32' ? 'where' : 'which', [cmd], { encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim().split('\n')[0].trim() : null;
}

function checkCodexAuth() {
  try {
    const r = spawnSync('codex', ['auth', 'status'], { encoding: 'utf8', timeout: 8000 });
    const out = (r.stdout + r.stderr).trim();
    return { authenticated: r.status === 0, output: out };
  } catch (e) { return { authenticated: false, output: e.message }; }
}

export async function callCodex({ prompt, mode = 'ask', workDir = '.' }) {
  if (!findBin('codex')) return { provider: 'codex', ok: false, error: 'NOT_INSTALLED', reply: 'Codex CLI 미설치' };
  const auth = checkCodexAuth();
  if (!auth.authenticated) return { provider: 'codex', ok: false, error: 'NOT_AUTHENTICATED', reply: `인증 필요: ${auth.output}` };
  const args = [...(mode === 'auto-edit' ? ['--auto-edit'] : mode === 'full-auto' ? ['--full-auto'] : []), prompt];
  const r = spawnSync('codex', args, { encoding: 'utf8', timeout: 120000, cwd: workDir });
  return { provider: 'codex', ok: r.status === 0, reply: (r.stdout || r.stderr || '(empty)').trim() };
}

export function startCodexLogin() {
  if (!findBin('codex')) return { started: false, reason: 'Codex CLI 미설치. npm install -g @openai/codex' };
  try {
    const proc = spawn('codex', ['auth', 'login'], { detached: true, stdio: 'ignore' });
    proc.unref();
    return { started: true, reason: 'codex auth login 시작됨. 브라우저 또는 터미널에서 인증을 완료해 주세요.' };
  } catch (e) { return { started: false, reason: e.message }; }
}

export async function testConnection() {
  if (!findBin('codex')) return { connected: false, reason: 'Codex CLI 미설치' };
  const auth = checkCodexAuth();
  return { connected: auth.authenticated, reason: auth.authenticated ? 'OAuth 인증 완료' : auth.output };
}

export function getStatus() {
  if (!findBin('codex')) return { provider: 'codex', configured: false, authMethod: 'none' };
  const auth = checkCodexAuth();
  return { provider: 'codex', configured: auth.authenticated, authMethod: auth.authenticated ? 'oauth' : 'none' };
}
