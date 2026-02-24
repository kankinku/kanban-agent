import { createServer } from 'node:http';
import {
  listTasks,
  getTask,
  createTask,
  updateTaskStatus,
  listArtifacts,
  addArtifact,
  addReviewReport,
  listReviewReports,
  listAuditEvents,
  listDecisionEvents,
  listBlockedTasks,
  listAgents,
  upsertDefaultAgents,
  acquireTaskLock,
  releaseTaskLock,
  setTaskAssignee
} from '../services/kanbanService.js';
import { runCycle } from '../orchestrator.js';
import { isOrchestratorPaused, setOrchestratorPaused, orchestratorStatus } from '../control.js';
import { saveSecret, listSecrets, deleteSecret } from '../services/secretService.js';

const PORT = Number(process.env.PORT || 4100);

const routes = {
  'GET:/health': (_req, res) => sendJson(res, 200, { ok: true, service: 'kanban-ssot-server', version: 'v0.1.0' }),
  'GET:/api/health': (_req, res) => sendJson(res, 200, { ok: true, service: 'kanban-ssot-server', version: 'v0.1.0' }),
  'GET:/api/tasks': (_req, res) => sendJson(res, 200, listTasks()),
  'GET:/api/agents': (_req, res) => sendJson(res, 200, listAgents()),
  'GET:/api/blockeds': (_req, res) => sendJson(res, 200, listBlockedTasks()),
  'GET:/api/audit': (req, res) => sendJson(res, 200, listAuditEvents(Number(req.query?.limit) || 100)),
  'GET:/api/secrets': (_req, res) => sendJson(res, 200, listSecrets()),
  'GET:/api/tasks/{id}': (req, res, params) => {
    const t = getTask(params.id);
    if (!t) return sendJson(res, 404, { ok: false, error: 'Task not found' });
    return sendJson(res, 200, t);
  },
  'GET:/api/tasks/{id}/artifacts': (_req, res, params) => sendJson(res, 200, listArtifacts(params.id)),
  'GET:/api/tasks/{id}/reviews': (_req, res, params) => sendJson(res, 200, listReviewReports(params.id)),
  'GET:/api/tasks/{id}/decisions': (_req, res, params) => sendJson(res, 200, listDecisionEvents(params.id)),
  'GET:/api/control/orchestrator': (_req, res) => sendJson(res, 200, orchestratorStatus()),
  'POST:/api/control/orchestrator/pause': async (req, res) => {
    const body = await req.body;
    sendJson(res, 200, setOrchestratorPaused(true));
  },
  'POST:/api/control/orchestrator/resume': async (req, res) => {
    const body = await req.body;
    sendJson(res, 200, setOrchestratorPaused(false));
  },
  'GET:/api/tasks/{id}/route': (req, res, params) => {
    const t = getTask(params.id);
    if (!t) return sendJson(res, 404, { ok: false, error: 'Task not found' });
    return sendJson(res, 200, {
      taskId: t.id,
      route: t.lockId ? `locked by ${t.lockId}` : 'free',
      status: t.status,
      attempt: `${t.attemptCount}/${t.maxAttempt}`
    });
  },
  'POST:/api/orchestrator/run': async (req, res) => {
    const report = runCycle();
    sendJson(res, 200, report);
  },
  'POST:/api/secrets': async (req, res) => {
    const body = await req.body;
    if (!body?.provider || !body.keyName || !body.value) return sendJson(res, 400, { ok: false, error: 'provider,keyName,value required' });
    const saved = saveSecret(body);
    sendJson(res, 201, saved);
  },
  'DELETE:/api/secrets/{id}': async (_req, res, params) => {
    deleteSecret(params.id);
    sendJson(res, 200, { ok: true, removed: params.id });
  }
};

createServer(async (req, res) => {
  const url = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
  const path = url.pathname;
  const method = req.method || 'GET';

  const matched = matchRoute(method, path);
  if (!matched) {
    if (method === 'POST' && path === '/api/tasks') {
      const body = await parseJson(req);
      const task = createTask(body);
      return sendJson(res, 201, task);
    }

    if (method === 'POST' && path.match(/^\/api\/tasks\/[^/]+\/status$/)) {
      const taskId = path.split('/')[3];
      const body = await parseJson(req);
      const result = updateTaskStatus({
        taskId,
        toStatus: body.toStatus,
        actorAgentId: body.actorAgentId || 'system',
        actorRole: body.actorRole || 'manager',
        reason: body.reason || null
      });
      if (!result.ok) return sendJson(res, 400, result);
      return sendJson(res, 200, result.task);
    }

    if (method === 'POST' && path.match(/^\/api\/tasks\/[^/]+\/artifacts$/)) {
      const taskId = path.split('/')[3];
      const body = await parseJson(req);
      const artifact = addArtifact({ ...body, taskId });
      return sendJson(res, 201, artifact);
    }

    if (method === 'POST' && path.match(/^\/api\/tasks\/[^/]+\/reviews$/)) {
      const taskId = path.split('/')[3];
      const body = await parseJson(req);
      const report = addReviewReport({ ...body, taskId });
      return sendJson(res, 201, report);
    }

    if (method === 'POST' && path.match(/^\/api\/tasks\/[^/]+\/lock$/)) {
      const taskId = path.split('/')[3];
      const body = await parseJson(req);
      const lock = acquireTaskLock(taskId, body.agentId || 'system', body.ttlSeconds || 300);
      return sendJson(res, 200, lock);
    }

    if (method === 'POST' && path.match(/^\/api\/tasks\/[^/]+\/release$/)) {
      const taskId = path.split('/')[3];
      const body = await parseJson(req);
      releaseTaskLock(taskId, body.actorAgentId || 'system');
      return sendJson(res, 200, { ok: true });
    }

    if (method === 'POST' && path.match(/^\/api\/tasks\/[^/]+\/retry$/)) {
      const taskId = path.split('/')[3];
      const body = await parseJson(req);
      const result = updateTaskStatus({
        taskId,
        toStatus: body.toStatus || 'Ready',
        actorAgentId: body.actorAgentId || 'manager-01',
        actorRole: body.actorRole || 'admin',
        reason: body.reason || 'manual_retry',
        force: body.force || false
      });
      if (!result.ok) return sendJson(res, 400, result);
      return sendJson(res, 200, result.task);
    }

    if (method === 'POST' && path.match(/^\/api\/tasks\/[^/]+\/assign$/)) {
      const taskId = path.split('/')[3];
      const body = await parseJson(req);
      setTaskAssignee(taskId, body.agentId);
      return sendJson(res, 200, { ok: true, taskId, assignee: body.agentId });
    }

    return sendJson(res, 404, { ok: false, error: 'Not found' });
  }

  req.query = Object.fromEntries(url.searchParams.entries());
  const body = await parseJson(req);
  req.body = body;
  const handler = matched.handler;
  return handler(req, res, matched.params);
}).listen(PORT, () => {
  upsertDefaultAgents();
  console.log(`Kanban SSOT server running on http://localhost:${PORT}`);
});

function matchRoute(method, path) {
  const keys = Object.keys(routes);
  for (const key of keys) {
    const [m, ...pArr] = key.split(':');
    const p = pArr.join(':');
    if (m !== method) continue;
    const template = '/' + p;
    const params = matchPath(path, template);
    if (params) return { handler: routes[key], params };
  }
  return null;
}

function matchPath(path, template) {
  const p1 = path.split('/').filter(Boolean);
  const p2 = template.split('/').filter(Boolean);
  if (p1.length !== p2.length) return null;
  const params = {};

  for (let i = 0; i < p1.length; i++) {
    const a = p1[i];
    const b = p2[i];
    if (b.startsWith('{') && b.endsWith('}')) {
      params[b.replace(/[{}]/g, '')] = a;
      continue;
    }
    if (a !== b) return null;
  }
  return params;
}

function sendJson(res, code, data) {
  const body = JSON.stringify(data);
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' });
  res.end(body);
}

function parseJson(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (chunk) => (data += chunk));
    req.on('end', () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); } catch { resolve({}); }
    });
  });
}
