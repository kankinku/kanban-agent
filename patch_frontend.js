import fs from 'fs';
import path from 'path';

const file = path.join(process.cwd(), 'web/index.html');
let data = fs.readFileSync(file, 'utf8');

// 1. CSS styles
if (!data.includes('.sidebar-section')) {
    data = data.replace(
        /(\/\* ─── Main ─── \*\/)/,
        `.sidebar-section {
      margin-bottom: 12px;
    }
    .section-title {
      font-size: 11px;
      font-weight: 700;
      color: var(--text-tertiary);
      padding: 0 16px;
      margin-bottom: 6px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .project-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 12px 8px 36px;
      border-radius: var(--r-sm);
      cursor: pointer;
      color: var(--text-secondary);
      font-size: 13px;
      font-weight: 500;
      transition: var(--t);
      margin-bottom: 2px;
    }
    .project-item:hover {
      background: var(--bg-main);
      color: var(--text-primary);
    }
    .project-item.active {
      background: var(--brand-bg);
      color: var(--brand);
      font-weight: 600;
    }
    .project-item.active::before {
      content: '';
      position: absolute;
      left: 16px;
      width: 4px;
      height: 4px;
      border-radius: 50%;
      background: var(--brand);
    }
    .p-actions {
      display: none;
      gap: 4px;
    }
    .project-item:hover .p-actions {
      display: flex;
    }
    $1`
    );
}

// 2. Sidebar HTML structure
data = data.replace(
    /<nav>[\s\S]*?<\/nav>/,
    `<nav>
      <div class="sidebar-section">
        <div class="section-title">일반</div>
        <div class="nav-item" data-tab="providers" onclick="go('providers')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
          </svg>
          <span>AI 프로바이더</span>
        </div>
        <div class="nav-item" data-tab="audit" onclick="go('audit')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
          </svg>
          <span>감사 로그</span>
        </div>
      </div>
      <div class="sidebar-section">
        <div class="section-title" style="display:flex;justify-content:space-between;align-items:center;padding-right:12px;">
          프로젝트 <button class="btn-icon" style="width:20px;height:20px;padding:0;min-height:0;line-height:0;" onclick="openBoardModal()" title="새 프로젝트">+</button>
        </div>
        <div id="projectList">
          <!-- dynamically rendered boards -->
        </div>
      </div>
    </nav>`
);

// 3. Modals HTML
if (!data.includes('boardModal')) {
    data = data.replace(
        /<!-- Agent CRUD Modal -->/,
        `<!-- Board CRUD Modal -->
  <div class="overlay" id="boardModal" onclick="if(event.target===this)closeModal('boardModal')">
    <div class="modal">
      <div class="modal-head">
        <h3 id="boardModalTitle">프로젝트 만들기</h3>
        <button class="modal-x" onclick="closeModal('boardModal')">✕</button>
      </div>
      <div class="modal-body">
        <input type="hidden" id="boardId">
        <div class="form-group"><label>프로젝트 이름</label><input class="inp" id="boardName" placeholder="예: 신규 서비스 앱 런칭"></div>
      </div>
      <div class="modal-foot">
        <button class="btn btn-danger btn-sm" id="boardDeleteBtn" style="display:none;margin-right:auto" onclick="deleteBoard()">프로젝트 삭제</button>
        <button class="btn" onclick="closeModal('boardModal')">취소</button>
        <button class="btn btn-primary" onclick="saveBoard()">저장</button>
      </div>
    </div>
  </div>

  <!-- Agent CRUD Modal -->`
    );
}

// 4. JS Globals and load() function
data = data.replace(
    /let _tasks = \[\], _agents = \[\], _paused = false;/,
    `let _boards = [], currentBoardId = null, _tasks = [], _agents = [], _paused = false;`
);

data = data.replace(
    /const \[tasks, agents, orchSt, blocked\] = await Promise\.all\(\[\s*api\('\/api\/tasks'\), api\('\/api\/agents'\), api\('\/api\/control\/orchestrator'\), api\('\/api\/blockeds'\)\s*\]\);/,
    `const [boards, agents, orchSt, blocked] = await Promise.all([
          api('/api/boards'), api('/api/agents'), api('/api/control/orchestrator'), api('/api/blockeds')
        ]);
        _boards = boards || [];
        if (!currentBoardId && _boards.length > 0) {
          currentBoardId = _boards[0].id;
        }
        
        let tasks = [];
        if (currentBoardId) {
          tasks = await api(\`/api/tasks?boardId=\${currentBoardId}\`);
        }
        `
);

data = data.replace(
    /renderStats\(tasks, blocked\);/,
    `renderProjects();
        renderStats(tasks, blocked);`
);

// 5. JS Functions
if (!data.includes('function renderProjects()')) {
    data = data.replace(
        /\/\* ─── Stats ─── \*\//,
        `/* ─── Projects ─── */
    function renderProjects() {
      const pl = document.getElementById('projectList');
      pl.innerHTML = _boards.map(b => \`<div class="nav-item project-item \${currentBoardId === b.id ? 'active' : ''}" data-tab="board" onclick="switchBoard('\${b.id}', event)">
        <span>\${escHtml(b.name)}</span>
        <div class="p-actions">
          <svg style="width:14px;height:14px" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" onclick="openBoardModal('\${b.id}', event)"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
        </div>
      </div>\`).join('');
      
      const b = _boards.find(x => x.id === currentBoardId);
      if (b) {
        document.getElementById('pageTitle').textContent = b.name;
        document.getElementById('view-board').classList.add('active');
        document.getElementById('view-providers').classList.remove('active');
        document.getElementById('view-audit').classList.remove('active');
      }
    }

    function switchBoard(id, e) {
      if (e) e.stopPropagation();
      currentBoardId = id;
      go('board');
      load();
    }

    function openBoardModal(id = null, e = null) {
      if (e) e.stopPropagation();
      document.getElementById('boardId').value = id || '';
      const b = id ? _boards.find(x => x.id === id) : null;
      document.getElementById('boardName').value = b ? b.name : '';
      document.getElementById('boardModalTitle').textContent = b ? '프로젝트 편집' : '프로젝트 만들기';
      document.getElementById('boardDeleteBtn').style.display = b && _boards.length > 1 ? 'block' : 'none';
      openModal('boardModal');
    }

    async function saveBoard() {
      const id = document.getElementById('boardId').value;
      const name = document.getElementById('boardName').value.trim();
      if (!name) return alert('프로젝트 이름을 입력하세요.');
      if (id) {
        await api(\`/api/boards/\${id}\`, { method: 'PUT', headers: {'content-type':'application/json'}, body: JSON.stringify({name}) });
      } else {
        const nr = await api('/api/boards', { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({name}) });
        if (nr.id) currentBoardId = nr.id;
      }
      closeModal('boardModal');
      load();
    }

    async function deleteBoard() {
      const id = document.getElementById('boardId').value;
      if (!id || !confirm('이 프로젝트와 포함된 모든 작업이 삭제될 수 있습니다.\\n계속하시겠습니까?')) return;
      await api(\`/api/boards/\${id}\`, { method: 'DELETE' });
      currentBoardId = null;
      closeModal('boardModal');
      load();
    }

    /* ─── Stats ─── */`
    );

    // Update submitTask and make logic board aware
    data = data.replace(
        /status: 'Backlog'/,
        `status: 'Backlog',
          boardId: currentBoardId`
    );

    data = data.replace(
        /assigneeAgentId: 'pm-01',/,
        `assigneeAgentId: 'pm-01',
            boardId: currentBoardId,`
    );
}

fs.writeFileSync(file, data, 'utf8');
console.log('Patch Applied to index.html');
