import { createServer } from 'node:http';
import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// exe 패키징 여부에 따라 web 경로 결정
const isPkg = typeof process.pkg !== 'undefined';
const WEB_DIR = isPkg
  ? join(dirname(process.execPath), 'web')
  : join(__dirname, '../../../web');
import {
  listTasks, getTask, createTask, updateTaskStatus,
  listArtifacts, addArtifact, addReviewReport, listReviewReports, listAllReviewReports,
  listAuditEvents, listDecisionEvents, listBlockedTasks,
  listAgents, getAgent, createAgent, updateAgent, deleteAgent,
  upsertDefaultAgents, acquireTaskLock, releaseTaskLock, setTaskAssignee,
  listBoards, getBoard, createBoard, updateBoard, deleteBoard, ensureDefaultBoard
} from '../services/kanbanService.js';
import { runCycle } from '../orchestrator.js';
import { isOrchestratorPaused, setOrchestratorPaused, orchestratorStatus } from '../control.js';
import { saveSecret, listSecrets, deleteSecret } from '../services/secretService.js';
import { getAllProviderStatus, testProvider, triggerOAuthLogin } from '../providers/index.js';

const PORT = Number(process.env.PORT || 4100);

function addCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function sendJson(res, code, data) {
  const body = JSON.stringify(data);
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' });
  res.end(body);
}

function parseJson(req) {
  return new Promise(resolve => {
    let data = '';
    req.on('data', c => (data += c));
    req.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve({}); } });
  });
}

function matchPath(path, template) {
  const a = path.split('/').filter(Boolean);
  const b = template.split('/').filter(Boolean);
  if (a.length !== b.length) return null;
  const params = {};
  for (let i = 0; i < a.length; i++) {
    if (b[i].startsWith('{')) { params[b[i].replace(/[{}]/g, '')] = a[i]; }
    else if (a[i] !== b[i]) return null;
  }
  return params;
}

const server = createServer(async (req, res) => {
  addCors(res);
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  const url = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
  const path = url.pathname;
  const method = req.method || 'GET';

  // ─── Web Dashboard ─────────────────────────────────────────────────────
  if (method === 'GET' && (path === '/' || path === '/index.html')) {
    const htmlPath = join(WEB_DIR, 'index.html');
    if (existsSync(htmlPath)) {
      const html = readFileSync(htmlPath, 'utf-8');
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      return res.end(html);
    } else {
      res.writeHead(404, { 'content-type': 'text/plain' });
      return res.end(`web/index.html not found at: ${htmlPath}`);
    }
  }

  // ─── Health ──────────────────────────────────────────────────────────
  if (method === 'GET' && (path === '/health' || path === '/api/health')) {
    return sendJson(res, 200, { ok: true, version: 'v0.3.0' });
  }

  // ─── Boards ─────────────────────────────────────────────────────────
  let m;
  if (method === 'GET' && path === '/api/boards') return sendJson(res, 200, listBoards());
  if (method === 'POST' && path === '/api/boards') {
    const b = await parseJson(req); return sendJson(res, 201, createBoard(b.name));
  }
  if ((m = matchPath(path, '/api/boards/{id}'))) {
    const board = getBoard(m.id);
    if (!board && method !== 'DELETE') return sendJson(res, 404, { ok: false, error: 'board not found' });
    if (method === 'GET') return sendJson(res, 200, board);
    if (method === 'PUT' || method === 'PATCH') {
      const b = await parseJson(req); return sendJson(res, 200, updateBoard(m.id, b.name));
    }
    if (method === 'DELETE') { deleteBoard(m.id); return sendJson(res, 200, { ok: true, deleted: m.id }); }
  }

  // ─── Tasks ───────────────────────────────────────────────────────────
  if (method === 'GET' && path === '/api/tasks') {
    const boardId = url.searchParams.get('boardId');
    return sendJson(res, 200, listTasks(boardId));
  }
  if (method === 'POST' && path === '/api/tasks') {
    const b = await parseJson(req); return sendJson(res, 201, createTask(b));
  }
  if ((m = matchPath(path, '/api/tasks/{id}'))) {
    const t = getTask(m.id);
    if (!t) return sendJson(res, 404, { ok: false, error: 'not found' });
    if (method === 'GET') return sendJson(res, 200, t);
  }
  if ((m = matchPath(path, '/api/tasks/{id}/status')) && method === 'POST') {
    const b = await parseJson(req);
    const r = updateTaskStatus({ taskId: m.id, toStatus: b.toStatus, actorAgentId: b.actorAgentId || 'system', actorRole: b.actorRole || 'manager', reason: b.reason });
    return r.ok ? sendJson(res, 200, r.task) : sendJson(res, 400, r);
  }
  if ((m = matchPath(path, '/api/tasks/{id}/artifacts'))) {
    if (method === 'GET') return sendJson(res, 200, listArtifacts(m.id));
    if (method === 'POST') { const b = await parseJson(req); return sendJson(res, 201, addArtifact({ ...b, taskId: m.id })); }
  }
  if ((m = matchPath(path, '/api/tasks/{id}/reviews'))) {
    if (method === 'GET') return sendJson(res, 200, listReviewReports(m.id));
    if (method === 'POST') { const b = await parseJson(req); return sendJson(res, 201, addReviewReport({ ...b, taskId: m.id })); }
  }
  if ((m = matchPath(path, '/api/tasks/{id}/decisions')) && method === 'GET') return sendJson(res, 200, listDecisionEvents(m.id));
  if ((m = matchPath(path, '/api/tasks/{id}/lock')) && method === 'POST') {
    const b = await parseJson(req);
    return sendJson(res, 200, acquireTaskLock(m.id, b.agentId || 'system', b.ttlSeconds || 300));
  }
  if ((m = matchPath(path, '/api/tasks/{id}/release')) && method === 'POST') {
    const b = await parseJson(req); releaseTaskLock(m.id, b.actorAgentId || 'system');
    return sendJson(res, 200, { ok: true });
  }
  if ((m = matchPath(path, '/api/tasks/{id}/assign')) && method === 'POST') {
    const b = await parseJson(req); setTaskAssignee(m.id, b.agentId);
    return sendJson(res, 200, { ok: true, taskId: m.id, assignee: b.agentId });
  }
  if ((m = matchPath(path, '/api/tasks/{id}/retry')) && method === 'POST') {
    const b = await parseJson(req);
    const r = updateTaskStatus({ taskId: m.id, toStatus: b.toStatus || 'Ready', actorAgentId: b.actorAgentId || 'manager-01', actorRole: 'admin', reason: b.reason || 'manual_retry', force: b.force });
    return r.ok ? sendJson(res, 200, r.task) : sendJson(res, 400, r);
  }

  // ─── Agents ──────────────────────────────────────────────────────────
  if (method === 'GET' && path === '/api/agents') return sendJson(res, 200, listAgents());
  if (method === 'POST' && path === '/api/agents') {
    const b = await parseJson(req); return sendJson(res, 201, createAgent(b));
  }
  if ((m = matchPath(path, '/api/agents/{id}'))) {
    const agent = getAgent(m.id);
    if (!agent && method !== 'DELETE') return sendJson(res, 404, { ok: false, error: 'agent not found' });
    if (method === 'GET') return sendJson(res, 200, agent);
    if (method === 'PUT' || method === 'PATCH') {
      const b = await parseJson(req);
      return sendJson(res, 200, updateAgent(m.id, { ...agent, ...b }));
    }
    if (method === 'DELETE') { deleteAgent(m.id); return sendJson(res, 200, { ok: true, deleted: m.id }); }
  }

  // ─── Blocked / Audit / Decisions / Reviews ─────────────────────────
  if (method === 'GET' && path === '/api/blockeds') return sendJson(res, 200, listBlockedTasks());
  if (method === 'GET' && path === '/api/audit') {
    const limit = Number(url.searchParams.get('limit') || 100);
    return sendJson(res, 200, listAuditEvents(limit));
  }
  if (method === 'GET' && path === '/api/decisions') {
    const limit = Number(url.searchParams.get('limit') || 200);
    return sendJson(res, 200, listDecisionEvents(null).slice(0, limit));
  }
  if (method === 'GET' && path === '/api/reviews') {
    const limit = Number(url.searchParams.get('limit') || 100);
    return sendJson(res, 200, listAllReviewReports(limit));
  }

  // ─── Orchestrator ─────────────────────────────────────────────────────
  if (method === 'GET' && path === '/api/control/orchestrator') return sendJson(res, 200, orchestratorStatus());
  if (method === 'POST' && path === '/api/control/orchestrator/pause') return sendJson(res, 200, setOrchestratorPaused(true));
  if (method === 'POST' && path === '/api/control/orchestrator/resume') return sendJson(res, 200, setOrchestratorPaused(false));
  if (method === 'POST' && path === '/api/orchestrator/run') return sendJson(res, 200, await runCycle());

  // ─── Providers ───────────────────────────────────────────────────────
  if (method === 'GET' && path === '/api/providers') return sendJson(res, 200, getAllProviderStatus());
  if ((m = matchPath(path, '/api/providers/{name}/test')) && method === 'POST') {
    return sendJson(res, 200, await testProvider(m.name));
  }
  if ((m = matchPath(path, '/api/providers/{name}/auth-login')) && method === 'POST') {
    return sendJson(res, 200, await triggerOAuthLogin(m.name));
  }

  // ─── Secrets ─────────────────────────────────────────────────────────
  if (method === 'GET' && path === '/api/secrets') return sendJson(res, 200, listSecrets());
  if (method === 'POST' && path === '/api/secrets') {
    const b = await parseJson(req);
    if (!b?.provider || !b.keyName || !b.value) return sendJson(res, 400, { ok: false, error: 'provider,keyName,value required' });
    return sendJson(res, 201, saveSecret(b));
  }
  if ((m = matchPath(path, '/api/secrets/{id}')) && method === 'DELETE') {
    deleteSecret(m.id); return sendJson(res, 200, { ok: true, removed: m.id });
  }

  return sendJson(res, 404, { ok: false, error: 'Not found', path });
});

function killPortAndListen(retried = false) {
  server.listen(PORT, () => {
    ensureDefaultBoard();
    upsertDefaultAgents();
    console.log(`Kanban SSOT server running on http://localhost:${PORT}`);
  });
}

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.warn(`[server] Port ${PORT} is in use. Killing existing process...`);
    try {
      // Windows: netstat로 PID 찾아 강제 종료
      const out = execSync(`netstat -ano | findstr ":${PORT}.*LISTENING"`, { encoding: 'utf8' });
      const pid = out.trim().split(/\s+/).pop();
      if (pid && /^\d+$/.test(pid) && pid !== '0') {
        execSync(`taskkill /PID ${pid} /F`);
        console.log(`[server] Killed PID ${pid}. Retrying in 1s...`);
        setTimeout(() => {
          server.removeAllListeners('error');
          server.on('error', (e) => { console.error('[server] fatal:', e.message); process.exit(1); });
          server.listen(PORT, () => {
            ensureDefaultBoard();
            upsertDefaultAgents();
            console.log(`Kanban SSOT server running on http://localhost:${PORT}`);
          });
        }, 1000);
        return;
      }
    } catch (e) {
      console.error('[server] Failed to kill port occupant:', e.message);
    }
    console.error(`[server] Could not free port ${PORT}. Exiting.`);
    process.exit(1);
  } else {
    console.error('[server] Unexpected error:', err.message);
    process.exit(1);
  }
});

killPortAndListen();
