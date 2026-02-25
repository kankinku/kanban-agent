'use strict';
/**
 * kanban-agent.exe 런처
 * dist/server/src/index.js 를 외부 Node.js 프로세스로 실행합니다.
 */
const childProcess = require('child_process');
const path = require('path');
const fs   = require('fs');

// pkg 환경에서 process.execPath 는 kanban-agent.exe 자신 -> dirname 으로 dist/ 확인
const exeDir    = path.dirname(process.execPath);
const serverDir = path.join(exeDir, 'server');
const entry     = path.join(serverDir, 'src', 'index.js');

if (!fs.existsSync(entry)) {
  process.stderr.write('\n[X] 서버 파일 없음: ' + entry + '\n');
  process.stderr.write('   kanban-agent.exe 옆에 server/ 폴더가 있어야 합니다.\n');
  process.exit(1);
}

// 외부 Node.js 찾기: PATH 에서 node 검색 (pkg 내부 node 가 아닌 시스템 node)
function findNode() {
  const candidates = process.env.PATH
    ? process.env.PATH.split(path.delimiter).map(function(d) {
        return path.join(d, process.platform === 'win32' ? 'node.exe' : 'node');
      })
    : [];
  for (var i = 0; i < candidates.length; i++) {
    if (fs.existsSync(candidates[i])) return candidates[i];
  }
  return null;
}

const nodeBin = findNode();
if (!nodeBin) {
  process.stderr.write('\n[X] Node.js 를 찾을 수 없습니다.\n');
  process.stderr.write('   https://nodejs.org 에서 LTS 버전을 설치하세요.\n');
  process.exit(1);
}

let nodeVersion = 'unknown';
try {
  nodeVersion = childProcess.execFileSync(nodeBin, ['--version'], {
    encoding: 'utf8', timeout: 3000
  }).trim();
} catch(_) {}

process.stdout.write('\n======================================\n');
process.stdout.write('  Kanban Agent Launcher\n');
process.stdout.write('  Node.js: ' + nodeVersion + '\n');
process.stdout.write('  서버:    ' + serverDir + '\n');
process.stdout.write('======================================\n\n');

var child = childProcess.spawn(nodeBin, [entry], {
  cwd: serverDir,
  stdio: 'inherit',
  env: Object.assign({}, process.env)
});

child.on('error', function(err) {
  process.stderr.write('[X] 서버 시작 오류: ' + err.message + '\n');
  process.exit(1);
});

child.on('exit', function(code) {
  process.exit(code || 0);
});

process.on('SIGINT', function() { try { child.kill('SIGINT'); } catch(_) {} });
process.on('SIGTERM', function() { try { child.kill('SIGTERM'); } catch(_) {} });