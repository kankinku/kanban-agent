const fs = require('fs');
let html = fs.readFileSync('web/index.html', 'utf8');

// replace .board
html = html.replace(/\.board\s*\{\s*display:\s*flex;\s*flex-direction:\s*column;\s*flex-wrap:\s*wrap;\s*gap:\s*16px;\s*overflow-x:\s*auto;\s*align-content:\s*flex-start;\s*padding-bottom:\s*8px;\s*height:\s*calc\([^)]+\);\s*\}/s, `.board {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      align-items: start;
      gap: 16px;
      padding-bottom: 24px;
    }`);

// replace .col
html = html.replace(/\.col\s*\{\s*width:\s*280px;\s*background:\s*var\(--bg-card\);\s*border:\s*1px\s*solid\s*var\(--border\);\s*border-radius:\s*var\(--r-lg\);\s*box-shadow:\s*var\(--sh\);\s*display:\s*flex;\s*flex-direction:\s*column;\s*max-height:\s*100%;\s*\}/s, `.col {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: var(--r-lg);
      box-shadow: var(--sh);
      display: flex;
      flex-direction: column;
    }`);

fs.writeFileSync('web/index.html', html, 'utf8');
console.log('Grid patch applied to index.html');
