import { spawnSync, spawn } from 'node:child_process';

const IS_WIN = process.platform === 'win32';

function findBin(cmd) {
  const r = spawnSync(IS_WIN ? 'where' : 'which', [cmd], { encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim().split('\n')[0].trim() : null;
}

function runSync(bin, args, timeout = 8000, cwd = process.cwd()) {
  try {
    return spawnSync(bin, args, { encoding: 'utf8', timeout, cwd, shell: IS_WIN });
  } catch (error) {
    return { status: 1, stdout: '', stderr: error.message };
  }
}

function checkCodexAuth() {
  const bin = findBin('codex');
  if (!bin) return { authenticated: false, output: 'codex CLI 미설치' };

  const r = runSync(bin, ['login', 'status'], 10000);
  const out = `${r.stdout || ''}${r.stderr || ''}`.trim();
  return { authenticated: r.status === 0, output: out || '인증 상태 확인 실패' };
}

export async function callCodex({ prompt, mode = 'ask', workDir = '.' }) {
  const bin = findBin('codex');
  if (!bin) {
    return { provider: 'codex', ok: false, error: 'NOT_INSTALLED', reply: 'Codex CLI 미설치' };
  }

  const auth = checkCodexAuth();
  if (!auth.authenticated) {
    return { provider: 'codex', ok: false, error: 'NOT_AUTHENTICATED', reply: `인증 필요: ${auth.output}` };
  }

  const args = [
    ...(mode === 'auto-edit' ? ['--auto-edit'] : mode === 'full-auto' ? ['--full-auto'] : []),
    prompt
  ];
  const r = runSync(bin, args, 120000, workDir);
  return { provider: 'codex', ok: r.status === 0, reply: (r.stdout || r.stderr || '(empty)').trim() };
}

function quoteArg(arg) {
  const s = String(arg ?? '');
  if (!s) return '""';
  return /[\s"]/u.test(s) ? `"${s.replace(/"/g, '\\"')}"` : s;
}

function openInWindowsCmd(bin, args) {
  const command = [quoteArg(bin), ...args.map(quoteArg)].join(' ');
  const proc = spawn('cmd.exe', ['/d', '/s', '/c', 'start', '""', 'cmd.exe', '/k', command], {
    detached: true,
    stdio: 'ignore'
  });
  proc.on('error', (e) => console.warn('[codex] spawn 오류 (무시됨):', e.message));
  proc.unref();
}

export function startCodexLogin() {
  const bin = findBin('codex');
  if (!bin) return { started: false, reason: 'Codex CLI 미설치. npm install -g @openai/codex' };

  try {
    if (IS_WIN) {
      openInWindowsCmd(bin, ['login']);
    } else {
      const proc = spawn(bin, ['login'], { detached: true, stdio: 'ignore' });
      proc.on('error', (e) => console.warn('[codex] spawn 오류 (무시됨):', e.message));
      proc.unref();
    }

    return { started: true, reason: 'codex login 시작됨. 인증을 완료해 주세요.' };
  } catch (e) {
    return { started: false, reason: e.message };
  }
}

export async function testConnection() {
  const bin = findBin('codex');
  if (!bin) return { connected: false, reason: 'Codex CLI 미설치' };
  const auth = checkCodexAuth();
  return { connected: auth.authenticated, reason: auth.authenticated ? 'OAuth 인증 완료' : auth.output };
}

export function getStatus() {
  const bin = findBin('codex');
  if (!bin) return { provider: 'codex', configured: false, authMethod: 'none' };
  const auth = checkCodexAuth();
  return { provider: 'codex', configured: auth.authenticated, authMethod: auth.authenticated ? 'oauth' : 'none' };
}
