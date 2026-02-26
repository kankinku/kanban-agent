/**
 * preflight.js — 서버 기동 전 환경 자동 점검 + 자동 설치 모듈
 *
 * runPreflight() 호출 시:
 *  1. Node.js 버전 체크
 *  2. CLI 도구(gcloud / codex) 체크 → 미설치 시 자동 설치 → PATH 갱신 후 재탐색(최대 3회)
 *  3. 필수 npm global 패키지(codex) 재확인
 *  4. 환경변수(OPENAI_API_KEY 등) 경고
 *  5. fatal 항목이 1개라도 있으면 process.exit(1)
 */

import { spawnSync, execSync } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const IS_WIN = process.platform === 'win32';
const IS_MAC = process.platform === 'darwin';
const PLATFORM = IS_WIN ? 'win32' : IS_MAC ? 'darwin' : 'linux';

// ─── 유틸 ────────────────────────────────────────────────────────────────────

/** CLI 바이너리 PATH 탐색 */
function findBin(name) {
  const r = spawnSync(IS_WIN ? 'where' : 'which', [name], { encoding: 'utf8' });
  return r.status === 0 ? (r.stdout || '').trim().split('\n')[0].trim() : null;
}

/** Windows: 레지스트리에서 최신 PATH를 현재 프로세스에 반영 */
function refreshWindowsPath() {
  try {
    const r = spawnSync('powershell', [
      '-NoProfile', '-NonInteractive', '-Command',
      `[Environment]::GetEnvironmentVariable('PATH','Machine') + ';' + [Environment]::GetEnvironmentVariable('PATH','User')`
    ], { encoding: 'utf8', timeout: 6000 });
    if (r.status === 0 && r.stdout.trim()) process.env.PATH = r.stdout.trim();
  } catch { /* 무시 */ }
}

/** 설치 명령 동기 실행 (stdout/stderr 그대로 콘솔에 출력) */
function runInstall(cmd) {
  try {
    execSync(cmd, { stdio: 'inherit', timeout: 600_000 });
    return true;
  } catch {
    return false;
  }
}

/** PATH 갱신 후 바이너리를 최대 retries회, 간격 intervalMs ms로 재탐색 */
async function waitForBin(name, retries = 3, intervalMs = 1500) {
  for (let i = 0; i < retries; i++) {
    if (IS_WIN) refreshWindowsPath();
    if (findBin(name)) return true;
    if (i < retries - 1) await sleep(intervalMs);
  }
  return false;
}

// ─── CLI 도구 정의 ───────────────────────────────────────────────────────────

const CLI_TOOLS = [
  {
    name: 'gcloud',
    label: 'Google Cloud SDK',
    severity: 'warn',
    install: {
      win32:  'winget install --id Google.CloudSDK -e --silent --accept-package-agreements --accept-source-agreements',
      darwin: 'brew install --cask google-cloud-sdk',
      linux:  'curl https://sdk.cloud.google.com | bash -s -- --disable-prompts',
    },
    manual: 'https://cloud.google.com/sdk',
  },
  {
    name: 'codex',
    label: 'OpenAI Codex CLI',
    severity: 'warn',
    install: {
      win32:  'npm install -g @openai/codex',
      darwin: 'npm install -g @openai/codex',
      linux:  'npm install -g @openai/codex',
    },
    manual: 'npm install -g @openai/codex',
  },
];

// ─── 환경변수 정의 ────────────────────────────────────────────────────────────

const ENV_CHECKS = [
  { key: 'OPENAI_API_KEY',  label: 'OpenAI API Key',   severity: 'warn', note: 'openai 프로바이더 비활성' },
  { key: 'GEMINI_API_KEY',  label: 'Gemini API Key',   severity: 'warn', note: 'gemini 프로바이더 비활성' },
];

// ─── 점검 함수들 ──────────────────────────────────────────────────────────────

/** Node.js 버전이 최소 요구치 이상인지 확인 */
function checkNodeVersion(minMajor = 18) {
  const ver = process.versions.node;
  const major = parseInt(ver.split('.')[0], 10);
  if (major < minMajor) {
    return { ok: false, severity: 'fatal', message: `Node.js v${ver} — v${minMajor}+ 필요` };
  }
  return { ok: true, message: `Node.js v${ver}` };
}

/**
 * CLI 도구 체크 + 미설치 시 자동 설치
 * @returns {{ ok: boolean, severity: string, message: string }}
 */
async function checkCli(tool) {
  if (findBin(tool.name)) {
    return { ok: true, message: tool.name };
  }

  // 자동 설치 시도
  console.log(`[preflight]  ↓ ${tool.name} (${tool.label}) 미설치 → 자동 설치 시작...`);
  const installCmd = tool.install[PLATFORM];
  const installed = runInstall(installCmd);

  if (installed) {
    const found = await waitForBin(tool.name);
    if (found) {
      return { ok: true, message: `${tool.name} 설치 완료` };
    }
  }

  // 설치 실패
  return {
    ok: false,
    severity: tool.severity,
    message: `${tool.name} 자동 설치 실패 → 수동 설치: ${tool.manual}`,
  };
}

/** 환경변수 존재 여부 */
function checkEnv(envDef) {
  if (process.env[envDef.key]) return { ok: true, message: `${envDef.key} ✓` };
  return {
    ok: false,
    severity: envDef.severity,
    message: `${envDef.key} 미설정 (${envDef.note})`,
  };
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * 서버 기동 전 전체 환경 점검 + 자동 설치 실행
 * fatal 항목이 있으면 process.exit(1)
 */
export async function runPreflight() {
  console.log('\n[preflight] ══════════════════════════════════');
  console.log('[preflight]  환경 점검 시작');
  console.log('[preflight] ══════════════════════════════════');

  const results = [];

  // 1. Node.js 버전
  const nodeResult = checkNodeVersion(18);
  results.push(nodeResult);

  // 2. CLI 도구 (순차 실행 — 각 설치가 PATH에 영향을 줄 수 있으므로)
  for (const tool of CLI_TOOLS) {
    const r = await checkCli(tool);
    results.push(r);
  }

  // 3. 환경변수
  for (const envDef of ENV_CHECKS) {
    results.push(checkEnv(envDef));
  }

  // ─── 결과 출력 ─────────────────────────────────────────────────────────────
  console.log('[preflight] ──────────────────────────────────');
  let fatals = 0;
  let warns = 0;
  for (const r of results) {
    if (r.ok) {
      console.log(`[preflight]  ✓ ${r.message}`);
    } else if (r.severity === 'fatal') {
      console.error(`[preflight]  ✗ [FATAL] ${r.message}`);
      fatals++;
    } else {
      console.warn(`[preflight]  ! [warn]  ${r.message}`);
      warns++;
    }
  }

  console.log('[preflight] ──────────────────────────────────');
  console.log(`[preflight]  완료 — fatal:${fatals} / warn:${warns}`);
  console.log('[preflight] ══════════════════════════════════\n');

  if (fatals > 0) {
    console.error('[preflight] 치명적 오류가 있어 서버를 시작할 수 없습니다.');
    process.exit(1);
  }
}
