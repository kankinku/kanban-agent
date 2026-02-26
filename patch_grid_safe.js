const fs = require('fs');
const file = 'web/index.html';
let html = fs.readFileSync(file, 'utf8');

const targetBoard = `    /* ─── Board ─── */
    .board {
      display: flex;
      gap: 16px;
      overflow-x: auto;
      align-items: flex-start;
      padding-bottom: 8px;
    }`;

const replaceBoard = `    /* ─── Board ─── */
    .board {
      columns: 280px;
      column-gap: 16px;
      height: calc(100vh - 240px);
      overflow-y: auto;
      padding-bottom: 24px;
    }`;

const targetCol = `    .col {
      flex: 0 0 280px;
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: var(--r-lg);
      box-shadow: var(--sh);
      display: flex;
      flex-direction: column;
      max-height: calc(100vh - 330px);
    }`;

const replaceCol = `    .col {
      break-inside: avoid;
      margin-bottom: 16px;
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: var(--r-lg);
      box-shadow: var(--sh);
      display: flex;
      flex-direction: column;
    }`;

html = html.replace(targetBoard, replaceBoard);
html = html.replace(targetCol, replaceCol);

fs.writeFileSync(file, html, 'utf8');
console.log('HTML restored and CSS cleanly patched.');
