import { exec } from 'node:child_process';
import { runPreflight } from './lib/preflight.js';
import { runCycle } from './orchestrator.js';
import { isOrchestratorPaused } from './control.js';
import { getAllProviderStatus } from './providers/index.js';
import './api/server.js';

// ─── 사전 환경 점검 + 자동 설치 ──────────────────────────────────────────────
await runPreflight();

// ─── (아래는 preflight 통과 후 실행) ─────────────────────────────────────────
const PORT = Number(process.env.PORT || 4100);

// ─── AI 프로바이더 상태 확인 ───────────────────────────────────────────────
setTimeout(() => {
  console.log('\n[AI] === 프로바이더 연결 상태 ===');
  try {
    const statuses = getAllProviderStatus();
    for (const s of statuses) {
      const icon = s.connected ? '✓' : '✗';
      console.log(`[AI] ${icon} ${s.provider || s.name || JSON.stringify(s)}`);
    }
  } catch (e) {
    console.warn('[AI] 상태 확인 실패:', e.message);
  }
  console.log('[AI] ================================\n');

  // ─── 브라우저 자동 열기 ────────────────────────────────────────────────
  const url = `http://localhost:${PORT}`;
  console.log(`[browser] Opening ${url} ...`);
  // Windows: start, macOS: open, Linux: xdg-open
  const cmd = process.platform === 'win32' ? `start "" "${url}"` :
              process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`;
  exec(cmd, (err) => {
    if (err) console.warn('[browser] 자동 열기 실패 (수동으로 접속하세요):', url);
  });
}, 2000); // 서버가 완전히 기동된 후 실행

// ─── 자동 스케줄러 ─────────────────────────────────────────────────────────
const CYCLE_INTERVAL_MS = Number(process.env.KANBAN_CYCLE_INTERVAL_MS || 30_000);
if (CYCLE_INTERVAL_MS > 0) {
  console.log(`[scheduler] Auto-cycle enabled: every ${CYCLE_INTERVAL_MS / 1000}s`);
  setInterval(async () => {
    if (isOrchestratorPaused()) return;
    try {
      const result = await runCycle();
      if (result.moved > 0) {
        console.log(`[scheduler] cycle done — moved=${result.moved}`, JSON.stringify(result.reports || []));
      }
    } catch (err) {
      console.error('[scheduler] cycle error:', err.message);
    }
  }, CYCLE_INTERVAL_MS);
}

