/**
 * Kanban Agent Build Script
 * 사용법: cd server && npm run build
 */
import { execSync } from 'node:child_process';
import { mkdirSync, existsSync, rmSync, copyFileSync, statSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const serverDir = dirname(fileURLToPath(import.meta.url));
const rootDir   = join(serverDir, '..');
const distDir   = join(rootDir, 'dist');

/** 순수 Node.js 재귀 복사 (robocopy/cpSync 대체) */
function nodeCopy(src, dst) {
  if (!existsSync(dst)) mkdirSync(dst, { recursive: true });
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const s = join(src, entry.name);
    const d = join(dst, entry.name);
    if (entry.isSymbolicLink()) continue;  // 심볼릭링크 무시
    else if (entry.isDirectory()) nodeCopy(s, d);
    else copyFileSync(s, d);
  }
}

// --- 1. dist 준비 ----------------------------------------------------------
console.log('[build] Step 1/4  dist/ 준비 ...');
if (existsSync(distDir)) rmSync(distDir, { recursive: true, force: true });
mkdirSync(join(distDir, 'server'), { recursive: true });
mkdirSync(join(distDir, 'web'), { recursive: true });
console.log('[build] 완료\n');

// --- 2. pkg: launcher.cjs -> kanban-agent.exe ----------------------------
console.log('[build] Step 2/4  pkg: launcher -> exe ...');
console.log('        (최초 실행 시 Node.js 바이너리 다운로드 ~ 수 분 소요)\n');
try {
  execSync(
    'npx --no @yao-pkg/pkg src/launcher.cjs --target node22-win-x64 --output ../dist/kanban-agent.exe',
    { stdio: 'inherit', cwd: serverDir }
  );
} catch (_) {}

if (!existsSync(join(distDir, 'kanban-agent.exe'))) {
  console.error('[build] kanban-agent.exe 생성 실패'); process.exit(1);
}
const exeMB = (statSync(join(distDir,'kanban-agent.exe')).size / 1024 / 1024).toFixed(1);
console.log(`\n[build] 완료 -> dist/kanban-agent.exe (${exeMB} MB)\n`);

// --- 3. 서버 파일 복사 ---------------------------------------------------
console.log('[build] Step 3/4  서버 파일 복사 ...');
nodeCopy(join(serverDir, 'src'), join(distDir, 'server', 'src'));
console.log('  src/ 완료');

copyFileSync(join(serverDir, 'package.json'), join(distDir, 'server', 'package.json'));
console.log('  package.json 완료');

// node_modules: devDependencies 제외 복사
const DEV_SKIP = new Set(['@yao-pkg', 'esbuild', '@esbuild', '.package-lock.json', '.bin']);
const nmSrc = join(serverDir, 'node_modules');
const nmDst = join(distDir, 'server', 'node_modules');
mkdirSync(nmDst, { recursive: true });
let copied = 0;
for (const mod of readdirSync(nmSrc)) {
  if ([...DEV_SKIP].some(d => mod.startsWith(d))) continue;
  nodeCopy(join(nmSrc, mod), join(nmDst, mod));
  copied++;
}
console.log(`  node_modules/ 완료 (${copied}개 패키지)\n`);

// --- 4. 웹 파일 복사 -------------------------------------------------------
console.log('[build] Step 4/4  웹 파일 복사 ...');
nodeCopy(join(rootDir, 'web'), join(distDir, 'web'));
console.log('[build] 완료\n');

// --- 완료 메시지 -----------------------------------------------------------
console.log('===========================================');
console.log('  BUILD SUCCESS');
console.log('===========================================');
console.log(`  dist/kanban-agent.exe   (${exeMB} MB)`);
console.log('  dist/server/src/');
console.log('  dist/server/node_modules/');
console.log('  dist/web/index.html');
console.log('');
console.log('  실행:  .\\dist\\kanban-agent.exe');
console.log('  ※ server/ 과 web/ 폴더가 exe 옆에 있어야 합니다');
console.log('  ※ Node.js가 PATH에 설치되어 있어야 합니다');
console.log('===========================================\n');