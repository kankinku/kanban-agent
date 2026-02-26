import fs from 'fs';
import path from 'path';

const file = path.join(process.cwd(), 'server/src/api/server.js');
let data = fs.readFileSync(file, 'utf8');

// 1. imports
if (!data.includes('listBoards')) {
    data = data.replace(
        /upsertDefaultAgents, acquireTaskLock, releaseTaskLock, setTaskAssignee\s+} from '\.\.\/services\/kanbanService\.js';/,
        `upsertDefaultAgents, acquireTaskLock, releaseTaskLock, setTaskAssignee,
  listBoards, getBoard, createBoard, updateBoard, deleteBoard, ensureDefaultBoard
} from '../services/kanbanService.js';`
    );
}

// 2. /api/boards routing
if (!data.includes('/api/boards')) {
    data = data.replace(
        /(\/\/ ─── Tasks ─+)/,
        `// ─── Boards ─────────────────────────────────────────────────────────
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

  $1`
    );
}

// 3. /api/tasks boardId support
data = data.replace(
    /if \(method === 'GET' && path === '\/api\/tasks'\) return sendJson\(res, 200, listTasks\(\)\);/,
    `if (method === 'GET' && path === '/api/tasks') {
    const boardId = url.searchParams.get('boardId');
    return sendJson(res, 200, listTasks(boardId));
  }`
);

// 4. Initialization
data = data.replace(
    /server\.listen\(PORT, \(\) => {\s+upsertDefaultAgents\(\);/g,
    `server.listen(PORT, () => {
    ensureDefaultBoard();
    upsertDefaultAgents();`
);

fs.writeFileSync(file, data, 'utf8');
console.log('Patch Applied to server.js');
